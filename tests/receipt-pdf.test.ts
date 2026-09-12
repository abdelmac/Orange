import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName } from "pdf-lib";
import {
  receiptSnapshotSchema,
  receiptText,
  type ReceiptSnapshot,
} from "../src/lib/receipt-schema";
import {
  receiptDocumentBlocks,
  receiptPdfResponse,
  renderReceiptPdf,
} from "../src/services/receipt-pdf.service";

const id = "10000000-0000-4000-8000-000000000001";
function example(): ReceiptSnapshot {
  const person = { id, name: "Élodie François" };
  const company = { kind: "COMPANY", name: "Société Démo SARL", phone: null };
  const payer = { kind: "DRIVER", name: "André Noël", phone: "+33 6 12 34 56 78" };
  return receiptSnapshotSchema.parse({
    version: 1,
    number: "REC-2026-000001",
    issuedAt: "2026-09-12T10:00:00.000Z",
    issuedBy: person,
    company: {
      id,
      name: company.name,
      address: "12 rue de l’Église, Lyon",
      email: "contact@example.test",
      phone: null,
      taxNumber: null,
    },
    operation: {
      id,
      number: "TRX-2026-000042",
      type: "CASH_RECEIPT",
      date: "2026-09-10T09:15:00.000Z",
      amountMinor: "125050",
      currency: "EUR",
      method: "CASH",
      description: "Versement de la tournée du matin",
      reference: "TOUR-42",
      comment: null,
    },
    payer,
    payee: company,
    source: payer,
    destination: { kind: "CASH_ACCOUNT", name: "Caisse principale", phone: null },
    recordedBy: person,
    validatedBy: person,
    requester: null,
    invoice: null,
    expense: null,
    reversalOf: null,
  });
}

describe("Reçus privés PDF", () => {
  it("produit un reçu français ordinaire sur une page A4 sans action active", async () => {
    const document = await PDFDocument.load(await renderReceiptPdf(example()));
    expect(document.getPageCount()).toBe(1);
    expect(document.getPage(0).getWidth()).toBeCloseTo(595.28, 1);
    expect(document.getPage(0).getHeight()).toBeCloseTo(841.89, 1);
    expect(document.catalog.get(PDFName.of("OpenAction"))).toBeUndefined();
    expect(document.catalog.get(PDFName.of("AA"))).toBeUndefined();
    const text = JSON.stringify(receiptDocumentBlocks(example(), null));
    expect(text).toContain("Chauffeur");
    expect(text).toContain("Espèces");
    expect(text).toContain("Date d’émission du reçu");
    expect(text).toContain("Reçu d’enregistrement — ne remplace pas une facture.");
  });

  it("pagine les textes très longs et les mots sans espaces sans erreur Unicode", async () => {
    const snapshot = example();
    snapshot.operation.description = receiptText(
      "Échéance réglée, cœur de métier, العربية. ".repeat(200),
    )!;
    snapshot.operation.comment = receiptText("X".repeat(12000))!;
    const document = await PDFDocument.load(await renderReceiptPdf(snapshot));
    expect(document.getPageCount()).toBeGreaterThan(1);
    expect(document.getPageCount()).toBeLessThan(15);
  });

  it("retire les caractères de contrôle et de direction trompeurs en bornant le texte", () => {
    expect(receiptText("\u0000Pa\u202aye\u2066ur\u007f")).toBe("Payeur");
    expect(receiptText("e\u0301chéance")).toBe("échéance");
    expect(receiptText("A".repeat(9999))!.length).toBeLessThanOrEqual(6400);
    expect(receiptText("A".repeat(9999))).toContain("[texte abrégé]");
  });

  it("ne présente jamais un mode inconnu comme des espèces", () => {
    const snapshot = example();
    snapshot.operation.method = null;
    snapshot.operation.type = "HANDOVER";
    const blocks = receiptDocumentBlocks(snapshot, null);
    expect(blocks.find((block) => block.cells?.[0] === "Mode de paiement")?.cells?.[1]).toBe(
      "Non renseigné",
    );
    expect(JSON.stringify(blocks)).not.toContain("Espèces");
  });

  it("affiche le numéro et la date d’annulation et marque le PDF ANNULÉ", async () => {
    const cancellation = { id, number: "TRX-2026-000099", date: "2026-09-12T12:00:00.000Z" };
    const document = await PDFDocument.load(await renderReceiptPdf(example(), cancellation));
    expect(document.getTitle()).toContain("ANNULÉ");
    const blocks = receiptDocumentBlocks(example(), cancellation);
    expect(blocks[0].label).toBe("OPÉRATION ANNULÉE");
    expect(blocks[0].text).toContain(cancellation.number);
    expect(blocks[0].text).toContain("12 septembre 2026");
  });

  it("sert un téléchargement privé par défaut et permet l’impression inline", async () => {
    const snapshot = example();
    const receipt = { id, number: snapshot.number, snapshot, cancellation: null };
    const response = await receiptPdfResponse(receipt);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="REC-2026-000001.pdf"',
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(response.headers.get("content-length")).toBe(String(bytes.length));
    const inline = await receiptPdfResponse(receipt, true);
    expect(inline.headers.get("content-disposition")).toMatch(/^inline;/);
  });
});
