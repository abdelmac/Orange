import { db } from "@/lib/db";
import type { Actor } from "@/lib/finance-context";
import { HttpError } from "@/lib/http";
import { assertPermission } from "@/lib/rbac";
import { invoiceScope, expenseScope } from "@/lib/record-access";
import { requireFeature } from "./entitlement.service";

export const advancedReportRoles = ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT"];
export async function getAdvancedReport(actor: Actor, now = new Date()) {
  for (const permission of ["reports.view", "sales.view", "expenses.view", "invoices.view"])
    assertPermission(actor, permission);
  if (!advancedReportRoles.includes(actor.role))
    throw new HttpError(403, "Ce rapport nécessite un accès de direction ou de comptabilité.");
  return db.$transaction(
    async (tx) => {
      await requireFeature(actor.companyId, "advanced_reports", tx);
      const company = await tx.company.findUniqueOrThrow({
        where: { id: actor.companyId },
        select: { currency: true },
      });
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const months = Array.from(
        { length: 12 },
        (_, index) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + index, 1)),
      );
      const monthly = await Promise.all(
        months.map(async (start) => {
          const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
          const range = { gte: start, lt: end };
          const [sales, expenses] = await Promise.all([
            tx.sale.aggregate({
              where: {
                companyId: actor.companyId,
                currency: company.currency,
                status: { notIn: ["CANCELLED", "DRAFT"] },
                date: range,
              },
              _sum: { totalMinor: true },
            }),
            tx.expense.aggregate({
              where: {
                ...expenseScope(actor),
                currency: company.currency,
                status: "PAID",
                AND: [{ OR: [{ paidAt: range }, { paidAt: null, date: range }] }],
              },
              _sum: { amountMinor: true },
            }),
          ]);
          const salesMinor = sales._sum.totalMinor ?? 0n;
          const expensesMinor = expenses._sum.amountMinor ?? 0n;
          return {
            month: start.toISOString().slice(0, 7),
            salesMinor,
            expensesMinor,
            differenceMinor: salesMinor - expensesMinor,
          };
        }),
      );
      const before = (days: number) => new Date(today.getTime() - days * 86_400_000);
      const agingRanges = [
        { key: "CURRENT", label: "Non échues", dueDate: { gte: today } },
        {
          key: "DAYS_1_30",
          label: "Retard de 1 à 30 jours",
          dueDate: { gte: before(30), lt: today },
        },
        {
          key: "DAYS_31_60",
          label: "Retard de 31 à 60 jours",
          dueDate: { gte: before(60), lt: before(30) },
        },
        {
          key: "DAYS_61_90",
          label: "Retard de 61 à 90 jours",
          dueDate: { gte: before(90), lt: before(60) },
        },
        { key: "OVER_90", label: "Retard de plus de 90 jours", dueDate: { lt: before(90) } },
      ];
      const receivables = await Promise.all(
        agingRanges.map(async ({ key, label, dueDate }) => {
          const result = await tx.invoice.aggregate({
            where: {
              ...invoiceScope(actor),
              currency: company.currency,
              status: { notIn: ["PAID", "CANCELLED", "DRAFT"] },
              dueDate,
            },
            _sum: { totalMinor: true, paidMinor: true },
            _count: { id: true },
          });
          return {
            key,
            label,
            count: result._count.id,
            amountMinor: (result._sum.totalMinor ?? 0n) - (result._sum.paidMinor ?? 0n),
          };
        }),
      );
      return {
        currency: company.currency,
        asOf: today.toISOString().slice(0, 10),
        monthly,
        receivables,
        totals: {
          salesMinor: monthly.reduce((sum, row) => sum + row.salesMinor, 0n),
          expensesMinor: monthly.reduce((sum, row) => sum + row.expensesMinor, 0n),
          receivablesMinor: receivables.reduce((sum, row) => sum + row.amountMinor, 0n),
        },
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 20000 },
  );
}
