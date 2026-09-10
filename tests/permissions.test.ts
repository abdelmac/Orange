import { describe, expect, it } from "vitest";
import {
  assertPermission,
  cashScope,
  clientScope,
  hasPermission,
  permissionDefinitions,
  rolePermissions,
} from "../src/lib/rbac";
import { hashPassword, verifyPassword } from "../src/lib/password";
import type { Actor } from "../src/lib/finance-context";

const actor = (role: string): Actor => ({
  id: "user-a",
  name: "Alice",
  companyId: "company-a",
  role,
  permissions: rolePermissions[role] ?? [],
});

describe("Autorisations côté serveur", () => {
  it("accorde toutes les permissions à l’administrateur", () =>
    expect(rolePermissions.ADMIN).toEqual([...permissionDefinitions]));
  it("refuse l’administration, la validation et l’annulation au commercial", () => {
    for (const permission of [
      "users.create",
      "settings.edit",
      "expenses.validate",
      "transactions.reverse",
    ])
      expect(() => assertPermission(actor("SALESPERSON"), permission)).toThrow();
  });
  it("évalue les permissions réelles plutôt que le seul nom du rôle", () => {
    expect(hasPermission({ ...actor("ADMIN"), permissions: [] }, "users.create")).toBe(false);
    expect(
      hasPermission({ ...actor("EMPLOYEE"), permissions: ["clients.create"] }, "clients.create"),
    ).toBe(true);
  });
  it("limite les clients au commercial et les caisses au caissier", () => {
    expect(clientScope(actor("SALESPERSON"))).toEqual({
      companyId: "company-a",
      salespersonId: "user-a",
    });
    expect(cashScope(actor("CASHIER"))).toEqual({
      companyId: "company-a",
      responsibleId: "user-a",
    });
    expect(clientScope(actor("ADMIN"))).toEqual({ companyId: "company-a" });
  });
  it("ne permet pas à l’employé de consulter le registre", () =>
    expect(() => assertPermission(actor("EMPLOYEE"), "transactions.view")).toThrow());
  it("n’accorde au caissier aucune suppression ou gestion utilisateur", () =>
    expect(
      rolePermissions.CASHIER.some(
        (permission) => permission.startsWith("users.") || permission.includes("delete"),
      ),
    ).toBe(false));
});

describe("Mots de passe", () => {
  it("sale indépendamment chaque hash et vérifie sans stocker le mot de passe", async () => {
    const first = await hashPassword("MotDePasse-long-2026!");
    const second = await hashPassword("MotDePasse-long-2026!");
    expect(first).not.toBe(second);
    expect(await verifyPassword("MotDePasse-long-2026!", first)).toBe(true);
    expect(await verifyPassword("incorrect", first)).toBe(false);
    expect(await verifyPassword("whatever", "malformed")).toBe(false);
  });
});
