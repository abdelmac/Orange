import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "../src/lib/finance-context";

const state = vi.hoisted(() => {
  const tx = {
    company: {
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ id: "company-a", name: "Test", currency: "EUR" }),
    },
    sale: { findMany: vi.fn().mockResolvedValue([]) },
    expense: { findMany: vi.fn().mockResolvedValue([]) },
    invoice: { findMany: vi.fn().mockResolvedValue([]) },
    payment: { findMany: vi.fn().mockResolvedValue([]) },
    cashAccount: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    financialTransaction: {
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
    },
  };
  return {
    tx,
    transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
});
vi.mock("../src/lib/db", () => ({ db: { $transaction: state.transaction } }));

import { getDashboard, getReports, reportPeriod } from "../src/services/report.service";
import { expenseScope, paymentScope, transactionScope } from "../src/lib/record-access";

const actor = (permissions: string[], role = "ADMIN"): Actor => ({
  id: "user-a",
  companyId: "company-a",
  name: "Test",
  role,
  permissions,
  cashAccountIds: ["cash-a"],
});
beforeEach(() => vi.clearAllMocks());

describe("Périmètres des rapports", () => {
  it("n’expose aucun portefeuille avec dashboard.view seul, même pour le nom de rôle ADMIN", async () => {
    const result = await getDashboard(actor(["dashboard.view"]));
    expect(result.metrics.availableMinor).toBe(0n);
    expect(result.salespersonCollections).toEqual([]);
    expect(state.tx.financialTransaction.groupBy).not.toHaveBeenCalled();
    expect(state.tx.user.findMany).not.toHaveBeenCalled();
    expect(state.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "RepeatableRead" }),
    );
  });
  it("n’ajoute pas le registre à un rapport sans transactions.view", async () => {
    const result = await getReports(actor(["reports.view"]), new URLSearchParams());
    expect(result.items).toEqual([]);
    expect(state.tx.financialTransaction.findMany).not.toHaveBeenCalled();
  });
  it("maintient le périmètre employé et caisse dans les helpers partagés", () => {
    expect(transactionScope(actor([], "EMPLOYEE"))).toEqual({
      companyId: "company-a",
      createdById: "user-a",
    });
    expect(expenseScope(actor([], "EMPLOYEE"))).toEqual({
      companyId: "company-a",
      requesterId: "user-a",
    });
    expect(paymentScope(actor([], "CASHIER"))).toEqual({
      companyId: "company-a",
      cashAccountId: { in: ["cash-a"] },
    });
  });
});

describe("Périodes des rapports", () => {
  const now = new Date("2026-09-10T14:20:00Z");
  it("accepte un seul filtre de date et conserve une borne raisonnable", () => {
    expect(reportPeriod(new URLSearchParams({ from: "2026-09-03" }), now).from.toISOString()).toBe(
      "2026-09-03T00:00:00.000Z",
    );
    expect(reportPeriod(new URLSearchParams({ to: "2026-09-04" }), now).to.toISOString()).toBe(
      "2026-09-05T00:00:00.000Z",
    );
  });
  it("inclut tout le dernier jour et refuse les périodes invalides ou excessives", () => {
    const period = reportPeriod(
      new URLSearchParams({ period: "custom", from: "2026-08-01", to: "2026-08-31" }),
      now,
    );
    expect(period.to.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(() => reportPeriod(new URLSearchParams({ from: "wrong" }), now)).toThrow();
    expect(() => reportPeriod(new URLSearchParams({ from: "2020-01-01" }), now)).toThrow();
  });
});
