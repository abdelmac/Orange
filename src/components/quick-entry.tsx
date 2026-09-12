"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileText,
  Paperclip,
  Plus,
  Printer,
  Wallet,
} from "lucide-react";
import { money, Row, value } from "@/lib/format";
import { moneyInput, parseMoney } from "@/lib/money";
import { translate } from "@/lib/i18n";
import { allItems, post } from "./api";
import { useSession } from "./app-shell";
import { Badge, ErrorMessage } from "./ui";

type Direction = "IN" | "OUT";
interface EntryResult {
  kind: "receipt" | "expense";
  id: string;
  number: string;
  status: string;
  transactionId?: string;
}

export const partyKinds = [
  ["CLIENT", "Client"],
  ["DRIVER", "Chauffeur"],
  ["SALESPERSON", "Commercial"],
  ["EMPLOYEE", "Employé"],
  ["SUPPLIER", "Fournisseur"],
  ["OTHER", "Autre personne"],
] as const;

export function QuickEntry() {
  const { user, can } = useSession();
  const params = useSearchParams();
  const canReceive = user.role === "SALESPERSON" ? can("payments.create") : can("cash.deposit");
  const canRequest = can("expenses.create");
  const direction: Direction =
    params.get("direction") === "OUT" ? "OUT" : canReceive ? "IN" : "OUT";
  const allowed = direction === "IN" ? canReceive : canRequest;
  return (
    <div className="quick-entry-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">LE QUOTIDIEN, SIMPLEMENT</div>
          <h1>{direction === "IN" ? "Encaisser" : "Demander une dépense"}</h1>
          <p>
            {direction === "IN"
              ? "Un montant, une personne, un motif. Votre reçu est prêt après l’enregistrement."
              : "Décrivez la dépense. Elle suivra ensuite le circuit de validation et de paiement."}
          </p>
        </div>
        {can("transactions.view") && (
          <Link className="button secondary" href="/journal">
            <FileText size={16} />
            Journal quotidien
          </Link>
        )}
      </div>
      <nav className="quick-direction-tabs" aria-label="Type de saisie">
        {canReceive && (
          <Link
            href="/saisie?direction=IN"
            className={direction === "IN" ? "active" : ""}
            aria-current={direction === "IN" ? "page" : undefined}
          >
            <ArrowDownLeft size={18} />
            Encaisser
          </Link>
        )}
        {!canRequest && can("expenses.pay") && (
          <Link href="/depenses?status=APPROVED">
            <Clock3 size={18} />
            Payer une dépense
          </Link>
        )}
        {canRequest && (
          <Link
            href="/saisie?direction=OUT"
            className={direction === "OUT" ? "active" : ""}
            aria-current={direction === "OUT" ? "page" : undefined}
          >
            <Clock3 size={18} />
            Demander une dépense
          </Link>
        )}
      </nav>
      {allowed ? (
        <QuickEntryForm key={direction} direction={direction} />
      ) : (
        <ErrorMessage message="Votre rôle ne permet pas d’enregistrer cette opération." />
      )}
    </div>
  );
}

function QuickEntryForm({ direction }: { direction: Direction }) {
  const { user, company, can } = useSession();
  const commercial = user.role === "SALESPERSON";
  const currency = value(company, "currency", "EUR");
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [loading, setLoading] = useState(direction === "IN" && !commercial);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [preferredAccount, setPreferredAccount] = useState("");
  const [preferredMethod, setPreferredMethod] = useState("CASH");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [result, setResult] = useState<EntryResult | null>(null);
  const [saved, setSaved] = useState({ amountMinor: "0", partyName: "", description: "" });
  const submitting = useRef(false);

  useEffect(() => {
    if (direction !== "IN" || commercial) return;
    let active = true;
    allItems<Row>("/api/cash-accounts")
      .then((items) => {
        if (active) {
          setAccounts(items.filter((account) => account.active !== false));
          setLoadError("");
        }
      })
      .catch((error) => {
        if (active) setLoadError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [direction, commercial, retry]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const amount = String(fields.amount ?? "")
      .replace(/\s/g, "")
      .replace(",", ".");
    if (!moneyInput.safeParse(amount).success || parseMoney(amount) <= 0n) {
      setError("Saisissez un montant supérieur à zéro, avec deux décimales maximum.");
      return;
    }
    const body: Row = {
      direction,
      amount,
      partyName: String(fields.partyName ?? "").trim(),
      partyKind: fields.partyKind,
      description: String(fields.description ?? "").trim(),
      method: fields.method,
      idempotencyKey,
    };
    for (const key of ["phone", "reference"])
      if (String(fields[key] ?? "").trim()) body[key] = String(fields[key]).trim();
    if (fields.date) {
      const date = new Date(String(fields.date));
      if (!Number.isFinite(date.getTime())) {
        setError("La date et l’heure indiquées sont invalides.");
        return;
      }
      body.date = date.toISOString();
    }
    if (direction === "IN") {
      if (commercial) body.salespersonId = user.id;
      else body.cashAccountId = accounts.length === 1 ? accounts[0].id : fields.cashAccountId;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const created = await post<EntryResult>("/api/quick-entries", body);
      setSaved({
        amountMinor: parseMoney(amount).toString(),
        partyName: String(body.partyName),
        description: String(body.description),
      });
      setResult(created);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "L’opération n’a pas pu être enregistrée. Vous pouvez réessayer.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  function restart() {
    setResult(null);
    setError("");
    setIdempotencyKey(crypto.randomUUID());
  }
  if (result) {
    const receipt = result.kind === "receipt";
    const reversed = receipt && result.status === "REVERSED";
    const target = receipt
      ? `/transactions?detail=${result.transactionId}`
      : `/depenses?detail=${result.id}`;
    return (
      <section className="card quick-success" role="status" aria-live="polite">
        <span className={`quick-success-icon ${receipt && !reversed ? "" : "pending"}`}>
          {receipt && !reversed ? <CheckCircle2 size={32} /> : <Clock3 size={32} />}
        </span>
        <h2>
          {receipt
            ? reversed
              ? "Cet encaissement a été annulé"
              : "Encaissement enregistré"
            : result.status === "PENDING"
              ? "Demande envoyée à validation"
              : "Dépense déjà enregistrée"}
        </h2>
        <p>{result.number}</p>
        <strong className="quick-success-amount">{money(saved.amountMinor, currency)}</strong>
        <p className="quick-success-party">
          {saved.partyName} · {saved.description}
        </p>
        <Badge status={result.status} />
        {reversed && (
          <p className="quick-workflow-note">
            La saisie précédente est conservée dans l’historique avec son annulation. Aucun nouvel
            encaissement n’a été créé.
          </p>
        )}
        {!receipt && (
          <p className="quick-workflow-note">
            {result.status === "PAID"
              ? "Le paiement a déjà été effectué. Retrouvez son historique dans la fiche."
              : result.status === "REJECTED"
                ? "Cette demande a été refusée. Elle ne peut pas être payée ; son historique reste consultable."
                : "Cette demande ne débite aucune caisse. Une personne autorisée doit la valider, puis enregistrer son paiement."}
          </p>
        )}
        <div className="quick-success-actions">
          {receipt && result.transactionId && (
            <>
              <a
                className="button primary"
                href={`/api/transactions/${result.transactionId}/receipt`}
              >
                <Download size={17} />
                Télécharger le reçu
              </a>
              <a
                className="button secondary"
                href={`/api/transactions/${result.transactionId}/receipt?inline=1`}
                target="_blank"
                rel="noreferrer"
              >
                <Printer size={17} />
                Imprimer
              </a>
            </>
          )}
          {(!receipt || result.transactionId) && (
            <Link className="button secondary" href={target}>
              <Paperclip size={17} />
              {can("attachments.create") ? "Ajouter un justificatif" : "Consulter le détail"}
            </Link>
          )}
        </div>
        <div className="quick-success-footer">
          <button className="button secondary" type="button" onClick={restart}>
            <Plus size={17} />
            {receipt ? "Nouvel encaissement" : "Nouvelle demande"}
          </button>
          {can("transactions.view") && (
            <Link className="text-link" href="/journal">
              Voir le journal
              <ArrowRight size={15} />
            </Link>
          )}
          {!receipt && (
            <Link className="text-link" href={target}>
              Suivre la dépense
              <ArrowRight size={15} />
            </Link>
          )}
        </div>
      </section>
    );
  }
  const noAccount =
    direction === "IN" && !commercial && !loading && !loadError && accounts.length === 0;
  return (
    <section className="card quick-entry-card">
      <form method="post" onSubmit={submit} className="quick-entry-form">
        <label className="quick-amount-field">
          <span>
            {direction === "IN" ? "Quel montant avez-vous reçu ?" : "Quel montant demandez-vous ?"}
          </span>
          <div>
            <input
              name="amount"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              required
              autoFocus
              autoComplete="off"
              aria-label="Montant"
              maxLength={22}
            />
            <span>{currency === "EUR" ? "€" : currency}</span>
          </div>
        </label>
        {error && <ErrorMessage message={error} />}{" "}
        {loadError && (
          <ErrorMessage
            message={loadError}
            retry={() => {
              setLoading(true);
              setRetry((number) => number + 1);
            }}
          />
        )}{" "}
        {noAccount && (
          <div className="quick-empty-account">
            <Wallet size={22} />
            <div>
              <strong>Aucune caisse disponible</strong>
              <p>
                {can("cash.create")
                  ? "Créez une caisse pour y enregistrer cet encaissement."
                  : "Demandez à votre administrateur de vous attribuer une caisse active."}
              </p>
              {can("cash.create") && (
                <Link className="text-link" href="/caisse?new=1">
                  Créer une caisse
                  <ArrowRight size={15} />
                </Link>
              )}
            </div>
          </div>
        )}
        <div className="quick-person-grid">
          <label className="field">
            <span>{direction === "IN" ? "Reçu de" : "Bénéficiaire"}</span>
            <select name="partyKind" defaultValue={direction === "IN" ? "CLIENT" : "SUPPLIER"}>
              {partyKinds.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Nom de la personne ou de l’entreprise *</span>
            <input
              name="partyName"
              placeholder="Ex. Jean Dupont"
              required
              maxLength={200}
              autoComplete="name"
            />
          </label>
        </div>
        <label className="field">
          <span>{direction === "IN" ? "Pour quel motif ?" : "Objet de la dépense"} *</span>
          <input
            name="description"
            placeholder={
              direction === "IN"
                ? "Ex. Livraison, transport, acompte…"
                : "Ex. Carburant, fournitures, réparation…"
            }
            minLength={3}
            maxLength={500}
            required
          />
        </label>
        <div className="quick-payment-grid">
          <label className="field">
            <span>Mode de paiement{direction === "OUT" ? " prévu" : ""}</span>
            <select
              name="method"
              value={preferredMethod}
              onChange={(event) => setPreferredMethod(event.target.value)}
            >
              {["CASH", "CARD", "TRANSFER", "CHECK", "OTHER"].map((method) => (
                <option key={method} value={method}>
                  {translate(method)}
                </option>
              ))}
            </select>
          </label>
          {direction === "IN" && !commercial && accounts.length > 1 && (
            <label className="field">
              <span>Caisse destinataire *</span>
              <select
                name="cashAccountId"
                required
                value={preferredAccount}
                onChange={(event) => setPreferredAccount(event.target.value)}
              >
                <option value="">Choisir une caisse…</option>
                {accounts.map((account) => (
                  <option key={value(account, "id")} value={value(account, "id")}>
                    {value(account, "name")}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {direction === "IN" && (
          <div className="quick-destination">
            <Wallet size={17} />
            {commercial ? (
              "Cet argent sera ajouté à votre portefeuille commercial."
            ) : loading ? (
              "Chargement des caisses…"
            ) : accounts.length === 1 ? (
              <>
                Versement dans <strong>{value(accounts[0], "name")}</strong>
              </>
            ) : (
              "Le montant sera ajouté à la caisse choisie."
            )}
          </div>
        )}
        {direction === "OUT" && (
          <div className="quick-destination">
            <Clock3 size={17} />À valider, puis à payer. La caisse reste inchangée à l’envoi de la
            demande.
          </div>
        )}
        <details className="quick-extra">
          <summary>
            Ajouter des précisions <span>facultatif</span>
            <ChevronDown size={16} />
          </summary>
          <div className="quick-extra-grid">
            <label className="field">
              <span>Téléphone</span>
              <input name="phone" type="tel" autoComplete="tel" maxLength={60} />
            </label>
            <label className="field">
              <span>Référence</span>
              <input name="reference" maxLength={200} placeholder="Ex. Livraison n° 42" />
            </label>
            <label className="field full-width">
              <span>Date et heure locales</span>
              <input name="date" type="datetime-local" />
              <small>Sans précision, la date et l’heure de l’enregistrement sont utilisées.</small>
            </label>
          </div>
        </details>
        <button
          className="button primary quick-submit"
          type="submit"
          disabled={busy || loading || Boolean(loadError) || noAccount}
        >
          {busy ? (
            <span className="spinner small" />
          ) : direction === "IN" ? (
            <ArrowDownLeft size={20} />
          ) : (
            <Clock3 size={19} />
          )}{" "}
          {busy
            ? "Enregistrement…"
            : direction === "IN"
              ? "Enregistrer l’encaissement"
              : "Envoyer pour validation"}
          <ArrowRight size={18} />
        </button>
        {direction === "IN" && can("payments.create") && (
          <Link className="quick-invoice-link" href="/encaissements?new=1">
            <FileText size={15} />
            Ce paiement concerne une facture ? <span>Régler une facture</span>
            <ArrowRight size={14} />
          </Link>
        )}
      </form>
    </section>
  );
}
