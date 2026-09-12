import { z } from "zod";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/finance-context";
import { assertPermission } from "@/lib/rbac";
import { audit } from "./audit.service";
import { journalPeriod, journalRows, journalWhere } from "./daybook.service";

/** Versioned interchange data, deliberately independent of any ERP's chart of accounts. */
export async function accountingExport(actor: Actor, params: URLSearchParams) {
  assertPermission(actor, "reports.export");
  assertPermission(actor, "transactions.view");
  const { from, to } = journalPeriod(params);
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(1_000_000)
    .parse(params.get("page") ?? 1);
  const pageSize = z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .parse(params.get("pageSize") ?? 250);
  const where = journalWhere(actor, params);
  return db.$transaction(
    async (tx) => {
      const [rows, total] = await Promise.all([
        journalRows(tx, actor, where, (page - 1) * pageSize, pageSize),
        tx.financialTransaction.count({ where }),
      ]);
      const items = rows.map((row) => ({
        id: row.id,
        companyId: row.companyId,
        number: row.number,
        type: row.type,
        occurredAt: row.date.toISOString(),
        recordedAt: row.createdAt.toISOString(),
        amount: { minor: row.amountMinor.toString(), currency: row.currency, exponent: 2 },
        source: row.sourceCashAccountId
          ? { kind: "CASH_ACCOUNT", id: row.sourceCashAccountId, label: row.sourceLabel }
          : row.sourceSalespersonId
            ? { kind: "SALESPERSON_WALLET", id: row.sourceSalespersonId, label: row.sourceLabel }
            : { kind: "EXTERNAL", id: row.clientId ?? row.supplierId, label: row.sourceLabel },
        destination: row.destinationCashAccountId
          ? { kind: "CASH_ACCOUNT", id: row.destinationCashAccountId, label: row.destinationLabel }
          : row.destinationSalespersonId
            ? {
                kind: "SALESPERSON_WALLET",
                id: row.destinationSalespersonId,
                label: row.destinationLabel,
              }
            : { kind: "EXTERNAL", id: row.clientId ?? row.supplierId, label: row.destinationLabel },
        counterparty: {
          name: row.partyName,
          kind: row.partyKind,
          phone: row.phone,
          clientId: row.clientId,
          supplierId: row.supplierId,
        },
        method: row.method,
        description: row.description,
        reference: row.reference,
        documents: {
          invoice: row.invoice,
          expense: row.expense ? { id: row.expense.id, number: row.expense.number } : null,
          paymentId: row.paymentId,
          receipt: row.receipt,
        },
        createdBy: row.creator,
        validatedBy: row.validator,
        reversalOfId: row.reversalOfId,
        reversedById: row.reversal?.id ?? null,
      }));
      await audit(tx, actor, {
        action: "EXPORT",
        entity: "AccountingExport",
        entityId: "v1",
        after: { from, to, page, pageSize, count: items.length },
      });
      return {
        schemaVersion: "orange.accounting.v1",
        companyId: actor.companyId,
        generatedAt: new Date().toISOString(),
        period: { from: from.toISOString(), toExclusive: to.toISOString() },
        page,
        pageSize,
        total,
        nextPage: page * pageSize < total ? page + 1 : null,
        items,
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 20000 },
  );
}
