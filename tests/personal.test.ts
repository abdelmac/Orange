import { describe, expect, it } from "vitest";
import {
  budgetProgress,
  monthRange,
  personalTransactionInput,
  requirePersonal,
} from "../src/lib/personal";

describe("finances personnelles : limites et identité", () => {
  it("ne confère aucun accès personnel à un administrateur d’entreprise", () => {
    expect(() =>
      requirePersonal({ id: "admin", usageType: "BUSINESS", personalCurrency: "EUR" }),
    ).toThrow("espace personnel");
    expect(requirePersonal({ id: "me", usageType: "BOTH", personalCurrency: "EUR" })).toBe("me");
  });
  it("calcule les alertes à 80 % et 100 % exactement, même pour les grands montants", () => {
    expect(budgetProgress(39999n, 50000n).status).toBe("OK");
    expect(budgetProgress(40000n, 50000n).status).toBe("WARNING");
    expect(budgetProgress(50000n, 50000n)).toEqual({
      percent: 100,
      status: "EXCEEDED",
      remainingMinor: 0n,
    });
    expect(budgetProgress(60000n, 50000n).remainingMinor).toBe(-10000n);
    expect(budgetProgress(8000000000000000n, 10000000000000000n).status).toBe("WARNING");
    expect(() => budgetProgress(0n, 0n)).toThrow();
  });
  it("utilise des bornes mensuelles UTC exclusives, y compris février bissextile", () => {
    expect(monthRange("2024-02").end.toISOString()).toBe("2024-03-01T00:00:00.000Z");
    expect(monthRange("2026-12").end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
  it("rejette les dates impossibles et les montants arrondis implicitement", () => {
    const base = {
      accountId: "9dadb38d-6b69-4bb5-aa44-fd1ac05b7718",
      idempotencyKey: "158a946e-6b17-4fcd-9726-82f2a5869714",
      type: "EXPENSE",
      description: "Courses",
      date: "2026-09-27",
      amount: "100.00",
    };
    expect(personalTransactionInput.safeParse(base).success).toBe(true);
    expect(personalTransactionInput.safeParse({ ...base, date: "2026-02-30" }).success).toBe(false);
    expect(personalTransactionInput.safeParse({ ...base, amount: "0.001" }).success).toBe(false);
    expect(personalTransactionInput.safeParse({ ...base, amount: 100 }).success).toBe(false);
  });
});
