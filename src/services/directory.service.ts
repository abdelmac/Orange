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
import { publicUserSelect } from "@/lib/user-select";

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
      companyId: actor.companyId,
      active: true,
      ...(salesperson ? { salesperson: { isNot: null } } : {}),
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
      const role = await checkRoleGrant(tx, actor, roleId);
      const item = await tx.user.create({
        data: {
          ...fields,
          companyId: actor.companyId,
          passwordHash,
          roles: { create: { roleId } },
          ...(role.name === "SALESPERSON" ? { salesperson: { create: {} } } : {}),
        },
        select: publicUserSelect,
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
    if (id === actor.id && fields.active === false)
      throw new HttpError(400, "Vous ne pouvez pas désactiver votre propre compte.");
    return db.$transaction(async (tx) => {
      const before = await tx.user.findFirst({
        where: { id, companyId: actor.companyId },
        select: publicUserSelect,
      });
      if (!before) throw new HttpError(404, "Utilisateur introuvable.");
      const roleChanged = Boolean(roleId && !before.roles.some((item) => item.role.id === roleId));
      if (roleChanged && id === actor.id)
        throw new HttpError(400, "Vous ne pouvez pas modifier votre propre rôle.");
      if (roleId && roleChanged) {
        const role = await checkRoleGrant(tx, actor, roleId);
        if (
          before.roles.some((item) => item.role.name === "SALESPERSON") &&
          role.name !== "SALESPERSON"
        ) {
          const [incoming, outgoing] = await Promise.all([
            tx.financialTransaction.aggregate({
              where: {
                companyId: actor.companyId,
                destinationSalespersonId: id,
                status: "VALIDATED",
              },
              _sum: { amountMinor: true },
            }),
            tx.financialTransaction.aggregate({
              where: { companyId: actor.companyId, sourceSalespersonId: id, status: "VALIDATED" },
              _sum: { amountMinor: true },
            }),
          ]);
          if ((incoming._sum.amountMinor ?? 0n) !== (outgoing._sum.amountMinor ?? 0n))
            throw new HttpError(
              400,
              "Ce commercial doit remettre ses fonds avant de changer de rôle.",
            );
        }
        await tx.userRole.deleteMany({ where: { userId: id, companyId: actor.companyId } });
        await tx.userRole.create({ data: { companyId: actor.companyId, userId: id, roleId } });
        if (role.name === "SALESPERSON")
          await tx.salespersonProfile.upsert({
            where: { userId: id },
            create: { companyId: actor.companyId, userId: id },
            update: {},
          });
      }
      const item = await tx.user.update({ where: { id }, data: fields, select: publicUserSelect });
      if (roleChanged || fields.active === false)
        await tx.session.deleteMany({ where: { userId: id, companyId: actor.companyId } });
      await audit(tx, actor, {
        action: "UPDATE",
        entity: "User",
        entityId: id,
        before,
        after: item,
      });
      return item;
    });
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
