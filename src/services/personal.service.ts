import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { parseMoney } from "@/lib/money";
import {
  type PersonalIdentity,
  requirePersonal,
  personalAccountInput,
  personalCategoryInput,
  personalTransactionInput,
  personalBudgetInput,
  personalDefaults,
} from "@/lib/personal";

export async function personalWrite<T>(
  identity: PersonalIdentity,
  work: (tx: Prisma.TransactionClient, userId: string) => Promise<T>,
) {
  const userId = requirePersonal(identity);
  return db.$transaction(async (tx) => {
    // Serialize this owner's writes: repeated mobile submissions, edits and archive checks.
    const key = `personal:${userId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    return work(tx, userId);
  });
}

export async function ensurePersonalCategories(identity: PersonalIdentity) {
  const userId = requirePersonal(identity);
  // Unique owner/type/name makes this safe when several devices first open the space.
  await db.personalCategory.createMany({
    data: Object.entries(personalDefaults).flatMap(([type, names]) =>
      names.map((name) => ({
        userId,
        name,
        type: type as "INCOME" | "EXPENSE",
        color: type === "INCOME" ? "#059669" : "#f97316",
      })),
    ),
    skipDuplicates: true,
  });
}

export async function createPersonalAccount(identity: PersonalIdentity, raw: unknown) {
  const input = personalAccountInput.parse(raw);
  const negative = input.initialBalance.startsWith("-");
  const balance = parseMoney(negative ? input.initialBalance.slice(1) : input.initialBalance);
  return personalWrite(identity, (tx, userId) =>
    tx.personalAccount.create({
      data: {
        userId,
        name: input.name,
        type: input.type,
        currency: identity.personalCurrency,
        initialBalanceMinor: negative ? -balance : balance,
      },
    }),
  );
}

export async function updatePersonalAccount(identity: PersonalIdentity, id: string, raw: unknown) {
  z.uuid().parse(id);
  const input = z
    .object({ name: z.string().trim().min(1).max(100), isArchived: z.boolean() })
    .parse(raw);
  return personalWrite(identity, async (tx, userId) => {
    const account = await tx.personalAccount.findFirst({ where: { id, userId } });
    if (!account) throw new HttpError(404, "Compte personnel introuvable.");
    return tx.personalAccount.update({ where: { userId_id: { id, userId } }, data: input });
  });
}

export async function createPersonalCategory(identity: PersonalIdentity, raw: unknown) {
  const input = personalCategoryInput.parse(raw);
  return personalWrite(identity, (tx, userId) =>
    tx.personalCategory.create({ data: { ...input, userId } }),
  );
}

async function transactionData(
  tx: Prisma.TransactionClient,
  identity: PersonalIdentity,
  raw: unknown,
) {
  const userId = requirePersonal(identity);
  const input = personalTransactionInput.parse(raw);
  const amountMinor = parseMoney(input.amount);
  if (amountMinor <= 0n) throw new HttpError(400, "Le montant doit être supérieur à zéro.");
  const account = await tx.personalAccount.findFirst({
    where: { id: input.accountId, userId, isArchived: false },
  });
  if (!account) throw new HttpError(404, "Compte personnel indisponible.");
  if (account.currency !== identity.personalCurrency)
    throw new HttpError(400, "Devise du compte incompatible.");
  let destinationAccountId: string | null = null;
  if (input.type === "TRANSFER") {
    if (!input.destinationAccountId || input.destinationAccountId === account.id)
      throw new HttpError(400, "Choisissez deux comptes distincts.");
    const destination = await tx.personalAccount.findFirst({
      where: { id: input.destinationAccountId, userId, isArchived: false },
    });
    if (!destination) throw new HttpError(404, "Compte destinataire indisponible.");
    if (destination.currency !== account.currency)
      throw new HttpError(400, "Le transfert nécessite deux comptes de même devise.");
    destinationAccountId = destination.id;
  } else if (input.destinationAccountId) {
    throw new HttpError(400, "Un compte destinataire est réservé aux transferts.");
  }
  if (input.categoryId) {
    const category = await tx.personalCategory.findFirst({
      where: { id: input.categoryId, userId },
    });
    if (!category) throw new HttpError(404, "Catégorie personnelle introuvable.");
    if (category.type !== input.type)
      throw new HttpError(400, "La catégorie ne correspond pas au type d’opération.");
  }
  if (
    input.attachmentId &&
    !(await tx.personalAttachment.findFirst({
      where: { id: input.attachmentId, userId },
      select: { id: true },
    }))
  )
    throw new HttpError(404, "Justificatif personnel introuvable.");
  return {
    userId,
    accountId: account.id,
    destinationAccountId,
    type: input.type,
    amountMinor,
    currency: account.currency,
    categoryId: input.categoryId || null,
    description: input.description,
    date: new Date(`${input.date}T00:00:00.000Z`),
    notes: input.notes,
    attachmentId: input.attachmentId || null,
    idempotencyKey: input.idempotencyKey,
  };
}

export async function savePersonalTransaction(
  identity: PersonalIdentity,
  raw: unknown,
  id?: string,
) {
  if (id) z.uuid().parse(id);
  const input = personalTransactionInput.parse(raw);
  const version = id ? z.object({ updatedAt: z.iso.datetime() }).parse(raw).updatedAt : undefined;
  return personalWrite(identity, async (tx, userId) => {
    if (id) {
      const previous = await tx.personalTransaction.findFirst({ where: { id, userId } });
      if (!previous) throw new HttpError(404, "Transaction personnelle introuvable.");
      if (previous.updatedAt.toISOString() !== version)
        throw new HttpError(409, "Cette transaction a été modifiée. Rechargez la liste.");
      const data = await transactionData(tx, identity, input);
      return tx.personalTransaction.update({
        where: { userId_id: { id, userId } },
        data: { ...data, idempotencyKey: previous.idempotencyKey },
      });
    }
    const existing = await tx.personalTransaction.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing) return existing;
    const data = await transactionData(tx, identity, input);
    // A transfer is one immutable pair of source/destination references in one DB row.
    // Its debit and credit cannot be partially saved; balances derive from that row.
    return tx.personalTransaction.create({ data });
  });
}

export async function savePersonalBudget(identity: PersonalIdentity, raw: unknown) {
  const input = personalBudgetInput.parse(raw);
  const limitMinor = parseMoney(input.limit);
  if (limitMinor <= 0n) throw new HttpError(400, "Le budget doit être supérieur à zéro.");
  return personalWrite(identity, async (tx, userId) => {
    const category = await tx.personalCategory.findFirst({
      where: { id: input.categoryId, userId, type: "EXPENSE" },
    });
    if (!category) throw new HttpError(404, "Catégorie de dépense introuvable.");
    const key = {
      userId,
      categoryId: category.id,
      month: input.month,
      year: input.year,
      currency: identity.personalCurrency,
    };
    return tx.personalBudget.upsert({
      where: { userId_categoryId_month_year_currency: key },
      create: { ...key, limitMinor },
      update: { limitMinor },
    });
  });
}
