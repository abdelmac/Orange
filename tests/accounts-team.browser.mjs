import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const base = process.env.APP_URL || "http://localhost:3107";
const databaseUrl = new URL(process.env.DATABASE_URL ?? "http://missing");
if (
  !["localhost", "127.0.0.1"].includes(new URL(base).hostname) ||
  !["localhost", "127.0.0.1"].includes(databaseUrl.hostname) ||
  !databaseUrl.searchParams.get("schema")?.startsWith("plans_qa_")
)
  throw Error("Local isolated plans_qa_ schema required");
const db = new PrismaClient();
const browser = await chromium.launch({
  headless: true,
  ...(process.platform === "win32"
    ? {
        executablePath:
          process.env.CHROME_BIN || "C:/Program Files/Google/Chrome/Application/chrome.exe",
      }
    : {}),
});
const errors = [];
const id = randomUUID();
const password = `Browser-test-${randomUUID()}`;
let checks = 0;
function ok(value, label) {
  assert.ok(value, label);
  checks++;
}
await mkdir(".local/accounts-team-browser", { recursive: true });
async function pageFor(width = 390) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", async (response) => {
    if (response.status() >= 400 && new URL(response.url()).pathname.startsWith("/api/"))
      console.log(
        `API ${response.status()} ${new URL(response.url()).pathname}: ${await response.text()}`,
      );
  });
  return { context, page };
}
async function fits(page) {
  ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    "no horizontal overflow",
  );
}
async function signup(page, usage, suffix) {
  await page.goto(`${base}/inscription`);
  await page.getByLabel("Votre nom", { exact: true }).fill(`Browser ${suffix}`);
  await page.getByLabel("Adresse email", { exact: true }).fill(`${suffix}-${id}@example.test`);
  await page.getByLabel("Mot de passe · 12 caractères minimum", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await page.locator(`input[name="usageType"][value="${usage}"]`).check();
  await fits(page);
  if (usage === "BUSINESS")
    await page.screenshot({
      path: ".local/accounts-team-browser/registration-mobile.png",
      fullPage: true,
    });
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  if (usage !== "PERSONAL")
    await page.getByLabel("Nom de l’entreprise", { exact: true }).fill(`Browser company ${id}`);
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  ok(
    await page.getByText("FREE sélectionné", { exact: true }).isVisible(),
    "FREE preselected without credit card",
  );
  await page.getByRole("button", { name: "Commencer gratuitement", exact: true }).click();
  await page.waitForURL("**/onboarding");
  console.log(`Inscription ${usage} vérifiée.`);
  await fits(page);
  const response = await page.request.get(`${base}/api/me`);
  ok(response.ok(), "real registered session");
  return response.json();
}
async function fixtureInvitation(owner, email, roleName) {
  const token = randomBytes(32).toString("hex");
  const role = await db.role.findUniqueOrThrow({
    where: { companyId_name: { companyId: owner.company.id, name: roleName } },
  });
  await db.teamInvitation.create({
    data: {
      companyId: owner.company.id,
      invitedById: owner.user.id,
      email,
      roleId: role.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  return token;
}
try {
  const ownerContext = await pageFor(390),
    ownerPage = ownerContext.page;
  const owner = await signup(ownerPage, "BUSINESS", "owner");
  ok(owner.user.isOwner, "business creator owns membership");
  await ownerPage.goto(`${base}/parametres/equipe`);
  await ownerPage.getByRole("heading", { name: "Travaillez ensemble avec PRO" }).waitFor();
  ok(
    await ownerPage.getByRole("button", { name: "Inviter", exact: true }).isDisabled(),
    "FREE invitation form disabled with explanation",
  );
  await fits(ownerPage);
  await ownerPage.screenshot({
    path: ".local/accounts-team-browser/free-team-mobile.png",
    fullPage: true,
  });
  const pro = await db.subscriptionPlan.findUniqueOrThrow({ where: { code: "PRO" } });
  await db.subscription.update({
    where: { companyId: owner.company.id },
    data: { planId: pro.id, status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 86400000) },
  });
  await ownerPage.reload();
  await ownerPage.getByRole("button", { name: "Inviter", exact: true }).waitFor();
  ok(
    await ownerPage.getByLabel("Adresse email", { exact: true }).isEnabled(),
    "PRO can enter invitation",
  );
  const personalContext = await pageFor(375),
    personalPage = personalContext.page;
  const personal = await signup(personalPage, "PERSONAL", "personal");
  ok(personal.company === null, "personal signup has no company");
  await personalPage.getByRole("link", { name: "Ouvrir mon tableau de bord", exact: true }).click();
  await personalPage.waitForURL("**/personal");
  await personalPage.getByRole("heading", { name: /finances personnelles/i }).waitFor();
  await fits(personalPage);
  const token = await fixtureInvitation(owner, personal.user.email, "ACCOUNTANT");
  await personalPage.goto(`${base}/invitation?token=${token}`);
  await personalPage.getByRole("button", { name: "Accepter l’invitation" }).waitFor();
  ok(
    (await personalPage.locator('input[type="password"]').count()) === 0,
    "existing account accepts without a second password",
  );
  await personalPage.screenshot({
    path: ".local/accounts-team-browser/invitation-mobile.png",
    fullPage: true,
  });
  const acceptedResponse = personalPage.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/team/accept" &&
      response.request().method() === "POST",
  );
  await personalPage.getByRole("button", { name: "Accepter l’invitation" }).click();
  ok((await acceptedResponse).ok(), "invitation API accepted");
  await personalPage.waitForURL(`${base}/`);
  const joined = await (await personalPage.request.get(`${base}/api/me`)).json();
  ok(
    joined.user.role === "ACCOUNTANT" && joined.user.usageType === "BOTH",
    "invitation joins company and preserves personal space",
  );
  await ownerPage.reload();
  await ownerPage.getByText(personal.user.email, { exact: true }).waitFor();
  const memberCard = ownerPage
    .locator(".team-member")
    .filter({ has: ownerPage.getByText(personal.user.email, { exact: true }) });
  await memberCard.getByRole("combobox").selectOption("VIEWER");
  await memberCard.getByRole("button", { name: "Enregistrer les droits" }).click();
  await ownerPage.getByText("Les modifications ont été enregistrées.", { exact: true }).waitFor();
  ok(
    (await personalPage.request.get(`${base}/api/me`)).status() === 401,
    "changed member session invalidated",
  );
  await fits(ownerPage);
  await ownerPage.screenshot({
    path: ".local/accounts-team-browser/pro-team-mobile.png",
    fullPage: true,
  });
  const newContext = await pageFor(1440),
    newPage = newContext.page;
  const newToken = await fixtureInvitation(owner, `invited-${id}@example.test`, "MEMBER");
  await newPage.goto(`${base}/invitation?token=${newToken}`);
  await newPage.getByLabel("Votre nom", { exact: true }).fill("Invited Browser");
  await newPage.getByLabel("Mot de passe · 12 caractères minimum", { exact: true }).fill(password);
  await newPage.getByRole("button", { name: "Accepter l’invitation" }).click();
  await newPage.waitForURL(`${base}/`);
  const invited = await (await newPage.request.get(`${base}/api/me`)).json();
  ok(invited.user.role === "MEMBER", "new invited account receives limited role");
  await fits(newPage);
  await ownerPage.goto(`${base}/onboarding`);
  await ownerPage.locator(".account-profile summary").click();
  await ownerPage.getByRole("button", { name: "Activer mon espace personnel" }).click();
  await ownerPage.getByRole("button", { name: "Ouvrir mon espace personnel" }).waitFor();
  ok(
    (await (await ownerPage.request.get(`${base}/api/me`)).json()).user.usageType === "BOTH",
    "existing business can enable personal space without moving company data",
  );
  ok(errors.length === 0, `no browser exceptions: ${errors.join("; ")}`);
  console.log(`${checks} contrôles comptes/équipes navigateur réussis avec PostgreSQL local.`);
} finally {
  await browser.close();
  await db.$disconnect();
}
