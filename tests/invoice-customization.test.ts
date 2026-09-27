import { describe, expect, it } from "vitest";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { APP_BRAND_NAME } from "../src/lib/brand";
import {
  defaultInvoiceSettings,
  formatInvoiceNumber,
  invoiceCustomizationInput,
  invoiceDate,
  invoicePresentation,
} from "../src/lib/invoice-customization";
import { invoiceBlocks, renderInvoicePdf, type InvoiceDocument } from "../src/services/pdf.service";
import { validateInvoiceLogo } from "../src/services/invoice-customization.service";

const company = {
  name: "Entreprise Exemple",
  address: "12 rue du Commerce",
  phone: "+33123456789",
  email: "contact@example.test",
  taxNumber: "TEST-123",
  currency: "EUR",
};
const free = {
  customization: false,
  removeBranding: false,
  logo: false,
  colors: false,
  fields: false,
  template: false,
};
const pro = {
  customization: true,
  removeBranding: true,
  logo: true,
  colors: true,
  fields: true,
  template: true,
};
const invoice: InvoiceDocument = {
  number: "FAC-2026-000001",
  date: new Date("2026-09-27T00:00:00Z"),
  dueDate: new Date("2026-10-27T00:00:00Z"),
  currency: "EUR",
  status: "PARTIALLY_PAID",
  client: { name: "Client test" },
  lines: [
    {
      description: "Service",
      quantity: "1",
      unitPrice: "100",
      taxPercent: "20",
      discountPercent: "0",
      totalMinor: 12000n,
    },
  ],
  subtotalMinor: 10000n,
  discountMinor: 0n,
  taxMinor: 2000n,
  totalMinor: 12000n,
  paidMinor: 4000n,
  notes: null,
  terms: null,
};
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0ioAAAAASUVORK5CYII=",
  "base64",
);

async function pdfContent(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  const streams = pdf.context
    .enumerateIndirectObjects()
    .filter(([, value]) => value instanceof PDFRawStream)
    .map(([, value]) => {
      try {
        return Buffer.from(decodePDFRawStream(value as PDFRawStream).decode()).toString("latin1");
      } catch {
        return "";
      }
    })
    .join("\n");
  return { pdf, streams };
}

describe("personnalisation sécurisée des factures", () => {
  it("impose l’identité et le branding FREE même si des réglages PRO sont envoyés", () => {
    const custom = invoiceCustomizationInput.parse({
      removeBranding: true,
      displayName: "Faux nom",
      primaryColor: "#ffffff",
      customFields: [{ label: "Secret", value: "test" }],
      currency: "USD",
    });
    const result = invoicePresentation(company, custom, free, { data: png, mime: "image/png" });
    expect(result.brandingVisible).toBe(true);
    expect(result.issuer.name).toBe(company.name);
    expect(result.settings.primaryColor).toBe("#253f42");
    expect(result.settings.customFields).toEqual([]);
    expect(result.settings.currency).toBe("EUR");
    expect(result.logoBase64).toBeNull();
  });

  it("exige un droit distinct pour retirer la marque, même avec personnalisation", () => {
    const settings = invoiceCustomizationInput.parse({ removeBranding: true });
    expect(
      invoicePresentation(company, settings, { ...pro, removeBranding: false }).brandingVisible,
    ).toBe(true);
    expect(invoicePresentation(company, settings, pro).brandingVisible).toBe(false);
  });

  it("applique le logo, les couleurs, les champs et les textes dans le document commun", async () => {
    const settings = invoiceCustomizationInput.parse({
      displayName: "Atelier Exemple",
      removeBranding: true,
      template: "MODERN",
      primaryColor: "#123456",
      footerText: "Merci pour votre confiance",
      bankDetails: "IBAN de démonstration",
      customFields: [{ label: "Bon de commande", value: "BC-42" }],
      columns: { quantity: false, unitPrice: false, tax: false, discount: false },
    });
    const presentation = invoicePresentation(company, settings, pro, {
      data: png,
      mime: "image/png",
    });
    const blocks = invoiceBlocks(invoice, presentation);
    expect(blocks).toContainEqual({ label: "Bon de commande", text: "BC-42" });
    expect(blocks).toContainEqual({ text: settings.footerText });
    expect(blocks.some((b) => b.heading && b.cells?.join("|") === "Désignation|Total TTC")).toBe(
      true,
    );
    expect(blocks.find((b) => b.cells?.[0] === "RESTE À PAYER")?.cells?.[1]).toBe("80,00 €");
    const { pdf, streams } = await pdfContent(await renderInvoicePdf(invoice, presentation));
    expect(pdf.getCreator()).toBe("Atelier Exemple");
    expect(pdf.getPageCount()).toBeGreaterThan(0);
    expect(streams).toContain("0.07058823529411765 0.20392156862745098 0.33725490196078434");
    expect(streams).not.toContain(Buffer.from(APP_BRAND_NAME).toString("hex").toUpperCase());
    expect(
      pdf.context
        .enumerateIndirectObjects()
        .some(
          ([, value]) => value instanceof PDFRawStream && value.dict.toString().includes("/Image"),
        ),
    ).toBe(true);
  });

  it("affiche réellement la marque FREE dans le PDF et préserve les montants exacts", async () => {
    const presentation = invoicePresentation(company, defaultInvoiceSettings("EUR"), free);
    const { streams } = await pdfContent(await renderInvoicePdf(invoice, presentation));
    expect(streams).toContain(Buffer.from(APP_BRAND_NAME).toString("hex").toUpperCase());
    const cancelled = invoiceBlocks({ ...invoice, status: "CANCELLED" }, presentation);
    expect(cancelled.find((b) => b.cells?.[0] === "RESTE À PAYER")?.cells?.[1]).toBe("0,00 €");
  });

  it("conserve l’année et la séquence dans tous les formats de numéro", () => {
    expect(formatInvoiceNumber(42, 2026, { prefix: "DEV", numberFormat: "DASH" })).toBe(
      "DEV-2026-000042",
    );
    expect(formatInvoiceNumber(43, 2026, { prefix: "FAC", numberFormat: "SLASH" })).toBe(
      "FAC/2026/000043",
    );
    expect(() => invoiceCustomizationInput.parse({ prefix: "../bad" })).toThrow();
    expect(() =>
      invoiceCustomizationInput.parse({ primaryColor: "url(https://example.test)" }),
    ).toThrow();
    expect(() => invoiceCustomizationInput.parse({ defaultDueDays: 366 })).toThrow();
    expect(invoiceDate(invoice.date, "ISO")).toBe("2026-09-27");
  });

  it("refuse les fichiers déguisés, les images démesurées et les logos surdimensionnés", async () => {
    expect(await validateInvoiceLogo(png)).toBe("image/png");
    await expect(validateInvoiceLogo(Buffer.from("<svg onload='alert(1)'></svg>"))).rejects.toThrow(
      "PNG ou JPEG",
    );
    await expect(validateInvoiceLogo(new Uint8Array(1_000_001))).rejects.toThrow("1 Mo");
    const bomb = Buffer.from(png);
    bomb.writeUInt32BE(100000, 16);
    await expect(validateInvoiceLogo(bomb)).rejects.toThrow("2 400");
  });

  it("génère plusieurs pages sans perdre les lignes longues", async () => {
    const many = {
      ...invoice,
      lines: Array.from({ length: 100 }, (_, i) => ({
        ...invoice.lines[0],
        description: `Ligne ${i + 1} ${"description ".repeat(10)}`,
      })),
    };
    const { pdf } = await pdfContent(
      await renderInvoicePdf(
        many,
        invoicePresentation(company, defaultInvoiceSettings("EUR"), free),
      ),
    );
    expect(pdf.getPageCount()).toBeGreaterThan(4);
  });
});
