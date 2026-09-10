import { z } from "zod";
import { calculateLines, lineInput } from "../lib/money";
import {
  Actor,
  assertClientAccess,
  assertIdempotentOwner,
  assertSalesperson,
  atomic,
  BusinessError,
  companyCurrency,
  dateInput,
  idInput,
  nextNumber,
  requirePermission,
} from "../lib/finance-context";
import { audit } from "./audit.service";

const saleInput = z.object({
  clientId: idInput,
  salespersonId: idInput.optional(),
  idempotencyKey: idInput,
  date: dateInput,
  dueDate: dateInput,
  notes: z.string().max(5000).optional(),
  terms: z.string().max(5000).optional(),
  lines: z.array(lineInput).min(1).max(100),
});

export async function createSale(actor: Actor, raw: unknown) {
  requirePermission(actor, "sales.create");
  const input = saleInput.parse(raw);
  const calculated = calculateLines(input.lines);
  return atomic(async (tx) => {
    const prior = await tx.sale.findUnique({
      where: {
        companyId_idempotencyKey: {
          companyId: actor.companyId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      include: { lines: true, invoice: true },
    });
    if (prior) {
      assertIdempotentOwner(actor, prior.createdById);
      return prior;
    }
    const client = await assertClientAccess(tx, actor, input.clientId);
    const salespersonId =
      actor.role === "SALESPERSON" ? actor.id : (input.salespersonId ?? client.salespersonId);
    if (input.salespersonId && actor.role === "SALESPERSON" && input.salespersonId !== actor.id)
      throw new BusinessError("Attribution commerciale non autorisée.", 403);
    if (salespersonId) await assertSalesperson(tx, actor, salespersonId);
    if (client.creditLimitMinor > 0n) {
      const invoices = await tx.invoice.findMany({
        where: { companyId: actor.companyId, clientId: client.id, status: { not: "CANCELLED" } },
        select: { totalMinor: true, paidMinor: true },
      });
      const debt = invoices.reduce(
        (sum, invoice) => sum + invoice.totalMinor - invoice.paidMinor,
        0n,
      );
      if (debt + calculated.totalMinor > client.creditLimitMinor)
        throw new BusinessError("La limite de crédit de ce client serait dépassée.");
    }
    const date = input.date ? new Date(input.date) : new Date();
    const dueDate = input.dueDate
      ? new Date(input.dueDate)
      : new Date(date.getTime() + 30 * 86400000);
    if (dueDate < date) throw new BusinessError("L’échéance doit suivre la date de facture.");
    const currency = await companyCurrency(tx, actor.companyId);
    const { lines, ...totals } = calculated;
    const common = {
      companyId: actor.companyId,
      clientId: client.id,
      salespersonId,
      date,
      currency,
      notes: input.notes,
      createdById: actor.id,
      ...totals,
    };
    const sale = await tx.sale.create({
      data: {
        ...common,
        number: await nextNumber(tx, actor.companyId, "VTE", date),
        idempotencyKey: input.idempotencyKey,
        status: "INVOICED",
        lines: { create: lines },
      },
    });
    const invoice = await tx.invoice.create({
      data: {
        ...common,
        saleId: sale.id,
        number: await nextNumber(tx, actor.companyId, "FAC", date),
        dueDate,
        terms: input.terms,
        status: "ISSUED",
        lines: { create: lines },
      },
    });
    await audit(tx, actor, {
      action: "CREATE",
      entity: "Sale",
      entityId: sale.id,
      after: { ...sale, lines },
    });
    await audit(tx, actor, {
      action: "ISSUE",
      entity: "Invoice",
      entityId: invoice.id,
      after: invoice,
    });
    return tx.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { lines: true, invoice: true },
    });
  });
}

export async function syncInvoice(
  tx: import("../lib/finance-context").Tx,
  companyId: string,
  invoiceId: string,
) {
  const invoice = await tx.invoice.findFirstOrThrow({ where: { companyId, id: invoiceId } });
  const aggregate = await tx.payment.aggregate({
    where: { companyId, invoiceId, status: "VALIDATED" },
    _sum: { amountMinor: true },
  });
  const paidMinor = aggregate._sum.amountMinor ?? 0n;
  if (paidMinor < 0n || paidMinor > invoice.totalMinor)
    throw new BusinessError("État financier de la facture incohérent.", 409);
  const status =
    paidMinor === invoice.totalMinor ? "PAID" : paidMinor > 0n ? "PARTIALLY_PAID" : "ISSUED";
  const updated = await tx.invoice.update({
    where: { id: invoiceId },
    data: { paidMinor, status },
  });
  await tx.sale.update({
    where: { id: invoice.saleId },
    data: { status: status === "ISSUED" ? "INVOICED" : status },
  });
  return updated;
}

export async function cancelInvoice(actor: Actor, raw: unknown) {
  requirePermission(actor, "invoices.edit");
  const input = z.object({ id: idInput, reason: z.string().trim().min(5).max(1000) }).parse(raw);
  return atomic(async (tx) => {
    const before = await tx.invoice.findFirst({
      where: {
        id: input.id,
        companyId: actor.companyId,
        ...(actor.role === "SALESPERSON" ? { salespersonId: actor.id } : {}),
      },
    });
    if (!before) throw new BusinessError("Facture introuvable.", 404);
    if (before.status === "CANCELLED") return before;
    const payments = await tx.payment.count({
      where: { companyId: actor.companyId, invoiceId: before.id, status: "VALIDATED" },
    });
    if (before.paidMinor !== 0n || payments > 0)
      throw new BusinessError(
        "Annulez d’abord les paiements de cette facture avant de l’annuler.",
        409,
      );
    const saleBefore = await tx.sale.findFirstOrThrow({
      where: { companyId: actor.companyId, id: before.saleId },
    });
    const after = await tx.invoice.update({
      where: { id: before.id },
      data: { status: "CANCELLED" },
    });
    const saleAfter = await tx.sale.update({
      where: { id: before.saleId },
      data: { status: "CANCELLED" },
    });
    await audit(tx, actor, {
      action: "CANCEL",
      entity: "Invoice",
      entityId: before.id,
      before,
      after: { ...after, cancellationReason: input.reason },
    });
    await audit(tx, actor, {
      action: "CANCEL",
      entity: "Sale",
      entityId: before.saleId,
      before: saleBefore,
      after: { ...saleAfter, cancellationReason: input.reason },
    });
    return after;
  });
}
