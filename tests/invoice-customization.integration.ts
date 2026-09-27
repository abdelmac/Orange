import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { db } from "../src/lib/db";
import { type Actor } from "../src/lib/finance-context";
import { defaultInvoiceSettings, invoicePresentationInput } from "../src/lib/invoice-customization";
import { rolePermissions } from "../src/lib/rbac";
import { ensurePlan } from "../src/services/entitlement.service";
import {
  getInvoiceCustomization,
  invoiceLogoResponse,
  updateInvoiceCustomization,
  updateInvoiceLogo,
} from "../src/services/invoice-customization.service";
import { createSale } from "../src/services/invoice.service";
import { invoicePdf, invoicePreview } from "../src/services/pdf.service";
import { getDirectoryItem, listDirectory } from "../src/services/directory-read.service";

const url = new URL(process.env.DATABASE_URL ?? "http://missing");
if (
  process.env.NODE_ENV === "production" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !url.searchParams.get("schema")?.startsWith("plans_qa_")
)
  throw new Error("Exécuter uniquement dans le schéma PostgreSQL local plans_qa_ isolé.");
let checks = 0;
async function check(name: string, work: () => Promise<void>) {
  await work();
  console.log(`PASS ${++checks}: ${name}`);
}

async function main() {
  const run = randomUUID();
  const company = await db.company.create({ data: { name: `Invoice QA ${run}`, currency: "EUR" } });
  const user = await db.user.create({
    data: {
      companyId: company.id,
      name: "Invoice QA",
      email: `invoice-${run}@example.test`,
      passwordHash: "test-only-unusable",
    },
  });
  const actor: Actor = {
    id: user.id,
    companyId: company.id,
    name: user.name,
    role: "ADMIN",
    permissions: rolePermissions.ADMIN,
  };
  const client = await db.client.create({
    data: { companyId: company.id, name: "Client de test" },
  });
  const settings = {
    ...defaultInvoiceSettings("EUR"),
    displayName: "Atelier PRO",
    removeBranding: true,
    prefix: "PRO",
    defaultDueDays: 7,
    defaultNotes: "Note par défaut",
    terms: "Paiement sous sept jours",
    footerText: "Merci",
    numberFormat: "SLASH" as const,
  };
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0ioAAAAASUVORK5CYII=",
    "base64",
  );
  const saleInput = () => ({
    clientId: client.id,
    idempotencyKey: randomUUID(),
    date: "2026-09-27T00:00:00.000Z",
    notes: "",
    terms: "",
    lines: [{ description: "Service", quantity: "1", unitPrice: "100.00" }],
  });

  await check("FREE : paramètres et logo PRO interdits côté serveur", async () => {
    await assert.rejects(() => updateInvoiceCustomization(actor, settings), /PRO/);
    await assert.rejects(() => updateInvoiceLogo(actor, png), /PRO/);
    await assert.rejects(() => getInvoiceCustomization({ ...actor, permissions: [] }), /autorisée/);
    assert.equal((await getInvoiceCustomization(actor)).canCustomize, false);
  });
  const freeSale = await createSale(actor, saleInput());
  assert(freeSale.invoice);
  await check("FREE : facture persistée et PDF accessible avec branding", async () => {
    const stored = await db.invoice.findUniqueOrThrow({ where: { id: freeSale.invoice!.id } });
    assert.equal(
      invoicePresentationInput.parse(stored.customizationSnapshot).brandingVisible,
      true,
    );
    assert.equal(stored.number, "FAC-2026-000001");
    const pdf = await invoicePdf(actor, stored.id);
    assert.equal(pdf.headers.get("cache-control"), "private, no-store");
    assert.equal((await PDFDocument.load(await pdf.arrayBuffer())).getCreator(), "Orange Finance");
  });
  const pro = await ensurePlan("PRO");
  await db.subscription.create({
    data: {
      companyId: company.id,
      planId: pro.id,
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 86400000),
    },
  });
  await check("PRO : personnalisation, logo privé et audit persistés", async () => {
    await updateInvoiceCustomization(actor, settings);
    await updateInvoiceLogo(actor, png);
    const result = await getInvoiceCustomization(actor);
    assert.equal(result.canCustomize, true);
    assert.equal(result.hasLogo, true);
    assert.equal(result.settings.footerText, "Merci");
    assert.equal(
      (await invoiceLogoResponse(actor)).headers.get("cache-control"),
      "private, no-store",
    );
    assert.equal(
      await db.auditLog.count({ where: { companyId: company.id, entity: "InvoiceCustomization" } }),
      2,
    );
    await assert.rejects(
      () => updateInvoiceCustomization(actor, { ...settings, currency: "USD" }),
      /devise/,
    );
  });
  const proSale = await createSale(actor, saleInput());
  assert(proSale.invoice);
  await check(
    "PRO : défauts facture, séquence non réinitialisée et snapshot sans branding",
    async () => {
      const invoice = await db.invoice.findUniqueOrThrow({ where: { id: proSale.invoice!.id } });
      const snapshot = invoicePresentationInput.parse(invoice.customizationSnapshot);
      assert.equal(invoice.number, "PRO/2026/000002");
      assert.equal(invoice.dueDate.toISOString(), "2026-10-04T00:00:00.000Z");
      assert.equal(invoice.notes, settings.defaultNotes);
      assert.equal(invoice.terms, settings.terms);
      assert.equal(snapshot.brandingVisible, false);
      assert.equal(snapshot.logoBase64, png.toString("base64"));
      const response = await invoicePdf(actor, invoice.id);
      assert.equal(
        response.headers.get("content-disposition"),
        'inline; filename="PRO-2026-000002.pdf"',
      );
      assert.equal(
        (await PDFDocument.load(await response.arrayBuffer())).getCreator(),
        "Atelier PRO",
      );
      const preview = await invoicePreview(actor, settings);
      assert.equal(
        (await PDFDocument.load(await preview.arrayBuffer())).getCreator(),
        "Atelier PRO",
      );
    },
  );
  await check("Les réponses API de lecture n’exposent pas le snapshot volumineux", async () => {
    const list = await listDirectory(actor, "invoices", new URLSearchParams());
    assert(list.length >= 2);
    assert(
      !JSON.stringify(list, (_, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ).includes("customizationSnapshot"),
    );
    const detail = await getDirectoryItem(actor, "invoices", proSale.invoice!.id);
    assert(detail && typeof detail === "object");
    assert(!("customizationSnapshot" in detail));
    assert(!("customizationSnapshot" in proSale.invoice!));
  });
  await check("Autre entreprise : ni facture ni logo accessibles", async () => {
    const other = await db.company.create({ data: { name: `Invoice Other ${run}` } });
    const foreign = { ...actor, companyId: other.id };
    await assert.rejects(() => invoicePdf(foreign, proSale.invoice!.id), /introuvable/);
    await assert.rejects(() => invoiceLogoResponse(foreign), /Aucun logo/);
  });
  await check(
    "Après expiration PRO, anciennes factures inchangées et nouvelles factures FREE",
    async () => {
      await db.subscription.update({
        where: { companyId: company.id },
        data: { status: "EXPIRED" },
      });
      await updateInvoiceLogo(actor, null).then(
        () => assert.fail("logo must be PRO"),
        (error) => assert.match(error.message, /PRO/),
      );
      const historic = await invoicePdf(actor, proSale.invoice!.id);
      assert.equal(
        (await PDFDocument.load(await historic.arrayBuffer())).getCreator(),
        "Atelier PRO",
      );
      const sale = await createSale(actor, saleInput());
      const invoice = await db.invoice.findUniqueOrThrow({ where: { id: sale.invoice!.id } });
      assert.equal(invoice.number, "FAC-2026-000003");
      assert.equal(
        invoicePresentationInput.parse(invoice.customizationSnapshot).brandingVisible,
        true,
      );
      assert.equal(invoice.notes, "");
      const preview = await invoicePreview(actor, settings);
      assert.equal(
        (await PDFDocument.load(await preview.arrayBuffer())).getCreator(),
        "Orange Finance",
      );
    },
  );
  console.log(`${checks} vérifications PostgreSQL facture réussies.`);
}
main()
  .finally(() => db.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
