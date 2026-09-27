import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

const base = process.env.E2E_BASE_URL || "http://localhost:3107";
const database = new URL(process.env.DATABASE_URL ?? "http://missing");
if (
  !["localhost", "127.0.0.1"].includes(new URL(base).hostname) ||
  !["localhost", "127.0.0.1"].includes(database.hostname) ||
  !database.searchParams.get("schema")?.startsWith("plans_qa_")
)
  throw new Error("Only isolated local plans_qa_ databases and local servers are permitted.");
const db = new PrismaClient();
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 980 },
  serviceWorkers: "block",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0ioAAAAASUVORK5CYII=",
  "base64",
);
let checks = 0;
const pass = (label) => {
  checks++;
  console.log(`PASS ${checks}: ${label}`);
};

try {
  const email = `invoice-ui-${randomUUID()}@example.test`;
  const registration = await context.request.post(`${base}/api/auth/register`, {
    headers: { Origin: base },
    data: {
      name: "Camille Facturation",
      email,
      password: `InvoiceQA-${randomUUID()}!`,
      companyName: "Atelier Harmonie",
      usageType: "BUSINESS",
      currency: "EUR",
    },
  });
  assert.equal(registration.status(), 201, await registration.text());
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  assert(user.companyId);
  await page.goto(`${base}/parametres/factures`);
  await page.getByRole("heading", { name: "Des factures à votre image" }).waitFor();
  await page.getByRole("link", { name: "Découvrir PRO — 4 €/mois" }).waitFor();
  assert.equal(
    await page.getByRole("textbox", { name: "Nom affiché", exact: true }).isDisabled(),
    true,
  );
  await page.locator('iframe[title="Aperçu de votre facture PDF"]').waitFor();
  assert.match(await page.locator("iframe").getAttribute("src"), /^blob:/);
  pass("FREE : accès aux réglages, invitation PRO claire et aperçu PDF disponible sans paiement");

  const pro = await db.subscriptionPlan.findUniqueOrThrow({ where: { code: "PRO" } });
  await db.subscription.update({
    where: { companyId: user.companyId },
    data: { planId: pro.id, status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 86400000) },
  });
  await page.reload();
  await page.getByRole("textbox", { name: "Nom affiché", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("textbox", { name: "Nom affiché", exact: true }).isEnabled(),
    true,
  );
  await page
    .getByRole("textbox", { name: "Nom affiché", exact: true })
    .fill("Atelier Harmonie PRO");
  await page
    .getByRole("textbox", { name: "Texte en bas de facture", exact: true })
    .fill("Merci pour votre confiance.");
  await page.getByRole("combobox", { name: "Modèle", exact: true }).selectOption("MODERN");
  await page.getByLabel("Couleur principale", { exact: true }).fill("#2a5461");
  await page.getByLabel(/Retirer la mention/).check();
  const logoSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/invoice-customization/logo") &&
      response.request().method() === "PUT",
  );
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png });
  assert.equal((await logoSaved).status(), 200);
  await page.getByAltText("Logo actuel de l’entreprise").waitFor();
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/invoice-customization") &&
      response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Enregistrer la personnalisation", exact: true }).click();
  assert.equal((await saved).status(), 200);
  await page
    .getByText("Personnalisation enregistrée. Elle sera appliquée aux prochaines factures.", {
      exact: true,
    })
    .waitFor();
  const persisted = await db.invoiceCustomization.findUniqueOrThrow({
    where: { companyId: user.companyId },
  });
  assert.equal(persisted.settings.displayName, "Atelier Harmonie PRO");
  assert.equal(persisted.settings.removeBranding, true);
  assert.equal(persisted.logoMime, "image/png");
  pass("PRO : formulaire, logo privé, couleurs, modèle, retrait branding et enregistrement réel");

  await page.reload();
  await page.getByRole("textbox", { name: "Nom affiché", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("textbox", { name: "Nom affiché", exact: true }).inputValue(),
    "Atelier Harmonie PRO",
  );
  await page.locator("iframe").waitFor();
  await mkdir(".local/invoice-browser", { recursive: true });
  await page.screenshot({ path: ".local/invoice-browser/desktop.png", fullPage: false });
  pass("Les réglages sauvegardés et l’aperçu sont conservés après rechargement");

  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `overflow at ${width}`,
    );
    const settings = page.getByRole("button", { name: "Réglages", exact: true });
    const preview = page.getByRole("button", { name: "Aperçu", exact: true });
    await settings.click();
    assert.equal(await page.locator(".invoice-settings-form").isVisible(), true);
    assert.equal(await page.locator(".invoice-live-preview").isVisible(), false);
    if (width <= 560)
      assert.equal(
        await page
          .getByRole("textbox", { name: "Nom affiché", exact: true })
          .evaluate((element) => getComputedStyle(element).fontSize),
        "16px",
      );
    await preview.click();
    assert.equal(await page.locator(".invoice-live-preview").isVisible(), true);
    assert.equal(await page.locator(".invoice-settings-form").isVisible(), false);
    const button = await preview.boundingBox();
    assert(button.height >= 44);
    await page.screenshot({
      path: `.local/invoice-browser/mobile-${width}-preview.png`,
      fullPage: false,
    });
    await settings.click();
    pass(
      `Mobile ${width}px : aucun débordement, champs lisibles et aperçu séparé accessible au toucher`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.setItem("orange-theme", "dark"));
  await page.reload();
  await page.getByRole("textbox", { name: "Nom affiché", exact: true }).waitFor();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.screenshot({
    path: ".local/invoice-browser/mobile-dark-settings.png",
    fullPage: false,
  });
  assert.deepEqual(errors, []);
  pass("Mode sombre et aucune erreur JavaScript");
  console.log(
    `${checks} scénarios navigateur de facturation réussis, compte isolé local uniquement.`,
  );
} catch (error) {
  await mkdir(".local/invoice-browser", { recursive: true });
  await page
    .screenshot({ path: ".local/invoice-browser/failure.png", fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
