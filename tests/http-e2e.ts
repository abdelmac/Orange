import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";
import { roleLabels, rolePermissions } from "../src/lib/rbac";

loadEnvConfig(process.cwd());
const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const runId = randomUUID().slice(0, 8),
  password = `Test-${randomBytes(18).toString("base64url")}!`;
const steps: string[] = [];
type Item = Record<string, unknown>;
function check(name: string) {
  steps.push(name);
  console.log(`PASS ${name}`);
}
async function call(path: string, cookie = "", method = "GET", body?: unknown) {
  const response = await fetch(`${base}/api/${path}`, {
    method,
    headers: {
      Origin: base,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data: Item;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${path}: ${response.status} réponse non JSON ${text.slice(0, 100)}`);
  }
  return { response, data };
}
async function ok(path: string, cookie = "", method = "GET", body?: unknown) {
  const result = await call(path, cookie, method, body);
  assert.ok(
    result.response.ok,
    `${method} ${path}: ${result.response.status} ${JSON.stringify(result.data)}`,
  );
  return result.data;
}
async function login(email: string, loginPassword = password) {
  const result = await call("auth/login", "", "POST", { email, password: loginPassword });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  const header = result.response.headers.get("set-cookie") ?? "";
  assert.match(header, /HttpOnly/i);
  assert.match(header, /SameSite=lax/i);
  return header.split(";")[0];
}

async function main() {
  assert.notEqual(process.env.NODE_ENV, "production", "Tests interdits en production.");
  assert.ok(
    ["localhost", "127.0.0.1", "db"].includes(new URL(process.env.DATABASE_URL!).hostname),
    "Utilisez une base locale dédiée aux tests.",
  );
  const company = await db.company.create({
    data: { name: `Validation HTTP ${runId}`, currency: "EUR" },
  });
  const roleIds: Record<string, string> = {};
  for (const [name, keys] of Object.entries(rolePermissions)) {
    const role = await db.role.create({
      data: { companyId: company.id, name, label: roleLabels[name] },
    });
    roleIds[name] = role.id;
    for (const key of keys) {
      const permission = await db.permission.upsert({
        where: { key },
        create: { key },
        update: {},
      });
      await db.rolePermission.create({
        data: { companyId: company.id, roleId: role.id, permissionId: permission.id },
      });
    }
  }
  const adminEmail = `admin-${runId}@example.test`;
  await db.user.create({
    data: {
      companyId: company.id,
      name: "Administrateur validation",
      email: adminEmail,
      passwordHash: await hashPassword(password),
      roles: { create: { roleId: roleIds.ADMIN } },
    },
  });
  const admin = await login(adminEmail);
  check("01 Administrateur connecté avec session HttpOnly");
  const users: Record<string, Item> = {};
  for (const role of ["SALESPERSON", "MANAGER", "CASHIER", "EMPLOYEE"])
    users[role] = await ok("users", admin, "POST", {
      name: `Validation ${role}`,
      email: `${role.toLowerCase()}-${runId}@example.test`,
      password,
      roleId: roleIds[role],
    });
  check("02 Commercial et collaborateurs créés par l’administrateur via API");
  const commercial = await login(String(users.SALESPERSON.email));
  const manager = await login(String(users.MANAGER.email)),
    cashier = await login(String(users.CASHIER.email)),
    employee = await login(String(users.EMPLOYEE.email));
  check("03 Commercial connecté avec ses permissions propres");
  const cash = await ok("cash-accounts", admin, "POST", {
    name: "Caisse principale",
    type: "CASH",
    currency: "EUR",
    responsibleId: users.CASHIER.id,
  });
  const client = await ok("clients", commercial, "POST", {
    name: "Dupont SARL validation",
    phone: "0612345678",
    companyId: randomUUID(),
  });
  assert.equal(client.companyId, company.id);
  assert.equal(client.salespersonId, users.SALESPERSON.id);
  check("04 Client créé et affecté au commercial côté serveur");
  const saleKey = randomUUID();
  const saleInput = {
    clientId: client.id,
    lines: [
      {
        description: "Prestation commerciale",
        quantity: "1",
        unitPrice: "10000.00",
        taxPercent: "0",
      },
    ],
    idempotencyKey: saleKey,
  };
  const sale = await ok("sales", commercial, "POST", saleInput);
  assert.equal(sale.totalMinor, "1000000");
  check("05 Vente de 10 000 € enregistrée");
  const invoice = sale.invoice as Item;
  assert.ok(invoice.id);
  assert.match(String(invoice.number), /^FAC-\d{4}-\d{6}$/);
  check("06 Facture numérotée créée atomiquement");
  assert.equal((await ok("sales", commercial, "POST", saleInput)).id, sale.id);
  const first = await ok("payments", commercial, "POST", {
    invoiceId: invoice.id,
    amount: "4000.00",
    method: "CASH",
    salespersonId: users.SALESPERSON.id,
    idempotencyKey: randomUUID(),
  });
  assert.equal(first.amountMinor, "400000");
  check("07 Encaissement commercial de 4 000 €");
  const partial = await ok(`invoices/${invoice.id}`, commercial);
  assert.equal(partial.paidMinor, "400000");
  assert.equal(partial.remainingMinor, "600000");
  assert.equal(partial.status, "PARTIALLY_PAID");
  check("08 Facture partielle : reste 6 000 €");
  const wallet = await ok(`salespeople/${users.SALESPERSON.id}`, commercial);
  assert.equal(wallet.balanceMinor, "400000");
  check("09 Portefeuille commercial : 4 000 €");
  await ok("cash/handovers", commercial, "POST", {
    cashAccountId: cash.id,
    amount: "4000.00",
    idempotencyKey: randomUUID(),
  });
  check("10 Remise commerciale de 4 000 €");
  assert.equal((await ok(`salespeople/${users.SALESPERSON.id}`, commercial)).balanceMinor, "0");
  check("11 Portefeuille commercial revenu à zéro");
  assert.equal((await ok(`cash-accounts/${cash.id}`, cashier)).balanceMinor, "400000");
  check("12 Caisse augmentée de 4 000 €");
  await ok("payments", cashier, "POST", {
    invoiceId: invoice.id,
    amount: "6000.00",
    method: "CASH",
    cashAccountId: cash.id,
    idempotencyKey: randomUUID(),
  });
  check("13 Encaissement des 6 000 € restants par le caissier");
  assert.equal((await ok(`invoices/${invoice.id}`, commercial)).status, "PAID");
  check("14 Facture entièrement payée");
  const expense = await ok("expenses", employee, "POST", {
    description: "Dépense de validation complète",
    amount: "1500.00",
    idempotencyKey: randomUUID(),
  });
  assert.equal(expense.status, "PENDING");
  assert.equal((await ok(`cash-accounts/${cash.id}`, cashier)).balanceMinor, "1000000");
  check("15 Dépense de 1 500 € soumise sans impacter la caisse");
  assert.equal(
    (await ok(`expenses/${expense.id}/approve`, manager, "POST", {})).status,
    "APPROVED",
  );
  check("16 Validation par le responsable");
  const paid = await ok(`expenses/${expense.id}/pay`, cashier, "POST", {
    cashAccountId: cash.id,
    idempotencyKey: randomUUID(),
  });
  assert.equal(paid.status, "PAID");
  check("17 Paiement de la dépense par le caissier");
  assert.equal((await ok(`cash-accounts/${cash.id}`, cashier)).balanceMinor, "850000");
  check("18 Solde exact : 8 500 €");
  const transactions = (await ok("transactions", admin)).items as Item[];
  assert.equal(transactions.length, 4);
  check("19 Quatre mouvements financiers dans le registre");
  const audit = (await ok("audit", admin)).items as Item[];
  const actorIds = new Set(audit.map((row) => row.userId));
  for (const role of ["SALESPERSON", "MANAGER", "CASHIER", "EMPLOYEE"])
    assert.ok(actorIds.has(users[role].id), `Audit de ${role} absent`);
  check("20 Audit complet avec les auteurs de chaque étape");

  const csrf = await fetch(`${base}/api/clients`, {
    method: "POST",
    headers: { Cookie: admin, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "CSRF" }),
  });
  assert.equal(csrf.status, 403);
  assert.equal((await call("users", commercial)).response.status, 403);
  assert.equal((await call("clients", employee)).response.status, 403);
  assert.equal(
    (await call(`transactions/${transactions[0].id}`, admin, "DELETE")).response.status,
    405,
  );
  const foreign = await db.company.create({ data: { name: `Isolation HTTP ${runId}` } });
  const foreignClient = await db.client.create({
    data: { companyId: foreign.id, name: "Client confidentiel" },
  });
  assert.equal((await call(`clients/${foreignClient.id}`, admin)).response.status, 404);
  const foreignSale = await call("sales", commercial, "POST", {
    ...saleInput,
    clientId: foreignClient.id,
    idempotencyKey: randomUUID(),
  });
  assert.equal(foreignSale.response.status, 404);
  const ownOther = await ok("clients", admin, "POST", { name: "Autre portefeuille" });
  assert.equal((await call(`clients/${ownOther.id}`, commercial)).response.status, 404);
  const altered = await call(`cash-accounts/${cash.id}`, admin, "PATCH", {
    balanceMinor: "9999999",
  });
  assert.equal(altered.response.status, 400);
  check(
    "Isolation entreprise, périmètres, CSRF et interdiction de modifier le solde/supprimer le registre",
  );

  const pdfResponse = await fetch(`${base}/api/invoices/${invoice.id}/pdf`, {
    headers: { Cookie: commercial },
  });
  assert.equal(pdfResponse.status, 200);
  const pdf = Buffer.from(await pdfResponse.arrayBuffer());
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const data = new FormData();
  data.set("entityType", "EXPENSE");
  data.set("entityId", String(expense.id));
  data.set("file", new Blob([pdf], { type: "application/pdf" }), "facture-justificatif.pdf");
  const uploaded = await fetch(`${base}/api/attachments`, {
    method: "POST",
    headers: { Cookie: employee, Origin: base },
    body: data,
  });
  assert.equal(uploaded.status, 200, await uploaded.clone().text());
  const attachment = await uploaded.json();
  const document = await fetch(`${base}/api/attachments/${attachment.id}`, {
    headers: { Cookie: employee },
  });
  assert.equal(document.status, 200);
  assert.deepEqual(Buffer.from(await document.arrayBuffer()), pdf);
  assert.equal((await fetch(`${base}/api/attachments/${attachment.id}`)).status, 401);
  assert.equal(
    (await fetch(`${base}/api/attachments/${attachment.id}`, { headers: { Cookie: commercial } }))
      .status,
    404,
  );
  const csv = await fetch(`${base}/api/exports?type=transactions&format=csv`, {
    headers: { Cookie: admin },
  });
  assert.equal(csv.status, 200);
  assert.match(await csv.text(), /Numéro/);
  const report = await ok("dashboard?period=month&from=&to=", admin);
  assert.equal((report.metrics as Item).availableMinor, "850000");
  const commercialDashboard = await ok("dashboard", commercial);
  assert.equal((commercialDashboard.metrics as Item).cashMinor, "0");
  check("PDF, justificatif privé, téléchargement autorisé, export et dashboard calculé");

  const rejections = await ok("expenses", employee, "POST", {
    description: "Dépense à refuser",
    amount: "100.00",
    idempotencyKey: randomUUID(),
  });
  await ok(`expenses/${rejections.id}/reject`, manager, "POST", { comment: "Hors budget" });
  assert.equal(
    (
      await call(`expenses/${rejections.id}/pay`, cashier, "POST", {
        cashAccountId: cash.id,
        idempotencyKey: randomUUID(),
      })
    ).response.status,
    409,
  );
  const bank = await ok("cash-accounts", admin, "POST", {
    name: "Banque validation",
    type: "BANK",
    currency: "EUR",
  });
  await ok("cash/transfers", admin, "POST", {
    sourceCashAccountId: cash.id,
    destinationCashAccountId: bank.id,
    amount: "1000.00",
    idempotencyKey: randomUUID(),
  });
  assert.equal((await ok(`cash-accounts/${cash.id}`, admin)).balanceMinor, "750000");
  assert.equal((await ok(`cash-accounts/${bank.id}`, admin)).balanceMinor, "100000");
  const movements = (await ok("transactions", admin)).items as Item[];
  const transfer = movements.find((item) => item.type === "TRANSFER")!;
  await ok(`transactions/${transfer.id}/reverse`, admin, "POST", {
    reason: "Annulation du transfert de validation",
    idempotencyKey: randomUUID(),
  });
  assert.equal((await ok(`cash-accounts/${cash.id}`, admin)).balanceMinor, "850000");
  check("Dépense refusée non payable, transfert et annulation restaurent les soldes exacts");
  await ok("auth/logout", commercial, "POST", {});
  assert.equal((await call("me", commercial)).response.status, 401);
  check("Déconnexion révoque la session");
  assert.equal(
    (await call(`invoices/${invoice.id}/cancel`, admin, "POST", { reason: "Facture déjà réglée" }))
      .response.status,
    409,
  );
  const cancellationSale = await ok("sales", admin, "POST", {
    clientId: client.id,
    lines: [{ description: "Facture créée par erreur", quantity: "1", unitPrice: "12.00" }],
    idempotencyKey: randomUUID(),
  });
  const cancellationInvoice = cancellationSale.invoice as Item;
  const cancelled = await ok(`invoices/${cancellationInvoice.id}/cancel`, admin, "POST", {
    reason: "Erreur de saisie constatée",
  });
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal((await ok(`sales/${cancellationSale.id}`, admin)).status, "CANCELLED");
  assert.equal(
    (
      await call("payments", admin, "POST", {
        invoiceId: cancelled.id,
        amount: "12.00",
        method: "CASH",
        cashAccountId: cash.id,
        idempotencyKey: randomUUID(),
      })
    ).response.status,
    409,
  );
  check("Annulation motivée facture/vente sans paiement, facture payée protégée");
  await mkdir(".local", { recursive: true });
  await writeFile(
    ".local/http-e2e-result.json",
    JSON.stringify(
      {
        runId,
        date: new Date().toISOString(),
        companyId: company.id,
        steps,
        scenarioFinalCashMinor: "850000",
        success: true,
      },
      null,
      2,
    ),
  );
  console.log(
    `Validation HTTP réussie : ${steps.length} contrôles, scénario complet de 20 étapes.`,
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
