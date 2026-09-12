import type { CashEntry, Expense, FinancialTransaction } from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  type Actor,
  assertCashAccess,
  assertIdempotentOwner,
  assertSalesperson,
  atomic,
  BusinessError,
  companyCurrency,
  dateInput,
  idInput,
  nextNumber,
  paymentMethod,
  requirePermission,
} from "../lib/finance-context";
import { moneyInput, parseMoney } from "../lib/money";
import { audit, notify } from "./audit.service";

export const partyKindInput = z.enum([
  "CLIENT",
  "DRIVER",
  "SALESPERSON",
  "EMPLOYEE",
  "SUPPLIER",
  "OTHER",
]);
export const quickEntryInput = z.object({
  direction: z.enum(["IN", "OUT"]),
  amount: moneyInput,
  partyName: z.string().trim().min(1).max(200),
  partyKind: partyKindInput,
  phone: z.string().trim().max(60).optional(),
  description: z.string().trim().min(3).max(5000),
  method: paymentMethod.default("CASH"),
  cashAccountId: idInput.optional(),
  salespersonId: idInput.optional(),
  date: dateInput,
  reference: z.string().trim().max(300).optional(),
  idempotencyKey: idInput,
});
type EntryInput = z.infer<typeof quickEntryInput>;
export type QuickEntryResult = {
  kind: "receipt" | "expense";
  id: string;
  number: string;
  transactionId?: string;
  status: string;
};

function idempotencyConflict(): never {
  throw new BusinessError("Cette clé correspond à une autre saisie. Rechargez le formulaire.", 409);
}

function inputFingerprint(input: EntryInput, amountMinor: bigint) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        direction: input.direction,
        amountMinor: amountMinor.toString(),
        partyName: input.partyName,
        partyKind: input.partyKind,
        phone: input.phone || null,
        description: input.description,
        method: input.method,
        cashAccountId: input.cashAccountId ?? null,
        salespersonId: input.salespersonId ?? null,
        date: input.date ? new Date(input.date).toISOString() : null,
        reference: input.reference || null,
      }),
    )
    .digest("hex");
}

function checkReceiptReplay(
  actor: Actor,
  input: EntryInput,
  transaction: FinancialTransaction & {
    cashEntry: CashEntry | null;
    reversal: { id: string } | null;
  },
  amountMinor: bigint,
) {
  assertIdempotentOwner(actor, transaction.createdById);
  const entry = transaction.cashEntry;
  if (
    input.direction !== "IN" ||
    transaction.type !== "CASH_RECEIPT" ||
    !entry ||
    transaction.amountMinor !== amountMinor ||
    transaction.destinationCashAccountId !== (input.cashAccountId ?? null) ||
    transaction.destinationSalespersonId !== (input.salespersonId ?? null) ||
    transaction.reference !== (input.reference || null) ||
    entry.partyName !== input.partyName ||
    entry.partyKind !== input.partyKind ||
    entry.phone !== (input.phone || null) ||
    entry.description !== input.description ||
    entry.method !== input.method ||
    (input.date && transaction.date.getTime() !== new Date(input.date).getTime())
  )
    idempotencyConflict();
  return {
    kind: "receipt" as const,
    id: entry.id,
    transactionId: transaction.id,
    number: transaction.number,
    status: transaction.reversal ? "REVERSED" : transaction.status,
  };
}

function checkExpenseReplay(
  actor: Actor,
  input: EntryInput,
  expense: Expense,
  amountMinor: bigint,
) {
  assertIdempotentOwner(actor, expense.requesterId);
  if (
    input.direction !== "OUT" ||
    expense.quickEntryFingerprint !== inputFingerprint(input, amountMinor)
  )
    idempotencyConflict();
  return {
    kind: "expense" as const,
    id: expense.id,
    number: expense.number,
    status: expense.status,
  };
}

export async function createQuickEntry(actor: Actor, raw: unknown): Promise<QuickEntryResult> {
  const input = quickEntryInput.parse(raw);
  const amountMinor = parseMoney(input.amount);
  if (amountMinor <= 0n) throw new BusinessError("Le montant doit être supérieur à zéro.");
  if (input.direction === "OUT") {
    requirePermission(actor, "expenses.create");
    if (input.salespersonId)
      throw new BusinessError("Une demande de dépense ne débite pas un portefeuille commercial.");
  } else {
    if (!input.cashAccountId && !input.salespersonId && actor.role === "SALESPERSON")
      input.salespersonId = actor.id;
    if (Boolean(input.cashAccountId) === Boolean(input.salespersonId))
      throw new BusinessError("Choisissez une caisse ou votre portefeuille commercial.");
    if (input.cashAccountId) requirePermission(actor, "cash.deposit");
    else {
      requirePermission(actor, "payments.create");
      if (input.salespersonId !== actor.id)
        throw new BusinessError("L’encaissement dans un portefeuille doit vous appartenir.", 403);
    }
  }
  return atomic(async (tx) => {
    const where = {
      companyId_idempotencyKey: {
        companyId: actor.companyId,
        idempotencyKey: input.idempotencyKey,
      },
    };
    const previousTransaction = await tx.financialTransaction.findUnique({
      where,
      include: { cashEntry: true, reversal: { select: { id: true } } },
    });
    const previousExpense = await tx.expense.findUnique({ where });
    if (previousTransaction && previousExpense) idempotencyConflict();
    if (previousTransaction)
      return checkReceiptReplay(actor, input, previousTransaction, amountMinor);
    if (previousExpense) return checkExpenseReplay(actor, input, previousExpense, amountMinor);

    const currency = await companyCurrency(tx, actor.companyId);
    if (input.cashAccountId) {
      // A request may nominate a company cash account without being authorized to
      // spend it. Payment is still subject to approval and cashier assignment.
      const account =
        input.direction === "IN"
          ? await assertCashAccess(tx, actor, input.cashAccountId)
          : await tx.cashAccount.findFirst({
              where: { id: input.cashAccountId, companyId: actor.companyId, active: true },
            });
      if (!account) throw new BusinessError("Caisse introuvable.", 404);
      if (account.currency !== currency)
        throw new BusinessError("La devise de la caisse est incompatible.");
    }
    if (input.salespersonId) await assertSalesperson(tx, actor, input.salespersonId);
    const date = input.date ? new Date(input.date) : new Date();
    if (input.direction === "OUT") {
      const expense = await tx.expense.create({
        data: {
          companyId: actor.companyId,
          number: await nextNumber(tx, actor.companyId, "DEP", date),
          requesterId: actor.id,
          description: input.description,
          amountMinor,
          currency,
          date,
          method: input.method,
          cashAccountId: input.cashAccountId,
          beneficiaryName: input.partyName,
          beneficiaryKind: input.partyKind,
          beneficiaryPhone: input.phone || null,
          reference: input.reference || null,
          quickEntryFingerprint: inputFingerprint(input, amountMinor),
          idempotencyKey: input.idempotencyKey,
        },
      });
      await audit(tx, actor, {
        action: "SUBMIT",
        entity: "Expense",
        entityId: expense.id,
        after: expense,
      });
      await notify(
        tx,
        actor,
        "Dépense à valider",
        `${actor.name} a soumis la dépense ${expense.number} pour ${input.partyName}.`,
        "/depenses",
        "expenses.validate",
      );
      return { kind: "expense", id: expense.id, number: expense.number, status: expense.status };
    }
    const transaction = await tx.financialTransaction.create({
      data: {
        companyId: actor.companyId,
        number: await nextNumber(tx, actor.companyId, "TRX", date),
        type: "CASH_RECEIPT",
        amountMinor,
        currency,
        destinationCashAccountId: input.cashAccountId,
        destinationSalespersonId: input.salespersonId,
        date,
        createdById: actor.id,
        validatedById: actor.id,
        comment: input.description,
        reference: input.reference || null,
        idempotencyKey: input.idempotencyKey,
      },
    });
    const entry = await tx.cashEntry.create({
      data: {
        companyId: actor.companyId,
        transactionId: transaction.id,
        partyName: input.partyName,
        partyKind: input.partyKind,
        phone: input.phone || null,
        description: input.description,
        method: input.method,
      },
    });
    await audit(tx, actor, {
      action: "CREATE",
      entity: "CashEntry",
      entityId: entry.id,
      after: entry,
    });
    await audit(tx, actor, {
      action: "VALIDATE",
      entity: "FinancialTransaction",
      entityId: transaction.id,
      after: { ...transaction, cashEntry: entry },
    });
    return {
      kind: "receipt",
      id: entry.id,
      number: transaction.number,
      transactionId: transaction.id,
      status: transaction.status,
    };
  });
}
