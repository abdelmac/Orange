import type { Prisma } from "@prisma/client";
import { db as database } from "@/lib/db";
import type { Actor } from "@/lib/finance-context";
import { assertPermission, hasPermission } from "@/lib/rbac";
import { expenseScope, invoiceScope, paymentScope, transactionScope } from "@/lib/record-access";
import { HttpError } from "@/lib/http";

const sum = <T>(items: T[], pick: (item: T) => bigint) =>
  items.reduce((total, item) => total + pick(item), 0n);
export function reportPeriod(params: URLSearchParams, now = new Date()) {
  const period = params.get("period") ?? params.get("range") ?? "month";
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  let to = new Date(day.getTime() + 86_400_000);
  if (period === "today") from = day;
  if (["7d", "7days", "week"].includes(period)) from = new Date(day.getTime() - 6 * 86_400_000);
  if (["30d", "30days"].includes(period)) from = new Date(day.getTime() - 29 * 86_400_000);
  if (["last-month", "previousMonth"].includes(period)) {
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }
  if (period === "year") from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  if (period === "custom" || params.get("from") || params.get("to")) {
    if (params.get("from")) from = new Date(`${params.get("from")}T00:00:00.000Z`);
    if (params.get("to"))
      to = new Date(new Date(`${params.get("to")}T00:00:00.000Z`).getTime() + 86_400_000);
  }
  if (
    !Number.isFinite(+from) ||
    !Number.isFinite(+to) ||
    from >= to ||
    (+to - +from) / 86_400_000 > 732
  )
    throw new HttpError(400, "Choisissez une période valide de deux ans maximum.");
  return { from, to, period, date: { gte: from, lt: to } };
}

export async function getDashboard(actor: Actor, params = new URLSearchParams()) {
  assertPermission(actor, "dashboard.view");
  return database.$transaction((tx) => dashboardSnapshot(actor, params, tx), {
    isolationLevel: "RepeatableRead",
    timeout: 20000,
  });
}

async function dashboardSnapshot(
  actor: Actor,
  params: URLSearchParams,
  db: Prisma.TransactionClient,
) {
  const { from, to, period, date } = reportPeriod(params);
  const companyId = actor.companyId;
  const commercial = actor.role === "SALESPERSON";
  const canSales = hasPermission(actor, "sales.view");
  const canCash = hasPermission(actor, "cash.view") && !commercial;
  const canReceivables = hasPermission(actor, "invoices.view") && actor.role !== "CASHIER";
  const canHeld =
    hasPermission(actor, "cash.view") &&
    hasPermission(actor, "salespeople.view") &&
    actor.role !== "CASHIER" &&
    actor.role !== "EMPLOYEE";
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(+today + 86_400_000);
  const month = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const historyDate = {
    gte: new Date(Math.min(+from, +month)),
    lt: new Date(Math.max(+to, +tomorrow)),
  };
  const saleWhere: Prisma.SaleWhereInput = {
    companyId,
    date: historyDate,
    status: { not: "CANCELLED" },
    ...(commercial ? { salespersonId: actor.id } : {}),
  };
  const [
    company,
    sales,
    expenses,
    invoices,
    payments,
    cashAccounts,
    heldIncoming,
    heldOutgoing,
    cashIncoming,
    cashOutgoing,
    recentTransactions,
    pendingExpenses,
    salespeople,
    quickCollections,
  ] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: companyId } }),
    canSales
      ? db.sale.findMany({ where: saleWhere, select: { date: true, totalMinor: true } })
      : [],
    hasPermission(actor, "expenses.view")
      ? db.expense.findMany({
          where: {
            AND: [
              expenseScope(actor),
              {
                OR: [
                  { status: { in: ["PENDING", "APPROVED"] } },
                  { status: "PAID", paidAt: historyDate },
                  { status: "PAID", paidAt: null, date: historyDate },
                ],
              },
            ],
          },
          select: {
            date: true,
            paidAt: true,
            amountMinor: true,
            status: true,
            supplierId: true,
            category: { select: { name: true } },
          },
        })
      : [],
    canReceivables
      ? db.invoice.findMany({
          where: { ...invoiceScope(actor), status: { notIn: ["CANCELLED", "PAID"] } },
          select: { totalMinor: true, paidMinor: true, dueDate: true },
        })
      : [],
    hasPermission(actor, "payments.view")
      ? db.payment.findMany({
          where: { ...paymentScope(actor), status: "VALIDATED", date },
          select: { amountMinor: true, date: true, salespersonId: true },
        })
      : [],
    canCash
      ? db.cashAccount.findMany({
          where: { companyId, ...(actor.role === "CASHIER" ? { responsibleId: actor.id } : {}) },
          include: { responsible: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        })
      : [],
    canHeld
      ? db.financialTransaction.groupBy({
          by: ["destinationSalespersonId"],
          where: {
            companyId,
            status: "VALIDATED",
            destinationSalespersonId: commercial ? actor.id : { not: null },
          },
          _sum: { amountMinor: true },
        })
      : [],
    canHeld
      ? db.financialTransaction.groupBy({
          by: ["sourceSalespersonId"],
          where: {
            companyId,
            status: "VALIDATED",
            sourceSalespersonId: commercial ? actor.id : { not: null },
          },
          _sum: { amountMinor: true },
        })
      : [],
    canCash
      ? db.financialTransaction.groupBy({
          by: ["destinationCashAccountId"],
          where: {
            ...transactionScope(actor),
            status: "VALIDATED",
            destinationCashAccountId: { not: null },
          },
          _sum: { amountMinor: true },
        })
      : [],
    canCash
      ? db.financialTransaction.groupBy({
          by: ["sourceCashAccountId"],
          where: {
            ...transactionScope(actor),
            status: "VALIDATED",
            sourceCashAccountId: { not: null },
          },
          _sum: { amountMinor: true },
        })
      : [],
    hasPermission(actor, "transactions.view")
      ? db.financialTransaction.findMany({
          where: { ...transactionScope(actor), date },
          include: {
            client: { select: { id: true, name: true } },
            creator: { select: { name: true } },
            invoice: { select: { number: true } },
          },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }],
          take: 8,
        })
      : [],
    hasPermission(actor, "expenses.view")
      ? db.expense.findMany({
          where: { ...expenseScope(actor), status: "PENDING" },
          include: { requester: { select: { name: true } }, category: true },
          orderBy: { createdAt: "desc" },
          take: 6,
        })
      : [],
    canHeld
      ? db.user.findMany({
          where: {
            companyId,
            salesperson: { isNot: null },
            ...(commercial ? { id: actor.id } : {}),
          },
          select: { id: true, name: true },
        })
      : [],
    hasPermission(actor, "payments.view")
      ? db.financialTransaction.findMany({
          where: { ...transactionScope(actor), type: "CASH_RECEIPT", reversal: null, date },
          select: { amountMinor: true, date: true, destinationSalespersonId: true },
        })
      : [],
  ]);
  const allCollections = [
    ...payments,
    ...quickCollections.map((row) => ({ ...row, salespersonId: row.destinationSalespersonId })),
  ];
  const heldMovements = [
    ...heldIncoming.map((row) => ({
      destinationSalespersonId: row.destinationSalespersonId,
      sourceSalespersonId: null,
      amountMinor: row._sum.amountMinor ?? 0n,
    })),
    ...heldOutgoing.map((row) => ({
      sourceSalespersonId: row.sourceSalespersonId,
      destinationSalespersonId: null,
      amountMinor: row._sum.amountMinor ?? 0n,
    })),
  ];
  const accounts = cashAccounts.map((account) => ({
    ...account,
    balanceMinor:
      (cashIncoming.find((row) => row.destinationCashAccountId === account.id)?._sum.amountMinor ??
        0n) -
      (cashOutgoing.find((row) => row.sourceCashAccountId === account.id)?._sum.amountMinor ?? 0n),
  }));
  const cashMinor = sum(accounts, (account) => account.balanceMinor);
  const salespersonHeldMinor = sum(
    heldMovements,
    (row) =>
      (row.destinationSalespersonId && (!commercial || row.destinationSalespersonId === actor.id)
        ? row.amountMinor
        : 0n) -
      (row.sourceSalespersonId && (!commercial || row.sourceSalespersonId === actor.id)
        ? row.amountMinor
        : 0n),
  );
  const within = (value: Date, start = from, end = to) => value >= start && value < end;
  const paidExpenses = expenses.filter((expense) => expense.status === "PAID");
  const selectedSales = sales.filter((sale) => within(sale.date));
  const selectedExpenses = paidExpenses.filter((expense) => within(expense.paidAt ?? expense.date));
  const series = [];
  for (let instant = +from; instant < +to; instant += 86_400_000) {
    const start = new Date(instant),
      end = new Date(instant + 86_400_000);
    series.push({
      date: start.toISOString().slice(0, 10),
      salesMinor: sum(
        selectedSales.filter((s) => within(s.date, start, end)),
        (s) => s.totalMinor,
      ),
      expensesMinor: sum(
        selectedExpenses.filter((e) => within(e.paidAt ?? e.date, start, end)),
        (e) => e.amountMinor,
      ),
    });
  }
  const groupedExpenses = new Map<string, bigint>();
  for (const expense of selectedExpenses) {
    const name = expense.category?.name ?? "Autre";
    groupedExpenses.set(name, (groupedExpenses.get(name) ?? 0n) + expense.amountMinor);
  }
  const selectedSalesMinor = sum(selectedSales, (sale) => sale.totalMinor);
  const selectedExpensesMinor = sum(selectedExpenses, (expense) => expense.amountMinor);
  return {
    company,
    period,
    from,
    to,
    currency: company.currency,
    metrics: {
      availableMinor: cashMinor + salespersonHeldMinor,
      cashMinor,
      salespersonHeldMinor,
      mainCashMinor: accounts[0]?.balanceMinor ?? 0n,
      salesTodayMinor: sum(
        sales.filter((s) => within(s.date, today, tomorrow)),
        (s) => s.totalMinor,
      ),
      salesMonthMinor: sum(
        sales.filter((s) => within(s.date, month, tomorrow)),
        (s) => s.totalMinor,
      ),
      expensesTodayMinor: sum(
        paidExpenses.filter((e) => within(e.paidAt ?? e.date, today, tomorrow)),
        (e) => e.amountMinor,
      ),
      expensesMonthMinor: sum(
        paidExpenses.filter((e) => within(e.paidAt ?? e.date, month, tomorrow)),
        (e) => e.amountMinor,
      ),
      salesMinor: selectedSalesMinor,
      expensesMinor: selectedExpensesMinor,
      collectedMinor: sum(
        allCollections.filter((p) => within(p.date)),
        (p) => p.amountMinor,
      ),
      receivablesMinor: sum(invoices, (invoice) => invoice.totalMinor - invoice.paidMinor),
      unpaidInvoices: invoices.filter((i) => i.paidMinor < i.totalMinor).length,
      overdueInvoices: invoices.filter((i) => i.paidMinor < i.totalMinor && i.dueDate < today)
        .length,
      payablesMinor: sum(
        expenses.filter((e) => e.supplierId && e.status === "APPROVED"),
        (e) => e.amountMinor,
      ),
      estimatedProfitMinor: selectedSalesMinor - selectedExpensesMinor,
      pendingExpenses: expenses.filter((e) => e.status === "PENDING").length,
    },
    series,
    cashAccounts: accounts,
    recentTransactions,
    pendingExpenses,
    expenseBreakdown: Array.from(groupedExpenses, ([name, amountMinor]) => ({ name, amountMinor })),
    salespersonCollections: salespeople.map((person) => ({
      id: person.id,
      name: person.name,
      amountMinor: sum(
        allCollections.filter((p) => p.salespersonId === person.id && within(p.date)),
        (p) => p.amountMinor,
      ),
      balanceMinor: sum(
        heldMovements,
        (row) =>
          (row.destinationSalespersonId === person.id ? row.amountMinor : 0n) -
          (row.sourceSalespersonId === person.id ? row.amountMinor : 0n),
      ),
    })),
  };
}

export async function getReports(actor: Actor, params: URLSearchParams) {
  assertPermission(actor, "reports.view");
  return database.$transaction(
    async (tx) => {
      const dashboard = await dashboardSnapshot(actor, params, tx);
      const items = hasPermission(actor, "transactions.view")
        ? await tx.financialTransaction.findMany({
            where: { ...transactionScope(actor), date: reportPeriod(params).date },
            include: {
              client: { select: { id: true, name: true } },
              creator: { select: { name: true } },
            },
            orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }],
            take: 1001,
          })
        : [];
      return {
        ...dashboard,
        items: items.slice(0, 1000),
        transactionsTruncated: items.length > 1000,
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 20000 },
  );
}
