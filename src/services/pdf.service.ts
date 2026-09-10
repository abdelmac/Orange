import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/finance-context";
import { accessibleRecord } from "@/lib/record-access";
import { formatMoney } from "@/lib/money";
import { HttpError } from "@/lib/http";

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
  blocks: { label?: string; text?: string; cells?: string[]; heading?: boolean }[],
) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica),
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(title);
  doc.setAuthor(company);
  doc.setCreator("Orange · Gestion financière");
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
    page.drawRectangle({ x: 40, y: 790, width: 30, height: 4, color: rgb(0.94, 0.36, 0.13) });
    draw("orange.", 40, 758, 26, true);
    draw(company, 280, 766, 11, true);
    draw(title, 40, 710, 23, true);
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
        block.cells.length === 4
          ? [235, 65, 100, 115]
          : block.cells.map(() => 515 / block.cells!.length);
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
            color: rgb(0.96, 0.95, 0.93),
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
        draw(block.label, 40, y, 11, true);
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
    draw(`${company} · ${title}`, 40, 32, 8);
    draw(`${index + 1} / ${pages.length}`, 510, 32, 8);
  });
  return doc.save();
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
  const date = (value: Date) => value.toLocaleDateString("fr-FR", { timeZone: "UTC" });
  const money = (value: bigint) => formatMoney(value, invoice.currency);
  const blocks = [
    {
      label: "ÉMETTEUR",
      text: [
        company.name,
        company.address,
        company.email,
        company.phone,
        company.taxNumber ? `Identifiant fiscal : ${company.taxNumber}` : "",
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
    { cells: ["Désignation", "Quantité", "Prix unitaire", "Total TTC"], heading: true },
    ...invoice.lines.flatMap((line) => [
      {
        cells: [
          line.description,
          line.quantity.toString(),
          `${line.unitPrice.toFixed(Math.max(2, line.unitPrice.decimalPlaces()))} ${invoice.currency}`,
          money(line.totalMinor),
        ],
      },
      ...(line.taxPercent.isZero() && line.discountPercent.isZero()
        ? []
        : [
            {
              text: `TVA : ${line.taxPercent.toString()} % · Remise : ${line.discountPercent.toString()} %`,
            },
          ]),
    ]),
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
    ...(invoice.notes ? [{ label: "Notes", text: invoice.notes }] : []),
  ];
  return new Response(
    new Uint8Array(
      await makeDocument(
        invoice.number,
        invoice.status === "CANCELLED" ? "FACTURE ANNULÉE — aucun règlement dû" : "Facture client",
        company.name,
        blocks,
      ),
    ),
    {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.number}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    },
  );
}
