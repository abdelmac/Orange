import { chromium, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

process.loadEnvFile();
const base = process.env.E2E_BASE_URL ?? "http://localhost:3107";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const executablePath = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find(existsSync);
const browser = await chromium.launch({ headless: true, executablePath });
expect.configure({ timeout: 20000 });
const checks = [];
const output = ".local/workspaces-browser";
await mkdir(output, { recursive: true });
try {
  for (const width of [390, 820, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      hasTouch: true,
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/login`);
    await page.getByLabel("Adresse email", { exact: true }).fill("admin@demo.local");
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.DEMO_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL(`${base}/`);
    await expect(page.locator(".workspace-selector")).toBeAttached();
    const cdp = await context.newCDPSession(page);
    const swipe = async (start, end) => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
      for (let step = 1; step <= 5; step++)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            {
              x: start.x + ((end.x - start.x) * step) / 5,
              y: start.y + ((end.y - start.y) * step) / 5,
            },
          ],
        });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    if (width <= 1020) {
      await expect(page.locator(".sidebar")).toHaveAttribute("inert", "");
      await swipe({ x: 8, y: 310 }, { x: 160, y: 314 });
      await expect(page.locator(".sidebar")).toHaveClass(/is-open/);
      await page.keyboard.press("Escape");
      await expect(page.locator(".sidebar")).not.toHaveClass(/is-open/);
      await page.getByRole("button", { name: "Ouvrir le menu" }).click();
      await expect(page.locator(".sidebar")).toHaveClass(/is-open/);
      await swipe({ x: 215, y: 310 }, { x: 50, y: 312 });
      await expect(page.locator(".sidebar")).not.toHaveClass(/is-open/);
      await swipe({ x: 8, y: 280 }, { x: 12, y: 435 });
      await expect(page.locator(".sidebar")).not.toHaveClass(/is-open/);
      // A horizontal control located at the edge keeps its own scrolling gesture.
      await page.evaluate(() => {
        const element = document.createElement("div");
        element.id = "qa-scroller";
        element.style.cssText =
          "position:fixed;left:0;top:290px;width:100%;height:80px;overflow-x:auto;z-index:5";
        element.innerHTML = '<div style="width:2000px;height:70px">Défilement horizontal</div>';
        document.body.append(element);
      });
      await swipe({ x: 8, y: 310 }, { x: 160, y: 315 });
      await expect(page.locator(".sidebar")).not.toHaveClass(/is-open/);
      await page.locator("#qa-scroller").evaluate((element) => element.remove());
      await page.getByRole("button", { name: "Ouvrir le menu" }).click();
      await page.locator(".sidebar-overlay").click({ position: { x: width - 10, y: 230 } });
      await expect(page.locator(".sidebar")).not.toHaveClass(/is-open/);
    } else {
      await expect(page.locator(".sidebar")).not.toHaveAttribute("inert");
      await swipe({ x: 8, y: 310 }, { x: 160, y: 314 });
      await expect(page.locator(".sidebar")).not.toHaveClass(/is-open/);
    }
    await page.goto(`${base}/abonnement`);
    await expect(page.getByRole("heading", { name: "Mon abonnement" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Offre actuelle : Accès existant" }),
    ).toBeVisible();
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `No horizontal overflow ${width}`,
    );
    await page.screenshot({ path: `${output}/subscription-${width}.png`, fullPage: true });
    await page.goto(`${base}/parametres`);
    await expect(page.getByRole("link", { name: "Personnaliser mes factures" })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByRole("link", { name: "Mon équipe", exact: true })).toBeVisible({
      timeout: 20000,
    });
    assert.deepEqual(errors, []);
    checks.push(
      `PASS ${width}px: gestures/keyboard/scrollers/sidebar/settings/billing/no overflow`,
    );
    console.log(checks.at(-1));
    await context.close();
  }
  await writeFile(`${output}/results.json`, JSON.stringify(checks, null, 2));
  for (const check of checks) console.log(check);
} finally {
  await browser.close();
}
