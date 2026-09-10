import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";

export type Actor = {
  id: string;
  companyId: string;
  name: string;
  role: string;
  permissions: string[];
  cashAccountIds?: string[];
  ip?: string;
};
export type Tx = Prisma.TransactionClient;
export class BusinessError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "BusinessError";
  }
}
export const idInput = z.string().uuid();
export const dateInput = z.string().datetime({ offset: true }).optional();
export const paymentMethod = z.enum(["CASH", "CARD", "TRANSFER", "CHECK", "OTHER"]);
export function requirePermission(actor: Actor, permission: string) {
  if (!actor.permissions.includes(permission))
    throw new BusinessError("Action non autorisée.", 403);
}

export async function atomic<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 20000,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" || error.code === "P2002") &&
        attempt < 4
      )
        continue;
      throw error;
    }
  }
  throw new BusinessError("Conflit concurrent, veuillez réessayer.", 409);
}

export async function assertCompany(
  tx: Tx,
  model:
    | "client"
    | "supplier"
    | "cashAccount"
    | "user"
    | "expenseCategory"
    | "invoice"
    | "expense"
    | "financialTransaction",
  id: string,
  companyId: string,
) {
  idInput.parse(id);
  // A fixed allowlist prevents arbitrary delegate access; each lookup always includes the tenant.
  const delegates = {
    client: tx.client,
    supplier: tx.supplier,
    cashAccount: tx.cashAccount,
    user: tx.user,
    expenseCategory: tx.expenseCategory,
    invoice: tx.invoice,
    expense: tx.expense,
    financialTransaction: tx.financialTransaction,
  };
  const delegate = delegates[model] as unknown as {
    findFirst(args: { where: { id: string; companyId: string } }): Promise<{ id: string } | null>;
  };
  const entity = await delegate.findFirst({ where: { id, companyId } });
  if (!entity) throw new BusinessError("Élément introuvable.", 404);
  return entity;
}

export async function assertClientAccess(tx: Tx, actor: Actor, id: string) {
  const client = await tx.client.findFirst({
    where: { id: idInput.parse(id), companyId: actor.companyId },
  });
  if (!client || (actor.role === "SALESPERSON" && client.salespersonId !== actor.id))
    throw new BusinessError("Client introuvable.", 404);
  if (!client.active) throw new BusinessError("Ce client est inactif.");
  return client;
}

export async function assertCashAccess(
  tx: Tx,
  actor: Actor,
  id: string,
  allowSalespersonDeposit = false,
) {
  const account = await tx.cashAccount.findFirst({
    where: { id: idInput.parse(id), companyId: actor.companyId, active: true },
  });
  if (!account) throw new BusinessError("Caisse introuvable.", 404);
  if (actor.role === "CASHIER" && account.responsibleId !== actor.id)
    throw new BusinessError("Cette caisse ne vous est pas attribuée.", 403);
  if (actor.role === "SALESPERSON" && !allowSalespersonDeposit)
    throw new BusinessError("Utilisez votre portefeuille commercial.", 403);
  return account;
}

export async function assertSalesperson(tx: Tx, actor: Actor, id: string) {
  const profile = await tx.salespersonProfile.findFirst({
    where: { companyId: actor.companyId, userId: idInput.parse(id), user: { active: true } },
  });
  if (!profile || (actor.role === "SALESPERSON" && id !== actor.id))
    throw new BusinessError("Commercial introuvable.", 404);
  return profile;
}

export async function nextNumber(tx: Tx, companyId: string, type: string, date = new Date()) {
  const year = date.getUTCFullYear();
  const seq = await tx.documentSequence.upsert({
    where: { companyId_type_year: { companyId, type, year } },
    create: { companyId, type, year, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${type}-${year}-${String(seq.value).padStart(6, "0")}`;
}

export async function companyCurrency(tx: Tx, companyId: string) {
  const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
  return company.currency;
}

export async function ledgerBalance(
  tx: Tx,
  companyId: string,
  kind: "cash" | "salesperson",
  id: string,
) {
  // One SQL statement observes one PostgreSQL snapshot, even outside a write transaction.
  // Prisma tagged templates parameterize both identifiers; no request text becomes SQL.
  const query =
    kind === "cash"
      ? Prisma.sql`
    SELECT COALESCE(SUM(CASE WHEN "destinationCashAccountId" = ${id}::uuid THEN "amountMinor" ELSE 0 END)
      - SUM(CASE WHEN "sourceCashAccountId" = ${id}::uuid THEN "amountMinor" ELSE 0 END), 0)::bigint AS balance
    FROM "FinancialTransaction" WHERE "companyId" = ${companyId}::uuid AND status = 'VALIDATED'
      AND ("destinationCashAccountId" = ${id}::uuid OR "sourceCashAccountId" = ${id}::uuid)
  `
      : Prisma.sql`
    SELECT COALESCE(SUM(CASE WHEN "destinationSalespersonId" = ${id}::uuid THEN "amountMinor" ELSE 0 END)
      - SUM(CASE WHEN "sourceSalespersonId" = ${id}::uuid THEN "amountMinor" ELSE 0 END), 0)::bigint AS balance
    FROM "FinancialTransaction" WHERE "companyId" = ${companyId}::uuid AND status = 'VALIDATED'
      AND ("destinationSalespersonId" = ${id}::uuid OR "sourceSalespersonId" = ${id}::uuid)
  `;
  const result = await tx.$queryRaw<{ balance: bigint }[]>(query);
  return result[0].balance;
}

export function assertIdempotentOwner(actor: Actor, ownerId: string) {
  if (ownerId !== actor.id)
    throw new BusinessError("Cette clé d’opération a déjà été utilisée.", 409);
}
