import { z } from "zod";
import {
  Actor,
  assertIdempotentOwner,
  atomic,
  BusinessError,
  idInput,
  ledgerBalance,
  nextNumber,
  requirePermission,
} from "../lib/finance-context";
import { audit } from "./audit.service";
import { syncInvoice } from "./invoice.service";

export async function reverseTransaction(actor: Actor, raw: unknown) {
  requirePermission(actor, "transactions.reverse");
  const input = z
    .object({ id: idInput, reason: z.string().trim().min(5).max(1000), idempotencyKey: idInput })
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
      if (prior.reversalOfId !== input.id)
        throw new BusinessError("Cette clé d’opération est déjà utilisée.", 409);
      return prior;
    }
    const original = await tx.financialTransaction.findFirst({
      where: { id: input.id, companyId: actor.companyId },
      include: { reversal: true },
    });
    if (!original) throw new BusinessError("Transaction introuvable.", 404);
    if (original.type === "REVERSAL" || original.reversal)
      throw new BusinessError("Cette transaction ne peut plus être annulée.", 409);
    if (
      original.destinationCashAccountId &&
      (await ledgerBalance(tx, actor.companyId, "cash", original.destinationCashAccountId)) <
        original.amountMinor
    )
      throw new BusinessError(
        "La caisse ne dispose plus du montant nécessaire à l’annulation.",
        409,
      );
    if (
      original.destinationSalespersonId &&
      (await ledgerBalance(tx, actor.companyId, "salesperson", original.destinationSalespersonId)) <
        original.amountMinor
    )
      throw new BusinessError("Annulez d’abord la remise commerciale correspondante.", 409);
    const reversal = await tx.financialTransaction.create({
      data: {
        companyId: actor.companyId,
        number: await nextNumber(tx, actor.companyId, "TRX"),
        type: "REVERSAL",
        amountMinor: original.amountMinor,
        currency: original.currency,
        sourceCashAccountId: original.destinationCashAccountId,
        destinationCashAccountId: original.sourceCashAccountId,
        sourceSalespersonId: original.destinationSalespersonId,
        destinationSalespersonId: original.sourceSalespersonId,
        clientId: original.clientId,
        supplierId: original.supplierId,
        invoiceId: original.invoiceId,
        expenseId: original.expenseId,
        paymentId: original.paymentId,
        createdById: actor.id,
        validatedById: actor.id,
        reversalOfId: original.id,
        comment: input.reason,
        reference: original.number,
        idempotencyKey: input.idempotencyKey,
      },
    });
    if (original.paymentId) {
      const payment = await tx.payment.findFirstOrThrow({
        where: { id: original.paymentId, companyId: actor.companyId },
      });
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: { status: "REVERSED" },
      });
      const invoice = await tx.invoice.findFirstOrThrow({
        where: { id: payment.invoiceId, companyId: actor.companyId },
      });
      const updatedInvoice = await syncInvoice(tx, actor.companyId, payment.invoiceId);
      await audit(tx, actor, {
        action: "REVERSE",
        entity: "Payment",
        entityId: payment.id,
        before: payment,
        after: updated,
      });
      await audit(tx, actor, {
        action: "REVERSE_PAYMENT",
        entity: "Invoice",
        entityId: invoice.id,
        before: invoice,
        after: updatedInvoice,
      });
    }
    if (original.expenseId) {
      const expense = await tx.expense.findFirstOrThrow({
        where: { id: original.expenseId, companyId: actor.companyId },
      });
      const updated = await tx.expense.update({
        where: { id: expense.id },
        data: { status: "APPROVED", paidAt: null },
      });
      await audit(tx, actor, {
        action: "REVERSE_PAYMENT",
        entity: "Expense",
        entityId: expense.id,
        before: expense,
        after: updated,
      });
    }
    await audit(tx, actor, {
      action: "REVERSE",
      entity: "FinancialTransaction",
      entityId: reversal.id,
      after: reversal,
    });
    return reversal;
  });
}

export async function deleteTransaction(): Promise<never> {
  throw new BusinessError(
    "Les transactions financières ne peuvent pas être supprimées. Utilisez une annulation.",
    405,
  );
}
