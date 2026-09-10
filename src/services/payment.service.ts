import { z } from "zod";
import {
  Actor,
  assertCashAccess,
  assertClientAccess,
  assertIdempotentOwner,
  assertSalesperson,
  atomic,
  BusinessError,
  dateInput,
  idInput,
  nextNumber,
  paymentMethod,
  requirePermission,
} from "../lib/finance-context";
import { moneyInput, parseMoney } from "../lib/money";
import { audit, notify } from "./audit.service";
import { syncInvoice } from "./invoice.service";

const inputSchema = z.object({
  invoiceId: idInput,
  amount: moneyInput,
  method: paymentMethod,
  cashAccountId: idInput.optional(),
  salespersonId: idInput.optional(),
  date: dateInput,
  reference: z.string().max(300).optional(),
  comment: z.string().max(5000).optional(),
  idempotencyKey: idInput,
});

export async function createPayment(actor: Actor, raw: unknown) {
  requirePermission(actor, "payments.create");
  const input = inputSchema.parse(raw);
  const amountMinor = parseMoney(input.amount);
  if (amountMinor <= 0n) throw new BusinessError("Le montant doit être supérieur à zéro.");
  if (Boolean(input.cashAccountId) === Boolean(input.salespersonId))
    throw new BusinessError("Choisissez une caisse ou un commercial comme destination.");
  return atomic(async (tx) => {
    const prior = await tx.payment.findUnique({
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
    const invoice = await tx.invoice.findFirst({
      where: { id: input.invoiceId, companyId: actor.companyId },
    });
    if (!invoice || (actor.role === "SALESPERSON" && invoice.salespersonId !== actor.id))
      throw new BusinessError("Facture introuvable.", 404);
    await assertClientAccess(tx, actor, invoice.clientId);
    if (["CANCELLED", "DRAFT"].includes(invoice.status))
      throw new BusinessError("Cette facture ne peut pas être encaissée.", 409);
    if (amountMinor > invoice.totalMinor - invoice.paidMinor)
      throw new BusinessError("Le paiement dépasse le montant restant dû.");
    if (input.salespersonId) {
      await assertSalesperson(tx, actor, input.salespersonId);
      if (actor.role === "CASHIER")
        throw new BusinessError("Un caissier doit encaisser dans sa caisse.", 403);
    }
    if (input.cashAccountId) {
      const account = await assertCashAccess(tx, actor, input.cashAccountId);
      if (account.currency !== invoice.currency)
        throw new BusinessError("La devise de la caisse diffère de celle de la facture.");
    }
    const date = input.date ? new Date(input.date) : new Date();
    const payment = await tx.payment.create({
      data: {
        companyId: actor.companyId,
        number: await nextNumber(tx, actor.companyId, "ENC", date),
        invoiceId: invoice.id,
        clientId: invoice.clientId,
        amountMinor,
        currency: invoice.currency,
        method: input.method,
        cashAccountId: input.cashAccountId,
        salespersonId: input.salespersonId,
        date,
        reference: input.reference,
        comment: input.comment,
        createdById: actor.id,
        idempotencyKey: input.idempotencyKey,
      },
    });
    const transaction = await tx.financialTransaction.create({
      data: {
        companyId: actor.companyId,
        number: await nextNumber(tx, actor.companyId, "TRX", date),
        type: "PAYMENT",
        amountMinor,
        currency: invoice.currency,
        destinationCashAccountId: input.cashAccountId,
        destinationSalespersonId: input.salespersonId,
        clientId: invoice.clientId,
        invoiceId: invoice.id,
        paymentId: payment.id,
        date,
        createdById: actor.id,
        validatedById: actor.id,
        comment: input.comment,
        reference: input.reference,
        idempotencyKey: input.idempotencyKey,
      },
    });
    const updated = await syncInvoice(tx, actor.companyId, invoice.id);
    await audit(tx, actor, {
      action: "CREATE",
      entity: "Payment",
      entityId: payment.id,
      after: payment,
    });
    await audit(tx, actor, {
      action: "VALIDATE",
      entity: "FinancialTransaction",
      entityId: transaction.id,
      after: transaction,
    });
    await audit(tx, actor, {
      action: "PAYMENT",
      entity: "Invoice",
      entityId: invoice.id,
      before: invoice,
      after: updated,
    });
    if (updated.status === "PAID")
      await notify(
        tx,
        actor,
        "Facture payée",
        `La facture ${invoice.number} est intégralement payée.`,
        "/factures",
      );
    return payment;
  });
}
