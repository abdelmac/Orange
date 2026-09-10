import { db as database } from "@/lib/db";
import type { Actor } from "@/lib/finance-context";
import { assertPermission, hasPermission } from "@/lib/rbac";
import { expenseScope, invoiceScope, paymentScope, transactionScope } from "@/lib/record-access";
import { HttpError } from "@/lib/http";
import { reportPeriod } from "./report.service";
import { makeDocument } from "./pdf.service";
import { audit } from "./audit.service";
import { filters, search } from "./directory-read.service";
import { publicUserSelect } from "@/lib/user-select";
import { uuid } from "@/lib/validation";

export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
const amount = (minor: bigint) =>
  `${minor < 0n ? "-" : ""}${(minor < 0n ? -minor : minor) / 100n},${String((minor < 0n ? -minor : minor) % 100n).padStart(2, "0")}`;
const day = (date: Date) => date.toISOString().slice(0, 10);

export async function exportReport(actor: Actor, params: URLSearchParams) {
  assertPermission(actor, "reports.export");
  const type = params.get("type") ?? "transactions",
    format = params.get("format") ?? "csv";
  if (!["csv", "pdf"].includes(format)) throw new HttpError(400, "Format d’export invalide.");
  const limit = format === "pdf" ? 1000 : 10000,
    take = limit + 1;
  return database.$transaction(
    async (db) => {
      const companyId = actor.companyId,
        date = reportPeriod(params).date;
      let headers: string[], rows: string[][];
      if (type === "transactions") {
        assertPermission(actor, "transactions.view");
        headers = [
          "Numéro",
          "Date",
          "Type",
          "Montant",
          "Devise",
          "Source caisse",
          "Destination caisse",
          "Source commercial",
          "Destination commercial",
          "Référence",
          "Créé par",
          "Annulation de",
        ];
        const cashId = params.get("cashAccountId"),
          personId = params.get("salespersonId");
        const [items, accounts, users] = await Promise.all([
          db.financialTransaction.findMany({
            where: {
              AND: [
                transactionScope(actor),
                { date },
                filters(params, [
                  "status",
                  "type",
                  "clientId",
                  "supplierId",
                  "createdById",
                  "amountMinor",
                ]),
                search(params, ["number", "reference", "comment"]),
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
                ...(personId
                  ? [
                      {
                        OR: [
                          { sourceSalespersonId: uuid.parse(personId) },
                          { destinationSalespersonId: personId },
                        ],
                      },
                    ]
                  : []),
              ],
            },
            include: {
              creator: { select: { name: true } },
              reversalOf: { select: { number: true } },
            },
            orderBy: { date: "asc" },
            take,
          }),
          db.cashAccount.findMany({ where: { companyId }, select: { id: true, name: true } }),
          db.user.findMany({ where: { companyId }, select: { id: true, name: true } }),
        ]);
        const cash = new Map(accounts.map((a) => [a.id, a.name])),
          people = new Map(users.map((u) => [u.id, u.name]));
        rows = items.map((item) => [
          item.number,
          day(item.date),
          item.type,
          amount(item.amountMinor),
          item.currency,
          cash.get(item.sourceCashAccountId ?? "") ?? "",
          cash.get(item.destinationCashAccountId ?? "") ?? "",
          people.get(item.sourceSalespersonId ?? "") ?? "",
          people.get(item.destinationSalespersonId ?? "") ?? "",
          item.reference ?? "",
          item.creator.name,
          item.reversalOf?.number ?? "",
        ]);
      } else if (type === "sales") {
        assertPermission(actor, "sales.view");
        headers = ["Numéro", "Date", "Client", "Commercial", "Total TTC", "Devise", "Statut"];
        rows = (
          await db.sale.findMany({
            where: {
              AND: [
                {
                  companyId,
                  date,
                  ...(actor.role === "SALESPERSON" ? { salespersonId: actor.id } : {}),
                },
                filters(params, [
                  "status",
                  "clientId",
                  "salespersonId",
                  "createdById",
                  "totalMinor",
                ]),
                search(params, ["number", "notes"]),
              ],
            },
            include: {
              client: { select: { name: true } },
              salesperson: { select: { name: true } },
            },
            orderBy: { date: "asc" },
            take,
          })
        ).map((item) => [
          item.number,
          day(item.date),
          item.client.name,
          item.salesperson?.name ?? "",
          amount(item.totalMinor),
          item.currency,
          item.status,
        ]);
      } else if (["invoices", "unpaid", "receivables"].includes(type)) {
        assertPermission(actor, "invoices.view");
        headers = [
          "Numéro",
          "Date",
          "Échéance",
          "Client",
          "Total TTC",
          "Payé",
          "Reste",
          "Devise",
          "Statut",
        ];
        const items = await db.invoice.findMany({
          where: {
            AND: [
              invoiceScope(actor),
              type === "invoices" ? { date } : { status: { notIn: ["PAID", "CANCELLED"] } },
              filters(params, ["status", "clientId", "salespersonId", "totalMinor"]),
              search(params, ["number", "notes"]),
            ],
          },
          include: { client: { select: { name: true } } },
          orderBy: { date: "asc" },
          take,
        });
        rows = items.map((item) => [
          item.number,
          day(item.date),
          day(item.dueDate),
          item.client.name,
          amount(item.totalMinor),
          amount(item.paidMinor),
          amount(item.totalMinor - item.paidMinor),
          item.currency,
          item.status,
        ]);
      } else if (["expenses", "payables"].includes(type)) {
        assertPermission(actor, "expenses.view");
        headers = [
          "Numéro",
          "Date",
          "Description",
          "Fournisseur",
          "Catégorie",
          "Montant",
          "Devise",
          "Statut",
          "Demandeur",
          "Approbateur",
        ];
        rows = (
          await db.expense.findMany({
            where: {
              AND: [
                expenseScope(actor),
                type === "payables" ? { status: "APPROVED", supplierId: { not: null } } : { date },
                filters(params, [
                  "status",
                  "supplierId",
                  "requesterId",
                  "cashAccountId",
                  "categoryId",
                  "amountMinor",
                ]),
                search(params, ["number", "description", "comment"]),
              ],
            },
            include: {
              supplier: { select: { name: true } },
              category: true,
              requester: { select: { name: true } },
              approver: { select: { name: true } },
            },
            orderBy: { date: "asc" },
            take,
          })
        ).map((item) => [
          item.number,
          day(item.date),
          item.description,
          item.supplier?.name ?? "",
          item.category?.name ?? "",
          amount(item.amountMinor),
          item.currency,
          item.status,
          item.requester.name,
          item.approver?.name ?? "",
        ]);
      } else if (type === "clients") {
        assertPermission(actor, "clients.view");
        headers = ["Client", "Entreprise", "Téléphone", "Email", "Commercial", "Créance"];
        const clients = await db.client.findMany({
          where: {
            companyId,
            AND: [
              filters(params, ["salespersonId"]),
              search(params, ["name", "businessName", "phone", "email", "taxNumber"]),
            ],
            ...(actor.role === "SALESPERSON" ? { salespersonId: actor.id } : {}),
          },
          include: { salesperson: { select: { name: true } } },
          orderBy: { name: "asc" },
          take,
        });
        const totals = hasPermission(actor, "invoices.view")
          ? await db.invoice.groupBy({
              by: ["clientId"],
              where: {
                ...invoiceScope(actor),
                status: { not: "CANCELLED" },
                clientId: { in: clients.map((client) => client.id) },
              },
              _sum: { totalMinor: true, paidMinor: true },
            })
          : [];
        rows = clients.map((item) => {
          const total = totals.find((row) => row.clientId === item.id);
          return [
            item.name,
            item.businessName ?? "",
            item.phone ?? "",
            item.email ?? "",
            item.salesperson?.name ?? "",
            hasPermission(actor, "invoices.view")
              ? amount((total?._sum.totalMinor ?? 0n) - (total?._sum.paidMinor ?? 0n))
              : "Non autorisé",
          ];
        });
      } else if (type === "suppliers") {
        assertPermission(actor, "suppliers.view");
        headers = ["Fournisseur", "Entreprise", "Téléphone", "Email", "À payer"];
        const suppliers = await db.supplier.findMany({
          where: { companyId, ...search(params, ["name", "businessName", "phone", "email"]) },
          orderBy: { name: "asc" },
          take,
        });
        const totals = hasPermission(actor, "expenses.view")
          ? await db.expense.groupBy({
              by: ["supplierId"],
              where: {
                ...expenseScope(actor),
                status: "APPROVED",
                supplierId: { in: suppliers.map((supplier) => supplier.id) },
              },
              _sum: { amountMinor: true },
            })
          : [];
        rows = suppliers.map((item) => [
          item.name,
          item.businessName ?? "",
          item.phone ?? "",
          item.email ?? "",
          hasPermission(actor, "expenses.view")
            ? amount(totals.find((row) => row.supplierId === item.id)?._sum.amountMinor ?? 0n)
            : "Non autorisé",
        ]);
      } else if (["cash-accounts", "cash", "salespeople"].includes(type)) {
        const cash = type !== "salespeople";
        assertPermission(actor, cash ? "cash.view" : "salespeople.view");
        headers = [cash ? "Caisse" : "Commercial", "Solde", "Devise"];
        if (cash && actor.role === "SALESPERSON")
          throw new HttpError(
            403,
            "Vous pouvez exporter votre portefeuille commercial. Les soldes des caisses sont privés.",
          );
        if (!cash) assertPermission(actor, "cash.view");
        const company = await db.company.findUniqueOrThrow({ where: { id: companyId } });
        const people = cash
          ? await db.cashAccount.findMany({
              where: {
                companyId,
                ...(actor.role === "CASHIER" ? { responsibleId: actor.id } : {}),
                ...search(params, ["name"]),
              },
              select: { id: true, name: true },
              take,
            })
          : await db.user.findMany({
              where: {
                companyId,
                salesperson: { isNot: null },
                ...(actor.role === "SALESPERSON" ? { id: actor.id } : {}),
                ...search(params, ["name", "email"]),
              },
              select: { id: true, name: true },
              take,
            });
        const ids = people.map((person) => person.id);
        if (cash) {
          const incoming = await db.financialTransaction.groupBy({
            by: ["destinationCashAccountId"],
            where: { companyId, status: "VALIDATED", destinationCashAccountId: { in: ids } },
            _sum: { amountMinor: true },
          });
          const outgoing = await db.financialTransaction.groupBy({
            by: ["sourceCashAccountId"],
            where: { companyId, status: "VALIDATED", sourceCashAccountId: { in: ids } },
            _sum: { amountMinor: true },
          });
          rows = people.map((person) => [
            person.name,
            amount(
              (incoming.find((row) => row.destinationCashAccountId === person.id)?._sum
                .amountMinor ?? 0n) -
                (outgoing.find((row) => row.sourceCashAccountId === person.id)?._sum.amountMinor ??
                  0n),
            ),
            company.currency,
          ]);
        } else {
          const incoming = await db.financialTransaction.groupBy({
            by: ["destinationSalespersonId"],
            where: { companyId, status: "VALIDATED", destinationSalespersonId: { in: ids } },
            _sum: { amountMinor: true },
          });
          const outgoing = await db.financialTransaction.groupBy({
            by: ["sourceSalespersonId"],
            where: { companyId, status: "VALIDATED", sourceSalespersonId: { in: ids } },
            _sum: { amountMinor: true },
          });
          rows = people.map((person) => [
            person.name,
            amount(
              (incoming.find((row) => row.destinationSalespersonId === person.id)?._sum
                .amountMinor ?? 0n) -
                (outgoing.find((row) => row.sourceSalespersonId === person.id)?._sum.amountMinor ??
                  0n),
            ),
            company.currency,
          ]);
        }
      } else if (type === "payments") {
        assertPermission(actor, "payments.view");
        headers = [
          "Numéro",
          "Date",
          "Client",
          "Facture",
          "Commercial",
          "Caisse",
          "Montant",
          "Devise",
          "Mode",
          "Statut",
          "Référence",
        ];
        rows = (
          await db.payment.findMany({
            where: {
              AND: [
                paymentScope(actor),
                { date },
                filters(params, [
                  "status",
                  "clientId",
                  "salespersonId",
                  "cashAccountId",
                  "createdById",
                  "amountMinor",
                ]),
                search(params, ["number", "reference", "comment"]),
              ],
            },
            include: {
              client: { select: { name: true } },
              invoice: { select: { number: true } },
              salesperson: { select: { name: true } },
              cashAccount: { select: { name: true } },
            },
            orderBy: { date: "asc" },
            take,
          })
        ).map((item) => [
          item.number,
          day(item.date),
          item.client.name,
          item.invoice.number,
          item.salesperson?.name ?? "",
          item.cashAccount?.name ?? "",
          amount(item.amountMinor),
          item.currency,
          item.method,
          item.status,
          item.reference ?? "",
        ]);
      } else if (type === "users") {
        assertPermission(actor, "users.view");
        headers = ["Nom", "Email", "Rôles", "Statut", "Créé le"];
        rows = (
          await db.user.findMany({
            where: { companyId, ...search(params, ["name", "email"]) },
            select: publicUserSelect,
            orderBy: { name: "asc" },
            take,
          })
        ).map((item) => [
          item.name,
          item.email,
          item.roles.map((role) => role.role.label).join(", "),
          item.active ? "Actif" : "Désactivé",
          day(item.createdAt),
        ]);
      } else if (type === "audit") {
        assertPermission(actor, "audit.view");
        headers = [
          "Date UTC",
          "Utilisateur",
          "Action",
          "Objet",
          "Identifiant",
          "Adresse IP",
          "Anciennes valeurs",
          "Nouvelles valeurs",
        ];
        rows = (
          await db.auditLog.findMany({
            where: {
              companyId,
              createdAt: date,
              AND: [
                filters(params, ["userId", "entity", "entityId", "action"]),
                search(params, ["userName", "action", "entity"]),
              ],
            },
            orderBy: { createdAt: "asc" },
            take,
          })
        ).map((item) => [
          item.createdAt.toISOString(),
          item.userName,
          item.action,
          item.entity,
          item.entityId,
          item.ip ?? "",
          JSON.stringify(item.before ?? null),
          JSON.stringify(item.after ?? null),
        ]);
      } else if (type === "roles") {
        assertPermission(actor, "users.view");
        headers = ["Rôle", "Permissions"];
        rows = (
          await db.role.findMany({
            where: { companyId },
            include: { permissions: { include: { permission: true } } },
            orderBy: { label: "asc" },
            take,
          })
        ).map((item) => [
          item.label,
          item.permissions.map((grant) => grant.permission.key).join(", "),
        ]);
      } else throw new HttpError(400, "Rapport non pris en charge.");
      if (rows.length > limit)
        throw new HttpError(
          413,
          `Cet export dépasse ${limit} lignes. Réduisez la période ou ajoutez des filtres.`,
        );
      if (
        rows.reduce(
          (size, row) =>
            size + row.reduce((total, cell) => total + Buffer.byteLength(cell, "utf8"), 0),
          0,
        ) >
        20 * 1024 * 1024
      )
        throw new HttpError(
          413,
          "Cet export dépasse 20 Mo. Réduisez la période ou ajoutez des filtres.",
        );
      const company = await db.company.findUniqueOrThrow({ where: { id: companyId } });
      await audit(db, actor, {
        action: "EXPORT",
        entity: "Report",
        entityId: type,
        after: { format, count: rows.length, period: params.toString().slice(0, 4000) },
      });
      if (format === "csv") {
        const csv =
          "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
        return new Response(csv, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="orange-${type}-${day(new Date())}.csv"`,
            "Cache-Control": "private, no-store",
          },
        });
      }
      const bytes = await makeDocument(
        `Rapport · ${type}`,
        `${rows.length} opération(s) · Généré le ${new Date().toLocaleDateString("fr-FR")}`,
        company.name,
        rows.length
          ? rows.map((row) => ({
              label: row[0],
              text: row
                .slice(1)
                .map((cell, i) => `${headers[i + 1]} : ${cell || "—"}`)
                .join(" · "),
            }))
          : [{ text: "Aucune opération sur cette période." }],
      );
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="orange-${type}.pdf"`,
          "Cache-Control": "private, no-store",
        },
      });
    },
    { isolationLevel: "RepeatableRead", timeout: 60000 },
  );
}
