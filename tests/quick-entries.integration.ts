import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import type { Actor } from "../src/lib/finance-context";
import { rolePermissions } from "../src/lib/rbac";
import { hashPassword } from "../src/lib/password";
import { createQuickEntry } from "../src/services/quick-entry.service";
import { approveExpense, payExpense, rejectExpense } from "../src/services/expense.service";
import { getCashBalance } from "../src/services/cash.service";
import { getSalespersonBalance } from "../src/services/salesperson.service";
import { reverseTransaction } from "../src/services/transaction.service";
import { getDaybook } from "../src/services/daybook.service";
import { accountingExport } from "../src/services/accounting-export.service";

loadEnvConfig(process.cwd());
let checks = 0;
async function check(name: string, work: () => Promise<void> | void) {
  await work();
  checks++;
  console.log(`PASS ${checks}: ${name}`);
}
const key = () => randomUUID();

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Tests interdits en production.");
  const databaseHost = new URL(process.env.DATABASE_URL ?? "").hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]", "db"].includes(databaseHost))
    throw new Error("Cette suite accepte uniquement une base locale de développement.");
  const run = key().slice(0, 8);
  const company = await db.company.create({
    data: { name: `Saisie rapide ${run}`, currency: "EUR" },
  });
  const otherCompany = await db.company.create({
    data: { name: `Isolation rapide ${run}`, currency: "EUR" },
  });
  const passwordHash = await hashPassword(`Quick-entry-${key()}`);
  async function actor(role: string, suffix = role, companyId = company.id): Promise<Actor> {
    const user = await db.user.create({
      data: {
        companyId,
        name: `Test ${suffix}`,
        email: `quick-${suffix.toLowerCase()}-${run}@example.test`,
        passwordHash,
      },
    });
    if (role === "SALESPERSON")
      await db.salespersonProfile.create({ data: { companyId, userId: user.id } });
    return {
      id: user.id,
      companyId,
      name: user.name,
      role,
      permissions: rolePermissions[role],
      cashAccountIds: [],
    };
  }
  const admin = await actor("ADMIN"),
    manager = await actor("MANAGER"),
    cashier = await actor("CASHIER"),
    employee = await actor("EMPLOYEE"),
    salesperson = await actor("SALESPERSON"),
    otherSalesperson = await actor("SALESPERSON", "other-salesperson"),
    foreign = await actor("ADMIN", "foreign", otherCompany.id);
  const cash = await db.cashAccount.create({
    data: { companyId: company.id, name: "Caisse principale", responsibleId: cashier.id },
  });
  const secondCash = await db.cashAccount.create({
    data: { companyId: company.id, name: "Caisse responsable", responsibleId: admin.id },
  });
  const inactiveCash = await db.cashAccount.create({
    data: { companyId: company.id, name: "Caisse fermée", active: false },
  });
  const foreignCash = await db.cashAccount.create({
    data: { companyId: otherCompany.id, name: "Caisse privée" },
  });
  cashier.cashAccountIds = [cash.id];
  const baseInput = {
    direction: "IN",
    amount: "500.25",
    partyName: "Mamadou Diallo",
    partyKind: "CLIENT",
    phone: "+221 77 123 45 67",
    description: "Versement reçu sans facture",
    cashAccountId: cash.id,
    reference: "REF-QUICK-001",
    idempotencyKey: key(),
  };
  const receipt = await createQuickEntry(cashier, baseInput);
  assert(receipt.transactionId);
  await check(
    "entrée exacte dans la caisse sans créer vente, facture ni paiement facturé",
    async () => {
      assert.equal(receipt.kind, "receipt");
      assert.equal(receipt.status, "VALIDATED");
      const movement = await db.financialTransaction.findUniqueOrThrow({
        where: { id: receipt.transactionId },
        include: { cashEntry: true },
      });
      assert.equal(movement.type, "CASH_RECEIPT");
      assert.equal(movement.amountMinor, 50025n);
      assert.equal(movement.cashEntry?.id, receipt.id);
      assert.equal(movement.cashEntry?.method, "CASH");
      assert.equal(movement.invoiceId, null);
      assert.equal(movement.paymentId, null);
      assert.equal(movement.expenseId, null);
      assert.equal(await getCashBalance(cashier, cash.id), 50025n);
      assert.equal(await db.sale.count({ where: { companyId: company.id } }), 0);
      assert.equal(await db.invoice.count({ where: { companyId: company.id } }), 0);
      assert.equal(await db.payment.count({ where: { companyId: company.id } }), 0);
    },
  );
  await check("répétition idempotente, contenu différent et auteur différent refusés", async () => {
    assert.deepEqual(await createQuickEntry(cashier, baseInput), receipt);
    await assert.rejects(() => createQuickEntry(cashier, { ...baseInput, amount: "500.26" }), {
      status: 409,
    });
    await assert.rejects(() => createQuickEntry(cashier, { ...baseInput, phone: "autre" }), {
      status: 409,
    });
    await assert.rejects(() => createQuickEntry(admin, baseInput), { status: 409 });
    await assert.rejects(() => createQuickEntry(admin, { ...baseInput, direction: "OUT" }), {
      status: 409,
    });
    assert.equal(await getCashBalance(cashier, cash.id), 50025n);
  });
  await check("montants et champs invalides refusés côté serveur", async () => {
    for (const amount of ["0", "-1", "0.001", "1e5", "NaN"])
      await assert.rejects(() =>
        createQuickEntry(cashier, { ...baseInput, amount, idempotencyKey: key() }),
      );
    await assert.rejects(() =>
      createQuickEntry(cashier, { ...baseInput, partyName: " ", idempotencyKey: key() }),
    );
    await assert.rejects(() =>
      createQuickEntry(cashier, { ...baseInput, partyKind: "ADMIN", idempotencyKey: key() }),
    );
    await assert.rejects(() =>
      createQuickEntry(cashier, { ...baseInput, phone: "1".repeat(61), idempotencyKey: key() }),
    );
    await assert.rejects(() =>
      createQuickEntry(cashier, {
        ...baseInput,
        salespersonId: salesperson.id,
        idempotencyKey: key(),
      }),
    );
  });
  await check("permissions, isolation entreprise et caisse attribuée", async () => {
    await assert.rejects(
      () => createQuickEntry(employee, { ...baseInput, idempotencyKey: key() }),
      { status: 403 },
    );
    await assert.rejects(() => createQuickEntry(manager, { ...baseInput, idempotencyKey: key() }), {
      status: 403,
    });
    await assert.rejects(
      () =>
        createQuickEntry(cashier, {
          ...baseInput,
          cashAccountId: secondCash.id,
          idempotencyKey: key(),
        }),
      { status: 403 },
    );
    await assert.rejects(
      () =>
        createQuickEntry(admin, {
          ...baseInput,
          cashAccountId: foreignCash.id,
          idempotencyKey: key(),
        }),
      { status: 404 },
    );
    await assert.rejects(
      () =>
        createQuickEntry(admin, {
          ...baseInput,
          cashAccountId: inactiveCash.id,
          idempotencyKey: key(),
        }),
      { status: 404 },
    );
    await assert.rejects(
      () =>
        createQuickEntry(employee, {
          ...baseInput,
          direction: "OUT",
          cashAccountId: foreignCash.id,
          idempotencyKey: key(),
        }),
      { status: 404 },
    );
  });
  const walletInput = {
    ...baseInput,
    cashAccountId: undefined,
    salespersonId: salesperson.id,
    amount: "70.10",
    idempotencyKey: key(),
  };
  const wallet = await createQuickEntry(salesperson, walletInput);
  await check("commercial encaisse uniquement dans son propre portefeuille", async () => {
    assert.equal(await getSalespersonBalance(salesperson, salesperson.id), 7010n);
    await assert.rejects(
      () => createQuickEntry(otherSalesperson, { ...walletInput, idempotencyKey: key() }),
      { status: 403 },
    );
    await assert.rejects(() => createQuickEntry(admin, { ...walletInput, idempotencyKey: key() }), {
      status: 403,
    });
    await assert.rejects(
      () => createQuickEntry(salesperson, { ...baseInput, idempotencyKey: key() }),
      { status: 403 },
    );
  });
  const expenseInput = {
    direction: "OUT",
    amount: "150.00",
    partyName: "Ibrahima Ndiaye",
    partyKind: "DRIVER",
    phone: "+221 76 500 10 20",
    description: "Avance pour transport des marchandises",
    cashAccountId: cash.id,
    reference: "MISSION-42",
    idempotencyKey: key(),
  };
  const requested = await createQuickEntry(employee, expenseInput);
  await check(
    "sortie rapide conservée comme demande bénéficiaire, sans débit immédiat",
    async () => {
      assert.equal(requested.kind, "expense");
      assert.equal(requested.status, "PENDING");
      assert.equal(requested.transactionId, undefined);
      const expense = await db.expense.findUniqueOrThrow({ where: { id: requested.id } });
      assert.equal(expense.beneficiaryName, "Ibrahima Ndiaye");
      assert.equal(expense.beneficiaryKind, "DRIVER");
      assert.equal(expense.reference, "MISSION-42");
      assert.equal(await getCashBalance(cashier, cash.id), 50025n);
      await assert.rejects(
        () =>
          payExpense(cashier, { id: requested.id, cashAccountId: cash.id, idempotencyKey: key() }),
        { status: 409 },
      );
    },
  );
  await check(
    "idempotence sortie distingue changement de bénéficiaire, caisse et direction",
    async () => {
      assert.deepEqual(await createQuickEntry(employee, expenseInput), requested);
      await assert.rejects(
        () => createQuickEntry(employee, { ...expenseInput, partyName: "Autre bénéficiaire" }),
        { status: 409 },
      );
      await assert.rejects(
        () => createQuickEntry(employee, { ...expenseInput, cashAccountId: undefined }),
        { status: 409 },
      );
      await assert.rejects(() => createQuickEntry(admin, { ...expenseInput, direction: "IN" }), {
        status: 409,
      });
    },
  );
  await approveExpense(manager, { id: requested.id });
  await payExpense(cashier, {
    id: requested.id,
    cashAccountId: cash.id,
    method: "TRANSFER",
    idempotencyKey: key(),
  });
  await check(
    "validation puis paiement suivent le workflow existant, replay reste idempotent",
    async () => {
      assert.equal(await getCashBalance(cashier, cash.id), 35025n);
      const repeated = await createQuickEntry(employee, expenseInput);
      assert.equal(repeated.id, requested.id);
      assert.equal(repeated.status, "PAID");
      assert.equal(
        await db.financialTransaction.count({
          where: { companyId: company.id, expenseId: requested.id },
        }),
        1,
      );
    },
  );
  await check("demande sans caisse et dépense refusée ne touchent pas les fonds", async () => {
    const refused = await createQuickEntry(employee, {
      ...expenseInput,
      cashAccountId: undefined,
      idempotencyKey: key(),
    });
    await rejectExpense(manager, { id: refused.id });
    await assert.rejects(
      () => payExpense(cashier, { id: refused.id, cashAccountId: cash.id, idempotencyKey: key() }),
      { status: 409 },
    );
    assert.equal(await getCashBalance(cashier, cash.id), 35025n);
  });
  await check("double saisie simultanée ne crée qu’une entrée", async () => {
    const input = { ...baseInput, amount: "10.01", idempotencyKey: key() };
    const [first, second] = await Promise.all([
      createQuickEntry(cashier, input),
      createQuickEntry(cashier, input),
    ]);
    assert.equal(first.id, second.id);
    assert.equal(await getCashBalance(cashier, cash.id), 36026n);
  });
  await check("entrées et sorties concurrentes avec la même clé restent exclusives", async () => {
    const idempotencyKey = key();
    const results = await Promise.allSettled([
      createQuickEntry(admin, { ...baseInput, amount: "1.00", idempotencyKey }),
      createQuickEntry(admin, { ...expenseInput, amount: "1.00", idempotencyKey }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const count =
      (await db.financialTransaction.count({ where: { companyId: company.id, idempotencyKey } })) +
      (await db.expense.count({ where: { companyId: company.id, idempotencyKey } }));
    assert.equal(count, 1);
  });
  const walletReversal = await reverseTransaction(admin, {
    id: wallet.transactionId,
    reason: "Erreur de remise, restitution client",
    idempotencyKey: key(),
  });
  await check("annulation entrée restaure les soldes en gardant la fiche originale", async () => {
    const replay = await createQuickEntry(salesperson, walletInput);
    assert.equal(replay.transactionId, wallet.transactionId);
    assert.equal(replay.status, "REVERSED");
    assert.equal(await getSalespersonBalance(salesperson, salesperson.id), 0n);
    const entry = await db.cashEntry.findUniqueOrThrow({
      where: { id: wallet.id },
      include: { transaction: { include: { reversal: true } } },
    });
    assert.equal(entry.transaction.reversal?.id, walletReversal.id);
    assert.equal(
      await db.cashEntry.count({
        where: { companyId: company.id, transactionId: walletReversal.id },
      }),
      0,
    );
    await assert.rejects(() =>
      db.cashEntry.update({ where: { id: entry.id }, data: { partyName: "Falsification" } }),
    );
    await assert.rejects(() => db.cashEntry.delete({ where: { id: entry.id } }));
  });
  await check("audit associe l’encaissement et son identité à l’auteur", async () => {
    const logs = await db.auditLog.findMany({
      where: { companyId: company.id, entityId: { in: [receipt.id, receipt.transactionId!] } },
    });
    assert.equal(logs.length, 2);
    assert(logs.every((log) => log.userId === cashier.id));
  });
  await check("snapshot de reçu immuable et références entreprise protégées", async () => {
    const document = await db.transactionReceipt.create({
      data: {
        companyId: company.id,
        transactionId: receipt.transactionId!,
        number: `REC-TEST-${run}`,
        snapshot: { version: 1, amountMinor: "50025" },
        issuedById: admin.id,
      },
    });
    await assert.rejects(() =>
      db.transactionReceipt.update({
        where: { id: document.id },
        data: { snapshot: { altered: true } },
      }),
    );
    await assert.rejects(() => db.transactionReceipt.delete({ where: { id: document.id } }));
    await assert.rejects(() =>
      db.transactionReceipt.create({
        data: {
          companyId: otherCompany.id,
          transactionId: walletReversal.id,
          number: `REC-FOREIGN-${run}`,
          snapshot: {},
          issuedById: foreign.id,
        },
      }),
    );
    await assert.rejects(() =>
      db.cashEntry.create({
        data: {
          companyId: otherCompany.id,
          transactionId: walletReversal.id,
          partyName: "Intrusion",
          partyKind: "OTHER",
          description: "Accès non autorisé",
          method: "CASH",
        },
      }),
    );
  });

  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 86400000);
  const journalName = `Journal ${run}`;
  const journalInput = {
    ...baseInput,
    partyName: journalName,
    phone: "0666000011",
    reference: "JOURNAL-SEARCH",
  };
  await createQuickEntry(admin, {
    ...journalInput,
    amount: "5.00",
    date: new Date(from.getTime() - 1).toISOString(),
    idempotencyKey: key(),
  });
  const firstOfDay = await createQuickEntry(admin, {
    ...journalInput,
    amount: "20.00",
    date: from.toISOString(),
    idempotencyKey: key(),
  });
  const middleOfDay = await createQuickEntry(admin, {
    ...journalInput,
    amount: "30.00",
    date: new Date(from.getTime() + 3600000).toISOString(),
    idempotencyKey: key(),
  });
  await createQuickEntry(admin, {
    ...journalInput,
    amount: "40.00",
    date: to.toISOString(),
    idempotencyKey: key(),
  });
  const journalReversal = await reverseTransaction(admin, {
    id: middleOfDay.transactionId,
    reason: "Annulation pour contrôle du journal",
    idempotencyKey: key(),
  });
  const params = (extra: Record<string, string> = {}) =>
    new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
      q: journalName,
      ...extra,
    });
  await check(
    "journal respecte les bornes du jour et conserve les totaux après pagination",
    async () => {
      const firstPage = await getDaybook(admin, params({ pageSize: "1" }));
      const secondPage = await getDaybook(admin, params({ pageSize: "1", page: "2" }));
      assert.equal(firstPage.items.length, 1);
      assert.equal(firstPage.total, 3);
      assert.deepEqual(firstPage.totals, { inMinor: 5000n, outMinor: 3000n, netMinor: 2000n });
      assert.deepEqual(secondPage.totals, firstPage.totals);
      assert.notEqual(firstPage.items[0].id, secondPage.items[0].id);
    },
  );
  await check("journal recherche personne, téléphone, référence et montant exact", async () => {
    assert.equal((await getDaybook(admin, params({ q: "0666000011" }))).total, 3);
    assert.equal((await getDaybook(admin, params({ q: "JOURNAL-SEARCH" }))).total, 2);
    const amount = await getDaybook(admin, params({ q: "20,00" }));
    assert.equal(amount.total, 1);
    assert.equal(amount.items[0].id, firstOfDay.transactionId);
    const journal = await getDaybook(admin, params());
    const inverse = journal.items.find((item) => item.id === journalReversal.id);
    assert.equal(inverse?.partyName, journalName);
    assert.equal(inverse?.direction, "OUT");
  });
  await createQuickEntry(foreign, {
    ...journalInput,
    cashAccountId: foreignCash.id,
    amount: "999.00",
    idempotencyKey: key(),
  });
  await createQuickEntry(salesperson, {
    ...walletInput,
    partyName: "Journal commercial",
    amount: "12.00",
    idempotencyKey: key(),
  });
  await createQuickEntry(admin, {
    ...baseInput,
    cashAccountId: secondCash.id,
    partyName: "Journal privé responsable",
    amount: "13.00",
    idempotencyKey: key(),
  });
  await check("journal restreint société, commercial et caissier, employé refusé", async () => {
    const all = await getDaybook(admin, params({ q: "" }));
    assert(all.items.every((item) => item.companyId === company.id));
    const mine = await getDaybook(salesperson, params({ q: "" }));
    assert(mine.items.length > 0);
    assert(
      mine.items.every(
        (item) =>
          item.sourceSalespersonId === salesperson.id ||
          item.destinationSalespersonId === salesperson.id,
      ),
    );
    const cashierBook = await getDaybook(cashier, params({ q: "" }));
    assert(
      cashierBook.items.every(
        (item) => item.sourceCashAccountId === cash.id || item.destinationCashAccountId === cash.id,
      ),
    );
    await assert.rejects(() => getDaybook(employee, params()), { status: 403 });
  });
  await check(
    "export comptable versionné conserve montants en chaînes et liens d’annulation",
    async () => {
      const exported = await accountingExport(admin, params({ pageSize: "2" }));
      assert.equal(exported.schemaVersion, "orange.accounting.v1");
      assert.equal(exported.companyId, company.id);
      assert.equal(exported.total, 3);
      assert.equal(exported.nextPage, 2);
      assert.equal(exported.items.length, 2);
      assert(
        exported.items.every(
          (item) => typeof item.amount.minor === "string" && item.amount.exponent === 2,
        ),
      );
      const all = await accountingExport(admin, params());
      assert.equal(
        all.items.find((item) => item.id === journalReversal.id)?.reversalOfId,
        middleOfDay.transactionId,
      );
      assert.equal(
        all.items.find((item) => item.id === middleOfDay.transactionId)?.reversedById,
        journalReversal.id,
      );
      assert.doesNotThrow(() => JSON.stringify(all));
      assert(!JSON.stringify(all).includes("passwordHash"));
      await assert.rejects(() => accountingExport(employee, params()), { status: 403 });
      await assert.rejects(() => accountingExport(salesperson, params()), { status: 403 });
      const restricted = await accountingExport(
        { ...salesperson, permissions: [...salesperson.permissions, "reports.export"] },
        params({ q: "" }),
      );
      assert(
        restricted.items.every(
          (item) => item.source.id === salesperson.id || item.destination.id === salesperson.id,
        ),
      );
    },
  );
  console.log(
    `\n${checks} contrôles saisie rapide, journal et export réussis. Entreprise de vérification conservée : ${company.id}.`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Échec des vérifications.");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
