"use client";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Filter,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Wallet,
  X,
} from "lucide-react";
import { useSession } from "./app-shell";
import { api, post, allItems } from "./api";
import { date, money, Row, rows, value, invoiceStatus } from "@/lib/format";
import { translate } from "@/lib/i18n";
import { Badge, Empty, ErrorMessage, Loading, Modal, Toast } from "./ui";
import { modules, ModuleConfig } from "./module-config";
import { FormKind, RecordForm } from "./record-form";
import { RecordDetail } from "./record-detail";
import { Dashboard } from "./dashboard";
import { Settings } from "./settings";

const formTitles: Record<FormKind, string> = {
  clients: "Nouveau client",
  suppliers: "Nouveau fournisseur",
  users: "Nouvel utilisateur",
  "cash-accounts": "Nouvelle caisse",
  sales: "Nouvelle vente & facture",
  payments: "Enregistrer un encaissement",
  expenses: "Nouvelle demande de dépense",
  handover: "Remise d’un commercial",
  transfer: "Transférer entre deux caisses",
  "pay-expense": "Payer la dépense",
  reverse: "Annuler une transaction",
  adjustment: "Ajustement autorisé",
};
interface Filters {
  q: string;
  from: string;
  to: string;
  status: string;
  minAmount: string;
  maxAmount: string;
  salespersonId: string;
  clientId: string;
  supplierId: string;
  cashAccountId: string;
  userId: string;
  type: string;
}
const initialFilters: Filters = {
  q: "",
  from: "",
  to: "",
  status: "",
  minAmount: "",
  maxAmount: "",
  salespersonId: "",
  clientId: "",
  supplierId: "",
  cashAccountId: "",
  userId: "",
  type: "",
};
export function ModulePage({ module }: { module: string }) {
  if (module === "rapports") return <Dashboard report />;
  if (module === "parametres") return <Settings />;
  const config = modules[module];
  return config ? (
    <Collection key={module} module={module} config={config} />
  ) : (
    <Empty
      title="Cette page n’existe pas"
      description="Utilisez le menu pour retrouver votre espace."
    />
  );
}

function Collection({ module, config }: { module: string; config: ModuleConfig }) {
  const queryString = useSearchParams().toString();
  const { user, company, can } = useSession();
  const [portfolio, setPortfolio] = useState<Row | null>(null);
  const [data, setData] = useState<Row[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const [filters, setFilters] = useState<Filters>(initialFilters),
    [advanced, setAdvanced] = useState(false),
    [page, setPage] = useState(1),
    [lookups, setLookups] = useState<Record<string, Row[]>>({});
  const [form, setForm] = useState<{ kind: FormKind; record?: Row } | null>(null),
    [detail, setDetail] = useState<Row | null>(null),
    [confirmation, setConfirmation] = useState<{
      action: "approve" | "reject" | "cancel-invoice";
      record: Row;
    } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false),
    [confirmError, setConfirmError] = useState("");
  const load = useCallback(() => {
    setError("");
    const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    params.set("page", String(page));
    params.set("pageSize", "12");
    api<{ items: Row[] }>(`/api/${config.endpoint}?${params}`)
      .then((result) => {
        setData(result.items);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [config.endpoint, filters, page]);
  useEffect(() => {
    const timer = setTimeout(load, 150);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const params = new URLSearchParams(queryString);
    const timer = setTimeout(() => {
      const detailId = params.get("detail");
      if (detailId)
        api<Row>(`/api/${config.endpoint}/${detailId}`)
          .then(setDetail)
          .catch((e) => setError(e.message));
      if (params.has("new") && config.create && can(config.createPermission!))
        setForm({ kind: config.create });
      if (params.get("action") === "handover" && can("cash.handover"))
        setForm({ kind: "handover" });
    }, 0);
    return () => clearTimeout(timer);
  }, [config, can, queryString]);
  useEffect(() => {
    if (!advanced) return;
    let active = true;
    const collections = ["clients", "suppliers", "salespeople", "cash-accounts", "users"];
    Promise.all(
      collections.map(async (k) => {
        try {
          return [k, await allItems<Row>(`/api/${k}`)] as const;
        } catch {
          return [k, []] as const;
        }
      }),
    ).then((items) => {
      if (active) setLookups(Object.fromEntries(items));
    });
    return () => {
      active = false;
    };
  }, [advanced]);
  useEffect(() => {
    if (module === "caisse" && user.role === "SALESPERSON")
      api<{ items: Row[] }>("/api/salespeople")
        .then((d) => setPortfolio(d.items.find((r) => r.id === user.id) ?? null))
        .catch(() => {});
  }, [module, user.role, user.id, data]);
  const setFilter = (key: keyof Filters, text: string) => {
    setFilters((f) => ({ ...f, [key]: text }));
    setPage(1);
  };
  const success = () => {
    setForm(null);
    setConfirmation(null);
    setToast("Opération enregistrée avec succès.");
    load();
  };
  const clearToast = useCallback(() => setToast(""), []);
  if (!can(config.permission))
    return <ErrorMessage message="Votre rôle ne permet pas de consulter cet espace." />;
  const visible = data;
  const pageSize = 12,
    displayed = visible,
    hasNext = data.length === pageSize;
  const statuses = ["ventes", "factures"].includes(module)
    ? ["ISSUED", "INVOICED", "PARTIALLY_PAID", "PAID", "CANCELLED"]
    : module === "depenses"
      ? ["PENDING", "APPROVED", "PAID", "REJECTED"]
      : module === "encaissements"
        ? ["VALIDATED", "REVERSED"]
        : module === "transactions"
          ? ["VALIDATED"]
          : [];
  const sum = (key: string) => data.reduce((n, r) => n + BigInt(String(r[key] ?? 0)), 0n);
  function rowActions(r: Row) {
    return (
      <div className="row-actions">
        <button
          className="icon-button"
          title="Consulter le détail"
          aria-label={`Consulter ${value(r, "number", value(r, "name", value(r, "description")))}`}
          onClick={() => setDetail(r)}
        >
          <Eye size={16} />
        </button>
        {config.editPermission &&
          can(config.editPermission) &&
          config.create &&
          (module !== "depenses" ||
            (["PENDING", "DRAFT"].includes(value(r, "status")) &&
              (r.requesterId === user.id || user.role === "ADMIN"))) && (
            <button
              className="icon-button"
              title="Modifier"
              aria-label="Modifier"
              onClick={() => setForm({ kind: config.create!, record: r })}
            >
              <Pencil size={15} />
            </button>
          )}
        {module === "factures" && (
          <>
            <a
              className="icon-button"
              href={`/api/invoices/${value(r, "id")}/pdf`}
              title="Télécharger la facture PDF"
              aria-label="Télécharger PDF"
              target="_blank"
              rel="noreferrer"
            >
              <Download size={16} />
            </a>
            {can("payments.create") && !["PAID", "CANCELLED"].includes(value(r, "status")) && (
              <button
                className="row-action-button"
                onClick={() => setForm({ kind: "payments", record: { invoiceId: r.id } })}
              >
                <ArrowDownLeft size={14} />
                Encaisser
              </button>
            )}
            {can("invoices.edit") && r.status !== "CANCELLED" && String(r.paidMinor) === "0" && (
              <button
                className="icon-button danger"
                aria-label="Annuler la facture"
                title="Annuler la facture"
                onClick={() => {
                  setConfirmError("");
                  setConfirmation({ action: "cancel-invoice", record: r });
                }}
              >
                <RotateCcw size={15} />
              </button>
            )}
          </>
        )}
        {module === "depenses" && (
          <>
            {r.status === "PENDING" &&
              can("expenses.validate") &&
              (r.requesterId !== user.id || user.role === "ADMIN") && (
                <button
                  className="row-action-button green"
                  onClick={() => {
                    setConfirmError("");
                    setConfirmation({ action: "approve", record: r });
                  }}
                >
                  <Check size={14} />
                  Valider
                </button>
              )}
            {r.status === "PENDING" &&
              can("expenses.reject") &&
              (r.requesterId !== user.id || user.role === "ADMIN") && (
                <button
                  className="icon-button danger"
                  title="Refuser"
                  aria-label="Refuser la dépense"
                  onClick={() => {
                    setConfirmError("");
                    setConfirmation({ action: "reject", record: r });
                  }}
                >
                  <X size={15} />
                </button>
              )}
            {r.status === "APPROVED" && can("expenses.pay") && (
              <button
                className="row-action-button"
                onClick={() => setForm({ kind: "pay-expense", record: r })}
              >
                Payer
                <ArrowRight size={14} />
              </button>
            )}
          </>
        )}
        {module === "transactions" &&
          can("transactions.reverse") &&
          r.type !== "REVERSAL" &&
          !r.reversedBy &&
          !r.reversal && (
            <button
              className="icon-button danger"
              title="Créer une annulation"
              aria-label="Annuler la transaction"
              onClick={() => setForm({ kind: "reverse", record: r })}
            >
              <RotateCcw size={15} />
            </button>
          )}
      </div>
    );
  }
  async function approve(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!confirmation) return;
    setConfirmBusy(true);
    setConfirmError("");
    try {
      await post(
        confirmation.action === "cancel-invoice"
          ? `/api/invoices/${value(confirmation.record, "id")}/cancel`
          : `/api/expenses/${value(confirmation.record, "id")}/${confirmation.action}`,
        Object.fromEntries(new FormData(e.currentTarget)),
      );
      success();
    } catch (error) {
      setConfirmError(error instanceof Error ? error.message : "L’opération a échoué.");
    } finally {
      setConfirmBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {["clients", "commerciaux", "fournisseurs", "utilisateurs"].includes(module)
              ? "VOTRE ENTREPRISE"
              : "GESTION FINANCIÈRE"}
          </div>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
        <div className="heading-actions">
          {can("reports.export") && (
            <a
              className="button secondary"
              href={`/api/exports?type=${config.endpoint}&format=csv&${new URLSearchParams(Object.entries(filters).filter(([, v]) => v))}`}
            >
              <Download size={16} />
              Exporter
            </a>
          )}
          {config.create && can(config.createPermission!) && (
            <button className="button primary" onClick={() => setForm({ kind: config.create! })}>
              <Plus size={17} />
              {config.createLabel}
            </button>
          )}
        </div>
      </div>
      {module === "caisse" && (
        <>
          <div className="cash-page-summary">
            <div>
              <span>
                {user.role === "SALESPERSON"
                  ? "Mon portefeuille commercial"
                  : `Solde des caisses · page ${page}`}
              </span>
              <strong>
                {money(
                  user.role === "SALESPERSON" ? portfolio?.heldMinor : sum("balanceMinor"),
                  value(company, "currency", "EUR"),
                )}
              </strong>
              <small>
                {user.role === "SALESPERSON"
                  ? "Fonds encaissés à remettre à la caisse"
                  : "Calculée à partir des mouvements validés"}
              </small>
            </div>
            <Wallet size={44} />
            <div className="cash-page-actions">
              {can("cash.handover") && (
                <button className="button white" onClick={() => setForm({ kind: "handover" })}>
                  <ArrowDownLeft size={17} />
                  Remise commercial
                </button>
              )}
              {can("cash.transfer") && (
                <button
                  className="button ghost-white"
                  onClick={() => setForm({ kind: "transfer" })}
                >
                  <ArrowLeftRight size={17} />
                  Transfert entre caisses
                </button>
              )}
              {can("cash.adjust") && (
                <button
                  className="button ghost-white"
                  onClick={() => setForm({ kind: "adjustment" })}
                >
                  <Plus size={16} />
                  Ajustement
                </button>
              )}
            </div>
          </div>
        </>
      )}
      {module === "commerciaux" && (
        <div className="mini-metrics">
          <div>
            <span>Commerciaux · page {page}</span>
            <strong>
              {data.length} <small>collaborateurs</small>
            </strong>
          </div>
          <div>
            <span>Ventes · page {page}</span>
            <strong>{money(sum("salesMinor"))}</strong>
          </div>
          <div>
            <span>Fonds à remettre · page {page}</span>
            <strong className="text-orange">{money(sum("heldMinor"))}</strong>
          </div>
        </div>
      )}
      {module === "factures" && (
        <div className="mini-metrics">
          <div>
            <span>Facturé · page {page}</span>
            <strong>{money(sum("totalMinor"))}</strong>
          </div>
          <div>
            <span>Reçu · page {page}</span>
            <strong className="text-green">{money(sum("paidMinor"))}</strong>
          </div>
          <div>
            <span>Reste à encaisser · page {page}</span>
            <strong className="text-orange">{money(sum("remainingMinor"))}</strong>
          </div>
        </div>
      )}
      {module === "depenses" && (
        <div className="expense-workflow">
          {[
            ["PENDING", "À valider"],
            ["APPROVED", "À payer"],
            ["PAID", "Payées"],
            ["REJECTED", "Refusées"],
          ].map(([status, label]) => (
            <button
              key={status}
              className={filters.status === status ? "selected" : ""}
              onClick={() => setFilter("status", filters.status === status ? "" : status)}
            >
              <span className={`workflow-dot status-${status.toLowerCase()}`} />
              {label}
            </button>
          ))}
        </div>
      )}
      <section className="card collection-card">
        <div className="collection-toolbar">
          <div className="collection-search">
            <Search size={17} />
            <input
              placeholder={`Rechercher ${module === "audit" ? "une action" : "un nom, une référence…"}`}
              aria-label="Rechercher dans la liste"
              value={filters.q}
              onChange={(e) => setFilter("q", e.target.value)}
            />
          </div>
          <div className="collection-filter-controls">
            {statuses.length > 0 && (
              <select
                aria-label="Filtrer par statut"
                value={filters.status}
                onChange={(e) => setFilter("status", e.target.value)}
              >
                <option value="">Tous les statuts</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {translate(status)}
                  </option>
                ))}
              </select>
            )}
            <button
              className={`button secondary ${advanced ? "selected" : ""}`}
              onClick={() => setAdvanced(!advanced)}
            >
              <Filter size={15} />
              Filtres
              {Object.values(filters).filter(Boolean).length > 0 && (
                <span className="count">{Object.values(filters).filter(Boolean).length}</span>
              )}
            </button>
          </div>
        </div>
        {advanced && (
          <div className="advanced-filters">
            <label className="field">
              <span>Du</span>
              <input
                type="date"
                value={filters.from}
                onChange={(e) => setFilter("from", e.target.value)}
              />
            </label>
            <label className="field">
              <span>Au</span>
              <input
                type="date"
                value={filters.to}
                onChange={(e) => setFilter("to", e.target.value)}
              />
            </label>
            <label className="field">
              <span>Montant minimum</span>
              <input
                inputMode="decimal"
                value={filters.minAmount}
                onChange={(e) => setFilter("minAmount", e.target.value)}
                placeholder="0.00"
              />
            </label>
            <label className="field">
              <span>Montant maximum</span>
              <input
                inputMode="decimal"
                value={filters.maxAmount}
                onChange={(e) => setFilter("maxAmount", e.target.value)}
                placeholder="10 000.00"
              />
            </label>
            {(
              [
                ["salespersonId", "Commercial", "salespeople"],
                ["clientId", "Client", "clients"],
                ["supplierId", "Fournisseur", "suppliers"],
                ["cashAccountId", "Caisse", "cash-accounts"],
                ["userId", "Utilisateur", "users"],
              ] as const
            )
              .filter(([, , key]) => rows(lookups[key]).length > 0)
              .map(([key, label, lookup]) => (
                <label className="field" key={key}>
                  <span>{label}</span>
                  <select value={filters[key]} onChange={(e) => setFilter(key, e.target.value)}>
                    <option value="">Tous</option>
                    {rows(lookups[lookup]).map((r) => (
                      <option key={value(r, "id")} value={value(r, "id")}>
                        {value(r, "name")}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            {module === "transactions" && (
              <label className="field">
                <span>Type d’opération</span>
                <select value={filters.type} onChange={(e) => setFilter("type", e.target.value)}>
                  <option value="">Tous</option>
                  {["PAYMENT", "EXPENSE", "TRANSFER", "HANDOVER", "REVERSAL", "ADJUSTMENT"].map(
                    (t) => (
                      <option value={t} key={t}>
                        {translate(t)}
                      </option>
                    ),
                  )}
                </select>
              </label>
            )}
            <button
              className="text-link"
              onClick={() => {
                setFilters(initialFilters);
                setPage(1);
              }}
            >
              <RotateCcw size={14} />
              Réinitialiser
            </button>
          </div>
        )}
        {error && <ErrorMessage message={error} retry={load} />}{" "}
        {loading ? (
          <Loading />
        ) : displayed.length ? (
          <div className="table-scroll">
            <table className="records-table">
              <thead>
                <tr>
                  {config.columns
                    .filter(
                      (c) =>
                        !(
                          module === "caisse" &&
                          user.role === "SALESPERSON" &&
                          c.key === "balanceMinor"
                        ),
                    )
                    .map((c) => (
                      <th key={c.key} className={c.kind === "money" ? "align-right" : ""}>
                        {c.label}
                      </th>
                    ))}
                  <th className="align-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((r, index) => (
                  <tr key={value(r, "id", String(index))}>
                    {config.columns
                      .filter(
                        (c) =>
                          !(
                            module === "caisse" &&
                            user.role === "SALESPERSON" &&
                            c.key === "balanceMinor"
                          ),
                      )
                      .map((c) => (
                        <td key={c.key} className={c.kind === "money" ? "align-right amount" : ""}>
                          {c.kind === "status" ? (
                            <Badge status={module === "factures" ? invoiceStatus(r) : r[c.key]} />
                          ) : c.kind === "identity" ? (
                            <button
                              className="table-identity identity-button"
                              onClick={() => setDetail(r)}
                            >
                              {["clients", "fournisseurs", "commerciaux", "utilisateurs"].includes(
                                module,
                              ) ? (
                                <span className={`avatar table-avatar tone-${index % 4}`}>
                                  {value(r, c.key, "?")
                                    .split(" ")
                                    .map((s) => s[0])
                                    .slice(0, 2)
                                    .join("")}
                                </span>
                              ) : (
                                <span className="document-icon">
                                  {module === "caisse" ? (
                                    <Wallet size={19} />
                                  ) : (
                                    <FileText size={18} />
                                  )}
                                </span>
                              )}
                              <span>
                                <strong>
                                  {module === "audit" ? translate(r[c.key]) : value(r, c.key)}
                                </strong>
                                <small>
                                  {value(
                                    r,
                                    "businessName",
                                    value(r, "email", value(r, "number", "")),
                                  )}
                                </small>
                              </span>
                            </button>
                          ) : c.render ? (
                            c.render(r)
                          ) : c.kind === "money" ? (
                            money(
                              r[c.key] ?? (c.key === "dueMinor" ? r.balanceMinor : undefined),
                              value(company, "currency", "EUR"),
                            )
                          ) : c.kind === "date" ? (
                            date(r[c.key])
                          ) : (
                            value(r, c.key)
                          )}
                        </td>
                      ))}
                    <td>{rowActions(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              filters.q || filters.status
                ? "Aucun résultat pour ces filtres"
                : `Aucun élément dans ${config.title.toLowerCase()}`
            }
            description={
              config.create && can(config.createPermission!)
                ? "Créez votre premier élément à l’aide du bouton en haut de la page."
                : "Les opérations de votre entreprise apparaîtront ici."
            }
          />
        )}
        <div className="table-pagination">
          <span>
            {visible.length
              ? `${(page - 1) * pageSize + 1}–${(page - 1) * pageSize + visible.length}`
              : "0 élément"}
          </span>
          <div>
            <button
              className="icon-button"
              aria-label="Page précédente"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={17} />
            </button>
            <span>Page {page}</span>
            <button
              className="icon-button"
              aria-label="Page suivante"
              disabled={!hasNext}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </section>
      {module === "transactions" && (
        <div className="register-note">
          <span className="live-dot" />
          Registre permanent · Les corrections sont enregistrées par écriture d’annulation.
        </div>
      )}
      {form && (
        <Modal
          title={
            form.record?.id &&
            ["clients", "users", "suppliers", "cash-accounts", "expenses"].includes(form.kind)
              ? "Modifier les informations"
              : module === "commerciaux" && form.kind === "users"
                ? "Ajouter un commercial"
                : formTitles[form.kind]
          }
          subtitle="Les informations sont enregistrées dans votre espace entreprise."
          onClose={() => setForm(null)}
          wide={form.kind === "sales"}
        >
          <RecordForm
            kind={form.kind}
            record={form.record}
            commercial={module === "commerciaux"}
            onSuccess={success}
            onClose={() => setForm(null)}
          />
        </Modal>
      )}
      {detail && (
        <Modal
          title="Détail"
          subtitle="Informations et historique de l’opération"
          onClose={() => setDetail(null)}
          wide
        >
          <RecordDetail record={detail} config={config} />
        </Modal>
      )}
      {confirmation && (
        <Modal
          title={
            confirmation.action === "approve"
              ? "Valider la dépense"
              : confirmation.action === "cancel-invoice"
                ? "Annuler la facture"
                : "Refuser la dépense"
          }
          onClose={() => setConfirmation(null)}
        >
          <form onSubmit={approve} className="record-form">
            {confirmError && <ErrorMessage message={confirmError} />}
            <div className="confirmation-summary">
              <span>
                {value(confirmation.record, "description", value(confirmation.record, "number"))}
              </span>
              <strong>
                {money(confirmation.record.amountMinor ?? confirmation.record.totalMinor)}
              </strong>
              <p>
                {confirmation.action === "approve"
                  ? "La dépense sera autorisée pour paiement. Le solde de la caisse changera au moment du règlement."
                  : confirmation.action === "cancel-invoice"
                    ? "La facture et sa vente seront annulées. Les numéros et l’historique seront conservés."
                    : "La demande sera refusée et aucun paiement ne sera effectué."}
              </p>
            </div>
            <label className="field">
              <span>
                {confirmation.action === "reject"
                  ? "Motif du refus *"
                  : confirmation.action === "cancel-invoice"
                    ? "Motif de l’annulation *"
                    : "Commentaire (facultatif)"}
              </span>
              <textarea
                name={confirmation.action === "cancel-invoice" ? "reason" : "comment"}
                rows={3}
                minLength={confirmation.action === "cancel-invoice" ? 5 : undefined}
                required={confirmation.action !== "approve"}
              />
            </label>
            <footer className="form-footer">
              <button
                type="button"
                className="button secondary"
                onClick={() => setConfirmation(null)}
              >
                Annuler
              </button>
              <button
                className={`button ${confirmation.action === "approve" ? "primary" : "destructive"}`}
                disabled={confirmBusy}
              >
                {confirmBusy
                  ? "Enregistrement…"
                  : confirmation.action === "approve"
                    ? "Confirmer la validation"
                    : confirmation.action === "cancel-invoice"
                      ? "Confirmer l’annulation"
                      : "Confirmer le refus"}
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {toast && <Toast message={toast} clear={clearToast} />}
    </>
  );
}
