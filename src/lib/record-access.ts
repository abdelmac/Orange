import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/finance-context";
import { assertPermission } from "@/lib/rbac";
import { HttpError } from "@/lib/http";
import { uuid } from "@/lib/validation";

export function invoiceScope(actor: Actor): Prisma.InvoiceWhereInput {
  return {
    companyId: actor.companyId,
    ...(actor.role === "SALESPERSON" ? { salespersonId: actor.id } : {}),
  };
}

export function paymentScope(actor: Actor): Prisma.PaymentWhereInput {
  return {
    companyId: actor.companyId,
    ...(actor.role === "SALESPERSON"
      ? { salespersonId: actor.id }
      : actor.role === "CASHIER"
        ? { cashAccountId: { in: actor.cashAccountIds ?? [] } }
        : {}),
  };
}

export function transactionScope(actor: Actor): Prisma.FinancialTransactionWhereInput {
  const where: Prisma.FinancialTransactionWhereInput = { companyId: actor.companyId };
  if (actor.role === "SALESPERSON")
    where.OR = [{ sourceSalespersonId: actor.id }, { destinationSalespersonId: actor.id }];
  if (actor.role === "CASHIER")
    where.OR = [
      { sourceCashAccountId: { in: actor.cashAccountIds ?? [] } },
      { destinationCashAccountId: { in: actor.cashAccountIds ?? [] } },
    ];
  if (actor.role === "EMPLOYEE") where.createdById = actor.id;
  return where;
}

export function expenseScope(actor: Actor): Prisma.ExpenseWhereInput {
  return {
    companyId: actor.companyId,
    ...(["SALESPERSON", "EMPLOYEE"].includes(actor.role) ? { requesterId: actor.id } : {}),
    ...(actor.role === "CASHIER"
      ? {
          OR: [
            { cashAccountId: { in: actor.cashAccountIds ?? [] } },
            { status: "APPROVED", cashAccountId: null },
          ],
        }
      : {}),
  };
}

export async function accessibleRecord(actor: Actor, entity: string, id: string, upload = false) {
  uuid.parse(id);
  if (upload) assertPermission(actor, "attachments.create");
  let found: unknown;
  switch (entity) {
    case "INVOICE":
      assertPermission(actor, "invoices.view");
      found = await db.invoice.findFirst({ where: { ...invoiceScope(actor), id } });
      break;
    case "EXPENSE":
      assertPermission(actor, "expenses.view");
      found = await db.expense.findFirst({ where: { ...expenseScope(actor), id } });
      break;
    case "PAYMENT":
      assertPermission(actor, "payments.view");
      found = await db.payment.findFirst({ where: { ...paymentScope(actor), id } });
      break;
    case "TRANSACTION":
      assertPermission(actor, "transactions.view");
      found = await db.financialTransaction.findFirst({
        where: { ...transactionScope(actor), id },
      });
      break;
    default:
      throw new HttpError(400, "Type de document invalide.");
  }
  if (!found) throw new HttpError(404, "Opération introuvable.");
  return found;
}
