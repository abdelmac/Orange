"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { money, related, Row, value } from "@/lib/format";
import { translate } from "@/lib/i18n";
import { api } from "./api";
import { useSession } from "./app-shell";
import { Badge, Empty, ErrorMessage, Loading } from "./ui";
import { partyKinds } from "./quick-entry";

interface DaybookResult {
  items: Row[];
  totals: { inMinor: string; outMinor: string; netMinor: string };
  total: number;
  page: number;
  pageSize: number;
}
function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function dayBounds(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  const from = new Date(year, month - 1, date),
    to = new Date(year, month - 1, date + 1);
  if (!Number.isFinite(from.getTime()) || localDay(from) !== day) return null;
  return { from: from.toISOString(), to: to.toISOString() };
}
function shiftDay(day: string, step: number) {
  const [year, month, date] = day.split("-").map(Number);
  return localDay(new Date(year, month - 1, date + step));
}
function partyLabel(row: Row) {
  return value(
    row,
    "partyName",
    value(
      related(row, "client"),
      "name",
      value(
        related(row, "supplier"),
        "name",
        value(row, "sourceLabel", value(row, "destinationLabel")),
      ),
    ),
  );
}
function partyType(row: Row) {
  return partyKinds.find(([kind]) => kind === row.partyKind)?.[1] ?? "";
}
function time(row: Row) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(value(row, "date")),
  );
}
function OperationAmount({ row, currency }: { row: Row; currency: string }) {
  return (
    <strong
      className={`amount ${row.direction === "IN" ? "text-green" : row.direction === "OUT" ? "text-red" : ""}`}
    >
      {row.direction === "IN" ? "+ " : row.direction === "OUT" ? "− " : ""}
      {money(row.amountMinor, currency)}
    </strong>
  );
}
function ReceiptLink({ row }: { row: Row }) {
  if (row.type === "REVERSAL" || row.reversalOfId)
    return <span className="daybook-reversal">Écriture d’annulation</span>;
  return (
    <a
      className="daybook-receipt"
      href={`/api/transactions/${value(row, "id")}/receipt`}
      title={row.reversed ? "Télécharger le reçu portant la mention Annulé" : "Télécharger le reçu"}
    >
      <Download size={15} />
      {row.reversed ? "Reçu annulé" : "Reçu"}
    </a>
  );
}
function OperationIcon({ row }: { row: Row }) {
  return (
    <span className={`operation-icon ${row.direction === "OUT" ? "out" : "in"}`}>
      {row.direction === "IN" ? (
        <ArrowDownLeft size={18} />
      ) : row.direction === "OUT" ? (
        <ArrowUpRight size={18} />
      ) : (
        <ArrowLeftRight size={18} />
      )}
    </span>
  );
}

export function Daybook() {
  const { user, company, can } = useSession();
  const [day, setDay] = useState(() => localDay()),
    [page, setPage] = useState(1),
    [query, setQuery] = useState("");
  const [data, setData] = useState<DaybookResult | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const allowed = can("transactions.view"),
    currency = value(company, "currency", "EUR");
  const own = user.role === "SALESPERSON" || user.role === "CASHIER";
  const canReceive = user.role === "SALESPERSON" ? can("payments.create") : can("cash.deposit");
  useEffect(() => {
    if (!allowed || !dayBounds(day)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      const bounds = dayBounds(day)!;
      const params = new URLSearchParams({
        ...bounds,
        page: String(page),
        pageSize: "25",
        q: query,
      });
      api<DaybookResult>(`/api/daybook?${params}`, { signal: controller.signal })
        .then((result) => {
          if (!controller.signal.aborted) setData(result);
        })
        .catch((error) => {
          if (!controller.signal.aborted) setError(error.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [day, page, query, revision, allowed]);
  function selectDay(selected: string) {
    setDay(selected);
    setPage(1);
    setData(null);
    setError("");
    setLoading(Boolean(dayBounds(selected)));
  }
  if (!allowed)
    return <ErrorMessage message="Votre rôle ne permet pas de consulter le journal financier." />;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div className="daybook-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CHAQUE OPÉRATION, AU FIL DE LA JOURNÉE</div>
          <h1>Journal quotidien</h1>
          <p>
            {own
              ? "Les entrées et sorties de vos caisses ou de votre portefeuille."
              : "Les mouvements d’argent de votre entreprise, réunis par jour."}
          </p>
        </div>
        <div className="heading-actions">
          {canReceive && (
            <Link className="button primary" href="/saisie?direction=IN">
              <Plus size={17} />
              Encaisser
            </Link>
          )}
          {!can("expenses.create") && can("expenses.pay") && (
            <Link className="button secondary" href="/depenses?status=APPROVED">
              Payer une dépense
            </Link>
          )}
          {can("expenses.create") && (
            <Link className="button secondary" href="/saisie?direction=OUT">
              Demander une dépense
            </Link>
          )}
        </div>
      </div>
      <div className="daybook-toolbar">
        <div className="daybook-date">
          <CalendarDays size={18} />
          <button
            className="icon-button"
            type="button"
            aria-label="Jour précédent"
            onClick={() => selectDay(shiftDay(day || localDay(), -1))}
          >
            <ChevronLeft size={19} />
          </button>
          <label>
            <span className="sr-only">Journée du journal</span>
            <input
              type="date"
              value={day}
              onChange={(event) => selectDay(event.target.value)}
              required
            />
          </label>
          <button
            className="icon-button"
            type="button"
            aria-label="Jour suivant"
            onClick={() => selectDay(shiftDay(day || localDay(), 1))}
          >
            <ChevronRight size={19} />
          </button>
          <button className="text-link" type="button" onClick={() => selectDay(localDay())}>
            Aujourd’hui
          </button>
        </div>
        <button
          className="button secondary"
          type="button"
          disabled={loading}
          onClick={() => setRevision((number) => number + 1)}
        >
          <RefreshCw size={15} />
          Actualiser
        </button>
      </div>
      {error && (
        <ErrorMessage message={error} retry={() => setRevision((number) => number + 1)} />
      )}{" "}
      {!dayBounds(day) ? (
        <Empty
          title="Choisissez une journée"
          description="Sélectionnez une date pour consulter les mouvements correspondants."
        />
      ) : loading && !data ? (
        <Loading />
      ) : (
        data && (
          <>
            <section
              className="daybook-totals"
              aria-label={query ? "Totaux des résultats de recherche" : "Totaux de la journée"}
              aria-busy={loading}
            >
              <article>
                <span>
                  <ArrowDownLeft size={17} />
                  {own ? "Entrées" : "Entrées externes"}
                </span>
                <strong className="text-green">{money(data.totals.inMinor, currency)}</strong>
              </article>
              <article>
                <span>
                  <ArrowUpRight size={17} />
                  {own ? "Sorties" : "Sorties externes"}
                </span>
                <strong className="text-red">{money(data.totals.outMinor, currency)}</strong>
              </article>
              <article>
                <span>
                  <ArrowLeftRight size={17} />
                  Variation nette
                </span>
                <strong>{money(BigInt(data.totals.netMinor), currency)}</strong>
              </article>
            </section>
            <p className="daybook-scope-note">
              {query &&
                "Totaux des résultats correspondant à la recherche, toutes pages comprises. "}
              {own
                ? "Totaux calculés sur les mouvements de votre périmètre autorisé."
                : "Transferts et remises internes exclus des entrées, sorties et de la variation nette."}{" "}
              Les demandes de dépenses apparaissent après leur paiement.
            </p>
            <section className="card daybook-list" aria-busy={loading}>
              <div className="collection-toolbar">
                <div className="collection-search">
                  <Search size={17} />
                  <input
                    aria-label="Rechercher dans le journal"
                    placeholder="Personne, motif, téléphone, référence, montant…"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <span className="daybook-count" role="status">
                  {loading ? "Recherche…" : `${data.total} opération${data.total > 1 ? "s" : ""}`}
                </span>
              </div>
              {data.items.length ? (
                <>
                  <div className="table-scroll daybook-desktop">
                    <table>
                      <thead>
                        <tr>
                          <th>Heure</th>
                          <th>Opération / personne</th>
                          <th>Motif / caisse</th>
                          <th>Mode</th>
                          <th>Statut</th>
                          <th className="align-right">Montant</th>
                          <th>Justificatif</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((row) => (
                          <tr key={value(row, "id")}>
                            <td>{time(row)}</td>
                            <td>
                              <div className="table-identity">
                                <OperationIcon row={row} />
                                <div>
                                  <Link href={`/transactions?detail=${value(row, "id")}`}>
                                    <strong>{partyLabel(row)}</strong>
                                  </Link>
                                  <small>
                                    {partyType(row)}
                                    {partyType(row) ? " · " : ""}
                                    {value(row, "number")}
                                  </small>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className="daybook-description">
                                {value(
                                  row,
                                  "description",
                                  value(row, "comment", translate(row.type)),
                                )}
                              </span>
                              <small className="daybook-route">
                                {value(row, "sourceLabel", "")} →{" "}
                                {value(row, "destinationLabel", "")}
                              </small>
                            </td>
                            <td>{translate(row.method)}</td>
                            <td>
                              <Badge status={row.reversed ? "REVERSED" : row.status} />
                              {row.direction === "INTERNAL" && (
                                <small className="daybook-internal">Mouvement interne</small>
                              )}
                            </td>
                            <td className="align-right">
                              <OperationAmount row={row} currency={currency} />
                            </td>
                            <td>
                              <ReceiptLink row={row} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="daybook-mobile">
                    {data.items.map((row) => (
                      <article className="daybook-operation" key={value(row, "id")}>
                        <div className="daybook-operation-top">
                          <OperationIcon row={row} />
                          <div>
                            <Link href={`/transactions?detail=${value(row, "id")}`}>
                              <strong>{partyLabel(row)}</strong>
                            </Link>
                            <small>
                              {time(row)} · {partyType(row) || translate(row.type)}
                            </small>
                          </div>
                          <OperationAmount row={row} currency={currency} />
                        </div>
                        <p>
                          {value(row, "description", value(row, "comment", translate(row.type)))}
                        </p>
                        <div className="daybook-operation-bottom">
                          <Badge status={row.reversed ? "REVERSED" : row.status} />
                          <small>
                            {row.direction === "INTERNAL" ? "Interne" : translate(row.method)}
                          </small>
                          <ReceiptLink row={row} />
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <Empty
                  title={
                    query
                      ? "Aucune opération ne correspond à cette recherche"
                      : "Aucun mouvement pour cette journée"
                  }
                  description={
                    query
                      ? "Essayez un nom, un téléphone ou une autre référence."
                      : "Les encaissements et les dépenses payées apparaîtront ici."
                  }
                />
              )}
              <div className="table-pagination">
                <span>
                  {data.total
                    ? `${(page - 1) * data.pageSize + 1}–${Math.min(page * data.pageSize, data.total)} sur ${data.total}`
                    : "0 opération"}
                </span>
                <div>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Page précédente"
                    disabled={page <= 1}
                    onClick={() => setPage((number) => number - 1)}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <span>
                    Page {page} / {totalPages}
                  </span>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Page suivante"
                    disabled={page >= totalPages}
                    onClick={() => setPage((number) => number + 1)}
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>
            </section>
          </>
        )
      )}
    </div>
  );
}
