import { chromium, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomBytes, randomUUID, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

try {
  process.loadEnvFile(".env");
} catch {
  /* Environment can be supplied by CI. */
}
const base = process.env.E2E_BASE_URL || "http://localhost:3100";
const db = new PrismaClient();
const run = randomUUID().slice(0, 8);
const password = `Quick-${randomBytes(18).toString("base64url")}!`;
const steps = [],
  errors = [];
let browser;
const pass = (message) => {
  steps.push(message);
  console.log(`PASS ${message}`);
};

async function fixture() {
  assert.notEqual(process.env.NODE_ENV, "production");
  assert.ok(
    ["localhost", "127.0.0.1", "db"].includes(new URL(process.env.DATABASE_URL).hostname),
    "Local test database required",
  );
  const template = await db.user.findUniqueOrThrow({ where: { email: "admin@demo.local" } });
  const sources = await db.role.findMany({
    where: { companyId: template.companyId },
    include: { permissions: true },
  });
  const company = await db.company.create({ data: { name: `Entreprise saisie ${run}` } });
  const salt = randomBytes(16).toString("hex");
  const derived = await promisify(scryptCallback)(password, Buffer.from(salt, "hex"), 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  const passwordHash = `scrypt$32768$8$1$${salt}$${derived.toString("hex")}`;
  const users = {};
  for (const source of sources) {
    const role = await db.role.create({
      data: { companyId: company.id, name: source.name, label: source.label },
    });
    await db.rolePermission.createMany({
      data: source.permissions.map((permission) => ({
        companyId: company.id,
        roleId: role.id,
        permissionId: permission.permissionId,
      })),
    });
    if (["ADMIN", "EMPLOYEE", "MANAGER", "CASHIER", "SALESPERSON"].includes(role.name)) {
      users[role.name] = await db.user.create({
        data: {
          companyId: company.id,
          name: `Rapide ${source.label}`,
          email: `quick-${role.name.toLowerCase()}-${run}@browser.test`,
          passwordHash,
          roles: { create: { roleId: role.id } },
          ...(role.name === "SALESPERSON" ? { salesperson: { create: {} } } : {}),
        },
      });
    }
  }
  const cash = await db.cashAccount.create({
    data: {
      companyId: company.id,
      name: "Caisse rapide principale",
      responsibleId: users.CASHIER.id,
    },
  });
  await db.cashAccount.create({
    data: {
      companyId: company.id,
      name: "Caisse rapide secondaire",
      responsibleId: users.CASHIER.id,
    },
  });
  return { company, users, cash };
}

async function pageFor(email) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: "Europe/Paris",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/login`);
  await page.getByLabel("Adresse email", { exact: true }).fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(`${base}/`);
  await page.getByRole("heading", { name: /Bonjour/ }).waitFor();
  return page;
}

async function loginApi(email) {
  const context = await browser.newContext();
  const response = await context.request.post(`${base}/api/auth/login`, {
    headers: { Origin: base },
    data: { email, password },
  });
  assert.ok(response.ok(), `API authentication failed: ${response.status()}`);
  return context;
}

async function createQuick(page, buttonName) {
  const received = page.waitForResponse(
    (response) =>
      response.url() === `${base}/api/quick-entries` && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  const response = await received;
  assert.ok(response.ok(), `Quick entry failed: ${response.status()}`);
  const result = await response.json();
  await page.locator(".quick-success").waitFor();
  return result;
}

async function receiptDownload(page, scope) {
  const received = page.waitForEvent("download");
  await scope.getByRole("link", { name: "Télécharger le reçu", exact: true }).click();
  const download = await received;
  const stream = await download.createReadStream();
  assert.ok(stream, "The receipt download must contain a readable body");
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).subarray(0, 4).toString(), "%PDF");
  assert.match(download.suggestedFilename(), /^REC-/);
}

async function cashBalance(page, id) {
  const response = await page.context().request.get(`${base}/api/cash-accounts`);
  assert.ok(response.ok());
  return (await response.json()).items.find((account) => account.id === id).balanceMinor;
}

async function journalData(page) {
  const day = await page.locator('.daybook-date input[type="date"]').inputValue();
  const bounds = await page.evaluate((selected) => {
    const [year, month, date] = selected.split("-").map(Number);
    return {
      from: new Date(year, month - 1, date).toISOString(),
      to: new Date(year, month - 1, date + 1).toISOString(),
    };
  }, day);
  const response = await page
    .context()
    .request.get(`${base}/api/daybook?${new URLSearchParams({ ...bounds, pageSize: "25" })}`);
  assert.ok(response.ok());
  return response.json();
}

async function checkWidths(page, name) {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    const dimensions = await page.evaluate(() => ({
      width: innerWidth,
      content: document.documentElement.scrollWidth,
    }));
    assert.ok(
      dimensions.content <= dimensions.width,
      `${name}: horizontal overflow at ${width}: ${dimensions.content}`,
    );
    await page.screenshot({ path: `.local/${name}-${width}.png`, fullPage: true });
  }
  pass(`${name}: aucun débordement à 390, 768 et 1440 px`);
  await page.setViewportSize({ width: 390, height: 844 });
}

async function main() {
  await mkdir(".local", { recursive: true });
  const { users, cash } = await fixture();
  const executablePath =
    process.env.BROWSER_EXECUTABLE ||
    (process.platform === "win32" &&
    existsSync("C:/Program Files/Google/Chrome/Application/chrome.exe")
      ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
      : undefined);
  browser = await chromium.launch({ headless: true, executablePath });
  const admin = await pageFor(users.ADMIN.email);
  await admin.goto(`${base}/saisie?direction=IN`);
  await admin.getByRole("heading", { name: "Encaisser", exact: true }).waitFor();
  await expect(admin.locator('select[name="cashAccountId"]')).toBeVisible();
  await checkWidths(admin, "quick-entry");
  await admin.getByLabel("Montant", { exact: true }).fill("1 000,25");
  await admin.locator('input[name="partyName"]').fill(`Client rapide ${run}`);
  await admin.locator('input[name="description"]').fill("Encaissement sans facture ni téléphone");
  await admin.locator('select[name="cashAccountId"]').selectOption(cash.id);
  const receipt = await createQuick(admin, "Enregistrer l’encaissement");
  assert.equal(receipt.kind, "receipt");
  assert.ok(receipt.transactionId);
  assert.equal(await cashBalance(admin, cash.id), "100025");
  await receiptDownload(admin, admin.locator(".quick-success"), "quick-receipt-first");
  pass("Encaissement mobile 1 000,25 sans facture ni téléphone, solde exact et reçu PDF");

  await admin.getByRole("button", { name: "Nouvel encaissement", exact: true }).click();
  await expect(admin.getByLabel("Montant", { exact: true })).toBeFocused();
  await expect(admin.locator('select[name="cashAccountId"]')).toHaveValue(cash.id);
  await expect(admin.locator('select[name="method"]')).toHaveValue("CASH");
  await admin.getByLabel("Montant", { exact: true }).fill("150,50");
  await admin.locator('select[name="partyKind"]').selectOption("DRIVER");
  await admin.locator('input[name="partyName"]').fill(`Chauffeur rapide ${run}`);
  await admin.locator('input[name="description"]').fill("Recette de transport du matin");
  await admin.locator(".quick-extra summary").click();
  await admin.locator('input[name="phone"]').fill("0612345678");
  const today = await admin.evaluate(() =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  );
  await admin.locator('input[name="date"]').fill(`${today}T00:15`);
  await createQuick(admin, "Enregistrer l’encaissement");
  assert.equal(await cashBalance(admin, cash.id), "115075");
  pass("Nouvelle saisie garde la caisse et le mode, chauffeur avec téléphone et date locale");

  await admin.goto(`${base}/journal`);
  await admin.locator(".daybook-list").waitFor();
  await expect(admin.locator('.daybook-date input[type="date"]')).toHaveValue(today);
  let journal = await journalData(admin);
  assert.equal(journal.total, 2);
  assert.equal(journal.totals.inMinor, "115075");
  assert.equal(journal.totals.outMinor, "0");
  assert.equal(journal.totals.netMinor, "115075");
  const search = admin.getByRole("textbox", { name: "Rechercher dans le journal", exact: true });
  await search.pressSequentially("0612345678", { delay: 230 });
  await expect(search).toBeFocused();
  await expect(admin.locator(".daybook-count")).toHaveText("1 opération");
  await expect(admin.locator(".daybook-operation")).toHaveCount(1);
  await search.fill("");
  await expect(admin.locator(".daybook-count")).toHaveText("2 opérations");
  await admin.getByRole("button", { name: "Jour suivant", exact: true }).click();
  await admin.getByRole("heading", { name: "Aucun mouvement pour cette journée" }).waitFor();
  await admin.getByRole("button", { name: "Aujourd’hui", exact: true }).click();
  await expect(admin.locator(".daybook-count")).toHaveText("2 opérations");
  await checkWidths(admin, "quick-journal");
  pass(
    "Journal: date locale, bornes minuit, recherche téléphone sans perte de focus et totaux exacts",
  );

  const employee = await pageFor(users.EMPLOYEE.email);
  await employee.goto(`${base}/saisie?direction=OUT`);
  await employee.getByLabel("Montant", { exact: true }).fill("75,25");
  await employee.locator('select[name="partyKind"]').selectOption("DRIVER");
  await employee.locator('input[name="partyName"]').fill(`Chauffeur dépense ${run}`);
  await employee.locator('input[name="description"]').fill("Carburant demandé pour la tournée");
  const expense = await createQuick(employee, "Envoyer pour validation");
  assert.equal(expense.kind, "expense");
  assert.equal(expense.status, "PENDING");
  assert.equal(
    await employee.getByRole("link", { name: "Télécharger le reçu", exact: true }).count(),
    0,
  );
  assert.equal(await cashBalance(admin, cash.id), "115075");
  const unavailable = await employee
    .context()
    .request.get(`${base}/api/receipts?entity=expense&id=${expense.id}`);
  assert.ok(
    [404, 409].includes(unavailable.status()),
    "An unpaid expense must not expose a receipt",
  );
  pass("Dépense rapide en attente: aucun débit et aucun reçu avant paiement");

  const manager = await loginApi(users.MANAGER.email);
  const approval = await manager.request.post(`${base}/api/expenses/${expense.id}/approve`, {
    headers: { Origin: base },
    data: { comment: "Validation du parcours rapide" },
  });
  assert.ok(approval.ok(), `Approval status ${approval.status()}`);
  const cashier = await loginApi(users.CASHIER.email);
  const payment = await cashier.request.post(`${base}/api/expenses/${expense.id}/pay`, {
    headers: { Origin: base },
    data: { cashAccountId: cash.id, method: "CASH", idempotencyKey: randomUUID() },
  });
  assert.ok(payment.ok(), `Expense payment status ${payment.status()}`);
  assert.equal(await cashBalance(admin, cash.id), "107550");
  await employee.goto(`${base}/depenses?detail=${expense.id}`);
  await employee.locator("dialog[open]").waitFor();
  await receiptDownload(employee, employee.locator("dialog[open]"), "quick-expense-paid-receipt");
  await admin.goto(`${base}/journal`);
  await admin.locator(".daybook-list").waitFor();
  journal = await journalData(admin);
  assert.equal(journal.total, 3);
  assert.equal(journal.totals.outMinor, "7525");
  assert.equal(journal.totals.netMinor, "107550");
  pass("Responsable valide, caissier paie, employé télécharge son reçu; journal net 1 075,50");

  const commercial = await pageFor(users.SALESPERSON.email);
  await commercial.goto(`${base}/saisie?direction=IN`);
  await commercial.getByLabel("Montant", { exact: true }).fill("90,00");
  await commercial.locator('input[name="partyName"]').fill(`Client commercial ${run}`);
  await commercial.locator('input[name="description"]').fill("Paiement reçu dans le portefeuille");
  assert.equal(await commercial.locator('select[name="cashAccountId"]').count(), 0);
  await createQuick(commercial, "Enregistrer l’encaissement");
  await commercial.goto(`${base}/journal`);
  await commercial.locator(".daybook-list").waitFor();
  const ownJournal = await journalData(commercial);
  assert.equal(ownJournal.total, 1);
  assert.equal(ownJournal.totals.netMinor, "9000");
  assert.equal(await cashBalance(admin, cash.id), "107550");
  pass("Commercial: saisie directe dans son portefeuille, journal personnel et caisses inchangées");
  assert.deepEqual(errors, []);
  pass("Aucune erreur JavaScript dans les parcours rapides");
}

try {
  await main();
  await writeFile(
    ".local/quick-browser-verification.json",
    JSON.stringify({ status: "passed", steps, errors }, null, 2),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  await writeFile(
    ".local/quick-browser-verification.json",
    JSON.stringify(
      {
        status: "failed",
        steps,
        errors,
        failure: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  await db.$disconnect();
}
