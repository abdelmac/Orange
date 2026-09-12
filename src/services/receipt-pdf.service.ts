import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { formatMoney } from "@/lib/money";
import {
  receiptSnapshotSchema,
  type ReceiptCancellation,
  type ReceiptSnapshot,
} from "@/lib/receipt-schema";
import { makeDocument } from "./pdf.service";
import type { IssuedReceipt } from "./receipt.service";

const methods: Record<string, string> = {
  CASH: "Espèces",
  CARD: "Carte",
  TRANSFER: "Virement",
  CHECK: "Chèque",
  OTHER: "Autre",
};
const kinds: Record<string, string> = {
  COMPANY: "Entreprise",
  CLIENT: "Client",
  CUSTOMER: "Client",
  SUPPLIER: "Fournisseur",
  DRIVER: "Chauffeur",
  EMPLOYEE: "Employé",
  SALESPERSON: "Commercial",
  CASH_ACCOUNT: "Caisse / compte",
  OTHER: "Tiers",
  INDIVIDUAL: "Particulier",
  UNSPECIFIED: "Non renseigné",
  ADJUSTMENT: "Ajustement autorisé",
};
const titles: Record<string, string> = {
  PAYMENT: "Reçu d’encaissement client",
  EXPENSE: "Reçu de règlement d’une dépense",
  HANDOVER: "Reçu de remise en caisse",
  TRANSFER: "Reçu de transfert interne",
  ADJUSTMENT: "Attestation d’ajustement autorisé",
  REVERSAL: "Avis d’annulation",
  CASH_RECEIPT: "Reçu d’entrée d’argent",
};
const date = (input: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(input)) + " UTC";
const shortName = (value: string) => (value.length > 45 ? `${value.slice(0, 42)}...` : value);

export function receiptDocumentBlocks(
  snapshot: ReceiptSnapshot,
  cancellation: ReceiptCancellation,
) {
  const party = (value: ReceiptSnapshot["payer"]) =>
    `${value.name} · ${kinds[value.kind] || value.kind}${value.phone ? ` · Téléphone : ${value.phone}` : ""}`;
  return [
    ...(cancellation
      ? [
          {
            label: "OPÉRATION ANNULÉE",
            text: `Ce reçu est conservé pour l’historique. L’opération a été annulée par ${cancellation.number}, le ${date(cancellation.date)}.`,
          },
        ]
      : []),
    ...(snapshot.reversalOf
      ? [
          {
            label: "AVIS D’ANNULATION",
            text: `Écriture inverse de ${snapshot.reversalOf.number}, opération du ${date(snapshot.reversalOf.date)}. Cet avis constate l’annulation enregistrée ; il ne prouve pas à lui seul un remboursement effectif.`,
          },
        ]
      : []),
    {
      text: [
        snapshot.company.name,
        snapshot.company.address,
        snapshot.company.phone,
        snapshot.company.email,
        snapshot.company.taxNumber ? `Identifiant fiscal : ${snapshot.company.taxNumber}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    },
    {
      cells: [
        snapshot.operation.type === "REVERSAL"
          ? "MONTANT DE LA CONTRE-ÉCRITURE"
          : "MONTANT ENREGISTRÉ",
        formatMoney(snapshot.operation.amountMinor, snapshot.operation.currency),
      ],
      heading: true,
    },
    {
      cells: [
        `Opération ${snapshot.operation.number}`,
        `Date d’opération : ${date(snapshot.operation.date)}`,
      ],
    },
    { cells: ["Date d’émission du reçu", date(snapshot.issuedAt)] },
    { cells: ["Donneur / payeur enregistré", party(snapshot.payer)] },
    { cells: ["Bénéficiaire / destinataire enregistré", party(snapshot.payee)] },
    {
      text: `Circuit des fonds — Source : ${party(snapshot.source)}. Destination : ${party(snapshot.destination)}.`,
    },
    {
      cells: [
        "Mode de paiement",
        snapshot.operation.type === "REVERSAL" || snapshot.operation.type === "ADJUSTMENT"
          ? "Non applicable à cette écriture"
          : snapshot.operation.method
            ? methods[snapshot.operation.method] || "Mode non renseigné"
            : "Non renseigné",
      ],
    },
    { label: "OBJET DE L’OPÉRATION", text: snapshot.operation.description },
    ...(snapshot.operation.reference
      ? [{ cells: ["Référence", snapshot.operation.reference] }]
      : []),
    ...(snapshot.invoice || snapshot.expense || snapshot.requester
      ? [
          {
            text: [
              snapshot.invoice ? `Facture : ${snapshot.invoice.number}` : null,
              snapshot.expense ? `Dépense : ${snapshot.expense.number}` : null,
              snapshot.requester ? `Demandeur : ${snapshot.requester.name}` : null,
            ]
              .filter(Boolean)
              .join(" · "),
          },
        ]
      : []),
    ...(snapshot.operation.comment && snapshot.operation.comment !== snapshot.operation.description
      ? [{ label: "COMMENTAIRE", text: snapshot.operation.comment }]
      : []),
    {
      text: `Enregistré par : ${snapshot.recordedBy.name} · Validé par : ${snapshot.validatedBy.name} · Reçu émis par : ${snapshot.issuedBy.name}.`,
    },
    {
      text: "Reçu d’enregistrement — ne remplace pas une facture. Ce document constate l’opération inscrite au registre, sans signature électronique. Informations figées à la première émission ; annulation éventuelle actualisée à chaque téléchargement.",
    },
  ];
}

export async function renderReceiptPdf(
  snapshot: ReceiptSnapshot,
  cancellation: ReceiptCancellation = null,
) {
  const safe = receiptSnapshotSchema.parse(snapshot);
  const subtitle = cancellation
    ? "ANNULÉ — document conservé pour l’historique"
    : titles[safe.operation.type] || "Reçu d’opération financière";
  const bytes = await makeDocument(
    safe.number,
    subtitle,
    shortName(safe.company.name),
    receiptDocumentBlocks(safe, cancellation),
  );
  const doc = await PDFDocument.load(bytes);
  doc.setTitle(
    `${safe.number} · ${cancellation ? "ANNULÉ" : titles[safe.operation.type] || "Reçu"}`,
  );
  doc.setCreationDate(new Date(safe.issuedAt));
  doc.setModificationDate(new Date());
  if (cancellation) {
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    for (const page of doc.getPages())
      page.drawText("ANNULÉ", {
        x: 120,
        y: 290,
        size: 68,
        font,
        rotate: degrees(32),
        opacity: 0.13,
        color: rgb(0.8, 0.12, 0.12),
      });
  }
  return doc.save();
}

export async function receiptPdfResponse(receipt: IssuedReceipt, inline = false) {
  const bytes = await renderReceiptPdf(receipt.snapshot, receipt.cancellation);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${receipt.number}.pdf"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Referrer-Policy": "no-referrer",
    },
  });
}
