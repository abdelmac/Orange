import { describe, expect, it } from "vitest";
import { resolvePermissions, rolePermissions } from "../src/lib/rbac";
import { expenseScope } from "../src/lib/record-access";
describe("Permissions des équipes", () => {
  it("applique les refus et ajouts explicites sans changer les autres droits", () => {
    expect(
      resolvePermissions(
        ["clients.view", "invoices.view"],
        [
          { permissionKey: "invoices.view", allowed: false },
          { permissionKey: "clients.create", allowed: true },
        ],
      ),
    ).toEqual(["clients.view", "clients.create"]);
  });
  it("n’accorde aucune écriture au lecteur", () =>
    expect(rolePermissions.VIEWER.every((key) => key.endsWith(".view"))).toBe(true));
  it("limite les dépenses du membre à ses propres demandes", () => {
    expect(
      expenseScope({
        id: "member",
        companyId: "company",
        name: "Membre",
        role: "MEMBER",
        permissions: rolePermissions.MEMBER,
      }),
    ).toEqual({ companyId: "company", requesterId: "member" });
  });
});
