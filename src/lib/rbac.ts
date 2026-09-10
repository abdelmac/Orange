import type { Actor } from "./finance-context";

export const permissionDefinitions = [
  "dashboard.view",
  "clients.view",
  "clients.create",
  "clients.edit",
  "suppliers.view",
  "suppliers.create",
  "suppliers.edit",
  "salespeople.view",
  "sales.view",
  "sales.create",
  "sales.edit",
  "sales.validate",
  "invoices.view",
  "invoices.create",
  "invoices.edit",
  "payments.view",
  "payments.create",
  "payments.validate",
  "expenses.view",
  "expenses.create",
  "expenses.edit",
  "expenses.validate",
  "expenses.reject",
  "expenses.pay",
  "cash.view",
  "cash.create",
  "cash.edit",
  "cash.deposit",
  "cash.withdraw",
  "cash.transfer",
  "cash.handover",
  "cash.adjust",
  "transactions.view",
  "transactions.reverse",
  "users.view",
  "users.create",
  "users.edit",
  "reports.view",
  "reports.export",
  "audit.view",
  "settings.edit",
  "attachments.create",
] as const;

export const roleLabels: Record<string, string> = {
  ADMIN: "Administrateur",
  MANAGER: "Responsable",
  ACCOUNTANT: "Comptable",
  CASHIER: "Caissier",
  SALESPERSON: "Commercial",
  EMPLOYEE: "Employé",
};

export const rolePermissions: Record<string, string[]> = {
  ADMIN: [...permissionDefinitions],
  MANAGER: [
    "dashboard.view",
    "clients.view",
    "clients.create",
    "clients.edit",
    "suppliers.view",
    "suppliers.create",
    "suppliers.edit",
    "salespeople.view",
    "sales.view",
    "sales.validate",
    "invoices.view",
    "payments.view",
    "payments.validate",
    "expenses.view",
    "expenses.create",
    "expenses.validate",
    "expenses.reject",
    "cash.view",
    "transactions.view",
    "reports.view",
    "attachments.create",
  ],
  ACCOUNTANT: [
    "dashboard.view",
    "clients.view",
    "suppliers.view",
    "suppliers.create",
    "suppliers.edit",
    "salespeople.view",
    "sales.view",
    "invoices.view",
    "invoices.create",
    "invoices.edit",
    "payments.view",
    "payments.create",
    "payments.validate",
    "expenses.view",
    "expenses.create",
    "expenses.edit",
    "expenses.pay",
    "cash.view",
    "cash.deposit",
    "cash.withdraw",
    "cash.transfer",
    "transactions.view",
    "reports.view",
    "reports.export",
    "audit.view",
    "attachments.create",
  ],
  CASHIER: [
    "dashboard.view",
    "clients.view",
    "invoices.view",
    "payments.view",
    "payments.create",
    "expenses.view",
    "expenses.pay",
    "cash.view",
    "cash.deposit",
    "cash.withdraw",
    "cash.handover",
    "transactions.view",
    "attachments.create",
  ],
  SALESPERSON: [
    "dashboard.view",
    "clients.view",
    "clients.create",
    "clients.edit",
    "salespeople.view",
    "sales.view",
    "sales.create",
    "sales.edit",
    "sales.validate",
    "invoices.view",
    "invoices.create",
    "payments.view",
    "payments.create",
    "cash.view",
    "cash.handover",
    "expenses.view",
    "expenses.create",
    "transactions.view",
    "attachments.create",
  ],
  EMPLOYEE: [
    "dashboard.view",
    "expenses.view",
    "expenses.create",
    "expenses.edit",
    "attachments.create",
  ],
};

export function hasPermission(actor: Pick<Actor, "permissions">, permission: string) {
  return actor.permissions.includes(permission);
}

export function assertPermission(actor: Pick<Actor, "permissions">, permission: string) {
  if (!hasPermission(actor, permission))
    throw Object.assign(new Error("Vous n’avez pas l’autorisation d’effectuer cette action."), {
      status: 403,
    });
}

export function isOwnScope(actor: Pick<Actor, "role">) {
  return actor.role === "SALESPERSON" || actor.role === "EMPLOYEE";
}

export function clientScope(actor: Actor) {
  return {
    companyId: actor.companyId,
    ...(actor.role === "SALESPERSON" ? { salespersonId: actor.id } : {}),
  };
}

export function cashScope(actor: Actor) {
  return {
    companyId: actor.companyId,
    ...(actor.role === "CASHIER" ? { responsibleId: actor.id } : {}),
  };
}
