import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/finance-context";
import { HttpError } from "@/lib/http";
import { parseMoney } from "@/lib/money";
import { assertPermission } from "@/lib/rbac";
import { transactionScope } from "@/lib/record-access";
import { withTransactionLabels } from "./transaction-labels.service";

export const journalInclude = {
  cashEntry: true,
  receipt: { select: { id: true, number: true, createdAt: true } },
  client: { select: { id: true, name: true, phone: true } },
  supplier: { select: { id: true, name: true, phone: true } },
  invoice: { select: { id: true, number: true } },
  expense: {
    select: {
      id: true,
      number: true,
      description: true,
      method: true,
      beneficiaryName: true,
      beneficiaryKind: true,
      beneficiaryPhone: true,
      requester: { select: { name: true } },
    },
  },
  creator: { select: { id: true, name: true } },
  validator: { select: { id: true, name: true } },
  reversal: { select: { id: true, number: true, date: true } },
  reversalOf: {
    select: {
      id: true,
      number: true,
      cashEntry: true,
      expense: {
        select: {
          beneficiaryName: true,
          beneficiaryKind: true,
          beneficiaryPhone: true,
          description: true,
          method: true,
        },
      },
    },
  },
} satisfies Prisma.FinancialTransactionInclude;

type Endpoints = {
  sourceCashAccountId: string | null;
  destinationCashAccountId: string | null;
  sourceSalespersonId: string | null;
  destinationSalespersonId: string | null;
};

/** Direction relative to the actor's complete authorized funds, including reversals. */
export function movementDirection(actor: Actor, row: Endpoints): "IN" | "OUT" | "INTERNAL" {
  const inside = (cash: string | null, person: string | null) => {
    if (actor.role === "SALESPERSON") return person === actor.id;
    if (actor.role === "CASHIER") return !!cash && (actor.cashAccountIds ?? []).includes(cash);
    return !!(cash || person);
  };
  const source = inside(row.sourceCashAccountId, row.sourceSalespersonId);
  const destination = inside(row.destinationCashAccountId, row.destinationSalespersonId);
  return source === destination ? "INTERNAL" : destination ? "IN" : "OUT";
}

export function journalPeriod(params: URLSearchParams) {
  const from = new Date(z.string().datetime({ offset: true }).parse(params.get("from")));
  const to = new Date(z.string().datetime({ offset: true }).parse(params.get("to")));
  if (+from >= +to || +to - +from > 366 * 86_400_000)
    throw new HttpError(400, "Choisissez une période valide de 366 jours maximum.");
  return { from, to };
}

export function transactionSearch(q: string | null): Prisma.FinancialTransactionWhereInput {
  const text = q?.trim().slice(0, 150);
  if (!text) return {};
  const contains = { contains: text, mode: "insensitive" as const };
  const OR: Prisma.FinancialTransactionWhereInput[] = [
    { number: contains },
    { reference: contains },
    { comment: contains },
    { client: { name: contains } },
    { client: { phone: contains } },
    { supplier: { name: contains } },
    { supplier: { phone: contains } },
    { invoice: { number: contains } },
    { creator: { name: contains } },
    { cashEntry: { partyName: contains } },
    { cashEntry: { phone: contains } },
    { cashEntry: { description: contains } },
    { expense: { beneficiaryName: contains } },
    { expense: { beneficiaryPhone: contains } },
    { expense: { description: contains } },
    { expense: { reference: contains } },
    { reversalOf: { cashEntry: { partyName: contains } } },
    { reversalOf: { cashEntry: { phone: contains } } },
  ];
  try {
    OR.push({ amountMinor: parseMoney(text.replace(/[\s\u00a0\u202f]/g, "").replace(",", ".")) });
  } catch {
    /* A name or reference does not need to be a monetary amount. */
  }
  return { OR };
}

export function journalWhere(
  actor: Actor,
  params: URLSearchParams,
): Prisma.FinancialTransactionWhereInput {
  const { from, to } = journalPeriod(params);
  return {
    AND: [
      transactionScope(actor),
      { date: { gte: from, lt: to }, status: "VALIDATED" },
      transactionSearch(params.get("q")),
    ],
  };
}

export async function journalRows(
  tx: Prisma.TransactionClient,
  actor: Actor,
  where: Prisma.FinancialTransactionWhereInput,
  skip: number,
  take: number,
) {
  const records = await tx.financialTransaction.findMany({
    where,
    include: journalInclude,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    skip,
    take,
  });
  const payments = await tx.payment.findMany({
    where: {
      companyId: actor.companyId,
      id: { in: records.flatMap((row) => (row.paymentId ? [row.paymentId] : [])) },
    },
    select: { id: true, method: true, number: true },
  });
  const methods = new Map(payments.map((row) => [row.id, row]));
  const labelled = await withTransactionLabels(actor, records, tx);
  return labelled.map((row) => {
    const entry = row.cashEntry ?? row.reversalOf?.cashEntry;
    const expense = row.expense ?? row.reversalOf?.expense;
    return {
      ...row,
      partyName:
        entry?.partyName ??
        expense?.beneficiaryName ??
        row.client?.name ??
        row.supplier?.name ??
        row.sourceSalesperson?.name ??
        row.expense?.requester.name ??
        null,
      partyKind:
        entry?.partyKind ??
        expense?.beneficiaryKind ??
        (row.client
          ? "CLIENT"
          : row.supplier
            ? "SUPPLIER"
            : row.sourceSalesperson
              ? "SALESPERSON"
              : null),
      phone:
        entry?.phone ??
        expense?.beneficiaryPhone ??
        row.client?.phone ??
        row.supplier?.phone ??
        null,
      description: entry?.description ?? expense?.description ?? row.comment,
      // A reviewed expense can be paid again after reversal with a different method.
      // Its current method cannot describe the cancelled historical payment.
      method: ["REVERSAL", "ADJUSTMENT"].includes(row.type)
        ? null
        : (entry?.method ??
          methods.get(row.paymentId ?? "")?.method ??
          (!row.reversal ? expense?.method : null) ??
          null),
      paymentNumber: methods.get(row.paymentId ?? "")?.number ?? null,
      reversed: !!row.reversal,
      direction: movementDirection(actor, row),
    };
  });
}

export async function getDaybook(actor: Actor, params: URLSearchParams) {
  assertPermission(actor, "transactions.view");
  const where = journalWhere(actor, params);
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
    .max(100)
    .parse(params.get("pageSize") ?? 25);
  return db.$transaction(
    async (tx) => {
      const [items, total, groups, company] = await Promise.all([
        journalRows(tx, actor, where, (page - 1) * pageSize, pageSize),
        tx.financialTransaction.count({ where }),
        tx.financialTransaction.groupBy({
          by: [
            "sourceCashAccountId",
            "destinationCashAccountId",
            "sourceSalespersonId",
            "destinationSalespersonId",
          ],
          where,
          _sum: { amountMinor: true },
        }),
        tx.company.findUniqueOrThrow({
          where: { id: actor.companyId },
          select: { currency: true },
        }),
      ]);
      let inMinor = 0n,
        outMinor = 0n;
      for (const group of groups) {
        const direction = movementDirection(actor, group);
        if (direction === "IN") inMinor += group._sum.amountMinor ?? 0n;
        if (direction === "OUT") outMinor += group._sum.amountMinor ?? 0n;
      }
      return {
        items,
        total,
        page,
        pageSize,
        currency: company.currency,
        totals: { inMinor, outMinor, netMinor: inMinor - outMinor },
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 20000 },
  );
}
