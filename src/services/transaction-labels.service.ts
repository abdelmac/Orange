import { db } from "@/lib/db";
import type { Actor } from "@/lib/finance-context";
import type { Prisma } from "@prisma/client";

type Movement = {
  sourceCashAccountId: string | null;
  destinationCashAccountId: string | null;
  sourceSalespersonId: string | null;
  destinationSalespersonId: string | null;
  client?: { name: string } | null;
  supplier?: { name: string } | null;
  cashEntry?: { partyName: string } | null;
  expense?: { beneficiaryName?: string | null } | null;
  reversalOf?: { cashEntry?: { partyName: string } | null } | null;
};

export async function withTransactionLabels<T extends Movement>(
  actor: Actor,
  items: T[],
  database: Prisma.TransactionClient = db,
) {
  const cashIds = [
    ...new Set(
      items
        .flatMap((item) => [item.sourceCashAccountId, item.destinationCashAccountId])
        .filter((id): id is string => !!id),
    ),
  ];
  const personIds = [
    ...new Set(
      items
        .flatMap((item) => [item.sourceSalespersonId, item.destinationSalespersonId])
        .filter((id): id is string => !!id),
    ),
  ];
  const [accounts, people] = await Promise.all([
    database.cashAccount.findMany({
      where: { companyId: actor.companyId, id: { in: cashIds } },
      select: { id: true, name: true },
    }),
    database.user.findMany({
      where: { companyId: actor.companyId, id: { in: personIds } },
      select: { id: true, name: true },
    }),
  ]);
  const cash = new Map(accounts.map((account) => [account.id, account]));
  const persons = new Map(people.map((person) => [person.id, person]));
  return items.map((item) => {
    const sourceCashAccount = cash.get(item.sourceCashAccountId ?? "") ?? null;
    const destinationCashAccount = cash.get(item.destinationCashAccountId ?? "") ?? null;
    const sourceSalesperson = persons.get(item.sourceSalespersonId ?? "") ?? null;
    const destinationSalesperson = persons.get(item.destinationSalespersonId ?? "") ?? null;
    return {
      ...item,
      sourceCashAccount,
      destinationCashAccount,
      sourceSalesperson,
      destinationSalesperson,
      sourceLabel:
        sourceCashAccount?.name ??
        sourceSalesperson?.name ??
        (item.destinationCashAccountId || item.destinationSalespersonId
          ? item.cashEntry?.partyName
          : null) ??
        item.expense?.beneficiaryName ??
        item.client?.name ??
        "Origine externe",
      destinationLabel:
        destinationCashAccount?.name ??
        destinationSalesperson?.name ??
        item.reversalOf?.cashEntry?.partyName ??
        item.expense?.beneficiaryName ??
        item.supplier?.name ??
        item.client?.name ??
        "Destination externe",
    };
  });
}
