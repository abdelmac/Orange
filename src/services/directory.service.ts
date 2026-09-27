import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/finance-context";
import { HttpError } from "@/lib/http";
import { assertPermission, clientScope } from "@/lib/rbac";
import { hashPassword } from "@/lib/password";
import {
  cashAccountInput,
  clientInput,
  supplierInput,
  userInput,
  userPatchInput,
  uuid,
} from "@/lib/validation";
import { parseMoney } from "@/lib/money";
import { audit } from "./audit.service";
import { listDirectory } from "./directory-read.service";
import { updateExpense } from "./expense-edit.service";
import { companyUserSelect } from "@/lib/user-select";
import { assertTeamOwner, checkTeamCapacity, updateMember } from "./team.service";

export async function listCollection(
  actor: Actor,
  collection: string,
  params = new URLSearchParams(),
) {
  return { items: await listDirectory(actor, collection, params) };
}

async function checkPerson(
  tx: Prisma.TransactionClient,
  actor: Actor,
  id: string | undefined,
  salesperson = false,
) {
  if (!id) return;
  const exists = await tx.user.findFirst({
    where: {
      id,
      memberships: { some: { companyId: actor.companyId, active: true } },
      active: true,
      ...(salesperson ? { salesperson: { some: { companyId: actor.companyId } } } : {}),
    },
    select: { id: true },
  });
  if (!exists)
    throw new HttpError(
      400,
      salesperson
        ? "Commercial introuvable dans cette entreprise."
        : "Responsable introuvable dans cette entreprise.",
    );
}

async function checkRoleGrant(tx: Prisma.TransactionClient, actor: Actor, roleId: string) {
  const role = await tx.role.findFirst({
    where: { id: roleId, companyId: actor.companyId },
    include: { permissions: { include: { permission: true } } },
  });
  if (!role) throw new HttpError(400, "Rôle introuvable.");
  if (role.name === "OWNER")
    throw new HttpError(403, "Le rôle propriétaire ne peut pas être attribué à un membre.");
  if (role.permissions.some((grant) => !actor.permissions.includes(grant.permission.key)))
    throw new HttpError(
      403,
      "Vous ne pouvez pas attribuer des permissions supérieures aux vôtres.",
    );
  return role;
}

export async function createDirectoryItem(actor: Actor, collection: string, input: unknown) {
  if (collection === "clients") {
    assertPermission(actor, "clients.create");
    const {
      companyName,
      businessName,
      taxId,
      taxNumber,
      isActive,
      active,
      creditLimit,
      ...fields
    } = clientInput.parse(input);
    const salespersonId = actor.role === "SALESPERSON" ? actor.id : fields.salespersonId;
    return db.$transaction(async (tx) => {
      await checkPerson(tx, actor, salespersonId, true);
      const item = await tx.client.create({
        data: {
          ...fields,
          salespersonId,
          companyId: actor.companyId,
          businessName: businessName ?? companyName,
          taxNumber: taxNumber ?? taxId,
          active: active ?? isActive,
          creditLimitMinor: creditLimit ? parseMoney(creditLimit) : 0n,
        },
      });
      await audit(tx, actor, {
        action: "CREATE",
        entity: "Client",
        entityId: item.id,
        after: item,
      });
      return item;
    });
  }
  if (collection === "suppliers") {
    assertPermission(actor, "suppliers.create");
    const { companyName, businessName, taxId, taxNumber, ...fields } = supplierInput.parse(input);
    return db.$transaction(async (tx) => {
      const item = await tx.supplier.create({
        data: {
          ...fields,
          businessName: businessName ?? companyName,
          taxNumber: taxNumber ?? taxId,
          companyId: actor.companyId,
        },
      });
      await audit(tx, actor, {
        action: "CREATE",
        entity: "Supplier",
        entityId: item.id,
        after: item,
      });
      return item;
    });
  }
  if (collection === "users") {
    assertPermission(actor, "users.create");
    const { roleId, password, ...fields } = userInput.parse(input);
    const passwordHash = await hashPassword(password);
    return db.$transaction(async (tx) => {
      await assertTeamOwner(actor, tx);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`team:${actor.companyId}`}))`;
      await checkTeamCapacity(actor.companyId, tx);
      const role = await checkRoleGrant(tx, actor, roleId);
      const item = await tx.user.create({
        data: {
          ...fields,
          companyId: actor.companyId,
          passwordHash,
          roles: { create: { companyId: actor.companyId, roleId } },
          ...(role.name === "SALESPERSON"
            ? { salesperson: { create: { companyId: actor.companyId } } }
            : {}),
        },
        select: companyUserSelect(actor.companyId),
      });
      await tx.companyMembership.upsert({
        where: { companyId_userId: { companyId: actor.companyId, userId: item.id } },
        create: { companyId: actor.companyId, userId: item.id },
        update: {},
      });
      await audit(tx, actor, { action: "CREATE", entity: "User", entityId: item.id, after: item });
      return item;
    });
  }
  if (collection === "cash-accounts") {
    assertPermission(actor, "cash.create");
    const fields = cashAccountInput.parse(input);
    return db.$transaction(async (tx) => {
      const company = await tx.company.findUniqueOrThrow({ where: { id: actor.companyId } });
      if (fields.currency !== company.currency)
        throw new HttpError(400, "La devise doit être celle de l’entreprise.");
      await checkPerson(tx, actor, fields.responsibleId);
      const item = await tx.cashAccount.create({ data: { ...fields, companyId: actor.companyId } });
      await audit(tx, actor, {
        action: "CREATE",
        entity: "CashAccount",
        entityId: item.id,
        after: item,
      });
      return { ...item, balanceMinor: 0n };
    });
  }
  throw new HttpError(405, "Création non autorisée pour ce type de données.");
}

export async function updateDirectoryItem(
  actor: Actor,
  collection: string,
  id: string,
  input: unknown,
) {
  uuid.parse(id);
  if (collection === "expenses") return updateExpense(actor, id, input);
  if (collection === "clients") {
    assertPermission(actor, "clients.edit");
    const {
      companyName,
      businessName,
      taxId,
      taxNumber,
      isActive,
      active,
      creditLimit,
      ...fields
    } = clientInput.partial().parse(input);
    if (actor.role === "SALESPERSON" && fields.salespersonId && fields.salespersonId !== actor.id)
      throw new HttpError(403, "Vous ne pouvez pas réattribuer ce client.");
    return db.$transaction(async (tx) => {
      const before = await tx.client.findFirst({ where: { ...clientScope(actor), id } });
      if (!before) throw new HttpError(404, "Client introuvable.");
      await checkPerson(tx, actor, fields.salespersonId, true);
      const item = await tx.client.update({
        where: { id },
        data: {
          ...fields,
          businessName: businessName ?? companyName,
          taxNumber: taxNumber ?? taxId,
          active: active ?? isActive,
          creditLimitMinor: creditLimit === undefined ? undefined : parseMoney(creditLimit),
        },
      });
      await audit(tx, actor, {
        action: "UPDATE",
        entity: "Client",
        entityId: id,
        before,
        after: item,
      });
      return item;
    });
  }
  if (collection === "suppliers") {
    assertPermission(actor, "suppliers.edit");
    const { companyName, businessName, taxId, taxNumber, ...fields } = supplierInput
      .partial()
      .parse(input);
    return db.$transaction(async (tx) => {
      const before = await tx.supplier.findFirst({ where: { companyId: actor.companyId, id } });
      if (!before) throw new HttpError(404, "Fournisseur introuvable.");
      const item = await tx.supplier.update({
        where: { id },
        data: {
          ...fields,
          businessName: businessName ?? companyName,
          taxNumber: taxNumber ?? taxId,
        },
      });
      await audit(tx, actor, {
        action: "UPDATE",
        entity: "Supplier",
        entityId: id,
        before,
        after: item,
      });
      return item;
    });
  }
  if (collection === "users") {
    assertPermission(actor, "users.edit");
    const { roleId, ...fields } = userPatchInput.parse(input);
    await assertTeamOwner(actor);
    const before = await db.user.findFirst({
      where: { id, memberships: { some: { companyId: actor.companyId } } },
      select: companyUserSelect(actor.companyId),
    });
    if (!before) throw new HttpError(404, "Utilisateur introuvable.");
    if (
      (fields.name && fields.name !== before.name) ||
      (fields.email && fields.email !== before.email)
    )
      throw new HttpError(
        403,
        "Chaque utilisateur gère ses informations personnelles depuis son profil. Vous pouvez modifier son rôle ou son accès à l’entreprise.",
      );
    const role = roleId
      ? await db.role.findFirst({ where: { id: roleId, companyId: actor.companyId } })
      : null;
    if (roleId && !role) throw new HttpError(400, "Rôle introuvable.");
    await updateMember(actor, id, { role: role?.name, active: fields.active });
    const item = await db.user.findUniqueOrThrow({
      where: { id },
      select: companyUserSelect(actor.companyId),
    });
    return { ...item, active: item.memberships[0]?.active ?? false };
  }
  if (collection === "cash-accounts") {
    assertPermission(actor, "cash.edit");
    const { currency, ...fields } = cashAccountInput.partial().parse(input);
    return db.$transaction(async (tx) => {
      const before = await tx.cashAccount.findFirst({ where: { id, companyId: actor.companyId } });
      if (!before) throw new HttpError(404, "Caisse introuvable.");
      if (currency && currency !== before.currency)
        throw new HttpError(400, "La devise d’une caisse existante ne peut pas être modifiée.");
      await checkPerson(tx, actor, fields.responsibleId);
      const item = await tx.cashAccount.update({ where: { id }, data: fields });
      await audit(tx, actor, {
        action: "UPDATE",
        entity: "CashAccount",
        entityId: id,
        before,
        after: item,
      });
      return item;
    });
  }
  if (collection === "notifications") {
    z.object({ read: z.literal(true).optional(), readAt: z.string().optional() }).parse(input);
    const result = await db.notification.updateMany({
      where: { id, companyId: actor.companyId, userId: actor.id },
      data: { readAt: new Date() },
    });
    if (!result.count) throw new HttpError(404, "Notification introuvable.");
    return { ok: true };
  }
  throw new HttpError(
    405,
    "Modification directe non autorisée. Utilisez l’action métier correspondante.",
  );
}
