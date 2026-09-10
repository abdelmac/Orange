import { z } from "zod";
import { db } from "../lib/db";
import {
  Actor,
  assertCashAccess,
  assertIdempotentOwner,
  assertSalesperson,
  atomic,
  BusinessError,
  companyCurrency,
  dateInput,
  idInput,
  ledgerBalance,
  nextNumber,
  requirePermission,
} from "../lib/finance-context";
import { formatMoney, moneyInput, parseMoney } from "../lib/money";
import { audit, notify } from "./audit.service";

export async function getSalespersonBalance(actor: Actor, salespersonId: string) {
  requirePermission(actor, "cash.view");
  await assertSalesperson(db, actor, salespersonId);
  return ledgerBalance(db, actor.companyId, "salesperson", salespersonId);
}

export async function handoverCash(actor: Actor, raw: unknown) {
  requirePermission(actor, "cash.handover");
  const input = z
    .object({
      salespersonId: idInput.optional(),
      cashAccountId: idInput,
      amount: moneyInput,
      date: dateInput,
      comment: z.string().max(5000).optional(),
      idempotencyKey: idInput,
    })
    .parse(raw);
  const salespersonId = input.salespersonId ?? actor.id;
  const amountMinor = parseMoney(input.amount);
  if (amountMinor <= 0n) throw new BusinessError("Le montant doit être supérieur à zéro.");
  return atomic(async (tx) => {
    const prior = await tx.salespersonCashHandover.findUnique({
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
    await assertSalesperson(tx, actor, salespersonId);
    const cash = await assertCashAccess(tx, actor, input.cashAccountId, true);
    const currency = await companyCurrency(tx, actor.companyId);
    if (cash.currency !== currency)
      throw new BusinessError("La devise de la caisse est incompatible.");
    if ((await ledgerBalance(tx, actor.companyId, "salesperson", salespersonId)) < amountMinor)
      throw new BusinessError("La remise dépasse le montant détenu par ce commercial.");
    const date = input.date ? new Date(input.date) : new Date();
    const transaction = await tx.financialTransaction.create({
      data: {
        companyId: actor.companyId,
        number: await nextNumber(tx, actor.companyId, "TRX", date),
        type: "HANDOVER",
        amountMinor,
        currency,
        sourceSalespersonId: salespersonId,
        destinationCashAccountId: cash.id,
        date,
        createdById: actor.id,
        validatedById: actor.id,
        comment: input.comment,
        idempotencyKey: input.idempotencyKey,
      },
    });
    const handover = await tx.salespersonCashHandover.create({
      data: {
        companyId: actor.companyId,
        salespersonId,
        cashAccountId: cash.id,
        amountMinor,
        transactionId: transaction.id,
        createdById: actor.id,
        date,
        comment: input.comment,
        idempotencyKey: input.idempotencyKey,
      },
    });
    await audit(tx, actor, {
      action: "HANDOVER",
      entity: "FinancialTransaction",
      entityId: transaction.id,
      after: { ...transaction, handoverId: handover.id },
    });
    const salesperson = await tx.user.findUniqueOrThrow({
      where: { id: salespersonId },
      select: { name: true },
    });
    await notify(
      tx,
      actor,
      "Remise en caisse",
      `${salesperson.name} a remis ${formatMoney(amountMinor, currency)} à ${cash.name}.`,
      "/caisse",
      "payments.validate",
    );
    return handover;
  });
}
