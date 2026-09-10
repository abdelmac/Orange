import { loadEnvConfig } from "@next/env";
import { z } from "zod";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";
import { atomic } from "../src/lib/finance-context";
import { permissionDefinitions, roleLabels, rolePermissions } from "../src/lib/rbac";
import { audit } from "../src/services/audit.service";

loadEnvConfig(process.cwd());

async function main() {
  const input = z
    .object({
      COMPANY_NAME: z.string().trim().min(2).max(200),
      ADMIN_NAME: z.string().trim().min(2).max(200),
      ADMIN_EMAIL: z.email().transform((value) => value.toLowerCase().trim()),
      ADMIN_PASSWORD: z.string().min(12).max(128),
    })
    .parse(process.env);
  const passwordHash = await hashPassword(input.ADMIN_PASSWORD);
  const company = await atomic(async (tx) => {
    if (await tx.user.findUnique({ where: { email: input.ADMIN_EMAIL } }))
      throw new Error(
        "Cette adresse email est déjà utilisée. Aucun compte ni aucune entreprise n’a été modifié.",
      );
    const created = await tx.company.create({
      data: { name: input.COMPANY_NAME, currency: "EUR" },
    });
    const permissions = [];
    for (const key of permissionDefinitions)
      permissions.push(await tx.permission.upsert({ where: { key }, update: {}, create: { key } }));
    let adminRoleId: string | undefined;
    for (const [name, keys] of Object.entries(rolePermissions)) {
      const role = await tx.role.create({
        data: { companyId: created.id, name, label: roleLabels[name] },
      });
      await tx.rolePermission.createMany({
        data: permissions
          .filter((permission) => keys.includes(permission.key))
          .map((permission) => ({
            companyId: created.id,
            roleId: role.id,
            permissionId: permission.id,
          })),
      });
      if (name === "ADMIN") adminRoleId = role.id;
    }
    if (!adminRoleId) throw new Error("Rôle administrateur manquant.");
    const user = await tx.user.create({
      data: {
        companyId: created.id,
        name: input.ADMIN_NAME,
        email: input.ADMIN_EMAIL,
        passwordHash,
        roles: { create: { roleId: adminRoleId } },
      },
    });
    await tx.cashAccount.create({
      data: {
        companyId: created.id,
        name: "Caisse principale",
        type: "CASH",
        currency: "EUR",
        responsibleId: user.id,
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
      ].map((name) => ({ companyId: created.id, name })),
    });
    await audit(
      tx,
      {
        id: user.id,
        companyId: created.id,
        name: user.name,
        role: "ADMIN",
        permissions: rolePermissions.ADMIN,
      },
      {
        action: "INITIALIZE",
        entity: "Company",
        entityId: created.id,
        after: { name: created.name, administratorId: user.id, currency: created.currency },
      },
    );
    return created;
  });
  console.log(
    `Entreprise créée : ${company.name} (${company.id}). Administrateur : ${input.ADMIN_EMAIL}. Caisse principale à zéro. Le mot de passe n’est pas affiché.`,
  );
}

main()
  .catch((error) => {
    if (error instanceof z.ZodError)
      console.error(
        "Variables requises invalides :",
        error.issues.map((issue) => `${issue.path.join(".")} : ${issue.message}`).join(" ; "),
      );
    else console.error(error instanceof Error ? error.message : "Échec de l’initialisation.");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
