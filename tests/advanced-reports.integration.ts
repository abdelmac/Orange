import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { rolePermissions } from "../src/lib/rbac";
import { getAdvancedReport } from "../src/services/advanced-report.service";
import { ensurePlan } from "../src/services/entitlement.service";
import { createPayment } from "../src/services/payment.service";
import { adjustCash } from "../src/services/cash.service";
import { createExpense, approveExpense, payExpense } from "../src/services/expense.service";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !/^plans_qa_[a-zA-Z0-9_]+$/.test(url.searchParams.get("schema") ?? "")
  )
    throw new Error("Schéma de tests local isolé obligatoire.");
  const run = randomUUID();
  const company = await db.company.create({ data: { name: `Advanced ${run}` } });
  const other = await db.company.create({ data: { name: `Other advanced ${run}` } });
  const user = await db.user.create({
    data: {
      name: "Rapport QA",
      email: `advanced-${run}@example.test`,
      companyId: company.id,
      passwordHash: "not-a-login-hash",
    },
  });
  const actor = {
    id: user.id,
    name: user.name,
    companyId: company.id,
    role: "ADMIN",
    permissions: rolePermissions.ADMIN,
  };
  const now = new Date("2026-09-27T12:00:00Z");
  await assert.rejects(() => getAdvancedReport(actor, now), /PRO/);
  const pro = await ensurePlan("PRO");
  await db.subscription.create({
    data: {
      companyId: company.id,
      planId: pro.id,
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 86400000),
    },
  });
  const client = await db.client.create({
    data: { companyId: company.id, name: "Client rapport" },
  });
  const dates = ["2026-09-28", "2026-09-26", "2026-08-27", "2026-07-28", "2026-06-28"];
  const cash = await db.cashAccount.create({ data: { companyId: company.id, name: "Test" } });
  for (const [index, dueDate] of dates.entries()) {
    const sale = await db.sale.create({
      data: {
        companyId: company.id,
        clientId: client.id,
        number: `V-${index}`,
        createdById: user.id,
        idempotencyKey: randomUUID(),
        subtotalMinor: 10000n,
        totalMinor: 10000n,
        date: new Date("2026-05-01"),
        status: "INVOICED",
      },
    });
    const invoice = await db.invoice.create({
      data: {
        companyId: company.id,
        saleId: sale.id,
        clientId: client.id,
        number: `F-${index}`,
        createdById: user.id,
        subtotalMinor: 10000n,
        totalMinor: 10000n,
        paidMinor: 0n,
        status: "ISSUED",
        date: new Date("2026-05-01"),
        dueDate: new Date(dueDate),
      },
    });
    if (index === 1)
      await createPayment(actor, {
        invoiceId: invoice.id,
        cashAccountId: cash.id,
        amount: "40",
        method: "CASH",
        idempotencyKey: randomUUID(),
      });
  }
  await adjustCash(actor, {
    cashAccountId: cash.id,
    amount: "1000",
    direction: "IN",
    reason: "Solde initial de test",
    idempotencyKey: randomUUID(),
  });
  const expense = await createExpense(actor, {
    description: "Payée en septembre",
    amount: "125.50",
    date: "2026-05-01T00:00:00.000Z",
    idempotencyKey: randomUUID(),
  });
  await approveExpense(actor, { id: expense.id });
  await payExpense(actor, {
    id: expense.id,
    cashAccountId: cash.id,
    date: "2026-09-01T00:00:00.000Z",
    idempotencyKey: randomUUID(),
  });
  await db.expense.create({
    data: {
      companyId: company.id,
      number: "D-ATTENTE",
      requesterId: user.id,
      description: "Non payée",
      amountMinor: 999999n,
      date: new Date("2026-09-01"),
      status: "PENDING",
      idempotencyKey: randomUUID(),
    },
  });
  const foreignClient = await db.client.create({
    data: { companyId: other.id, name: "Autre client" },
  });
  await db.companyMembership.create({ data: { companyId: other.id, userId: user.id } });
  await db.sale.create({
    data: {
      companyId: other.id,
      clientId: foreignClient.id,
      number: "FOREIGN",
      createdById: user.id,
      idempotencyKey: randomUUID(),
      subtotalMinor: 99999999n,
      totalMinor: 99999999n,
      date: new Date("2026-09-01"),
    },
  });
  const report = await getAdvancedReport(actor, now);
  assert.equal(report.monthly.length, 12);
  assert.equal(report.monthly[0].month, "2025-10");
  assert.equal(report.totals.salesMinor, 50000n);
  assert.equal(report.monthly.find((item) => item.month === "2026-09")?.expensesMinor, 12550n);
  assert.equal(report.monthly.find((item) => item.month === "2026-05")?.expensesMinor, 0n);
  assert.equal(report.totals.receivablesMinor, 46000n);
  assert.deepEqual(
    report.receivables.map((item) => item.amountMinor),
    [10000n, 6000n, 10000n, 10000n, 10000n],
  );
  await assert.rejects(
    () => getAdvancedReport({ ...actor, permissions: ["reports.view"] }),
    /autorisation/,
  );
  await assert.rejects(() => getAdvancedReport({ ...actor, role: "SALESPERSON" }), /direction/);
  await db.subscription.update({ where: { companyId: company.id }, data: { status: "PAST_DUE" } });
  await assert.rejects(() => getAdvancedReport(actor), /PRO/);
  console.log(
    "PASS advanced reports: FREE gate; active PRO; exact 12-month totals; paid expenses by paymentdate; pending excluded; 5 aging buckets and partialpayment; tenant isolation; permission/role restrictions; overdue subscription denied.",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
