import { db } from "@/lib/db";
import { getActor } from "@/lib/auth";
import { withApi } from "@/lib/http";
import { hasPermission } from "@/lib/rbac";
import { invoiceScope, transactionScope } from "@/lib/record-access";
import { clientScope } from "@/lib/rbac";
import { parseMoney } from "@/lib/money";
import { transactionSearch } from "@/services/daybook.service";
export async function GET(request: Request) {
  return withApi(async () => {
    const actor = await getActor(request),
      q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 120);
    if (q.length < 2) return { items: [] };
    const companyId = actor.companyId,
      contains = { contains: q, mode: "insensitive" as const };
    let amountMinor: bigint | undefined;
    try {
      amountMinor = parseMoney(q.replace(/\s/g, "").replace(",", "."));
    } catch {
      /* Recherche textuelle. */
    }
    const [clients, suppliers, invoices, transactions, people] = await Promise.all([
      hasPermission(actor, "clients.view")
        ? db.client.findMany({
            where: {
              ...clientScope(actor),
              OR: [
                { name: contains },
                { businessName: contains },
                { phone: contains },
                { email: contains },
              ],
            },
            select: { id: true, name: true, phone: true },
            take: 6,
          })
        : [],
      hasPermission(actor, "suppliers.view")
        ? db.supplier.findMany({
            where: {
              companyId,
              OR: [{ name: contains }, { businessName: contains }, { phone: contains }],
            },
            select: { id: true, name: true },
            take: 6,
          })
        : [],
      hasPermission(actor, "invoices.view")
        ? db.invoice.findMany({
            where: {
              ...invoiceScope(actor),
              OR: [
                { number: contains },
                { client: { name: contains } },
                ...(amountMinor === undefined ? [] : [{ totalMinor: amountMinor }]),
              ],
            },
            select: { id: true, number: true },
            take: 6,
          })
        : [],
      hasPermission(actor, "transactions.view")
        ? db.financialTransaction.findMany({
            where: {
              AND: [transactionScope(actor), transactionSearch(q)],
            },
            select: { id: true, number: true, reference: true },
            take: 6,
          })
        : [],
      hasPermission(actor, "salespeople.view")
        ? db.user.findMany({
            where: {
              companyId,
              salesperson: { isNot: null },
              ...(actor.role === "SALESPERSON" ? { id: actor.id } : {}),
              name: contains,
            },
            select: { id: true, name: true },
            take: 6,
          })
        : [],
    ]);
    return {
      items: [
        ...clients.map((item) => ({
          id: item.id,
          label: item.name,
          type: "Client",
          href: `/clients?detail=${item.id}`,
        })),
        ...suppliers.map((item) => ({
          id: item.id,
          label: item.name,
          type: "Fournisseur",
          href: `/fournisseurs?detail=${item.id}`,
        })),
        ...invoices.map((item) => ({
          id: item.id,
          label: item.number,
          type: "Facture",
          href: `/factures?detail=${item.id}`,
        })),
        ...transactions.map((item) => ({
          id: item.id,
          label: item.number,
          type: "Transaction",
          href: `/transactions?detail=${item.id}`,
        })),
        ...people.map((item) => ({
          id: item.id,
          label: item.name,
          type: "Commercial",
          href: `/commerciaux?detail=${item.id}`,
        })),
      ],
    };
  });
}
