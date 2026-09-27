import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import {
  budgetProgress,
  monthRange,
  personalFilterInput,
  requirePersonal,
  type PersonalIdentity,
} from "@/lib/personal";

export async function getPersonalOverview(identity: PersonalIdentity, raw: unknown = {}) {
  const userId = requirePersonal(identity);
  const filter = personalFilterInput.parse(raw);
  const period = monthRange(filter.month);
  if (filter.from && filter.to && filter.from > filter.to)
    throw new HttpError(400, "La date de fin précède la date de début.");
  const where: Prisma.PersonalTransactionWhereInput = {
    userId,
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
    ...(filter.accountId
      ? { OR: [{ accountId: filter.accountId }, { destinationAccountId: filter.accountId }] }
      : {}),
    ...(filter.q
      ? {
          AND: [
            {
              OR: [
                { description: { contains: filter.q, mode: "insensitive" } },
                { notes: { contains: filter.q, mode: "insensitive" } },
              ],
            },
          ],
        }
      : {}),
    date: {
      gte: filter.from ? new Date(`${filter.from}T00:00:00.000Z`) : period.start,
      lt: filter.to
        ? new Date(new Date(`${filter.to}T00:00:00.000Z`).getTime() + 86_400_000)
        : period.end,
    },
  };
  return db.$transaction(
    async (tx) => {
      const [accounts, categories, outgoing, incoming, monthly, daily, budgets, items, total] =
        await Promise.all([
          tx.personalAccount.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
          tx.personalCategory.findMany({
            where: { userId },
            orderBy: [{ type: "asc" }, { name: "asc" }],
          }),
          tx.personalTransaction.groupBy({
            by: ["accountId", "type"],
            where: { userId },
            _sum: { amountMinor: true },
          }),
          tx.personalTransaction.groupBy({
            by: ["destinationAccountId"],
            where: { userId, type: "TRANSFER" },
            _sum: { amountMinor: true },
          }),
          tx.personalTransaction.groupBy({
            by: ["type", "categoryId"],
            where: {
              userId,
              currency: identity.personalCurrency,
              date: { gte: period.start, lt: period.end },
            },
            _sum: { amountMinor: true },
          }),
          tx.personalTransaction.groupBy({
            by: ["date", "type"],
            where: {
              userId,
              currency: identity.personalCurrency,
              date: { gte: period.start, lt: period.end },
            },
            _sum: { amountMinor: true },
            orderBy: { date: "asc" },
          }),
          tx.personalBudget.findMany({
            where: {
              userId,
              month: period.month,
              year: period.year,
              currency: identity.personalCurrency,
            },
            include: { category: true },
            orderBy: { category: { name: "asc" } },
          }),
          tx.personalTransaction.findMany({
            where,
            include: {
              account: true,
              destinationAccount: true,
              category: true,
              attachment: { select: { id: true, originalName: true } },
            },
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
            skip: (filter.page - 1) * 50,
            take: 50,
          }),
          tx.personalTransaction.count({ where }),
        ]);
      const accountBalances = accounts.map((account) => {
        let balanceMinor = account.initialBalanceMinor;
        for (const entry of outgoing)
          if (entry.accountId === account.id)
            balanceMinor += (entry.type === "INCOME" ? 1n : -1n) * (entry._sum.amountMinor ?? 0n);
        for (const entry of incoming)
          if (entry.destinationAccountId === account.id)
            balanceMinor += entry._sum.amountMinor ?? 0n;
        return { ...account, balanceMinor };
      });
      const sum = (type: "INCOME" | "EXPENSE") =>
        monthly
          .filter((entry) => entry.type === type)
          .reduce((total, entry) => total + (entry._sum.amountMinor ?? 0n), 0n);
      const incomeMinor = sum("INCOME");
      const expenseMinor = sum("EXPENSE");
      const budgetDetails = budgets.map((budget) => {
        const spentMinor = monthly
          .filter((entry) => entry.type === "EXPENSE" && entry.categoryId === budget.categoryId)
          .reduce((total, entry) => total + (entry._sum.amountMinor ?? 0n), 0n);
        return { ...budget, spentMinor, ...budgetProgress(spentMinor, budget.limitMinor) };
      });
      return {
        currency: identity.personalCurrency,
        month: `${period.year}-${String(period.month).padStart(2, "0")}`,
        accounts: accountBalances,
        categories,
        budgets: budgetDetails,
        summary: {
          balanceMinor: accountBalances
            .filter((account) => account.currency === identity.personalCurrency)
            .reduce((sum, account) => sum + account.balanceMinor, 0n),
          incomeMinor,
          expenseMinor,
          savingsMinor: incomeMinor - expenseMinor,
          budgetRemainingMinor: budgetDetails.reduce(
            (sum, budget) => sum + budget.remainingMinor,
            0n,
          ),
        },
        categoryExpenses: monthly
          .filter((entry) => entry.type === "EXPENSE")
          .map((entry) => ({
            name:
              categories.find((category) => category.id === entry.categoryId)?.name ??
              "Sans catégorie",
            color:
              categories.find((category) => category.id === entry.categoryId)?.color ?? "#64748b",
            amountMinor: entry._sum.amountMinor ?? 0n,
          })),
        daily: daily.map((entry) => ({
          date: entry.date.toISOString().slice(0, 10),
          type: entry.type,
          amountMinor: entry._sum.amountMinor ?? 0n,
        })),
        transactions: { items, total, page: filter.page, pageSize: 50 },
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
