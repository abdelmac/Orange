import { chromium, expect as playwrightExpect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const expect = playwrightExpect.configure({ timeout: 30000 });
const base = process.env.PERSONAL_TEST_URL || "http://localhost:3107";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Le test de finances personnelles exige un serveur local de test.");
const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_EXECUTABLE ||
    (process.platform === "win32"
      ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
      : undefined),
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const run = randomUUID();
let checks = 0;
const checked = (label) => {
  console.log(`PASS ${++checks}: ${label}`);
};
const overview = async () => {
  const response = await context.request.get(`${base}/api/personal/overview`);
  assert.equal(response.status(), 200);
  return response.json();
};
async function saveDialog() {
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}
async function transaction(type, amount, description, withFile = false) {
  await page
    .locator(".personal-quick-actions")
    .getByRole("button", { name: type, exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input[name=amount]").fill(amount);
  await dialog.locator("input[name=description]").fill(description);
  if (type === "Dépense")
    await dialog.locator("select[name=categoryId]").selectOption({ label: "Alimentation" });
  if (withFile) {
    await dialog.locator("summary").click();
    await dialog.locator("input[type=file]").setInputFiles({
      name: "receipt.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nQA receipt"),
    });
  }
  await saveDialog();
}
try {
  await page.goto(`${base}/inscription`);
  await page.getByLabel("Votre nom").fill("QA personnel mobile");
  await page.getByLabel("Adresse email").fill(`mobile-personal-${run}@example.test`);
  await page.getByLabel("Mot de passe · 12 caractères minimum").fill(`Browser-${run}`);
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await page.locator("input[value=PERSONAL]").check();
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await expect(page.getByText("FREE sélectionné")).toBeVisible();
  await page.getByRole("button", { name: "Commencer gratuitement" }).click();
  await page.waitForURL("**/onboarding");
  await page.getByRole("link", { name: "Ouvrir mon tableau de bord" }).click();
  await page.waitForURL("**/personal");
  await expect(page.getByRole("button", { name: "Créer un compte", exact: true })).toBeVisible();
  assert.equal((await context.request.get(`${base}/api/me`).then((r) => r.json())).company, null);
  checked("inscription mobile PERSONAL/FREE sans entreprise ni carte");
  await page.getByRole("button", { name: "Créer un compte", exact: true }).click();
  await page.getByRole("dialog").locator("input[name=name]").fill("Compte courant QA");
  await saveDialog();
  await transaction("Revenu", "2000", "Salaire QA");
  await transaction("Dépense", "100", "Courses QA", true);
  let data = await overview();
  assert.equal(data.summary.balanceMinor, "190000");
  assert.equal(data.summary.incomeMinor, "200000");
  assert.equal(data.summary.expenseMinor, "10000");
  assert.equal(data.categories.length, 21);
  const originalAccount = data.accounts[0].id;
  const expense = data.transactions.items.find((item) => item.description === "Courses QA");
  assert(expense.attachmentId);
  assert.equal(
    (
      await context.request.get(`${base}/api/personal/attachments/${expense.attachmentId}`)
    ).status(),
    200,
  );
  checked("revenu2000 dépense100 solde1900 + justificatifprivé");
  await page.getByRole("button", { name: "Budget", exact: true }).click();
  await page
    .getByRole("dialog")
    .locator("select[name=categoryId]")
    .selectOption({ label: "Alimentation" });
  await page.getByRole("dialog").locator("input[name=limit]").fill("500");
  await saveDialog();
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "20");
  await transaction("Dépense", "300", "Courses semaine QA");
  await expect(page.getByText("Attention : au moins 80 % utilisés")).toBeVisible();
  await transaction("Dépense", "100", "Courses fin QA");
  await expect(page.getByText("Budget atteint ou dépassé")).toBeVisible();
  checked("budget500 persistant et alertes80/100 visibles");
  await page.goto(`${base}/personal/comptes`);
  await page.getByRole("button", { name: "Compte", exact: true }).click();
  await page.getByRole("dialog").locator("input[name=name]").fill("Épargne QA");
  await page.getByRole("dialog").locator("select[name=type]").selectOption("SAVINGS");
  await saveDialog();
  await page
    .locator(".personal-quick-actions")
    .getByRole("button", { name: "Transférer", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .locator("select[name=accountId]")
    .selectOption({ label: "Compte courant QA" });
  await page
    .getByRole("dialog")
    .locator("select[name=destinationAccountId]")
    .selectOption({ label: "Épargne QA" });
  await page.getByRole("dialog").locator("input[name=amount]").fill("300");
  await page.getByRole("dialog").locator("input[name=description]").fill("Épargne mensuelle QA");
  await saveDialog();
  data = await overview();
  assert.equal(data.summary.balanceMinor, "150000");
  assert.equal(data.accounts.find((item) => item.name === "Épargne QA").balanceMinor, "30000");
  assert.equal(
    data.accounts.find((item) => item.name === "Compte courant QA").balanceMinor,
    "120000",
  );
  checked("transfertUI atomique entrecomptes sansmodifierrevenus/dépenses");
  await page.goto(`${base}/personal/transactions`);
  await page.getByRole("button", { name: "Modifier Courses QA", exact: true }).click();
  await page.getByRole("dialog").locator("input[name=amount]").fill("125");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Enregistrer les modifications" })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  assert.equal((await overview()).summary.balanceMinor, "147500");
  await page.getByLabel("Rechercher", { exact: true }).fill("Salaire QA");
  await expect(page.locator(".personal-transactions > article")).toHaveCount(1);
  checked("édition persistée et recherche effective");
  await mkdir(".local/personal-ui", { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["", "/budgets", "/parametres"]) {
      await page.goto(`${base}/personal${route}`);
      await expect(page.locator(".personal-workspace h1")).toBeVisible();
      await expect(page.locator(".personal-card").first()).toBeVisible();
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        `No overflow ${width} ${route}`,
      );
    }
    checked(`responsive ${width}px dashboard/budgets/settings`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/personal`);
  await page.getByRole("button", { name: /Choisir le thème/ }).click();
  await page.locator(".theme-menu").getByRole("button", { name: "Sombre" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: ".local/personal-ui/dashboard-dark.png", fullPage: true });
  await page
    .locator(".personal-quick-actions")
    .getByRole("button", { name: "Dépense", exact: true })
    .click();
  assert(
    (await page
      .getByRole("dialog")
      .locator("input[name=amount]")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize))) >= 16,
  );
  await page.screenshot({ path: ".local/personal-ui/entry-dark.png", fullPage: true });
  await page.getByRole("dialog").getByRole("button", { name: "Fermer la fenêtre" }).click();
  checked("dark mode et formulaire mobile lisible");
  const other = await browser.newContext();
  const registration = await other.request.post(`${base}/api/auth/register`, {
    headers: { Origin: base },
    data: {
      name: "Autre utilisateur QA",
      email: `other-mobile-${run}@example.test`,
      password: `Browser-${run}`,
      usageType: "BOTH",
      companyName: "Autre société QA",
      currency: "EUR",
    },
  });
  assert.equal(registration.status(), 201);
  const foreign = await other.request
    .get(`${base}/api/personal/overview?accountId=${originalAccount}`)
    .then((r) => r.json());
  assert.equal(foreign.transactions.total, 0);
  assert.equal(
    (await other.request.get(`${base}/api/personal/attachments/${expense.attachmentId}`)).status(),
    404,
  );
  assert.equal(
    (
      await other.request.post(`${base}/api/personal/transactions`, {
        headers: { Origin: base },
        data: {
          accountId: originalAccount,
          amount: "1",
          type: "EXPENSE",
          description: "Interdit",
          date: new Date().toISOString().slice(0, 10),
          idempotencyKey: randomUUID(),
        },
      })
    ).status(),
    404,
  );
  await other.close();
  checked("APIutilisateurB ne voit et ne modifie pas lesfinances/justificatifsA");
  await page.goto(`${base}/personal/parametres`);
  await page
    .getByLabel("Nom de l’entreprise", { exact: true })
    .fill("Mon entreprise depuis personnel QA");
  await page.getByRole("button", { name: "Créer mon espace entreprise" }).click();
  await page.waitForURL(base + "/");
  const me = await context.request.get(`${base}/api/me`).then((r) => r.json());
  assert.equal(me.user.usageType, "BOTH");
  assert(me.company);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("combobox", { name: "Changer d’espace" }).selectOption("personal");
  await page.waitForURL("**/personal");
  assert.equal((await overview()).summary.balanceMinor, "147500");
  checked("PERSONAL devientBOTH, switchentreprise/personnel conservecompteprivé");
  assert.deepEqual(errors, []);
  console.log(`SUCCESS ${checks} browser scenarios; real local APIs/Postgres, no production data.`);
} finally {
  await browser.close();
}
