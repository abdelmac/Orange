export type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER";
export interface PersonalAccountView {
  id: string;
  name: string;
  type: string;
  currency: string;
  initialBalanceMinor: string;
  balanceMinor: string;
  isArchived: boolean;
}
export interface PersonalCategoryView {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
  color: string;
}
export interface PersonalTransactionView {
  id: string;
  accountId: string;
  destinationAccountId: string | null;
  categoryId: string | null;
  type: TransactionType;
  amountMinor: string;
  currency: string;
  description: string;
  date: string;
  notes: string;
  attachmentId: string | null;
  idempotencyKey: string;
  updatedAt: string;
  account: PersonalAccountView;
  destinationAccount: PersonalAccountView | null;
  category: PersonalCategoryView | null;
  attachment: { id: string; originalName: string } | null;
}
export interface PersonalOverview {
  currency: string;
  month: string;
  accounts: PersonalAccountView[];
  categories: PersonalCategoryView[];
  summary: {
    balanceMinor: string;
    incomeMinor: string;
    expenseMinor: string;
    savingsMinor: string;
    budgetRemainingMinor: string;
  };
  budgets: {
    id: string;
    categoryId: string;
    month: number;
    year: number;
    category: PersonalCategoryView;
    limitMinor: string;
    spentMinor: string;
    remainingMinor: string;
    percent: number;
    status: string;
  }[];
  categoryExpenses: { name: string; color: string; amountMinor: string }[];
  daily: { date: string; type: TransactionType; amountMinor: string }[];
  transactions: { items: PersonalTransactionView[]; total: number; page: number; pageSize: number };
}
export const typeLabels = { INCOME: "Revenu", EXPENSE: "Dépense", TRANSFER: "Transfert" };
export function personalToday() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}
export const accountLabels: Record<string, string> = {
  CURRENT: "Compte courant",
  CASH: "Espèces",
  CARD: "Carte bancaire",
  SAVINGS: "Épargne",
  OTHER: "Autre compte",
};
