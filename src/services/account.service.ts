import { z } from "zod";
import { db } from "@/lib/db";
import { atomic, type Tx } from "@/lib/finance-context";
import { HttpError } from "@/lib/http";
import { hashPassword } from "@/lib/password";
import { passwordInput } from "@/lib/validation";
import { permissionDefinitions, roleLabels, rolePermissions } from "@/lib/rbac";
import { getIdentity } from "@/lib/auth";
import { ensureFreeSubscription, ensurePersonalSubscription } from "./entitlement.service";
import { personalDefaults } from "@/lib/personal";
import { audit } from "./audit.service";

export const registrationInput = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase().trim()),
    password: passwordInput,
    usageType: z.enum(["BUSINESS", "PERSONAL", "BOTH"]),
    companyName: z.string().trim().max(200).optional(),
    currency: z
      .enum(["EUR", "USD", "GBP", "MAD", "XOF", "XAF", "CAD", "CHF", "AED"])
      .default("EUR"),
  })
  .superRefine((value, context) => {
    if (value.usageType !== "PERSONAL" && (!value.companyName || value.companyName.length < 2))
      context.addIssue({
        code: "custom",
        path: ["companyName"],
        message: "Indiquez le nom de votre entreprise.",
      });
  });

export async function initializeRoles(tx: Tx, companyId: string) {
  const permissions = await Promise.all(
    permissionDefinitions.map((key) =>
      tx.permission.upsert({ where: { key }, create: { key }, update: {} }),
    ),
  );
  for (const [name, keys] of Object.entries(rolePermissions)) {
    const role = await tx.role.upsert({
      where: { companyId_name: { companyId, name } },
      create: { companyId, name, label: roleLabels[name] },
      update: {},
    });
    await tx.rolePermission.createMany({
      data: permissions
        .filter((item) => keys.includes(item.key))
        .map((item) => ({ companyId, roleId: role.id, permissionId: item.id })),
      skipDuplicates: true,
    });
  }
}

export async function createBusiness(
  tx: Tx,
  user: { id: string; name: string },
  name: string,
  currency: string,
) {
  const company = await tx.company.create({ data: { name, currency } });
  await tx.companyMembership.create({
    data: { companyId: company.id, userId: user.id, isOwner: true },
  });
  await initializeRoles(tx, company.id);
  const owner = await tx.role.findUniqueOrThrow({
    where: { companyId_name: { companyId: company.id, name: "OWNER" } },
  });
  await tx.userRole.create({ data: { companyId: company.id, userId: user.id, roleId: owner.id } });
  await tx.cashAccount.create({
    data: {
      companyId: company.id,
      responsibleId: user.id,
      name: "Caisse principale",
      currency,
      type: "CASH",
    },
  });
  await tx.expenseCategory.createMany({
    data: [
      "Carburant",
      "Transport",
      "Achats",
      "Fournitures",
      "Salaires",
      "Repas",
      "Maintenance",
      "Loyer",
      "Marketing",
      "Taxes",
      "Autre",
    ].map((category) => ({ companyId: company.id, name: category })),
  });
  await ensureFreeSubscription(company.id, tx);
  await audit(
    tx,
    {
      id: user.id,
      name: user.name,
      companyId: company.id,
      role: "OWNER",
      permissions: rolePermissions.OWNER,
    },
    {
      action: "REGISTER_BUSINESS",
      entity: "Company",
      entityId: company.id,
      after: { name, currency, plan: "FREE" },
    },
  );
  return company;
}

export async function registerAccount(input: unknown) {
  const data = registrationInput.parse(input);
  const passwordHash = await hashPassword(data.password);
  return atomic(async (tx) => {
    if (await tx.user.findUnique({ where: { email: data.email }, select: { id: true } }))
      throw new HttpError(
        409,
        "Cette adresse possède déjà un compte. Connectez-vous ou réinitialisez votre mot de passe.",
      );
    const user = await tx.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        usageType: data.usageType,
        personalCurrency: data.currency,
      },
    });
    if (data.usageType !== "BUSINESS") {
      await ensurePersonalSubscription(user.id, tx);
      for (const type of ["EXPENSE", "INCOME"] as const)
        await tx.personalCategory.createMany({
          data: personalDefaults[type].map((name) => ({ userId: user.id, name, type })),
          skipDuplicates: true,
        });
    }
    const company =
      data.usageType === "PERSONAL"
        ? null
        : await createBusiness(tx, user, data.companyName!, data.currency);
    if (company) await tx.user.update({ where: { id: user.id }, data: { companyId: company.id } });
    return { id: user.id, companyId: company?.id ?? null, usageType: user.usageType };
  });
}

export async function switchWorkspace(
  identity: Awaited<ReturnType<typeof getIdentity>>,
  input: unknown,
) {
  const { companyId } = z.object({ companyId: z.uuid().nullable() }).parse(input);
  if (!companyId && identity.usageType === "BUSINESS")
    throw new HttpError(403, "Activez d’abord votre espace personnel dans votre profil.");
  if (
    companyId &&
    !(await db.companyMembership.findFirst({
      where: { companyId, userId: identity.id, active: true },
    }))
  )
    throw new HttpError(403, "Vous n’avez pas accès à cette entreprise.");
  await db.session.update({ where: { id: identity.sessionId }, data: { companyId } });
  return { ok: true, redirectTo: companyId ? "/" : "/personal" };
}

export async function updateAccount(
  identity: Awaited<ReturnType<typeof getIdentity>>,
  input: unknown,
) {
  const data = z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      enablePersonal: z.boolean().optional(),
      companyName: z.string().trim().min(2).max(200).optional(),
    })
    .strict()
    .parse(input);
  return atomic(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: identity.id } });
    const company = data.companyName
      ? await createBusiness(tx, user, data.companyName, user.personalCurrency)
      : null;
    const usageType = company
      ? user.usageType === "PERSONAL" || user.usageType === "BOTH"
        ? "BOTH"
        : "BUSINESS"
      : data.enablePersonal && user.usageType === "BUSINESS"
        ? "BOTH"
        : user.usageType;
    if (usageType !== "BUSINESS") await ensurePersonalSubscription(user.id, tx);
    await tx.user.update({
      where: { id: identity.id },
      data: {
        name: data.name,
        usageType,
        ...(company && !user.companyId ? { companyId: company.id } : {}),
      },
    });
    if (company)
      await tx.session.update({
        where: { id: identity.sessionId },
        data: { companyId: company.id },
      });
    return { ok: true, companyId: company?.id, usageType };
  });
}
