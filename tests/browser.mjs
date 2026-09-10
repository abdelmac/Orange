import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomBytes, randomUUID, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
try {
  process.loadEnvFile(".env");
} catch {
  /* Environment supplied by CI. */
}
const db = new PrismaClient(),
  scrypt = promisify(scryptCallback);
const base = process.env.E2E_BASE_URL || "http://localhost:3000";
const run = randomUUID().slice(0, 8),
  password = `Browser-${randomBytes(16).toString("base64url")}!`;
const steps = [],
  errors = [];
let browser;
function pass(message) {
  steps.push(message);
  console.log(`PASS ${message}`);
}
async function fixture() {
  assert.notEqual(process.env.NODE_ENV, "production");
  assert.ok(["localhost", "127.0.0.1", "db"].includes(new URL(process.env.DATABASE_URL).hostname));
  const template = await db.user.findUniqueOrThrow({ where: { email: "admin@demo.local" } });
  const roles = await db.role.findMany({
    where: { companyId: template.companyId },
    include: { permissions: true },
  });
  const company = await db.company.create({ data: { name: `Entreprise navigateur ${run}` } });
  const salt = randomBytes(16).toString("hex"),
    hash = await scrypt(password, Buffer.from(salt, "hex"), 64, {
      N: 32768,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
  const passwordHash = `scrypt$32768$8$1$${salt}$${hash.toString("hex")}`,
    users = {};
  for (const source of roles) {
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
    if (["ADMIN", "MANAGER", "CASHIER", "EMPLOYEE"].includes(role.name))
      users[role.name] = await db.user.create({
        data: {
          companyId: company.id,
          name: `UI ${source.label}`,
          email: `${source.name.toLowerCase()}-${run}@browser.test`,
          passwordHash,
          roles: { create: { roleId: role.id } },
        },
      });
  }
  const cash = await db.cashAccount.create({
    data: { companyId: company.id, name: "Caisse principale", responsibleId: users.CASHIER.id },
  });
  return { company, users, cash };
}
async function pageFor(email, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/login`);
  await page.getByLabel("Adresse email", { exact: true }).fill(email);
  await page.locator('input[name="password"]').fill(password);
  assert.equal(await page.locator("form").getAttribute("method"), "post");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(`${base}/`);
  await page.getByRole("heading", { name: /Bonjour/ }).waitFor();
  return page;
}
async function go(page, path) {
  await page.goto(`${base}/${path}`);
  await page.locator(".page-heading h1").waitFor();
}
async function submit(page, label = "Enregistrer") {
  await page.locator("dialog[open]").getByRole("button", { name: label, exact: true }).click();
  await page.locator("dialog[open]").waitFor({ state: "hidden", timeout: 20000 });
}
async function screenshot(page, name) {
  await page.locator(".loading-area").waitFor({ state: "hidden", timeout: 30000 });
  await page.screenshot({ path: `.local/${name}.png`, fullPage: true });
}

async function main() {
  await mkdir(".local", { recursive: true });
  const { company, users, cash } = await fixture();
  const chromePath =
    process.env.BROWSER_EXECUTABLE ||
    (process.platform === "win32" &&
    existsSync("C:/Program Files/Google/Chrome/Application/chrome.exe")
      ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
      : undefined);
  browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const admin = await pageFor(users.ADMIN.email);
  await go(admin, "utilisateurs");
  await admin.getByRole("button", { name: "Nouvel utilisateur", exact: true }).click();
  const commercialEmail = `commercial-${run}@browser.test`;
  await admin.getByLabel(/Nom complet/).fill("Jean Validation");
  await admin.getByLabel(/Email professionnel/).fill(commercialEmail);
  await admin.getByLabel(/Mot de passe initial/).fill(password);
  await admin.getByLabel(/Rôle et permissions/).selectOption({ label: "Commercial" });
  await submit(admin);
  pass("Administrateur crée un commercial depuis le formulaire");
  const commercial = await pageFor(commercialEmail);
  assert.equal(
    await commercial.getByRole("link", { name: "Utilisateurs", exact: true }).count(),
    0,
  );
  await go(commercial, "clients");
  await commercial.getByRole("button", { name: "Nouveau client", exact: true }).click();
  await commercial.getByLabel(/Nom du client/).fill(`Client navigateur ${run}`);
  await submit(commercial);
  pass("Commercial connecté crée son client");
  const client = await db.client.findFirstOrThrow({
    where: { companyId: company.id, name: `Client navigateur ${run}` },
  });
  await go(commercial, "ventes");
  await commercial.getByRole("button", { name: "Nouvelle vente", exact: true }).click();
  await commercial.getByLabel("Client", { exact: false }).selectOption(String(client.id));
  await commercial.getByLabel(/Désignation/).fill("Prestation de validation navigateur");
  await commercial.getByLabel("Prix HT", { exact: true }).fill("10000");
  await submit(commercial);
  const invoice = await db.invoice.findFirstOrThrow({
    where: { companyId: company.id, clientId: client.id },
  });
  assert.equal(invoice.totalMinor, 1000000n);
  pass("Vente de 10 000 € et facture créées par le formulaire");
  await go(commercial, "encaissements");
  await commercial.getByRole("button", { name: "Nouvel encaissement", exact: true }).click();
  await commercial.getByLabel(/Facture à régler/).selectOption(invoice.id);
  await commercial.getByLabel(/Montant encaissé/).fill("4000,00");
  await submit(commercial);
  assert.equal(
    (await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).paidMinor,
    400000n,
  );
  pass("Paiement partiel avec virgule française : reste 6 000 €");
  await go(commercial, "caisse");
  await commercial
    .getByRole("button", { name: /Remise commercial/ })
    .first()
    .click();
  await commercial.getByLabel(/Caisse destinataire/).selectOption(cash.id);
  await commercial.getByLabel(/Montant remis/).fill("4000");
  await submit(commercial);
  pass("Remise de 4 000 € depuis le portefeuille commercial");
  const cashier = await pageFor(users.CASHIER.email);
  await go(cashier, "encaissements");
  await cashier.getByRole("button", { name: "Nouvel encaissement", exact: true }).click();
  await cashier.getByLabel(/Facture à régler/).selectOption(invoice.id);
  await cashier.getByLabel(/Montant encaissé/).fill("6000");
  await cashier.getByLabel(/Caisse destinataire/).selectOption(cash.id);
  await submit(cashier);
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status, "PAID");
  pass("Paiement final par le caissier : facture payée");
  const employee = await pageFor(users.EMPLOYEE.email);
  await go(employee, "depenses");
  await employee.getByRole("button", { name: "Nouvelle dépense", exact: true }).click();
  await employee.getByLabel(/Description de la dépense/).fill(`Dépense navigateur ${run}`);
  await employee.getByLabel(/Montant TTC/).fill("1500");
  await submit(employee, "Soumettre la demande");
  pass("Employé soumet une dépense de 1 500 €");
  const manager = await pageFor(users.MANAGER.email);
  await go(manager, "depenses");
  await manager.getByRole("button", { name: "Valider", exact: true }).first().click();
  await submit(manager, "Confirmer la validation");
  pass("Responsable valide la demande depuis la liste");
  await go(cashier, "depenses");
  await cashier.getByRole("button", { name: "Payer", exact: true }).first().click();
  await cashier.getByLabel(/Caisse à débiter/).selectOption(cash.id);
  await submit(cashier, "Confirmer le paiement");
  const transactions = await db.financialTransaction.findMany({ where: { companyId: company.id } });
  const balance = transactions.reduce(
    (total, transaction) =>
      total +
      (transaction.destinationCashAccountId === cash.id ? transaction.amountMinor : 0n) -
      (transaction.sourceCashAccountId === cash.id ? transaction.amountMinor : 0n),
    0n,
  );
  assert.equal(balance, 850000n);
  pass("Caissier paie : solde final PostgreSQL exact de 8 500 €");
  await go(admin, "");
  await screenshot(admin, "dashboard-desktop");
  for (const section of [
    "caisse",
    "transactions",
    "ventes",
    "factures",
    "encaissements",
    "depenses",
    "clients",
    "commerciaux",
    "fournisseurs",
    "rapports",
    "utilisateurs",
    "audit",
    "parametres",
  ]) {
    await go(admin, section);
    await admin.locator(".loading-area").waitFor({ state: "hidden" });
    assert.equal(
      await admin.locator('.alert.error[role="alert"]').count(),
      0,
      `Erreur module ${section}`,
    );
  }
  pass("Les 14 modules s’ouvrent sans erreur");
  await admin.setViewportSize({ width: 390, height: 844 });
  await go(admin, "");
  await screenshot(admin, "dashboard-mobile");
  assert.ok(
    await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    "Débordement horizontal mobile",
  );
  await go(admin, "clients");
  await admin.getByRole("button", { name: "Nouveau client", exact: true }).click();
  await screenshot(admin, "form-mobile");
  assert.ok(
    await admin
      .locator("dialog[open]")
      .evaluate((dialog) => dialog.getBoundingClientRect().right <= innerWidth),
    "Formulaire hors écran",
  );
  await admin.getByRole("button", { name: "Fermer la fenêtre" }).click();
  await admin.setViewportSize({ width: 768, height: 1024 });
  await go(admin, "");
  await screenshot(admin, "dashboard-tablet");
  assert.ok(
    await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    "Débordement tablette",
  );
  pass("Vues téléphone 390px et tablette 768px, formulaires utilisables sans débordement");
  const pwa = await admin.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const manifest = await fetch("/manifest.webmanifest").then((response) => response.json());
    const cached = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      cached.push(...(await cache.keys()).map((request) => new URL(request.url).pathname));
    }
    return { display: manifest.display, icons: manifest.icons, cached };
  });
  assert.equal(pwa.display, "standalone");
  assert.ok(pwa.icons.some((icon) => icon.sizes === "512x512"));
  assert.deepEqual(pwa.cached.sort(), ["/icon.svg", "/offline.html"]);
  await admin.context().setOffline(true);
  await admin.goto(`${base}/clients`);
  await admin.getByRole("heading", { name: "Retrouvons la connexion." }).waitFor();
  await admin.context().setOffline(false);
  pass("PWA : manifeste, service worker et écran hors connexion, aucune donnée privée en cache");
  assert.deepEqual(errors, [], "Erreurs JavaScript navigateur");
  await writeFile(
    ".local/browser-result.json",
    JSON.stringify(
      { date: new Date().toISOString(), companyId: company.id, steps, errors, success: true },
      null,
      2,
    ),
  );
  console.log(`Validation navigateur réussie : ${steps.length} contrôles.`);
}
main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
    if (browser) {
      const pages = browser.contexts().flatMap((context) => context.pages());
      for (const [index, page] of pages.entries())
        await screenshot(page, `browser-failure-${index}`).catch(() => {});
    }
  })
  .finally(async () => {
    await browser?.close();
    await db.$disconnect();
  });
