import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { db } from "../src/lib/db";
import { createSession, getActor, SESSION_COOKIE } from "../src/lib/auth";
import { registerAccount } from "../src/services/account.service";
import { createDirectoryItem } from "../src/services/directory.service";
import { createSale } from "../src/services/invoice.service";
import { createPayment } from "../src/services/payment.service";
import { createExpense, approveExpense, payExpense } from "../src/services/expense.service";
import { getCashBalance } from "../src/services/cash.service";
import { getEntitlements } from "../src/services/entitlement.service";
import { inviteMember } from "../src/services/team.service";
import { updateInvoiceCustomization } from "../src/services/invoice-customization.service";
import { defaultInvoiceSettings, invoicePresentationInput } from "../src/lib/invoice-customization";
import { invoicePdf } from "../src/services/pdf.service";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !/^plans_qa_[a-zA-Z0-9_]+$/.test(url.searchParams.get("schema") ?? "")
  )
    throw new Error("Schéma de tests local isolé obligatoire.");
  // This scenario must never send invitations; FREE is rejected before email dispatch.
  const run = randomUUID();
  const registered = await registerAccount({
    name: "Propriétaire individuel FREE",
    email: `owner-free-${run}@example.test`,
    password: `Test-only-${run}`,
    usageType: "BUSINESS",
    companyName: `Entreprise FREE ${run}`,
    currency: "EUR",
  });
  assert(registered.companyId);
  const session = await createSession(registered.id, registered.companyId);
  const actor = await getActor(
    new Request("http://localhost:3107/api/me", {
      headers: { cookie: `${SESSION_COOKIE}=${session.token}` },
    }),
  );
  assert.equal(actor.role, "OWNER");
  const entitlement = await getEntitlements(actor.companyId);
  assert.equal(entitlement.plan.code, "FREE");
  assert.equal(entitlement.limits.maxTeamMembers, 1);
  const client = await createDirectoryItem(actor, "clients", { name: "Client FREE" });
  const sale = await createSale(actor, {
    clientId: client.id,
    lines: [{ description: "Prestation", quantity: "1", unitPrice: "100" }],
    idempotencyKey: randomUUID(),
  });
  assert(sale.invoice);
  assert.equal(sale.invoice.totalMinor, 10000n);
  const invoiceId = sale.invoice.id;
  const invoice = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const presentation = invoicePresentationInput.parse(invoice.customizationSnapshot);
  assert.equal(presentation.settings.removeBranding, false);
  const pdf = await invoicePdf(actor, invoiceId);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert((await PDFDocument.load(await pdf.arrayBuffer())).getPageCount() >= 1);
  const cash = await db.cashAccount.findFirstOrThrow({ where: { companyId: actor.companyId } });
  await createPayment(actor, {
    invoiceId,
    cashAccountId: cash.id,
    method: "CASH",
    amount: "40",
    idempotencyKey: randomUUID(),
  });
  const partial = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  assert.equal(partial.paidMinor, 4000n);
  assert.equal(partial.totalMinor - partial.paidMinor, 6000n);
  assert.equal(partial.status, "PARTIALLY_PAID");
  await createPayment(actor, {
    invoiceId,
    cashAccountId: cash.id,
    method: "CASH",
    amount: "60",
    idempotencyKey: randomUUID(),
  });
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).status, "PAID");
  assert.equal(await getCashBalance(actor, cash.id), 10000n);
  const expense = await createExpense(actor, {
    description: "Fournitures propriétaire FREE",
    amount: "15",
    cashAccountId: cash.id,
    idempotencyKey: randomUUID(),
  });
  assert.equal(await getCashBalance(actor, cash.id), 10000n);
  await approveExpense(actor, { id: expense.id });
  assert.equal(await getCashBalance(actor, cash.id), 10000n);
  await payExpense(actor, {
    id: expense.id,
    cashAccountId: cash.id,
    method: "CASH",
    idempotencyKey: randomUUID(),
  });
  assert.equal(await getCashBalance(actor, cash.id), 8500n);
  assert.equal((await db.expense.findUniqueOrThrow({ where: { id: expense.id } })).status, "PAID");
  await assert.rejects(
    () => inviteMember(actor, { email: `not-sent-${run}@example.test`, role: "ACCOUNTANT" }),
    /PRO/,
  );
  assert.equal(await db.teamInvitation.count({ where: { companyId: actor.companyId } }), 0);
  await assert.rejects(
    () =>
      updateInvoiceCustomization(actor, { ...defaultInvoiceSettings("EUR"), removeBranding: true }),
    /PRO/,
  );
  assert.equal(
    await db.financialTransaction.count({
      where: { companyId: actor.companyId, status: "VALIDATED" },
    }),
    3,
  );
  const audit = await db.auditLog.findMany({
    where: { companyId: actor.companyId },
    select: { userId: true, action: true },
  });
  assert(audit.length >= 7);
  assert(audit.every((entry) => entry.userId === actor.id));
  assert(audit.some((entry) => entry.action === "APPROVE"));
  console.log(
    "PASS FREE OWNER: actual registration/session OWNER, client, invoice 100 with branding/PDF, payments 40+60, expense 15 self-approved/paid, cash 85, immutable ledger and audit; team/branding PRO still denied.",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
