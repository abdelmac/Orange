import { z } from "zod";
import { db } from "../lib/db";
import {
  Actor,
  assertCashAccess,
  assertIdempotentOwner,
  atomic,
  BusinessError,
  companyCurrency,
  dateInput,
  idInput,
  ledgerBalance,
  nextNumber,
  requirePermission,
} from "../lib/finance-context";
import { moneyInput, parseMoney } from "../lib/money";
import { audit } from "./audit.service";

export async function getCashBalance(actor: Actor, cashAccountId: string) {
  requirePermission(actor, "cash.view");
  await assertCashAccess(db, actor, cashAccountId);
  return ledgerBalance(db, actor.companyId, "cash", cashAccountId);
}

const transferInput = z.object({
  sourceCashAccountId: idInput,
  destinationCashAccountId: idInput,
  amount: moneyInput,
  date: dateInput,
  comment: z.string().max(5000).optional(),
  idempotencyKey: idInput,
});

export async function transferCash(actor: Actor, raw: unknown) {
  requirePermission(actor, "cash.transfer");
  const input = transferInput.parse(raw);
  const amountMinor = parseMoney(input.amount);
  if (amountMinor <= 0n) throw new BusinessError("Le montant doit être supérieur à zéro.");
  if (input.sourceCashAccountId === input.destinationCashAccountId)
    throw new BusinessError("Sélectionnez deux caisses différentes.");
  return atomic(async (tx) => {
    const prior = await tx.cashTransfer.findUnique({
      where: {
        companyId_idempotencyKey: {
          companyId: actor.companyId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (prior) {
      assertIdempotentOwner(actor, prior.createdById);
      return prior;
    }
    const source = await assertCashAccess(tx, actor, input.sourceCashAccountId);
    const destination = await assertCashAccess(tx, actor, input.destinationCashAccountId);
    if (source.currency !== destination.currency)
      throw new BusinessError("Les caisses doivent avoir la même devise.");
    if ((await ledgerBalance(tx, actor.companyId, "cash", source.id)) < amountMinor)
      throw new BusinessError("Solde de caisse insuffisant.");
    const date = input.date ? new Date(input.date) : new Date();
    const transaction = await tx.financialTransaction.create({
      data: {
        companyId: actor.companyId,
        number: await nextNumber(tx, actor.companyId, "TRX", date),
        type: "TRANSFER",
        amountMinor,
        currency: source.currency,
        sourceCashAccountId: source.id,
        destinationCashAccountId: destination.id,
        date,
        createdById: actor.id,
        validatedById: actor.id,
        comment: input.comment,
        idempotencyKey: input.idempotencyKey,
      },
    });
    const transfer = await tx.cashTransfer.create({
      data: {
        companyId: actor.companyId,
        sourceCashAccountId: source.id,
        destinationCashAccountId: destination.id,
        amountMinor,
        transactionId: transaction.id,
        createdById: actor.id,
        date,
        comment: input.comment,
        idempotencyKey: input.idempotencyKey,
      },
    });
    await audit(tx, actor, {
      action: "TRANSFER",
      entity: "FinancialTransaction",
      entityId: transaction.id,
      after: { ...transaction, transferId: transfer.id },
    });
    return transfer;
  });
}

export async function adjustCash(actor: Actor, raw: unknown) {
  requirePermission(actor, "cash.adjust");
  const input = z
    .object({
      cashAccountId: idInput,
      amount: moneyInput,
      direction: z.enum(["IN", "OUT"]),
      reason: z.string().trim().min(5).max(1000),
      idempotencyKey: idInput,
    })
    .parse(raw);
  const amountMinor = parseMoney(input.amount);
  if (amountMinor <= 0n) throw new BusinessError("Le montant doit être supérieur à zéro.");
  return atomic(async (tx) => {
    const prior = await tx.financialTransaction.findUnique({
      where: {
        companyId_idempotencyKey: {
          companyId: actor.companyId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (prior) {
      assertIdempotentOwner(actor, prior.createdById);
      return prior;
    }
    const cash = await assertCashAccess(tx, actor, input.cashAccountId);
    const currency = await companyCurrency(tx, actor.companyId);
    if (cash.currency !== currency) throw new BusinessError("Devise incompatible.");
    if (
      input.direction === "OUT" &&
      (await ledgerBalance(tx, actor.companyId, "cash", cash.id)) < amountMinor
    )
      throw new BusinessError("Solde insuffisant.");
    const transaction = await tx.financialTransaction.create({
      data: {
        companyId: actor.companyId,
        number: await nextNumber(tx, actor.companyId, "TRX"),
        type: "ADJUSTMENT",
        amountMinor,
        currency,
        ...(input.direction === "IN"
          ? { destinationCashAccountId: cash.id }
          : { sourceCashAccountId: cash.id }),
        createdById: actor.id,
        validatedById: actor.id,
        comment: input.reason,
        idempotencyKey: input.idempotencyKey,
      },
    });
    await audit(tx, actor, {
      action: "ADJUST",
      entity: "FinancialTransaction",
      entityId: transaction.id,
      after: transaction,
    });
    return transaction;
  });
}
