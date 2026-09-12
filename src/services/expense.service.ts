import { z } from "zod";
import {
  Actor,
  assertCashAccess,
  assertCompany,
  assertIdempotentOwner,
  atomic,
  BusinessError,
  companyCurrency,
  dateInput,
  idInput,
  ledgerBalance,
  nextNumber,
  paymentMethod,
  requirePermission,
} from "../lib/finance-context";
import { moneyInput, parseMoney } from "../lib/money";
import { audit, notify } from "./audit.service";

export async function createExpense(actor: Actor, raw: unknown) {
  requirePermission(actor, "expenses.create");
  const input = z
    .object({
      description: z.string().trim().min(3).max(5000),
      amount: moneyInput,
      categoryId: idInput.optional(),
      supplierId: idInput.optional(),
      date: dateInput,
      method: paymentMethod.optional(),
      cashAccountId: idInput.optional(),
      comment: z.string().max(5000).optional(),
      idempotencyKey: idInput,
    })
    .parse(raw);
  const amountMinor = parseMoney(input.amount);
  if (amountMinor <= 0n) throw new BusinessError("Le montant doit être supérieur à zéro.");
  return atomic(async (tx) => {
    const prior = await tx.expense.findUnique({
      where: {
        companyId_idempotencyKey: {
          companyId: actor.companyId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (prior) {
      assertIdempotentOwner(actor, prior.requesterId);
      return prior;
    }
    if (input.supplierId) await assertCompany(tx, "supplier", input.supplierId, actor.companyId);
    if (input.categoryId)
      await assertCompany(tx, "expenseCategory", input.categoryId, actor.companyId);
    if (input.cashAccountId)
      await assertCompany(tx, "cashAccount", input.cashAccountId, actor.companyId);
    const date = input.date ? new Date(input.date) : new Date();
    const expense = await tx.expense.create({
      data: {
        companyId: actor.companyId,
        number: await nextNumber(tx, actor.companyId, "DEP", date),
        requesterId: actor.id,
        supplierId: input.supplierId,
        categoryId: input.categoryId,
        description: input.description,
        amountMinor,
        currency: await companyCurrency(tx, actor.companyId),
        date,
        method: input.method,
        cashAccountId: input.cashAccountId,
        comment: input.comment,
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
      `${actor.name} a soumis la dépense ${expense.number}.`,
      "/depenses",
      "expenses.validate",
    );
    return expense;
  });
}

const reviewInput = z.object({ id: idInput, comment: z.string().max(5000).optional() });

async function reviewExpense(actor: Actor, raw: unknown, status: "APPROVED" | "REJECTED") {
  requirePermission(actor, status === "APPROVED" ? "expenses.validate" : "expenses.reject");
  const input = reviewInput.parse(raw);
  return atomic(async (tx) => {
    const expense = await tx.expense.findFirst({
      where: { companyId: actor.companyId, id: input.id },
    });
    if (!expense) throw new BusinessError("Dépense introuvable.", 404);
    if (expense.status !== "PENDING")
      throw new BusinessError("Seules les dépenses en attente peuvent être examinées.", 409);
    if (expense.requesterId === actor.id && actor.role !== "ADMIN")
      throw new BusinessError("Une autre personne doit examiner votre demande.", 403);
    const updated = await tx.expense.update({
      where: { id: expense.id },
      data: {
        status,
        approverId: actor.id,
        approvedAt: new Date(),
        ...(input.comment ? { comment: input.comment } : {}),
      },
    });
    await audit(tx, actor, {
      action: status === "APPROVED" ? "APPROVE" : "REJECT",
      entity: "Expense",
      entityId: expense.id,
      before: expense,
      after: updated,
    });
    await tx.notification.create({
      data: {
        companyId: actor.companyId,
        userId: expense.requesterId,
        title: status === "APPROVED" ? "Dépense validée" : "Dépense refusée",
        message: `Votre dépense ${expense.number} a été ${status === "APPROVED" ? "validée" : "refusée"}.`,
        href: "/depenses",
      },
    });
    return updated;
  });
}

export const approveExpense = (actor: Actor, input: unknown) =>
  reviewExpense(actor, input, "APPROVED");
export const rejectExpense = (actor: Actor, input: unknown) =>
  reviewExpense(actor, input, "REJECTED");

export async function payExpense(actor: Actor, raw: unknown) {
  requirePermission(actor, "expenses.pay");
  const input = z
    .object({
      id: idInput,
      cashAccountId: idInput,
      method: paymentMethod.default("CASH"),
      date: dateInput,
      reference: z.string().max(300).optional(),
      idempotencyKey: idInput,
    })
    .parse(raw);
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
      if (prior.expenseId !== input.id || prior.type !== "EXPENSE")
        throw new BusinessError("Cette clé d’opération est déjà utilisée.", 409);
      return tx.expense.findFirstOrThrow({ where: { id: input.id, companyId: actor.companyId } });
    }
    const expense = await tx.expense.findFirst({
      where: { id: input.id, companyId: actor.companyId },
    });
    if (!expense) throw new BusinessError("Dépense introuvable.", 404);
    if (expense.status !== "APPROVED")
      throw new BusinessError("La dépense doit être validée avant paiement.", 409);
    if (expense.cashAccountId && expense.cashAccountId !== input.cashAccountId)
      throw new BusinessError("Utilisez la caisse prévue dans la dépense validée.", 409);
    const cash = await assertCashAccess(tx, actor, input.cashAccountId);
    if (cash.currency !== expense.currency)
      throw new BusinessError("La devise de la caisse est incompatible.");
    if ((await ledgerBalance(tx, actor.companyId, "cash", cash.id)) < expense.amountMinor)
      throw new BusinessError("Solde de caisse insuffisant.");
    const date = input.date ? new Date(input.date) : new Date();
    const transaction = await tx.financialTransaction.create({
      data: {
        companyId: actor.companyId,
        number: await nextNumber(tx, actor.companyId, "TRX", date),
        type: "EXPENSE",
        amountMinor: expense.amountMinor,
        currency: expense.currency,
        sourceCashAccountId: cash.id,
        supplierId: expense.supplierId,
        expenseId: expense.id,
        date,
        createdById: actor.id,
        validatedById: actor.id,
        reference: input.reference || expense.reference || undefined,
        idempotencyKey: input.idempotencyKey,
      },
    });
    const updated = await tx.expense.update({
      where: { id: expense.id },
      data: { status: "PAID", cashAccountId: cash.id, method: input.method, paidAt: date },
    });
    await audit(tx, actor, {
      action: "PAY",
      entity: "Expense",
      entityId: expense.id,
      before: expense,
      after: updated,
    });
    await audit(tx, actor, {
      action: "VALIDATE",
      entity: "FinancialTransaction",
      entityId: transaction.id,
      after: transaction,
    });
    return updated;
  });
}
