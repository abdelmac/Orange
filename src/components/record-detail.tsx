"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Download, FileText, Paperclip, Printer, Upload } from "lucide-react";
import { date, money, related, Row, rows, value, invoiceStatus } from "@/lib/format";
import { api } from "./api";
import { useSession } from "./app-shell";
import { Badge, ErrorMessage } from "./ui";
import { ModuleConfig } from "./module-config";

export function RecordDetail({ record, config }: { record: Row; config: ModuleConfig }) {
  const [data, setData] = useState(record),
    [files, setFiles] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [uploading, setUploading] = useState(false),
    [success, setSuccess] = useState("");
  const { company, can } = useSession();
  const id = value(record, "id");
  const loadFiles = useCallback(() => {
    if (config.entity)
      api<{ items: Row[] }>(`/api/attachments?entityType=${config.entity}&entityId=${id}`)
        .then((d) => setFiles(d.items))
        .catch((e) => setError(e.message));
  }, [config.entity, id]);
  useEffect(() => {
    let active = true;
    api<Row>(`/api/${config.endpoint}/${id}`)
      .then((r) => {
        if (active) setData((r.item ?? r) as Row);
      })
      .catch(() => {});
    loadFiles();
    return () => {
      active = false;
    };
  }, [config.endpoint, id, loadFiles]);
  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setUploading(true);
    const form = e.currentTarget;
    const body = new FormData(form);
    body.set("entityType", config.entity!);
    body.set("entityId", id);
    try {
      await api("/api/attachments", { method: "POST", body });
      setSuccess("Justificatif ajouté.");
      form.reset();
      loadFiles();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Téléversement impossible.");
    } finally {
      setUploading(false);
    }
  }
  const fields: Record<string, string> = {
    name: "Nom",
    number: "Numéro",
    description: "Description",
    businessName: "Entreprise",
    email: "Email",
    phone: "Téléphone",
    address: "Adresse",
    city: "Ville",
    country: "Pays",
    taxNumber: "Identifiant fiscal",
    bankDetails: "Coordonnées bancaires",
    reference: "Référence",
    comment: "Commentaire",
    notes: "Notes",
    terms: "Conditions",
    currency: "Devise",
    date: "Date",
    dueDate: "Échéance",
    createdAt: "Créé le",
    ip: "Adresse IP",
    action: "Action",
    entity: "Objet",
    entityId: "Identifiant de l’objet",
    sourceLabel: "Origine",
    destinationLabel: "Destination",
    sourceType: "Type d’origine",
    destinationType: "Type de destination",
    reversalOfId: "Transaction annulée",
  };
  const details = Object.entries(fields).filter(
    ([key]) => data[key] !== undefined && data[key] !== null && data[key] !== "",
  );
  const receiptEntity =
    config.endpoint === "transactions" && data.type !== "REVERSAL"
      ? "transaction"
      : config.endpoint === "payments"
        ? "payment"
        : config.endpoint === "expenses" && data.status === "PAID"
          ? "expense"
          : null;
  const receiptUrl = receiptEntity ? `/api/receipts?entity=${receiptEntity}&id=${id}` : null;
  const relatedLists = [
    ["sales", "Ventes"],
    ["invoices", "Factures"],
    ["payments", "Paiements"],
    ["expenses", "Dépenses"],
    ["transactions", "Historique financier"],
    ["clients", "Clients"],
  ];
  return (
    <div className="record-detail">
      {error && <ErrorMessage message={error} />}
      <div className="detail-summary">
        <div>
          <span className="eyebrow">{config.title}</span>
          <h3>{value(data, "name", value(data, "number", value(data, "description")))}</h3>
          {Boolean(data.status) && (
            <Badge status={config.endpoint === "invoices" ? invoiceStatus(data) : data.status} />
          )}
        </div>
        {(data.totalMinor !== undefined ||
          data.amountMinor !== undefined ||
          data.heldMinor !== undefined ||
          data.balanceMinor !== undefined) && (
          <strong>
            {money(
              data.totalMinor ?? data.amountMinor ?? data.heldMinor ?? data.balanceMinor,
              value(company, "currency", "EUR"),
            )}
          </strong>
        )}
      </div>
      {receiptUrl && (
        <div className="record-receipt-actions">
          <a className="button secondary" href={receiptUrl}>
            <Download size={16} />
            Télécharger le reçu
          </a>
          <a
            className="button secondary"
            href={`${receiptUrl}&inline=1`}
            target="_blank"
            rel="noreferrer"
          >
            <Printer size={16} />
            Imprimer le reçu
          </a>
          {(Boolean(data.reversal) || data.status === "REVERSED") && (
            <span className="text-red">Ce reçu porte la mention « Annulé ».</span>
          )}
        </div>
      )}
      {config.endpoint === "invoices" && (
        <div className="invoice-summary">
          <div>
            <span>Total facture</span>
            <strong>{money(data.totalMinor)}</strong>
          </div>
          <div>
            <span>Déjà réglé</span>
            <strong className="text-green">{money(data.paidMinor)}</strong>
          </div>
          <div>
            <span>Reste à payer</span>
            <strong>
              {money(
                data.status === "CANCELLED"
                  ? 0n
                  : BigInt(String(data.totalMinor ?? 0)) - BigInt(String(data.paidMinor ?? 0)),
              )}
            </strong>
          </div>
          <a
            className="button secondary"
            href={`/api/invoices/${id}/pdf`}
            target="_blank"
            rel="noreferrer"
          >
            <Download size={16} />
            Télécharger / imprimer
          </a>
        </div>
      )}
      {config.endpoint === "sales" && Boolean(data.invoice) && (
        <Link
          className="button secondary"
          href={`/factures?detail=${value(related(data, "invoice"), "id")}`}
        >
          <FileText size={17} />
          Consulter {value(related(data, "invoice"), "number", "la facture")}
        </Link>
      )}
      <dl className="detail-fields">
        {details.map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>
              {["date", "dueDate", "createdAt"].includes(key)
                ? date(data[key], key === "createdAt")
                : String(data[key])}
            </dd>
          </div>
        ))}
        {[
          ["client", "Client"],
          ["supplier", "Fournisseur"],
          ["salesperson", "Commercial"],
          ["requester", "Demandeur"],
          ["approver", "Approbateur"],
          ["creator", "Créateur"],
          ["validator", "Validateur"],
          ["cashAccount", "Caisse"],
          ["responsible", "Responsable"],
        ]
          .filter(([key]) => data[key])
          .map(([key, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{value(related(data, key), "name")}</dd>
            </div>
          ))}
      </dl>
      {rows(data.lines).length > 0 && (
        <div className="detail-section">
          <h3>Lignes de la facture</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Désignation</th>
                  <th>Qté</th>
                  <th>Prix HT</th>
                  <th>TVA</th>
                  <th className="align-right">Total TTC</th>
                </tr>
              </thead>
              <tbody>
                {rows(data.lines).map((line, i) => (
                  <tr key={i}>
                    <td>{value(line, "description")}</td>
                    <td>{value(line, "quantity")}</td>
                    <td>{value(line, "unitPrice")}</td>
                    <td>{value(line, "taxPercent")}%</td>
                    <td className="align-right amount">{money(line.totalMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {relatedLists
        .filter(([key]) => rows(data[key]).length)
        .map(([key, label]) => (
          <section className="detail-section" key={key}>
            <h3>{label}</h3>
            {rows(data[key]).map((r, i) => (
              <div className="report-row" key={value(r, "id", String(i))}>
                <span>{value(r, "number", value(r, "name", value(r, "description")))}</span>
                {Boolean(r.status) && <Badge status={r.status} />}
                <strong>{money(r.amountMinor ?? r.totalMinor)}</strong>
              </div>
            ))}
          </section>
        ))}
      {config.endpoint === "audit" && (
        <section className="detail-section">
          <h3>Détail de la modification</h3>
          <div className="audit-values">
            <div>
              <h4>Anciennes valeurs</h4>
              <pre>{JSON.stringify(data.before ?? data.oldValues ?? null, null, 2)}</pre>
            </div>
            <div>
              <h4>Nouvelles valeurs</h4>
              <pre>{JSON.stringify(data.after ?? data.newValues ?? null, null, 2)}</pre>
            </div>
          </div>
        </section>
      )}
      {config.entity && (
        <section className="detail-section attachments">
          <h3>
            <Paperclip size={18} />
            Justificatifs privés <span className="count">{files.length}</span>
          </h3>
          {files.map((file) => (
            <a
              className="attachment-file"
              href={`/api/attachments/${value(file, "id")}`}
              target="_blank"
              rel="noreferrer"
              key={value(file, "id")}
            >
              <FileText size={20} />
              <span>
                <strong>{value(file, "filename", value(file, "originalName", "Document"))}</strong>
                <small>
                  {Math.ceil(Number(file.size ?? 0) / 1024)} Ko · {date(file.createdAt)}
                </small>
              </span>
              <Download size={17} />
            </a>
          ))}
          {success && (
            <p className="text-green" role="status">
              {success}
            </p>
          )}
          {can("attachments.create") && (
            <form className="attachment-upload" onSubmit={upload}>
              <Upload size={24} />
              <div>
                <strong>Joindre une photo ou un document</strong>
                <p>Image JPEG, PNG, WebP ou PDF · 10 Mo maximum</p>
              </div>
              <label className="field">
                <span>Choisir un fichier ou prendre une photo</span>
                <input
                  type="file"
                  name="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  required
                />
              </label>
              <button className="button secondary" disabled={uploading}>
                {uploading ? "Envoi en cours…" : "Ajouter le justificatif"}
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
