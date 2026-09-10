import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import type { Actor } from "../src/lib/finance-context";
import { rolePermissions } from "../src/lib/rbac";
import { hashPassword, verifyPassword } from "../src/lib/password";
import { createSale } from "../src/services/invoice.service";
import { createPayment } from "../src/services/payment.service";
import {
  approveExpense,
  createExpense,
  payExpense,
  rejectExpense,
} from "../src/services/expense.service";
import { getCashBalance, transferCash } from "../src/services/cash.service";
import { getSalespersonBalance, handoverCash } from "../src/services/salesperson.service";
import { deleteTransaction, reverseTransaction } from "../src/services/transaction.service";

loadEnvConfig(process.cwd());
let checks = 0;
async function check(name: string, work: () => Promise<void> | void) {
  await work();
  checks++;
  console.log(`PASS ${checks}: ${name}`);
}
const key = () => randomUUID();

async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Tests d’intégration interdits en production.");
  const run = randomUUID().slice(0, 8);
  const company = await db.company.create({
    data: { name: `Vérification ${run}`, currency: "EUR" },
  });
  const otherCompany = await db.company.create({
    data: { name: `Isolation ${run}`, currency: "EUR" },
  });
  const password = `Integration-${randomUUID()}`;
  const passwordHash = await hashPassword(password);
  async function makeActor(role: string, suffix = role): Promise<Actor> {
    const user = await db.user.create({
      data: {
        companyId: company.id,
        name: `Test ${suffix}`,
        email: `${suffix.toLowerCase()}-${run}@example.test`,
        passwordHash,
      },
    });
    if (role === "SALESPERSON")
      await db.salespersonProfile.create({ data: { companyId: company.id, userId: user.id } });
    return {
      id: user.id,
      companyId: company.id,
      name: user.name,
      role,
      permissions: rolePermissions[role],
    };
  }
  const admin = await makeActor("ADMIN"),
    manager = await makeActor("MANAGER"),
    cashier = await makeActor("CASHIER"),
    employee = await makeActor("EMPLOYEE"),
    commercial = await makeActor("SALESPERSON"),
    otherCommercial = await makeActor("SALESPERSON", "other-commercial");
  const cash = await db.cashAccount.create({
    data: { companyId: company.id, name: "Principale", responsibleId: cashier.id },
  });
  const bank = await db.cashAccount.create({
    data: { companyId: company.id, name: "Banque", type: "BANK" },
  });
  const foreignCash = await db.cashAccount.create({
    data: { companyId: otherCompany.id, name: "Autre entreprise" },
  });
  const client = await db.client.create({
    data: { companyId: company.id, name: "Client scénario", salespersonId: commercial.id },
  });
  const foreignClient = await db.client.create({
    data: { companyId: otherCompany.id, name: "Client privé" },
  });
  await check("mot de passe haché valide et mauvaise saisie rejetée", async () => {
    assert.equal(await verifyPassword(password, passwordHash), true);
    assert.equal(await verifyPassword("incorrect", passwordHash), false);
  });
  await check("employé ne peut créer une vente", async () => {
    await assert.rejects(() => createSale(employee, {}), /non autorisée/);
  });
  const sale = await createSale(commercial, {
    clientId: client.id,
    lines: [{ description: "Prestation complète", quantity: "1", unitPrice: "10000.00" }],
    idempotencyKey: key(),
  });
  assert(sale.invoice);
  const invoiceId = sale.invoice.id;
  await check("vente 10 000 EUR et facture automatiquement créée", () => {
    assert.equal(sale.totalMinor, 1000000n);
    assert.equal(sale.invoice!.totalMinor, 1000000n);
    assert.match(sale.invoice!.number, /^FAC-\d{4}-000001$/);
  });
  const firstPayment = await createPayment(commercial, {
    invoiceId,
    amount: "4000.00",
    method: "CASH",
    salespersonId: commercial.id,
    idempotencyKey: key(),
  });
  await check("paiement partiel 4 000 EUR, reste 6 000 EUR", async () => {
    const invoice = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    assert.equal(invoice.status, "PARTIALLY_PAID");
    assert.equal(invoice.totalMinor - invoice.paidMinor, 600000n);
  });
  await check("portefeuille commercial 4 000 EUR et caisse inchangée", async () => {
    assert.equal(await getSalespersonBalance(commercial, commercial.id), 400000n);
    assert.equal(await getCashBalance(admin, cash.id), 0n);
  });
  const handover = await handoverCash(commercial, {
    cashAccountId: cash.id,
    amount: "4000.00",
    idempotencyKey: key(),
  });
  await check("remise atomique : portefeuille zéro, caisse +4 000 EUR", async () => {
    assert.equal(await getSalespersonBalance(commercial, commercial.id), 0n);
    assert.equal(await getCashBalance(cashier, cash.id), 400000n);
    assert.equal(handover.amountMinor, 400000n);
  });
  const secondPayment = await createPayment(cashier, {
    invoiceId,
    amount: "6000.00",
    method: "CASH",
    cashAccountId: cash.id,
    idempotencyKey: key(),
  });
  await check("paiement complet : facture et vente PAYÉES", async () => {
    const invoice = await db.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { sale: true },
    });
    assert.equal(invoice.status, "PAID");
    assert.equal(invoice.paidMinor, 1000000n);
    assert.equal(invoice.sale.status, "PAID");
  });
  const expense = await createExpense(employee, {
    description: "Achat matériel 1 500 EUR",
    amount: "1500.00",
    cashAccountId: cash.id,
    idempotencyKey: key(),
  });
  await check("dépense en attente sans effet sur la caisse", async () => {
    assert.equal(expense.status, "PENDING");
    assert.equal(await getCashBalance(cashier, cash.id), 1000000n);
    await assert.rejects(
      () => payExpense(cashier, { id: expense.id, cashAccountId: cash.id, idempotencyKey: key() }),
      /validée/,
    );
  });
  await approveExpense(manager, { id: expense.id });
  await check("dépense validée par le responsable sans décaissement prématuré", async () => {
    const record = await db.expense.findUniqueOrThrow({ where: { id: expense.id } });
    assert.equal(record.approverId, manager.id);
    assert.equal(await getCashBalance(cashier, cash.id), 1000000n);
  });
  await check("base refuse modification du montant après validation", async () => {
    await assert.rejects(() =>
      db.expense.update({ where: { id: expense.id }, data: { amountMinor: 500000n } }),
    );
  });
  const paidExpense = await payExpense(cashier, {
    id: expense.id,
    cashAccountId: cash.id,
    idempotencyKey: key(),
  });
  await check("paiement caissier : caisse finale 8 500 EUR", async () => {
    assert.equal(paidExpense.status, "PAID");
    assert.equal(await getCashBalance(cashier, cash.id), 850000n);
  });
  await check("registre et audit identifient les trois intervenants", async () => {
    const transactions = await db.financialTransaction.findMany({
      where: { companyId: company.id },
    });
    assert.equal(transactions.length, 4);
    const logs = await db.auditLog.findMany({ where: { companyId: company.id } });
    for (const actor of [commercial, manager, cashier])
      assert(logs.some((log) => log.userId === actor.id));
    assert(logs.some((log) => log.entityId === expense.id && log.action === "APPROVE"));
    assert(logs.some((log) => log.entityId === firstPayment.id));
  });
  await check("dépense refusée ne peut être payée", async () => {
    const refused = await createExpense(employee, {
      description: "Demande refusée",
      amount: "20.00",
      idempotencyKey: key(),
    });
    await rejectExpense(manager, { id: refused.id });
    await assert.rejects(
      () => payExpense(cashier, { id: refused.id, cashAccountId: cash.id, idempotencyKey: key() }),
      /validée/,
    );
    assert.equal(await getCashBalance(cashier, cash.id), 850000n);
  });
  await check("auteur responsable ne peut valider sa propre demande", async () => {
    const own = await createExpense(manager, {
      description: "Demande personnelle responsable",
      amount: "10.00",
      idempotencyKey: key(),
    });
    await assert.rejects(() => approveExpense(manager, { id: own.id }), /autre personne/);
  });
  await check("isolation entreprise et entre commerciaux", async () => {
    await assert.rejects(
      () =>
        createSale(commercial, {
          clientId: foreignClient.id,
          lines: [{ description: "Hors entreprise", quantity: "1", unitPrice: "1" }],
          idempotencyKey: key(),
        }),
      /introuvable/,
    );
    await assert.rejects(
      () =>
        createSale(otherCommercial, {
          clientId: client.id,
          lines: [{ description: "Hors portefeuille", quantity: "1", unitPrice: "1" }],
          idempotencyKey: key(),
        }),
      /introuvable/,
    );
    await assert.rejects(
      () => getSalespersonBalance(otherCommercial, commercial.id),
      /introuvable/,
    );
    await assert.rejects(() => getCashBalance(admin, foreignCash.id), /introuvable/);
    await assert.rejects(
      () =>
        handoverCash(commercial, {
          cashAccountId: foreignCash.id,
          amount: "1",
          idempotencyKey: key(),
        }),
      /introuvable/,
    );
    await assert.rejects(() => getCashBalance(cashier, bank.id), /attribuée/);
    await assert.rejects(() =>
      db.client.create({
        data: {
          companyId: otherCompany.id,
          name: "Lien interentreprise interdit",
          salespersonId: commercial.id,
        },
      }),
    );
  });
  await check("caisse préassignée respectée après validation", async () => {
    const assigned = await createExpense(employee, {
      description: "Paiement banque prévu",
      amount: "10.00",
      cashAccountId: bank.id,
      idempotencyKey: key(),
    });
    await approveExpense(manager, { id: assigned.id });
    await assert.rejects(
      () => payExpense(cashier, { id: assigned.id, cashAccountId: cash.id, idempotencyKey: key() }),
      /caisse prévue/,
    );
  });
  await check("montant nul et trop-payé refusés", async () => {
    await assert.rejects(
      () =>
        createPayment(cashier, {
          invoiceId,
          amount: "0",
          method: "CASH",
          cashAccountId: cash.id,
          idempotencyKey: key(),
        }),
      /supérieur/,
    );
    await assert.rejects(
      () =>
        createPayment(cashier, {
          invoiceId,
          amount: "1",
          method: "CASH",
          cashAccountId: cash.id,
          idempotencyKey: key(),
        }),
      /dépasse/,
    );
  });
  const transferKey = key();
  const transfer = await transferCash(admin, {
    sourceCashAccountId: cash.id,
    destinationCashAccountId: bank.id,
    amount: "1000.00",
    idempotencyKey: transferKey,
  });
  await check("transfert atomique et répétition idempotente", async () => {
    const repeated = await transferCash(admin, {
      sourceCashAccountId: cash.id,
      destinationCashAccountId: bank.id,
      amount: "1000.00",
      idempotencyKey: transferKey,
    });
    assert.equal(transfer.id, repeated.id);
    assert.equal(await getCashBalance(admin, cash.id), 750000n);
    assert.equal(await getCashBalance(admin, bank.id), 100000n);
    await assert.rejects(
      () =>
        transferCash(admin, {
          sourceCashAccountId: bank.id,
          destinationCashAccountId: cash.id,
          amount: "1001.00",
          idempotencyKey: key(),
        }),
      /insuffisant/,
    );
  });
  await reverseTransaction(admin, {
    id: transfer.transactionId,
    reason: "Erreur de transfert, restitution",
    idempotencyKey: key(),
  });
  await check("annulation transfert conserve le total et l’original", async () => {
    assert.equal(await getCashBalance(admin, cash.id), 850000n);
    assert.equal(await getCashBalance(admin, bank.id), 0n);
    assert(await db.financialTransaction.findUnique({ where: { id: transfer.transactionId } }));
    await assert.rejects(
      () =>
        reverseTransaction(admin, {
          id: transfer.transactionId,
          reason: "Double annulation interdite",
          idempotencyKey: key(),
        }),
      /plus être annulée/,
    );
  });
  const secondTx = await db.financialTransaction.findFirstOrThrow({
    where: { companyId: company.id, paymentId: secondPayment.id, type: "PAYMENT" },
  });
  await reverseTransaction(admin, {
    id: secondTx.id,
    reason: "Paiement client erroné à corriger",
    idempotencyKey: key(),
  });
  await check("annulation paiement réouvre facture, vente et solde client", async () => {
    const invoice = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    assert.equal(invoice.status, "PARTIALLY_PAID");
    assert.equal(invoice.paidMinor, 400000n);
    assert.equal(await getCashBalance(admin, cash.id), 250000n);
  });
  const expenseTx = await db.financialTransaction.findFirstOrThrow({
    where: { companyId: company.id, expenseId: expense.id, type: "EXPENSE" },
  });
  await reverseTransaction(admin, {
    id: expenseTx.id,
    reason: "Remboursement dépense à payer de nouveau",
    idempotencyKey: key(),
  });
  await check("annulation dépense restitue caisse et revient APPROVED", async () => {
    assert.equal(
      (await db.expense.findUniqueOrThrow({ where: { id: expense.id } })).status,
      "APPROVED",
    );
    assert.equal(await getCashBalance(admin, cash.id), 400000n);
  });
  await check(
    "registre, audit et facture protégés contre modification/suppression DB",
    async () => {
      await assert.rejects(() => deleteTransaction(), /supprimées/);
      await assert.rejects(() => db.financialTransaction.delete({ where: { id: secondTx.id } }));
      await assert.rejects(() =>
        db.financialTransaction.update({ where: { id: secondTx.id }, data: { amountMinor: 1n } }),
      );
      const log = await db.auditLog.findFirstOrThrow({ where: { companyId: company.id } });
      await assert.rejects(() =>
        db.auditLog.update({ where: { id: log.id }, data: { action: "FORGED" } }),
      );
      await assert.rejects(() => db.auditLog.delete({ where: { id: log.id } }));
      await assert.rejects(() =>
        db.invoice.update({ where: { id: invoiceId }, data: { totalMinor: 1n } }),
      );
      await assert.rejects(() =>
        db.invoice.update({ where: { id: invoiceId }, data: { paidMinor: 1n } }),
      );
      await assert.rejects(() =>
        db.expense.update({
          where: { id: expense.id },
          data: { status: "PAID", paidAt: new Date() },
        }),
      );
      await assert.rejects(() =>
        db.saleLine.updateMany({ where: { saleId: sale.id }, data: { unitPrice: "1" } }),
      );
    },
  );
  const concurrentSale = await createSale(commercial, {
    clientId: client.id,
    lines: [{ description: "Test de concurrence", quantity: "1", unitPrice: "100.00" }],
    idempotencyKey: key(),
  });
  assert(concurrentSale.invoice);
  await check("deux paiements simultanés ne peuvent dépasser la facture", async () => {
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        createPayment(commercial, {
          invoiceId: concurrentSale.invoice!.id,
          amount: "70.00",
          method: "CASH",
          salespersonId: commercial.id,
          idempotencyKey: key(),
        }),
      ),
    );
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(
      (await db.invoice.findUniqueOrThrow({ where: { id: concurrentSale.invoice!.id } })).paidMinor,
      7000n,
    );
  });
  await check("double soumission simultanée idempotente ne débite qu’une fois", async () => {
    const idempotencyKey = key();
    const input = {
      invoiceId: concurrentSale.invoice!.id,
      amount: "30.00",
      method: "CASH",
      salespersonId: commercial.id,
      idempotencyKey,
    };
    const [a, b] = await Promise.all([
      createPayment(commercial, input),
      createPayment(commercial, input),
    ]);
    assert.equal(a.id, b.id);
    assert.equal(
      (await db.invoice.findUniqueOrThrow({ where: { id: concurrentSale.invoice!.id } })).paidMinor,
      10000n,
    );
    assert.equal(await db.payment.count({ where: { companyId: company.id, idempotencyKey } }), 1);
  });
  await check("remises concurrentes ne créent pas de portefeuille négatif", async () => {
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        handoverCash(commercial, {
          cashAccountId: cash.id,
          amount: "70.00",
          idempotencyKey: key(),
        }),
      ),
    );
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(await getSalespersonBalance(commercial, commercial.id), 3000n);
  });
  await check("échec d’opération annule aussi transaction et audit", async () => {
    const before = await db.financialTransaction.count({ where: { companyId: company.id } });
    const audits = await db.auditLog.count({ where: { companyId: company.id } });
    await assert.rejects(() =>
      transferCash(admin, {
        sourceCashAccountId: bank.id,
        destinationCashAccountId: cash.id,
        amount: "10.00",
        idempotencyKey: key(),
      }),
    );
    assert.equal(await db.financialTransaction.count({ where: { companyId: company.id } }), before);
    assert.equal(await db.auditLog.count({ where: { companyId: company.id } }), audits);
  });
  console.log(
    `\n${checks} contrôles PostgreSQL réussis. Entreprise de vérification conservée : ${company.name} (${company.id}).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
