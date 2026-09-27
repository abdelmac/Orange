import { z } from "zod";
import { HttpError } from "./http";
import { moneyInput } from "./money";

export interface PersonalIdentity {
  id: string;
  usageType: string;
  personalCurrency: string;
}

export function requirePersonal(identity: PersonalIdentity) {
  if (identity.usageType !== "PERSONAL" && identity.usageType !== "BOTH")
    throw new HttpError(403, "Votre profil ne dispose pas d’un espace personnel.");
  return identity.id;
}

export const personalAccountInput = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(["CURRENT", "CASH", "CARD", "SAVINGS", "OTHER"]).default("CURRENT"),
  initialBalance: z
    .string()
    .trim()
    .regex(/^-?\d{1,12}(?:\.\d{1,2})?$/)
    .default("0"),
});
export const personalCategoryInput = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(["INCOME", "EXPENSE"]),
  color: z
    .string()
    .regex(/^#[\da-fA-F]{6}$/)
    .default("#f97316"),
});
export const personalTransactionInput = z.object({
  accountId: z.uuid(),
  destinationAccountId: z.uuid().nullable().optional(),
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
  amount: moneyInput,
  categoryId: z.uuid().nullable().optional(),
  description: z.string().trim().min(1).max(300),
  date: z.iso.date(),
  notes: z.string().trim().max(2000).default(""),
  attachmentId: z.uuid().nullable().optional(),
  idempotencyKey: z.uuid(),
});
export const personalBudgetInput = z.object({
  categoryId: z.uuid(),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2200),
  limit: moneyInput,
});
export const personalFilterInput = z.object({
  month: z
    .string()
    .regex(/^20\d{2}-(0[1-9]|1[0-2])$/)
    .optional(),
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]).optional(),
  accountId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  q: z.string().trim().max(100).default(""),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});

export function monthRange(month = new Date().toISOString().slice(0, 7)) {
  const [year, number] = month.split("-").map(Number);
  return {
    year,
    month: number,
    start: new Date(Date.UTC(year, number - 1, 1)),
    end: new Date(Date.UTC(year, number, 1)),
  };
}

/** Ratios are bounded visual indicators. Monetary totals always remain bigint. */
export function budgetProgress(spent: bigint, limit: bigint) {
  if (limit <= 0n) throw new HttpError(400, "Le budget doit être supérieur à zéro.");
  const percentage = (spent * 100n) / limit;
  return {
    percent: Number(percentage > 100n ? 100n : percentage < 0n ? 0n : percentage),
    status: spent >= limit ? "EXCEEDED" : spent * 100n >= limit * 80n ? "WARNING" : "OK",
    remainingMinor: limit - spent,
  };
}

export const personalDefaults = {
  EXPENSE: [
    "Alimentation",
    "Logement",
    "Transport",
    "Carburant",
    "Restaurants",
    "Shopping",
    "Santé",
    "Abonnements",
    "Loisirs",
    "Voyages",
    "Assurances",
    "Taxes",
    "Famille",
    "Autres",
  ],
  INCOME: ["Salaire", "Freelance", "Remboursement", "Vente", "Investissement", "Cadeau", "Autres"],
} as const;
