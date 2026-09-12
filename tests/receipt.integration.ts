import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { db } from "../src/lib/db";
import type { Actor } from "../src/lib/finance-context";
import { hashPassword } from "../src/lib/password";
import { rolePermissions } from "../src/lib/rbac";
import { adjustCash, getCashBalance, transferCash } from "../src/services/cash.service";
import { approveExpense, createExpense, payExpense } from "../src/services/expense.service";
import { createSale } from "../src/services/invoice.service";
import { createPayment } from "../src/services/payment.service";
import { createQuickEntry } from "../src/services/quick-entry.service";
import { issueReceipt, issueReceiptForEntity } from "../src/services/receipt.service";
import { receiptDocumentBlocks, renderReceiptPdf } from "../src/services/receipt-pdf.service";
import { handoverCash } from "../src/services/salesperson.service";
import { reverseTransaction } from "../src/services/transaction.service";
import { getDaybook } from "../src/services/daybook.service";
import { accountingExport } from "../src/services/accounting-export.service";

loadEnvConfig(process.cwd());
let checks = 0;
async function check(label: string, work: () => Promise<void> | void) {
  await work();
  console.log(`PASS ${++checks}: ${label}`);
}
const key = () => randomUUID();
async function denied(work: () => Promise<unknown>, status = 404) {
  await assert.rejects(
    work,
    (error: unknown) => error instanceof Error && "status" in error && error.status === status,
  );
}

async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Tests de reçus interdits en production.");
  const database = new URL(process.env.DATABASE_URL || "");
  if (!["localhost", "127.0.0.1", "[::1]", "db"].includes(database.hostname))
    throw new Error("Les tests de reçus exigent une base locale isolée.");
  const run = randomUUID().slice(0, 8);
  const company = await db.company.create({
    data: { name: `Société Élan ${run}`, currency: "EUR", address: "12 rue de l’Église, Lyon" },
  });
  const foreignCompany = await db.company.create({
    data: { name: `Entreprise privée ${run}`, currency: "EUR" },
  });
  const passwordHash = await hashPassword(`Receipt-tests-${randomUUID()}`);
  async function actor(role: string, suffix = role, companyId = company.id): Promise<Actor> {
    const user = await db.user.create({
      data: {
        companyId,
        name: `Élodie ${suffix}`,
        email: `receipt-${run}-${suffix}@example.test`,
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
    otherCashier = await actor("CASHIER", "other-cashier");
  const commercial = await actor("SALESPERSON"),
    otherCommercial = await actor("SALESPERSON", "other-commercial");
  const employee = await actor("EMPLOYEE"),
    otherEmployee = await actor("EMPLOYEE", "other-employee"),
    foreignAdmin = await actor("ADMIN", "foreign-admin", foreignCompany.id);
  const cash = await db.cashAccount.create({
    data: { companyId: company.id, name: "Caisse principale", responsibleId: cashier.id },
  });
  const secondCash = await db.cashAccount.create({
    data: { companyId: company.id, name: "Caisse annexe", responsibleId: otherCashier.id },
  });
  cashier.cashAccountIds = [cash.id];
  otherCashier.cashAccountIds = [secondCash.id];
  const client = await db.client.create({
    data: {
      companyId: company.id,
      name: "André Noël",
      phone: "+33 6 12 34 56 78",
      salespersonId: commercial.id,
    },
  });
  const opening = await adjustCash(admin, {
    cashAccountId: cash.id,
    amount: "5000",
    direction: "IN",
    reason: "Ouverture de caisse de vérification",
    idempotencyKey: key(),
  });
  const sale = await createSale(commercial, {
    clientId: client.id,
    lines: [{ description: "Prestation professionnelle", quantity: "1", unitPrice: "10000" }],
    idempotencyKey: key(),
  });
  assert(sale.invoice);
  const payment = await createPayment(cashier, {
    invoiceId: sale.invoice.id,
    amount: "4000",
    method: "CARD",
    cashAccountId: cash.id,
    date: "2026-01-15T09:15:00.000Z",
    reference: "CB-42",
    idempotencyKey: key(),
  });
  const movement = await db.financialTransaction.findFirstOrThrow({
    where: { companyId: company.id, paymentId: payment.id, type: "PAYMENT" },
  });

  await check(
    "refus avant émission : autre entreprise, caisse non affectée et absence de permission",
    async () => {
      await denied(() => issueReceipt(foreignAdmin, movement.id));
      await denied(() => issueReceipt(otherCashier, movement.id));
      await denied(() => issueReceipt({ ...admin, permissions: [] }, movement.id), 403);
      assert.equal(await db.transactionReceipt.count({ where: { transactionId: movement.id } }), 0);
    },
  );

  const balanceBefore = await getCashBalance(admin, cash.id);
  const concurrent = await Promise.all([
    issueReceipt(admin, movement.id),
    issueReceipt(cashier, movement.id),
    issueReceipt(manager, movement.id),
  ]);
  const first = concurrent[0];
  await check(
    "trois émissions concurrentes créent un seul reçu et un seul audit sans mouvement financier",
    async () => {
      assert(
        concurrent.every((receipt) => receipt.id === first.id && receipt.number === first.number),
      );
      assert.equal(await db.transactionReceipt.count({ where: { transactionId: movement.id } }), 1);
      assert.equal(
        await db.auditLog.count({
          where: {
            companyId: company.id,
            entity: "TransactionReceipt",
            entityId: first.id,
            action: "ISSUE",
          },
        }),
        1,
      );
      assert.equal(await getCashBalance(admin, cash.id), balanceBefore);
      assert.match(first.number, /^REC-\d{4}-000001$/);
      assert.equal(first.snapshot.operation.method, "CARD");
      assert.equal(first.snapshot.operation.amountMinor, "400000");
      assert.equal(first.snapshot.operation.date, "2026-01-15T09:15:00.000Z");
      assert.notEqual(first.snapshot.operation.date, first.snapshot.issuedAt);
      assert.equal(first.snapshot.payer.name, client.name);
      assert.equal(first.snapshot.payee.name, company.name);
    },
  );

  await check(
    "un reçu existant conserve noms, mode, dates et émetteur après modification des fiches",
    async () => {
      await db.company.update({ where: { id: company.id }, data: { name: "Entreprise renommée" } });
      await db.client.update({
        where: { id: client.id },
        data: { name: "Client renommé", phone: "000" },
      });
      await db.cashAccount.update({ where: { id: cash.id }, data: { name: "Caisse renommée" } });
      const again = await issueReceipt(cashier, movement.id);
      assert.deepEqual(again.snapshot, first.snapshot);
      assert.equal(
        (await issueReceiptForEntity(admin, { entity: "payment", id: payment.id })).id,
        first.id,
      );
      assert.equal(
        (await issueReceiptForEntity(admin, { entity: "transaction", id: movement.id })).id,
        first.id,
      );
    },
  );

  await check("PostgreSQL interdit modification et suppression du reçu immuable", async () => {
    await assert.rejects(() =>
      db.transactionReceipt.update({
        where: { id: first.id },
        data: { snapshot: { changed: true } },
      }),
    );
    await assert.rejects(() => db.transactionReceipt.delete({ where: { id: first.id } }));
    assert.deepEqual((await issueReceipt(admin, movement.id)).snapshot, first.snapshot);
  });

  const walletEntry = await createQuickEntry(commercial, {
    direction: "IN",
    amount: "50.25",
    partyName: "Ahmed Ben Ali",
    partyKind: "DRIVER",
    phone: "+33 6 00 00 00 00",
    description: "Versement de tournée",
    method: "CHECK",
    salespersonId: commercial.id,
    reference: "TOUR-007",
    idempotencyKey: key(),
  });
  assert(walletEntry.kind === "receipt");
  const walletTransactionId = walletEntry.transactionId;
  assert(walletTransactionId);
  const walletReceipt = await issueReceipt(commercial, walletTransactionId);
  await check(
    "entrée au portefeuille : tiers payeur, entreprise bénéficiaire et commercial détenteur",
    async () => {
      assert.equal(walletReceipt.snapshot.payer.name, "Ahmed Ben Ali");
      assert.equal(walletReceipt.snapshot.payer.kind, "DRIVER");
      assert.equal(walletReceipt.snapshot.payee.kind, "COMPANY");
      assert.equal(walletReceipt.snapshot.destination.kind, "SALESPERSON");
      assert.equal(walletReceipt.snapshot.destination.name, commercial.name);
      assert.equal(walletReceipt.snapshot.operation.method, "CHECK");
      assert.equal(walletReceipt.snapshot.operation.reference, "TOUR-007");
      await denied(() => issueReceipt(otherCommercial, walletTransactionId));
      await denied(() => issueReceipt(cashier, walletTransactionId));
      await denied(() => issueReceipt(employee, walletTransactionId));
      await denied(() => issueReceipt(foreignAdmin, walletTransactionId));
    },
  );

  const handover = await handoverCash(commercial, {
    cashAccountId: cash.id,
    amount: "50.25",
    idempotencyKey: key(),
  });
  const transfer = await transferCash(admin, {
    sourceCashAccountId: cash.id,
    destinationCashAccountId: secondCash.id,
    amount: "25",
    idempotencyKey: key(),
  });
  await check(
    "remise, transfert et ajustement indiquent leurs véritables circuits sans inventer d’espèces",
    async () => {
      const handoverReceipt = await issueReceipt(commercial, handover.transactionId);
      assert.equal(handoverReceipt.snapshot.payer.name, commercial.name);
      assert.equal(handoverReceipt.snapshot.destination.name, "Caisse renommée");
      assert.equal(handoverReceipt.snapshot.operation.method, null);
      assert.equal((await issueReceipt(cashier, handover.transactionId)).id, handoverReceipt.id);
      const transferReceipt = await issueReceipt(admin, transfer.transactionId);
      assert.equal(transferReceipt.snapshot.source.name, "Caisse renommée");
      assert.equal(transferReceipt.snapshot.destination.name, secondCash.name);
      assert.equal(transferReceipt.snapshot.operation.method, null);
      const adjustmentReceipt = await issueReceipt(admin, opening.id);
      assert.equal(adjustmentReceipt.snapshot.operation.type, "ADJUSTMENT");
      assert.equal(adjustmentReceipt.snapshot.payer.kind, "ADJUSTMENT");
      assert.equal(adjustmentReceipt.snapshot.operation.method, null);
    },
  );

  const pending = await createExpense(employee, {
    description: "Matériel demandé par l’employé",
    amount: "150",
    cashAccountId: cash.id,
    idempotencyKey: key(),
  });
  await check("aucun reçu pour une dépense encore impayée", async () => {
    await denied(() => issueReceiptForEntity(employee, { entity: "expense", id: pending.id }));
  });
  await approveExpense(manager, { id: pending.id });
  await payExpense(cashier, {
    id: pending.id,
    cashAccountId: cash.id,
    method: "CARD",
    idempotencyKey: key(),
  });
  const employeeReceipt = await issueReceiptForEntity(employee, {
    entity: "expense",
    id: pending.id,
  });
  await check(
    "employé : reçu de sa dépense payée sans transactions.view et bénéficiaire inconnu explicitement",
    async () => {
      assert(!employee.permissions.includes("transactions.view"));
      assert.equal(employeeReceipt.snapshot.operation.method, "CARD");
      assert.equal(employeeReceipt.snapshot.requester?.id, employee.id);
      assert.equal(employeeReceipt.snapshot.payee.kind, "UNSPECIFIED");
      assert.equal(employeeReceipt.snapshot.payee.name, "Bénéficiaire non renseigné");
      await denied(() =>
        issueReceiptForEntity(otherEmployee, { entity: "expense", id: pending.id }),
      );
      await denied(() => issueReceipt(otherEmployee, employeeReceipt.snapshot.operation.id));
      await denied(() => issueReceipt(foreignAdmin, employeeReceipt.snapshot.operation.id));
    },
  );

  const salespersonExpense = await createExpense(commercial, {
    description: "Déplacement du commercial",
    amount: "20",
    cashAccountId: cash.id,
    idempotencyKey: key(),
  });
  await approveExpense(manager, { id: salespersonExpense.id });
  await payExpense(cashier, {
    id: salespersonExpense.id,
    cashAccountId: cash.id,
    method: "TRANSFER",
    idempotencyKey: key(),
  });
  await check(
    "commercial : propre dépense payée accessible, dépenses d’un autre commercial refusées",
    async () => {
      const receipt = await issueReceiptForEntity(commercial, {
        entity: "expense",
        id: salespersonExpense.id,
      });
      assert.equal(receipt.snapshot.requester?.id, commercial.id);
      assert.equal(receipt.snapshot.operation.method, "TRANSFER");
      await denied(() =>
        issueReceiptForEntity(otherCommercial, { entity: "expense", id: salespersonExpense.id }),
      );
      await denied(() => issueReceipt(otherCommercial, receipt.snapshot.operation.id));
      assert.equal(
        (
          await issueReceipt(
            { ...commercial, permissions: ["expenses.view"] },
            receipt.snapshot.operation.id,
          )
        ).id,
        receipt.id,
      );
    },
  );

  const quickExpense = await createQuickEntry(employee, {
    direction: "OUT",
    amount: "45",
    partyName: "Moussa Diallo",
    partyKind: "DRIVER",
    phone: "+221 77 000 00 00",
    description: "Règlement du transport",
    method: "TRANSFER",
    cashAccountId: cash.id,
    reference: "COURSE-18",
    idempotencyKey: key(),
  });
  assert(quickExpense.kind === "expense");
  await approveExpense(manager, { id: quickExpense.id });
  await payExpense(cashier, {
    id: quickExpense.id,
    cashAccountId: cash.id,
    method: "TRANSFER",
    idempotencyKey: key(),
  });
  const payeeReceipt = await issueReceiptForEntity(employee, {
    entity: "expense",
    id: quickExpense.id,
  });
  await check("sortie validée : bénéficiaire, téléphone, motif et référence conservés", () => {
    assert.equal(payeeReceipt.snapshot.payer.kind, "COMPANY");
    assert.equal(payeeReceipt.snapshot.payee.name, "Moussa Diallo");
    assert.equal(payeeReceipt.snapshot.payee.kind, "DRIVER");
    assert.equal(payeeReceipt.snapshot.payee.phone, "+221 77 000 00 00");
    assert.equal(payeeReceipt.snapshot.operation.description, "Règlement du transport");
    assert.equal(payeeReceipt.snapshot.operation.reference, "COURSE-18");
  });

  const reversal = await reverseTransaction(admin, {
    id: movement.id,
    reason: "Annulation de la saisie de test",
    idempotencyKey: key(),
  });
  await check(
    "annulation actualisée sur le reçu original sans altération de son instantané",
    async () => {
      const cancelled = await issueReceipt(admin, movement.id);
      assert.deepEqual(cancelled.snapshot, first.snapshot);
      assert.equal(cancelled.cancellation?.id, reversal.id);
      assert.equal(cancelled.cancellation?.number, reversal.number);
      assert.equal(
        (await issueReceiptForEntity(admin, { entity: "payment", id: payment.id })).cancellation
          ?.id,
        reversal.id,
      );
      const document = await PDFDocument.load(
        await renderReceiptPdf(cancelled.snapshot, cancelled.cancellation),
      );
      assert(document.getTitle()?.includes("ANNULÉ"));
      const inverse = await issueReceipt(admin, reversal.id);
      assert.equal(inverse.snapshot.operation.type, "REVERSAL");
      assert.equal(inverse.snapshot.reversalOf?.id, movement.id);
      assert.equal(inverse.snapshot.operation.method, null);
      assert(
        JSON.stringify(receiptDocumentBlocks(inverse.snapshot, inverse.cancellation)).includes(
          "ne prouve pas à lui seul un remboursement effectif",
        ),
      );
    },
  );

  await reverseTransaction(admin, {
    id: employeeReceipt.snapshot.operation.id,
    reason: "Correction du règlement employé",
    idempotencyKey: key(),
  });
  await payExpense(cashier, {
    id: pending.id,
    cashAccountId: cash.id,
    method: "CASH",
    idempotencyKey: key(),
  });
  await check(
    "après nouveau paiement, la fiche dépense résout le nouveau reçu et conserve l’ancien annulé",
    async () => {
      const current = await issueReceiptForEntity(employee, { entity: "expense", id: pending.id });
      assert.notEqual(current.id, employeeReceipt.id);
      assert.equal(current.snapshot.operation.method, "CASH");
      assert.equal(current.cancellation, null);
      const old = await issueReceipt(employee, employeeReceipt.snapshot.operation.id);
      assert.equal(old.snapshot.operation.method, "CARD");
      assert(old.cancellation);
    },
  );

  const noInitialReceipt = await createExpense(employee, {
    description: "Ancien paiement sans reçu émis",
    amount: "10",
    cashAccountId: cash.id,
    idempotencyKey: key(),
  });
  await approveExpense(manager, { id: noInitialReceipt.id });
  await payExpense(cashier, {
    id: noInitialReceipt.id,
    cashAccountId: cash.id,
    method: "CHECK",
    idempotencyKey: key(),
  });
  const oldMovement = await db.financialTransaction.findFirstOrThrow({
    where: { expenseId: noInitialReceipt.id, companyId: company.id, type: "EXPENSE" },
  });
  await reverseTransaction(admin, {
    id: oldMovement.id,
    reason: "Remplacement avant émission du reçu",
    idempotencyKey: key(),
  });
  await payExpense(cashier, {
    id: noInitialReceipt.id,
    cashAccountId: cash.id,
    method: "CARD",
    idempotencyKey: key(),
  });
  await check(
    "première émission tardive : ne réutilise pas le mode d’un autre règlement de la même dépense",
    async () => {
      const old = await issueReceipt(employee, oldMovement.id);
      assert.equal(old.snapshot.operation.method, null);
      assert(old.cancellation);
      assert.equal(
        (await issueReceiptForEntity(employee, { entity: "expense", id: noInitialReceipt.id }))
          .snapshot.operation.method,
        "CARD",
      );
    },
  );

  await check("échantillon PDF téléchargeable et imprimable sur une page", async () => {
    const bytes = await renderReceiptPdf(walletReceipt.snapshot);
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
    await mkdir(".local", { recursive: true });
    await writeFile(".local/quick-receipt.pdf", bytes);
  });
  await check(
    "journal et export ne réattribuent pas le mode du nouveau paiement à son prédécesseur",
    async () => {
      const params = new URLSearchParams({
        from: new Date(Date.now() - 86_400_000).toISOString(),
        to: new Date(Date.now() + 86_400_000).toISOString(),
        q: noInitialReceipt.description,
      });
      const journal = await getDaybook(admin, params);
      const old = journal.items.find((row) => row.id === oldMovement.id)!;
      const reversal = journal.items.find((row) => row.reversalOfId === oldMovement.id)!;
      const latest = journal.items.find(
        (row) => row.expenseId === noInitialReceipt.id && row.type === "EXPENSE" && !row.reversed,
      )!;
      assert.equal(old.method, null);
      assert.equal(reversal.method, null);
      assert.equal(latest.method, "CARD");
      const exported = await accountingExport(admin, params);
      assert.equal(exported.items.find((row) => row.id === oldMovement.id)!.method, null);
      assert.equal(exported.items.find((row) => row.id === latest.id)!.method, "CARD");
    },
  );
  console.log(
    `${checks} contrôles reçus réussis. Données de test conservées dans l’entreprise ${company.id} ; échantillon .local/quick-receipt.pdf.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
