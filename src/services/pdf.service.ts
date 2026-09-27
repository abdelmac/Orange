import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/finance-context";
import { accessibleRecord } from "@/lib/record-access";
import { formatMoney } from "@/lib/money";
import { HttpError } from "@/lib/http";
import { APP_BRAND_NAME, APP_NAME } from "@/lib/brand";
import {
  defaultInvoiceSettings,
  invoiceDate,
  invoicePresentation,
  invoicePresentationInput,
  type InvoicePresentation,
} from "@/lib/invoice-customization";
import { createInvoicePresentation } from "./invoice-customization.service";
import { requirePermission } from "@/lib/finance-context";
import { invoiceCustomizationInput } from "@/lib/invoice-customization";

export type PdfBlock = {
  label?: string;
  text?: string;
  cells?: string[];
  heading?: boolean;
  widths?: number[];
};
type DocumentStyle = { presentation?: InvoicePresentation };
const hexColor = (hex: string) =>
  rgb(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  );

function printable(value: string, font: PDFFont) {
  return Array.from(value.replace(/[\u202f\u00a0]/g, " ").replace(/[\r\n\t]+/g, " "))
    .map((char) => {
      try {
        font.encodeText(char);
        return char;
      } catch {
        return "?";
      }
    })
    .join("");
}

export async function makeDocument(
  title: string,
  subtitle: string,
  company: string,
  blocks: PdfBlock[],
  options: DocumentStyle = {},
) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica),
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(title);
  doc.setAuthor(company);
  const presentation = options.presentation;
  const settings = presentation?.settings;
  doc.setCreator(presentation && !presentation.brandingVisible ? company : APP_NAME);
  const primary = hexColor(settings?.primaryColor ?? "#253f42");
  const accent = hexColor(settings?.accentColor ?? "#ee6425");
  const logo = presentation?.logoBase64
    ? presentation.logoMime === "image/png"
      ? await doc.embedPng(Buffer.from(presentation.logoBase64, "base64"))
      : await doc.embedJpg(Buffer.from(presentation.logoBase64, "base64"))
    : null;
  let page: PDFPage,
    y = 0;
  const pageWidth = 595.28,
    pageHeight = 841.89;
  const draw = (
    text: string,
    x: number,
    top: number,
    size = 10,
    strong = false,
    color = rgb(0.16, 0.19, 0.22),
  ) =>
    page.drawText(printable(text, strong ? bold : regular), {
      x,
      y: top,
      size,
      font: strong ? bold : regular,
      color,
    });
  const freshPage = () => {
    page = doc.addPage([pageWidth, pageHeight]);
    if (settings?.template === "MODERN")
      page.drawRectangle({ x: 0, y: 825, width: pageWidth, height: 17, color: primary });
    if (settings?.template !== "MINIMAL")
      page.drawRectangle({ x: 40, y: 790, width: 38, height: 4, color: accent });
    if (logo) {
      const dimensions = logo.scaleToFit(112, 58);
      page.drawImage(logo, { x: 40, y: 727, ...dimensions });
    } else
      draw(
        presentation ? "FACTURE" : APP_BRAND_NAME,
        40,
        758,
        presentation ? 18 : 26,
        true,
        primary,
      );
    const headerCompany = printable(company, bold);
    let shortCompany = headerCompany;
    while (bold.widthOfTextAtSize(shortCompany, 11) > 275) shortCompany = shortCompany.slice(0, -1);
    draw(shortCompany, 280, 766, 11, true, primary);
    draw(title, 40, 710, 20, true, primary);
    draw(subtitle, 40, 689, 10);
    page.drawLine({
      start: { x: 40, y: 672 },
      end: { x: 555, y: 672 },
      color: rgb(0.88, 0.89, 0.9),
      thickness: 1,
    });
    y = 646;
  };
  const wrap = (text: string, width: number, font = regular, size = 10) => {
    const result: string[] = [];
    let line = "";
    for (const word of printable(text, font).split(/\s+/)) {
      if (font.widthOfTextAtSize(word, size) > width) {
        if (line) {
          result.push(line);
          line = "";
        }
        let fragment = "";
        for (const char of word) {
          if (font.widthOfTextAtSize(fragment + char, size) > width) {
            result.push(fragment);
            fragment = "";
          }
          fragment += char;
        }
        line = fragment;
      } else if (line && font.widthOfTextAtSize(`${line} ${word}`, size) > width) {
        result.push(line);
        line = word;
      } else line += `${line ? " " : ""}${word}`;
    }
    if (line) result.push(line);
    return result.length ? result : [""];
  };
  freshPage();
  for (const block of blocks) {
    if (block.cells) {
      const widths =
        block.widths ??
        (block.cells.length === 4
          ? [235, 65, 100, 115]
          : block.cells.map(() => 515 / block.cells!.length));
      const columns = block.cells.map((cell, index) =>
        wrap(cell, widths[index] - 12, block.heading ? bold : regular, 9),
      );
      const lines = Math.max(...columns.map((column) => column.length));
      for (let line = 0; line < lines; line++) {
        if (y < 65) freshPage();
        if (block.heading)
          page!.drawRectangle({
            x: 40,
            y: y - 5,
            width: 515,
            height: 19,
            color: rgb(0.95, 0.96, 0.96),
          });
        let x = 46;
        columns.forEach((column, index) => {
          draw(column[line] ?? "", x, y, 9, !!block.heading);
          x += widths[index];
        });
        y -= 15;
      }
      y -= 11;
    } else {
      if (block.label) {
        if (y < 90) freshPage();
        draw(block.label, 40, y, 11, true, primary);
        y -= 20;
      }
      for (const line of wrap(block.text ?? "", 510)) {
        if (y < 65) freshPage();
        draw(line, 40, y);
        y -= 15;
      }
      y -= 12;
    }
  }
  const pages = doc.getPages();
  pages.forEach((pdfPage, index) => {
    page = pdfPage;
    let footer = printable(`${company} · ${title}`, regular);
    while (regular.widthOfTextAtSize(footer, 8) > 455) footer = footer.slice(0, -1);
    draw(footer, 40, 32, 8);
    draw(`${index + 1} / ${pages.length}`, 510, 32, 8);
    if (presentation?.brandingVisible) draw(`Créé avec ${APP_BRAND_NAME}`, 40, 18, 8);
  });
  return doc.save();
}

export type InvoiceDocument = {
  number: string;
  date: Date;
  dueDate: Date;
  currency: string;
  status: string;
  client: {
    name: string;
    businessName?: string | null;
    address?: string | null;
    city?: string | null;
    country?: string | null;
    taxNumber?: string | null;
  };
  salesperson?: { name: string } | null;
  lines: {
    description: string;
    quantity: { toString(): string };
    unitPrice: { toString(): string };
    taxPercent: { toString(): string };
    discountPercent: { toString(): string };
    totalMinor: bigint;
  }[];
  subtotalMinor: bigint;
  discountMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  paidMinor: bigint;
  notes: string | null;
  terms: string | null;
};

/** The preview and issued PDF (also used for printing) use this same document renderer. */
export function invoiceBlocks(
  invoice: InvoiceDocument,
  presentation: InvoicePresentation,
): PdfBlock[] {
  const { settings, issuer } = presentation;
  const date = (value: Date) => invoiceDate(value, settings.dateFormat);
  const money = (value: bigint) => formatMoney(value, invoice.currency);
  const columns = settings.columns;
  const labels = [
    "Désignation",
    ...(columns.quantity ? ["Qté"] : []),
    ...(columns.unitPrice ? ["Prix HT"] : []),
    ...(columns.tax ? ["TVA %"] : []),
    ...(columns.discount ? ["Remise %"] : []),
    "Total TTC",
  ];
  const narrow = columns.quantity ? 40 : 0;
  const price = columns.unitPrice ? 80 : 0;
  const tax = columns.tax ? 45 : 0;
  const discount = columns.discount ? 55 : 0;
  const widths = [
    515 - narrow - price - tax - discount - 100,
    ...(columns.quantity ? [narrow] : []),
    ...(columns.unitPrice ? [price] : []),
    ...(columns.tax ? [tax] : []),
    ...(columns.discount ? [discount] : []),
    100,
  ];
  return [
    ...(settings.headerText ? [{ text: settings.headerText }] : []),
    {
      label: "ÉMETTEUR",
      text: [
        issuer.name,
        ...(settings.showContact ? [issuer.address, issuer.email, issuer.phone] : []),
        issuer.taxNumber ? `Identifiant fiscal : ${issuer.taxNumber}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    },
    {
      label: "FACTURER À",
      text: [
        invoice.client.name,
        invoice.client.businessName,
        invoice.client.address,
        invoice.client.city,
        invoice.client.country,
        invoice.client.taxNumber ? `Identifiant fiscal : ${invoice.client.taxNumber}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    },
    {
      text: `Date de facture : ${date(invoice.date)}     Échéance : ${date(invoice.dueDate)}${invoice.salesperson ? `     Commercial : ${invoice.salesperson.name}` : ""}`,
    },
    ...settings.customFields.map((field) => ({ label: field.label, text: field.value })),
    { cells: labels, widths, heading: true },
    ...invoice.lines.map((line) => ({
      widths,
      cells: [
        line.description,
        ...(columns.quantity ? [line.quantity.toString()] : []),
        ...(columns.unitPrice ? [`${line.unitPrice.toString()} ${invoice.currency}`] : []),
        ...(columns.tax ? [line.taxPercent.toString()] : []),
        ...(columns.discount ? [line.discountPercent.toString()] : []),
        money(line.totalMinor),
      ],
    })),
    { cells: ["Sous-total HT", money(invoice.subtotalMinor)] },
    { cells: ["Remise", money(invoice.discountMinor)] },
    { cells: ["Taxes", money(invoice.taxMinor)] },
    { cells: ["TOTAL TTC", money(invoice.totalMinor)], heading: true },
    { cells: ["Montant encaissé", money(invoice.paidMinor)] },
    {
      cells: [
        "RESTE À PAYER",
        money(invoice.status === "CANCELLED" ? 0n : invoice.totalMinor - invoice.paidMinor),
      ],
      heading: true,
    },
    {
      label: "Conditions de règlement",
      text: invoice.terms || `Règlement à réception, au plus tard le ${date(invoice.dueDate)}.`,
    },
    ...(settings.bankDetails
      ? [{ label: "Coordonnées bancaires", text: settings.bankDetails }]
      : []),
    ...(invoice.notes ? [{ label: "Notes", text: invoice.notes }] : []),
    ...(settings.legalInformation
      ? [{ label: "Informations légales", text: settings.legalInformation }]
      : []),
    ...(settings.thankYou ? [{ text: settings.thankYou }] : []),
    ...(settings.footerText ? [{ text: settings.footerText }] : []),
  ];
}

export async function renderInvoicePdf(
  invoice: InvoiceDocument,
  presentation: InvoicePresentation,
  preview = false,
) {
  return makeDocument(
    invoice.number,
    preview
      ? "APERÇU — exemple, sans valeur comptable"
      : invoice.status === "CANCELLED"
        ? "FACTURE ANNULÉE — aucun règlement dû"
        : "Facture client",
    presentation.issuer.name,
    invoiceBlocks(invoice, presentation),
    { presentation },
  );
}

function pdfResponse(bytes: Uint8Array, name: string) {
  // Custom numbering may include slashes; they must never become a download path.
  const filename = name.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 100);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function invoicePdf(actor: Actor, id: string) {
  await accessibleRecord(actor, "INVOICE", id);
  const [invoice, company] = await Promise.all([
    db.invoice.findFirst({
      where: { id, companyId: actor.companyId },
      include: {
        client: true,
        lines: { orderBy: { position: "asc" } },
        salesperson: { select: { name: true } },
      },
    }),
    db.company.findUniqueOrThrow({ where: { id: actor.companyId } }),
  ]);
  if (!invoice) throw new HttpError(404, "Facture introuvable.");
  // Old issued invoices have no snapshot; render their original default layout/issuer.
  const snapshot = invoicePresentationInput.safeParse(invoice.customizationSnapshot);
  const presentation = snapshot.success
    ? snapshot.data
    : invoicePresentation(company, defaultInvoiceSettings(invoice.currency), {
        customization: false,
        removeBranding: false,
        logo: false,
        colors: false,
        fields: false,
        template: false,
      });
  return pdfResponse(await renderInvoicePdf(invoice, presentation), invoice.number);
}

export async function invoicePreview(actor: Actor, raw: unknown) {
  requirePermission(actor, "settings.edit");
  const settings = invoiceCustomizationInput.parse(raw);
  const presentation = await createInvoicePresentation(db, actor.companyId, settings);
  const date = new Date();
  const sample: InvoiceDocument = {
    number: "APERÇU",
    date,
    dueDate: new Date(date.getTime() + presentation.settings.defaultDueDays * 86400000),
    currency: presentation.issuer.currency,
    status: "ISSUED",
    client: {
      name: "Client exemple",
      address: "12 rue du Commerce",
      city: "Paris",
      country: "France",
    },
    lines: [
      {
        description: "Prestation de services",
        quantity: "2",
        unitPrice: "500.00",
        taxPercent: "20",
        discountPercent: "0",
        totalMinor: 120000n,
      },
    ],
    subtotalMinor: 100000n,
    discountMinor: 0n,
    taxMinor: 20000n,
    totalMinor: 120000n,
    paidMinor: 0n,
    notes: presentation.settings.defaultNotes,
    terms: presentation.settings.terms,
  };
  const { formatInvoiceNumber } = await import("../lib/invoice-customization");
  sample.number = formatInvoiceNumber(1, date.getUTCFullYear(), presentation.settings);
  return pdfResponse(await renderInvoicePdf(sample, presentation, true), "apercu-facture");
}
