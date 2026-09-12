import Decimal from "decimal.js";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/finance-context";
import { HttpError } from "@/lib/http";
import { assertPermission, cashScope, clientScope, hasPermission } from "@/lib/rbac";
import { parseMoney } from "@/lib/money";
import { uuid } from "@/lib/validation";
import { publicUserSelect } from "@/lib/user-select";
import { expenseScope, invoiceScope, paymentScope, transactionScope } from "@/lib/record-access";
import { withTransactionLabels } from "./transaction-labels.service";
import { transactionSearch } from "./daybook.service";
export { expenseScope, invoiceScope, paymentScope, transactionScope } from "@/lib/record-access";

const person = { select: { id: true, name: true, email: true } } as const;
const customer = { select: { id: true, name: true, phone: true } } as const;
const account = { select: { id: true, name: true, currency: true } } as const;
const invoice = {
  select: { id: true, number: true, totalMinor: true, paidMinor: true, status: true },
} as const;
const includes = {
  sale: {
    client: customer,
    salesperson: person,
    invoice,
    lines: { orderBy: { position: "asc" as const } },
  },
  invoice: {
    client: customer,
    salesperson: person,
    lines: { orderBy: { position: "asc" as const } },
  },
  payment: { client: customer, invoice, salesperson: person, cashAccount: account },
  expense: {
    requester: person,
    approver: person,
    category: true,
    supplier: customer,
    cashAccount: account,
  },
  transaction: {
    cashEntry: true,
    receipt: { select: { id: true, number: true } },
    creator: person,
    validator: person,
    invoice,
    client: customer,
    supplier: customer,
    expense: {
      select: {
        id: true,
        number: true,
        description: true,
        beneficiaryName: true,
        beneficiaryKind: true,
        beneficiaryPhone: true,
      },
    },
    reversal: { select: { id: true, number: true } },
    reversalOf: { select: { cashEntry: true } },
  },
} satisfies Record<string, unknown>;

export function filters(params: URLSearchParams, fields: string[]) {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (["date", "createdAt", "amountMinor", "totalMinor"].includes(field)) continue;
    const value =
      params.get(field) ??
      (["createdById", "requesterId"].includes(field) ? params.get("userId") : null);
    if (value) result[field] = field.endsWith("Id") ? uuid.parse(value) : value.slice(0, 100);
  }
  const dateField = fields.includes("date")
    ? "date"
    : fields.includes("createdAt")
      ? "createdAt"
      : undefined;
  if (dateField) {
    const date: { gte?: Date; lte?: Date } = {};
    for (const [keys, target] of [
      [["startDate", "dateFrom", "from"], "gte"],
      [["endDate", "dateTo", "to"], "lte"],
    ] as const) {
      const value = keys.map((key) => params.get(key)).find(Boolean);
      if (value) {
        const parsed = new Date(
          value.length === 10
            ? `${value}T${target === "lte" ? "23:59:59.999" : "00:00:00.000"}Z`
            : value,
        );
        if (!Number.isFinite(parsed.getTime()))
          throw new HttpError(400, "Date de filtre invalide.");
        date[target] = parsed;
      }
    }
    if (Object.keys(date).length) result[dateField] = date;
  }
  if (fields.includes("amountMinor") || fields.includes("totalMinor")) {
    const amount: { gte?: bigint; lte?: bigint } = {};
    const min = params.get("minAmount") ?? params.get("amountMin"),
      max = params.get("maxAmount") ?? params.get("amountMax");
    if (min) amount.gte = parseMoney(min);
    if (max) amount.lte = parseMoney(max);
    if (Object.keys(amount).length)
      result[fields.includes("amountMinor") ? "amountMinor" : "totalMinor"] = amount;
  }
  return result;
}

export function search(params: URLSearchParams, fields: string[]) {
  const q = params.get("q")?.trim().slice(0, 150);
  return q
    ? { OR: fields.map((field) => ({ [field]: { contains: q, mode: "insensitive" } })) }
    : {};
}

export async function listDirectory(
  actor: Actor,
  collection: string,
  params = new URLSearchParams(),
) {
  const page = Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1);
  const take = Math.min(
    250,
    Math.max(1, Number.parseInt(params.get("pageSize") || "100", 10) || 100),
  );
  const paging = { take, skip: (page - 1) * take };
  const companyId = actor.companyId;
  if (collection === "clients") {
    assertPermission(actor, "clients.view");
    const items = await db.client.findMany({
      where: {
        AND: [
          clientScope(actor),
          filters(params, ["salespersonId"]),
          search(params, ["name", "businessName", "phone", "email", "taxNumber"]),
        ],
      },
      include: { salesperson: person },
      orderBy: { createdAt: "desc" },
      ...paging,
    });
    const totals = await db.invoice.groupBy({
      by: ["clientId"],
      where: {
        companyId,
        clientId: { in: items.map((item) => item.id) },
        status: { not: "CANCELLED" },
        ...(actor.role === "SALESPERSON" ? { salespersonId: actor.id } : {}),
      },
      _sum: { totalMinor: true, paidMinor: true },
    });
    return items.map((item) => {
      const total = totals.find((row) => row.clientId === item.id);
      return {
        ...item,
        companyName: item.businessName,
        taxId: item.taxNumber,
        balanceMinor: (total?._sum.totalMinor ?? 0n) - (total?._sum.paidMinor ?? 0n),
      };
    });
  }
  if (collection === "suppliers") {
    assertPermission(actor, "suppliers.view");
    const items = await db.supplier.findMany({
      where: { companyId, ...search(params, ["name", "businessName", "phone", "email"]) },
      orderBy: { createdAt: "desc" },
      ...paging,
    });
    const totals = await db.expense.groupBy({
      by: ["supplierId"],
      where: { companyId, supplierId: { in: items.map((item) => item.id) }, status: "APPROVED" },
      _sum: { amountMinor: true },
    });
    return items.map((item) => ({
      ...item,
      companyName: item.businessName,
      taxId: item.taxNumber,
      balanceMinor: totals.find((row) => row.supplierId === item.id)?._sum.amountMinor ?? 0n,
    }));
  }
  if (collection === "users") {
    assertPermission(actor, "users.view");
    return (
      await db.user.findMany({
        where: { companyId, ...search(params, ["name", "email"]) },
        select: publicUserSelect,
        orderBy: { name: "asc" },
        ...paging,
      })
    ).map((item) => ({ ...item, role: item.roles[0]?.role.name, roleId: item.roles[0]?.role.id }));
  }
  if (collection === "roles") {
    assertPermission(actor, "users.view");
    return db.role.findMany({
      where: { companyId },
      include: { permissions: { select: { permission: { select: { key: true } } } } },
      orderBy: { label: "asc" },
    });
  }
  if (collection === "salespeople") {
    if (!hasPermission(actor, "salespeople.view")) assertPermission(actor, "cash.handover");
    const people = await db.salespersonProfile.findMany({
      where: {
        companyId,
        AND: [
          ...(actor.role === "SALESPERSON" ? [{ userId: actor.id }] : []),
          ...(params.get("id") ? [{ userId: uuid.parse(params.get("id")) }] : []),
        ],
        user: { ...search(params, ["name", "email"]) },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            active: true,
            _count: { select: { clients: true } },
          },
        },
      },
      ...paging,
    });
    if (actor.role === "CASHIER")
      return people.map((item) => ({
        id: item.userId,
        name: item.user.name,
        email: item.user.email,
        active: item.user.active,
      }));
    const ids = people.map((item) => item.userId);
    const [incoming, outgoing, sales, handovers, collections, quickCollections] = await Promise.all(
      [
        db.financialTransaction.groupBy({
          by: ["destinationSalespersonId"],
          where: { companyId, destinationSalespersonId: { in: ids }, status: "VALIDATED" },
          _sum: { amountMinor: true },
        }),
        db.financialTransaction.groupBy({
          by: ["sourceSalespersonId"],
          where: { companyId, sourceSalespersonId: { in: ids }, status: "VALIDATED" },
          _sum: { amountMinor: true },
        }),
        db.sale.groupBy({
          by: ["salespersonId"],
          where: { companyId, salespersonId: { in: ids }, status: { not: "CANCELLED" } },
          _sum: { totalMinor: true },
        }),
        db.financialTransaction.groupBy({
          by: ["sourceSalespersonId"],
          where: { companyId, sourceSalespersonId: { in: ids }, type: "HANDOVER", reversal: null },
          _sum: { amountMinor: true },
        }),
        db.payment.groupBy({
          by: ["salespersonId"],
          where: { companyId, salespersonId: { in: ids }, status: "VALIDATED" },
          _sum: { amountMinor: true },
        }),
        db.financialTransaction.groupBy({
          by: ["destinationSalespersonId"],
          where: {
            companyId,
            destinationSalespersonId: { in: ids },
            type: "CASH_RECEIPT",
            reversal: null,
          },
          _sum: { amountMinor: true },
        }),
      ],
    );
    return people.map((item) => {
      const incomingMinor =
        incoming.find((row) => row.destinationSalespersonId === item.userId)?._sum.amountMinor ??
        0n;
      const collectedMinor =
        (collections.find((row) => row.salespersonId === item.userId)?._sum.amountMinor ?? 0n) +
        (quickCollections.find((row) => row.destinationSalespersonId === item.userId)?._sum
          .amountMinor ?? 0n);
      const spentMinor =
        outgoing.find((row) => row.sourceSalespersonId === item.userId)?._sum.amountMinor ?? 0n;
      const salesMinor =
        sales.find((row) => row.salespersonId === item.userId)?._sum.totalMinor ?? 0n;
      return {
        ...item,
        ...item.user,
        id: item.userId,
        profileId: item.id,
        heldMinor: incomingMinor - spentMinor,
        balanceMinor: incomingMinor - spentMinor,
        collectedMinor,
        salesMinor,
        handedOverMinor:
          handovers.find((row) => row.sourceSalespersonId === item.userId)?._sum.amountMinor ?? 0n,
        clientsCount: item.user._count.clients,
        commissionMinor: BigInt(
          new Decimal(salesMinor.toString())
            .mul(item.commissionPercent.toString())
            .div(100)
            .toFixed(0),
        ),
      };
    });
  }
  if (collection === "cash-accounts") {
    assertPermission(actor, "cash.view");
    const items = await db.cashAccount.findMany({
      where: { ...cashScope(actor), ...search(params, ["name"]) },
      include: { responsible: person },
      orderBy: { name: "asc" },
      ...paging,
    });
    if (actor.role === "SALESPERSON")
      return items
        .filter((item) => item.active)
        .map((item) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          currency: item.currency,
          active: item.active,
        }));
    const ids = items.map((item) => item.id);
    const [incoming, outgoing] = await Promise.all([
      db.financialTransaction.groupBy({
        by: ["destinationCashAccountId"],
        where: { companyId, destinationCashAccountId: { in: ids }, status: "VALIDATED" },
        _sum: { amountMinor: true },
      }),
      db.financialTransaction.groupBy({
        by: ["sourceCashAccountId"],
        where: { companyId, sourceCashAccountId: { in: ids }, status: "VALIDATED" },
        _sum: { amountMinor: true },
      }),
    ]);
    return items.map((item) => ({
      ...item,
      balanceMinor:
        (incoming.find((row) => row.destinationCashAccountId === item.id)?._sum.amountMinor ?? 0n) -
        (outgoing.find((row) => row.sourceCashAccountId === item.id)?._sum.amountMinor ?? 0n),
    }));
  }
  if (collection === "sales") {
    assertPermission(actor, "sales.view");
    return db.sale.findMany({
      where: {
        AND: [
          { companyId, ...(actor.role === "SALESPERSON" ? { salespersonId: actor.id } : {}) },
          filters(params, [
            "date",
            "status",
            "clientId",
            "salespersonId",
            "createdById",
            "totalMinor",
          ]),
          search(params, ["number", "notes"]),
        ],
      },
      include: includes.sale,
      orderBy: { date: "desc" },
      ...paging,
    });
  }
  if (collection === "invoices") {
    assertPermission(actor, "invoices.view");
    const items = await db.invoice.findMany({
      where: {
        AND: [
          invoiceScope(actor),
          filters(params, ["date", "status", "clientId", "salespersonId", "totalMinor"]),
          search(params, ["number", "notes"]),
        ],
      },
      include: includes.invoice,
      orderBy: { date: "desc" },
      ...paging,
    });
    return items.map((item) => ({
      ...item,
      remainingMinor: item.status === "CANCELLED" ? 0n : item.totalMinor - item.paidMinor,
      overdue: item.dueDate < new Date() && !["PAID", "CANCELLED"].includes(item.status),
    }));
  }
  if (collection === "payments") {
    assertPermission(actor, "payments.view");
    return db.payment.findMany({
      where: {
        AND: [
          paymentScope(actor),
          filters(params, [
            "date",
            "status",
            "clientId",
            "salespersonId",
            "cashAccountId",
            "amountMinor",
          ]),
          search(params, ["number", "reference", "comment"]),
        ],
      },
      include: includes.payment,
      orderBy: { date: "desc" },
      ...paging,
    });
  }
  if (collection === "expenses") {
    assertPermission(actor, "expenses.view");
    return db.expense.findMany({
      where: {
        AND: [
          expenseScope(actor),
          filters(params, [
            "date",
            "status",
            "supplierId",
            "requesterId",
            "cashAccountId",
            "categoryId",
            "amountMinor",
          ]),
          search(params, [
            "number",
            "description",
            "comment",
            "beneficiaryName",
            "beneficiaryPhone",
            "reference",
          ]),
        ],
      },
      include: includes.expense,
      orderBy: { date: "desc" },
      ...paging,
    });
  }
  if (collection === "expense-categories") {
    assertPermission(actor, "expenses.view");
    return db.expenseCategory.findMany({ where: { companyId }, orderBy: { name: "asc" } });
  }
  if (collection === "transactions") {
    assertPermission(actor, "transactions.view");
    const cashId = params.get("cashAccountId");
    const salespersonId = params.get("salespersonId");
    const items = await db.financialTransaction.findMany({
      where: {
        AND: [
          transactionScope(actor),
          filters(params, [
            "date",
            "status",
            "type",
            "clientId",
            "supplierId",
            "createdById",
            "amountMinor",
          ]),
          transactionSearch(params.get("q")),
          ...(cashId
            ? [
                {
                  OR: [
                    { sourceCashAccountId: uuid.parse(cashId) },
                    { destinationCashAccountId: cashId },
                  ],
                },
              ]
            : []),
          ...(salespersonId
            ? [
                {
                  OR: [
                    { sourceSalespersonId: uuid.parse(salespersonId) },
                    { destinationSalespersonId: salespersonId },
                  ],
                },
              ]
            : []),
        ],
      },
      include: includes.transaction,
      orderBy: { date: "desc" },
      ...paging,
    });
    return withTransactionLabels(actor, items);
  }
  if (collection === "audit") {
    assertPermission(actor, "audit.view");
    return db.auditLog.findMany({
      where: {
        companyId,
        ...filters(params, ["createdAt", "userId", "entity", "entityId", "action"]),
        ...search(params, ["userName", "action", "entity"]),
      },
      orderBy: { createdAt: "desc" },
      ...paging,
    });
  }
  if (collection === "notifications")
    return db.notification.findMany({
      where: { companyId, userId: actor.id },
      orderBy: { createdAt: "desc" },
      ...paging,
    });
  throw new HttpError(404, "Collection introuvable.");
}

export async function getDirectoryItem(actor: Actor, collection: string, id: string) {
  uuid.parse(id);
  const companyId = actor.companyId;
  let item: unknown;
  if (collection === "clients") {
    assertPermission(actor, "clients.view");
    const result = await db.client.findFirst({
      where: { ...clientScope(actor), id },
      include: {
        salesperson: person,
        sales: {
          where: {
            companyId,
            ...(!hasPermission(actor, "sales.view") ? { id: { in: [] } } : {}),
            ...(actor.role === "SALESPERSON" ? { salespersonId: actor.id } : {}),
          },
          include: { invoice },
          orderBy: { date: "desc" },
          take: 100,
        },
        invoices: {
          where: {
            ...invoiceScope(actor),
            ...(!hasPermission(actor, "invoices.view") ? { id: { in: [] } } : {}),
          },
          orderBy: { date: "desc" },
          take: 100,
        },
        payments: {
          where: {
            ...paymentScope(actor),
            ...(!hasPermission(actor, "payments.view") ? { id: { in: [] } } : {}),
          },
          orderBy: { date: "desc" },
          take: 100,
        },
        transactions: {
          where: {
            ...transactionScope(actor),
            ...(!hasPermission(actor, "transactions.view") ? { id: { in: [] } } : {}),
          },
          orderBy: { date: "desc" },
          take: 100,
        },
      },
    });
    if (result) {
      const total = await db.invoice.aggregate({
        where: { ...invoiceScope(actor), clientId: id, status: { not: "CANCELLED" } },
        _sum: { totalMinor: true, paidMinor: true },
      });
      item = {
        ...result,
        companyName: result.businessName,
        taxId: result.taxNumber,
        balanceMinor: (total._sum.totalMinor ?? 0n) - (total._sum.paidMinor ?? 0n),
      };
    }
  } else if (collection === "suppliers") {
    assertPermission(actor, "suppliers.view");
    const result = await db.supplier.findFirst({
      where: { companyId, id },
      include: {
        expenses: {
          where: {
            ...expenseScope(actor),
            ...(!hasPermission(actor, "expenses.view") ? { id: { in: [] } } : {}),
          },
          include: includes.expense,
          orderBy: { date: "desc" },
          take: 100,
        },
        transactions: {
          where: {
            ...transactionScope(actor),
            ...(!hasPermission(actor, "transactions.view") ? { id: { in: [] } } : {}),
          },
          orderBy: { date: "desc" },
          take: 100,
        },
      },
    });
    if (result) {
      const total = await db.expense.aggregate({
        where: { companyId, supplierId: id, status: "APPROVED" },
        _sum: { amountMinor: true },
      });
      item = {
        ...result,
        companyName: result.businessName,
        taxId: result.taxNumber,
        balanceMinor: total._sum.amountMinor ?? 0n,
      };
    }
  } else if (collection === "users") {
    assertPermission(actor, "users.view");
    item = await db.user.findFirst({ where: { companyId, id }, select: publicUserSelect });
  } else if (collection === "salespeople") {
    assertPermission(actor, "salespeople.view");
    if (actor.role === "SALESPERSON" && id !== actor.id)
      throw new HttpError(404, "Commercial introuvable.");
    const profile = (await listDirectory(actor, "salespeople", new URLSearchParams({ id }))).find(
      (row: { id: string }) => row.id === id,
    );
    if (profile) {
      const [clients, sales, payments, handovers] = await Promise.all([
        db.client.findMany({ where: { companyId, salespersonId: id }, take: 100 }),
        db.sale.findMany({
          where: { companyId, salespersonId: id },
          include: includes.sale,
          orderBy: { date: "desc" },
          take: 100,
        }),
        db.payment.findMany({
          where: { companyId, salespersonId: id },
          include: includes.payment,
          orderBy: { date: "desc" },
          take: 100,
        }),
        db.salespersonCashHandover.findMany({
          where: { companyId, salespersonId: id },
          orderBy: { date: "desc" },
          take: 100,
        }),
      ]);
      item = { ...profile, clients, sales, payments, handovers };
    }
  } else if (collection === "cash-accounts") {
    assertPermission(actor, "cash.view");
    if (actor.role === "SALESPERSON")
      throw new HttpError(403, "Le détail des caisses est réservé aux responsables habilités.");
    const result = await db.cashAccount.findFirst({
      where: { ...cashScope(actor), id },
      include: { responsible: person },
    });
    if (result) {
      const [incoming, outgoing, transactions] = await Promise.all([
        db.financialTransaction.aggregate({
          where: { companyId, destinationCashAccountId: id, status: "VALIDATED" },
          _sum: { amountMinor: true },
        }),
        db.financialTransaction.aggregate({
          where: { companyId, sourceCashAccountId: id, status: "VALIDATED" },
          _sum: { amountMinor: true },
        }),
        db.financialTransaction.findMany({
          where: {
            ...transactionScope(actor),
            AND: [{ OR: [{ sourceCashAccountId: id }, { destinationCashAccountId: id }] }],
          },
          include: includes.transaction,
          orderBy: { date: "desc" },
          take: 100,
        }),
      ]);
      item = {
        ...result,
        transactions: await withTransactionLabels(actor, transactions),
        balanceMinor: (incoming._sum.amountMinor ?? 0n) - (outgoing._sum.amountMinor ?? 0n),
      };
    }
  } else if (collection === "sales") {
    assertPermission(actor, "sales.view");
    item = await db.sale.findFirst({
      where: {
        companyId,
        id,
        ...(actor.role === "SALESPERSON" ? { salespersonId: actor.id } : {}),
      },
      include: includes.sale,
    });
  } else if (collection === "invoices") {
    assertPermission(actor, "invoices.view");
    const result = await db.invoice.findFirst({
      where: { ...invoiceScope(actor), id },
      include: {
        ...includes.invoice,
        client: true,
        payments: {
          where: paymentScope(actor),
          include: includes.payment,
          orderBy: { date: "desc" },
        },
      },
    });
    if (result)
      item = {
        ...result,
        remainingMinor: result.status === "CANCELLED" ? 0n : result.totalMinor - result.paidMinor,
      };
  } else if (collection === "expenses") {
    assertPermission(actor, "expenses.view");
    item = await db.expense.findFirst({
      where: { ...expenseScope(actor), id },
      include: {
        ...includes.expense,
        transactions: { where: transactionScope(actor), orderBy: { date: "desc" } },
      },
    });
  } else if (collection === "payments") {
    assertPermission(actor, "payments.view");
    item = await db.payment.findFirst({
      where: { ...paymentScope(actor), id },
      include: includes.payment,
    });
  } else if (collection === "transactions") {
    assertPermission(actor, "transactions.view");
    const result = await db.financialTransaction.findFirst({
      where: { ...transactionScope(actor), id },
      include: includes.transaction,
    });
    item = result ? (await withTransactionLabels(actor, [result]))[0] : null;
  } else if (collection === "audit") {
    assertPermission(actor, "audit.view");
    item = await db.auditLog.findFirst({ where: { companyId, id } });
  } else if (collection === "notifications") {
    item = await db.notification.findFirst({ where: { companyId, id, userId: actor.id } });
  } else throw new HttpError(404, "Collection introuvable.");
  if (!item) throw new HttpError(404, "Élément introuvable ou non accessible.");
  return item;
}
