import type { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  atomic,
  type Actor,
  type Tx,
  idInput,
  nextNumber,
  requirePermission,
} from "@/lib/finance-context";
import { HttpError } from "@/lib/http";
import { expenseScope, paymentScope, transactionScope } from "@/lib/record-access";
import {
  receiptSnapshotSchema,
  receiptText,
  type ReceiptCancellation,
  type ReceiptSnapshot,
} from "@/lib/receipt-schema";
import { audit } from "./audit.service";

const person = { select: { id: true, name: true } } as const;
const transactionInclude = {
  creator: person,
  validator: person,
  client: { select: { name: true, phone: true } },
  supplier: { select: { name: true, phone: true } },
  invoice: { select: { id: true, number: true } },
  expense: { include: { requester: person, supplier: { select: { name: true, phone: true } } } },
  cashEntry: true,
  reversal: { select: { id: true, companyId: true, number: true, date: true } },
  reversalOf: {
    select: { id: true, companyId: true, number: true, date: true, type: true, cashEntry: true },
  },
} satisfies Prisma.FinancialTransactionInclude;

type ReceiptTransaction = Prisma.FinancialTransactionGetPayload<{
  include: typeof transactionInclude;
}>;
type Party = ReceiptSnapshot["payer"];
export type IssuedReceipt = {
  id: string;
  number: string;
  snapshot: ReceiptSnapshot;
  cancellation: ReceiptCancellation;
};

function receiptScope(actor: Actor): Prisma.FinancialTransactionWhereInput {
  const ownExpense = {
    companyId: actor.companyId,
    type: { in: ["EXPENSE", "REVERSAL"] },
    expense: { requesterId: actor.id, companyId: actor.companyId },
  };
  if (actor.role === "EMPLOYEE") {
    requirePermission(actor, "expenses.view");
    return ownExpense;
  }
  if (actor.role === "SALESPERSON") {
    const scopes: Prisma.FinancialTransactionWhereInput[] = [];
    if (actor.permissions.includes("transactions.view")) scopes.push(transactionScope(actor));
    if (actor.permissions.includes("expenses.view")) scopes.push(ownExpense);
    if (!scopes.length) requirePermission(actor, "transactions.view");
    return { companyId: actor.companyId, OR: scopes };
  }
  requirePermission(actor, "transactions.view");
  return transactionScope(actor);
}

async function accessibleTransaction(tx: Tx, actor: Actor, id: string) {
  const transaction = await tx.financialTransaction.findFirst({
    where: { ...receiptScope(actor), id: idInput.parse(id), status: "VALIDATED" },
    include: transactionInclude,
  });
  if (!transaction) throw new HttpError(404, "Opération introuvable ou reçu non accessible.");
  if (
    (transaction.reversal && transaction.reversal.companyId !== actor.companyId) ||
    (transaction.reversalOf && transaction.reversalOf.companyId !== actor.companyId)
  )
    throw new HttpError(409, "Lien d’annulation incohérent.");
  return transaction;
}

const party = (kind: string, name: string | null | undefined, phone?: string | null): Party => ({
  kind,
  name: receiptText(name) || "Non renseigné",
  phone: receiptText(phone),
});

async function snapshotFor(
  tx: Tx,
  actor: Actor,
  movement: ReceiptTransaction,
  number: string,
  issuedAt: Date,
): Promise<ReceiptSnapshot> {
  const companyId = actor.companyId;
  const ids = (values: (string | null)[]) => values.filter((id): id is string => !!id);
  const [company, accounts, people, payment] = await Promise.all([
    tx.company.findUniqueOrThrow({ where: { id: companyId } }),
    tx.cashAccount.findMany({
      where: {
        companyId,
        id: { in: ids([movement.sourceCashAccountId, movement.destinationCashAccountId]) },
      },
      select: { id: true, name: true },
    }),
    tx.user.findMany({
      where: {
        companyId,
        id: { in: ids([movement.sourceSalespersonId, movement.destinationSalespersonId]) },
      },
      select: { id: true, name: true },
    }),
    movement.paymentId
      ? tx.payment.findFirst({
          where: { companyId, id: movement.paymentId },
          select: { method: true, reference: true },
        })
      : null,
  ]);
  const companyParty = party("COMPANY", company.name, company.phone);
  const cashEntry = movement.cashEntry ?? movement.reversalOf?.cashEntry;
  const expense = movement.expense;
  const expensePayee = expense?.beneficiaryName
    ? party(expense.beneficiaryKind || "OTHER", expense.beneficiaryName, expense.beneficiaryPhone)
    : expense?.supplier
      ? party("SUPPLIER", expense.supplier.name, expense.supplier.phone)
      : party("UNSPECIFIED", "Bénéficiaire non renseigné");
  const clientParty = party("CLIENT", movement.client?.name, movement.client?.phone);
  const entryParty = cashEntry
    ? party(cashEntry.partyKind, cashEntry.partyName, cashEntry.phone)
    : null;
  const endpoint = (cashId: string | null, personId: string | null, fallback: Party): Party => {
    if (cashId)
      return party(
        "CASH_ACCOUNT",
        accounts.find((account) => account.id === cashId)?.name || "Caisse non renseignée",
      );
    if (personId)
      return party(
        "SALESPERSON",
        people.find((person) => person.id === personId)?.name || "Commercial non renseigné",
      );
    return fallback;
  };
  const externalParty =
    entryParty ??
    (movement.client
      ? clientParty
      : expense
        ? expensePayee
        : movement.supplier
          ? party("SUPPLIER", movement.supplier.name, movement.supplier.phone)
          : party("UNSPECIFIED", "Tiers non renseigné"));
  const source = endpoint(
    movement.sourceCashAccountId,
    movement.sourceSalespersonId,
    movement.type === "ADJUSTMENT" ? party("ADJUSTMENT", "Ajustement autorisé") : externalParty,
  );
  const destination = endpoint(
    movement.destinationCashAccountId,
    movement.destinationSalespersonId,
    movement.type === "ADJUSTMENT" ? party("ADJUSTMENT", "Ajustement autorisé") : externalParty,
  );
  let payer = source,
    payee = destination;
  if (movement.type === "PAYMENT") {
    payer = clientParty;
    payee = companyParty;
  } else if (movement.type === "EXPENSE") {
    payer = companyParty;
    payee = expensePayee;
  } else if (movement.type === "HANDOVER") {
    payer = source;
    payee = companyParty;
  } else if (cashEntry && movement.type !== "REVERSAL") {
    const incoming = !!(movement.destinationCashAccountId || movement.destinationSalespersonId);
    payer = incoming ? externalParty : companyParty;
    payee = incoming ? companyParty : externalParty;
  }
  // Expense.method describes its latest payment. After reversal/re-payment it cannot
  // reliably identify the method of a historical entry that had no receipt yet.
  const expenseMethod = !movement.reversal ? expense?.method : null;
  const method =
    movement.type === "REVERSAL" || movement.type === "ADJUSTMENT"
      ? null
      : (cashEntry?.method ?? payment?.method ?? expenseMethod ?? null);
  return receiptSnapshotSchema.parse({
    version: 1,
    number,
    issuedAt: issuedAt.toISOString(),
    issuedBy: { id: actor.id, name: receiptText(actor.name) || "Utilisateur" },
    company: {
      id: company.id,
      name: receiptText(company.name) || "Entreprise",
      address: receiptText(company.address),
      phone: receiptText(company.phone),
      email: receiptText(company.email),
      taxNumber: receiptText(company.taxNumber),
    },
    operation: {
      id: movement.id,
      number: movement.number,
      type: movement.type,
      date: movement.date.toISOString(),
      amountMinor: movement.amountMinor.toString(),
      currency: movement.currency,
      method,
      description:
        receiptText(cashEntry?.description ?? expense?.description ?? movement.comment) ||
        "Opération financière enregistrée",
      reference: receiptText(movement.reference ?? payment?.reference ?? expense?.reference),
      comment: receiptText(movement.comment),
    },
    payer,
    payee,
    source,
    destination,
    recordedBy: {
      id: movement.creator.id,
      name: receiptText(movement.creator.name) || "Utilisateur",
    },
    validatedBy: {
      id: movement.validator.id,
      name: receiptText(movement.validator.name) || "Utilisateur",
    },
    requester: expense
      ? { id: expense.requester.id, name: receiptText(expense.requester.name) || "Demandeur" }
      : null,
    invoice: movement.invoice,
    expense: expense ? { id: expense.id, number: expense.number } : null,
    reversalOf: movement.reversalOf
      ? {
          id: movement.reversalOf.id,
          number: movement.reversalOf.number,
          date: movement.reversalOf.date.toISOString(),
        }
      : null,
  });
}

async function issueInTransaction(
  tx: Tx,
  actor: Actor,
  transactionId: string,
): Promise<IssuedReceipt> {
  const movement = await accessibleTransaction(tx, actor, transactionId);
  const cancellation = movement.reversal
    ? {
        id: movement.reversal.id,
        number: movement.reversal.number,
        date: movement.reversal.date.toISOString(),
      }
    : null;
  const existing = await tx.transactionReceipt.findUnique({ where: { transactionId } });
  if (existing) {
    if (existing.companyId !== actor.companyId) throw new HttpError(404, "Reçu introuvable.");
    const parsed = receiptSnapshotSchema.safeParse(existing.snapshot);
    if (
      !parsed.success ||
      parsed.data.operation.id !== transactionId ||
      parsed.data.company.id !== actor.companyId ||
      parsed.data.number !== existing.number
    )
      throw new HttpError(409, "Les données du reçu enregistré sont incohérentes.");
    return { id: existing.id, number: existing.number, snapshot: parsed.data, cancellation };
  }
  const issuedAt = new Date();
  const number = await nextNumber(tx, actor.companyId, "REC", issuedAt);
  const snapshot = await snapshotFor(tx, actor, movement, number, issuedAt);
  const receipt = await tx.transactionReceipt.create({
    data: {
      companyId: actor.companyId,
      transactionId,
      number,
      snapshot,
      issuedById: actor.id,
      createdAt: issuedAt,
    },
  });
  await audit(tx, actor, {
    action: "ISSUE",
    entity: "TransactionReceipt",
    entityId: receipt.id,
    after: {
      number,
      transactionId,
      transactionNumber: movement.number,
      snapshotVersion: snapshot.version,
    },
  });
  return { id: receipt.id, number, snapshot, cancellation };
}

export async function issueReceipt(actor: Actor, transactionId: string): Promise<IssuedReceipt> {
  idInput.parse(transactionId);
  return atomic((tx) => issueInTransaction(tx, actor, transactionId));
}

const entityInput = z.object({
  entity: z.enum(["payment", "expense", "transaction"]),
  id: z.uuid(),
});
export async function issueReceiptForEntity(actor: Actor, raw: unknown): Promise<IssuedReceipt> {
  const { entity, id } = entityInput.parse(raw);
  if (entity === "transaction") return issueReceipt(actor, id);
  return atomic(async (tx) => {
    let where: Prisma.FinancialTransactionWhereInput;
    if (entity === "payment") {
      requirePermission(actor, "payments.view");
      const payment = await tx.payment.findFirst({
        where: { ...paymentScope(actor), id },
        select: { id: true },
      });
      if (!payment) throw new HttpError(404, "Encaissement introuvable.");
      where = { companyId: actor.companyId, paymentId: id, type: "PAYMENT", status: "VALIDATED" };
    } else {
      requirePermission(actor, "expenses.view");
      const expense = await tx.expense.findFirst({
        where: { ...expenseScope(actor), id },
        select: { id: true },
      });
      if (!expense) throw new HttpError(404, "Dépense introuvable.");
      where = { companyId: actor.companyId, expenseId: id, type: "EXPENSE", status: "VALIDATED" };
    }
    const orderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];
    const movement =
      (await tx.financialTransaction.findFirst({
        where: { ...where, reversal: null },
        orderBy,
        select: { id: true },
      })) ?? (await tx.financialTransaction.findFirst({ where, orderBy, select: { id: true } }));
    if (!movement)
      throw new HttpError(404, "Aucun paiement enregistré ne permet d’émettre un reçu.");
    return issueInTransaction(tx, actor, movement.id);
  });
}
