"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Wallet,
  Pencil,
  Paperclip,
  ShieldCheck,
} from "lucide-react";
import { api } from "../api";
import { Empty, ErrorMessage, Loading, Toast } from "../ui";
import { money } from "@/lib/format";
import { ThemeOptions } from "../theme-picker";
import { useSession } from "../app-shell";
import { PersonalEditor, PersonalPassword, PersonalProfile, type PersonalForm } from "./forms";
import { PersonalCharts } from "./charts";
import { accountLabels, personalToday, typeLabels, type PersonalOverview } from "./types";
import "./personal.css";

export const personalSections: Record<string, string> = {
  accueil: "Mes finances personnelles",
  transactions: "Mes transactions",
  depenses: "Mes dépenses",
  revenus: "Mes revenus",
  budgets: "Mes budgets",
  categories: "Mes catégories",
  comptes: "Mes comptes",
  statistiques: "Mes statistiques",
  parametres: "Mes paramètres",
};

function transactionDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function PersonalWorkspace({ section = "accueil" }: { section?: string }) {
  const { user } = useSession();
  const [data, setData] = useState<PersonalOverview | null>(null);
  const [month, setMonth] = useState(() => personalToday().slice(0, 7));
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [form, setForm] = useState<PersonalForm | null>(null);
  const list = ["transactions", "depenses", "revenus"].includes(section);
  const effectiveType =
    section === "depenses" ? "EXPENSE" : section === "revenus" ? "INCOME" : type;
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ month, page: String(page) });
    for (const [key, value] of Object.entries({
      q,
      type: effectiveType,
      accountId,
      categoryId,
      from,
      to,
    }))
      if (value && list) query.set(key, value);
    const timer = setTimeout(
      () => {
        setLoading(true);
        setError("");
        api<PersonalOverview>(`/api/personal/overview?${query}`, { signal: controller.signal })
          .then(setData)
          .catch((error) => {
            if (!controller.signal.aborted) setError(error.message);
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      },
      q ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [month, page, q, effectiveType, accountId, categoryId, from, to, list, revision]);

  function saved(message: string) {
    setForm(null);
    setToast(message);
    setRevision((value) => value + 1);
  }
  async function toggleAccount(id: string) {
    const account = data?.accounts.find((item) => item.id === id);
    if (!account) return;
    if (
      !account.isArchived &&
      !confirm(
        "Archiver ce compte ? Son historique et son solde seront conservés, et vous pourrez le réactiver.",
      )
    )
      return;
    try {
      await api(`/api/personal/accounts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: account.name, isArchived: !account.isArchived }),
      });
      saved("Compte mis à jour.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Modification impossible.");
    }
  }
  return (
    <div className="personal-workspace">
      <div className="page-heading">
        <div>
          <div className="eyebrow">ESPACE PERSONNEL</div>
          <h1>{personalSections[section]}</h1>
          <p>Vos finances, séparées de celles de votre entreprise.</p>
        </div>
        <label className="personal-month">
          <span>Mois</span>
          <input
            type="month"
            value={month}
            min="2000-01"
            max="2099-12"
            onChange={(event) => {
              if (event.target.value) {
                setMonth(event.target.value);
                setPage(1);
              }
            }}
          />
        </label>
      </div>
      <p className="personal-privacy">
        <ShieldCheck size={16} /> Visible uniquement par vous, même si vous faites partie d’une
        équipe.
      </p>
      <div className="personal-quick-actions">
        <button
          className="button primary"
          onClick={() => setForm({ kind: "transaction", type: "EXPENSE" })}
        >
          <ArrowUpRight size={17} /> Dépense
        </button>
        <button
          className="button secondary"
          onClick={() => setForm({ kind: "transaction", type: "INCOME" })}
        >
          <ArrowDownLeft size={17} /> Revenu
        </button>
        <button
          className="button secondary"
          onClick={() => setForm({ kind: "transaction", type: "TRANSFER" })}
        >
          Transférer
        </button>
      </div>
      {error && <ErrorMessage message={error} retry={() => setRevision((value) => value + 1)} />}
      {!data && loading && <Loading />}
      {data && (
        <>
          {!data.accounts.length && (
            <section className="personal-card personal-welcome">
              <Wallet size={28} />
              <div>
                <h2>Commencez avec votre premier compte</h2>
                <p>
                  Compte courant, espèces ou épargne : ajoutez un compte, puis votre première
                  transaction.
                </p>
              </div>
              <button className="button primary" onClick={() => setForm({ kind: "account" })}>
                <Plus size={17} /> Créer un compte
              </button>
            </section>
          )}
          {["accueil", "statistiques"].includes(section) && (
            <>
              <div className="personal-metrics">
                {[
                  ["Solde total", data.summary.balanceMinor],
                  ["Revenus du mois", data.summary.incomeMinor],
                  ["Dépenses du mois", data.summary.expenseMinor],
                  ["Épargne estimée du mois", data.summary.savingsMinor],
                  ["Budget restant", data.summary.budgetRemainingMinor],
                ].map(([label, amount]) => (
                  <article className="personal-card" key={label}>
                    <span>{label}</span>
                    <strong>{money(amount, data.currency)}</strong>
                    {label === "Budget restant" && <small>Sur les catégories budgétisées</small>}
                  </article>
                ))}
              </div>
              <PersonalCharts data={data} />
            </>
          )}
          {(section === "budgets" || section === "accueil") && (
            <section className="personal-card">
              <header className="personal-section-heading">
                <h2>Budgets du mois</h2>
                <button className="button secondary" onClick={() => setForm({ kind: "budget" })}>
                  <Plus size={16} /> Budget
                </button>
              </header>
              {!data.budgets.length ? (
                <Empty
                  title="Votre premier budget"
                  description="Fixez une limite mensuelle pour une catégorie de dépenses."
                />
              ) : (
                <div className="personal-budget-grid">
                  {data.budgets.map((budget) => (
                    <article
                      key={budget.id}
                      className={`personal-budget budget-${budget.status.toLowerCase()}`}
                    >
                      <header>
                        <strong>{budget.category.name}</strong>
                        <button
                          className="icon-button"
                          aria-label={`Modifier le budget ${budget.category.name}`}
                          onClick={() =>
                            setForm({
                              kind: "budget",
                              categoryId: budget.categoryId,
                              limit: budget.limitMinor,
                            })
                          }
                        >
                          <Pencil size={16} />
                        </button>
                      </header>
                      <div>
                        <strong>{money(budget.spentMinor, data.currency)}</strong>
                        <span> / {money(budget.limitMinor, data.currency)}</span>
                      </div>
                      <progress
                        value={budget.percent}
                        max={100}
                        aria-label={`${budget.category.name} : ${budget.percent} % du budget`}
                      />
                      <p>
                        {budget.status === "EXCEEDED"
                          ? "Budget atteint ou dépassé"
                          : budget.status === "WARNING"
                            ? "Attention : au moins 80 % utilisés"
                            : `Reste ${money(budget.remainingMinor, data.currency)}`}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
          {section === "comptes" && (
            <section className="personal-card">
              <header className="personal-section-heading">
                <h2>Comptes et soldes</h2>
                <button className="button primary" onClick={() => setForm({ kind: "account" })}>
                  <Plus size={16} /> Compte
                </button>
              </header>
              <div className="personal-account-grid">
                {data.accounts.map((account) => (
                  <article className="personal-account" key={account.id}>
                    <Wallet size={22} />
                    <h3>{account.name}</h3>
                    <p>
                      {accountLabels[account.type]}
                      {account.isArchived ? " · Archivé" : ""}
                    </p>
                    <strong>{money(account.balanceMinor, account.currency)}</strong>
                    <button className="button secondary" onClick={() => toggleAccount(account.id)}>
                      {account.isArchived ? "Réactiver" : "Archiver"}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}
          {section === "categories" && (
            <section className="personal-card">
              <header className="personal-section-heading">
                <h2>Vos catégories</h2>
                <button className="button primary" onClick={() => setForm({ kind: "category" })}>
                  <Plus size={16} /> Catégorie
                </button>
              </header>
              {(["EXPENSE", "INCOME"] as const).map((type) => (
                <section key={type}>
                  <h3>{type === "EXPENSE" ? "Dépenses" : "Revenus"}</h3>
                  <ul className="personal-category-list">
                    {data.categories
                      .filter((category) => category.type === type)
                      .map((category) => (
                        <li key={category.id}>
                          <i style={{ background: category.color }} />
                          {category.name}
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
            </section>
          )}
          {(list || section === "accueil") && (
            <section className="personal-card">
              <header className="personal-section-heading">
                <h2>{list ? "Historique personnel" : "Transactions récentes"}</h2>
                {!list && (
                  <Link className="button secondary" href="/personal/transactions">
                    Tout voir
                  </Link>
                )}
                <span aria-live="polite">
                  {loading ? "Actualisation…" : `${data.transactions.total} opération(s)`}
                </span>
              </header>
              {list && (
                <div className="personal-filters">
                  <label className="field">
                    <span>Rechercher</span>
                    <input
                      type="search"
                      value={q}
                      onChange={(event) => {
                        setQ(event.target.value);
                        setPage(1);
                      }}
                      placeholder="Description ou notes"
                    />
                  </label>
                  {section === "transactions" && (
                    <label className="field">
                      <span>Type</span>
                      <select
                        value={type}
                        onChange={(event) => {
                          setType(event.target.value);
                          setPage(1);
                        }}
                      >
                        <option value="">Tous</option>
                        {Object.entries(typeLabels).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="field">
                    <span>Compte</span>
                    <select
                      value={accountId}
                      onChange={(event) => {
                        setAccountId(event.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">Tous</option>
                      {data.accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Catégorie</span>
                    <select
                      value={categoryId}
                      onChange={(event) => {
                        setCategoryId(event.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">Toutes</option>
                      {data.categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name} · {typeLabels[category.type]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Du (facultatif)</span>
                    <input
                      type="date"
                      value={from}
                      onChange={(event) => {
                        setFrom(event.target.value);
                        setPage(1);
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>Au (facultatif)</span>
                    <input
                      type="date"
                      value={to}
                      onChange={(event) => {
                        setTo(event.target.value);
                        setPage(1);
                      }}
                    />
                  </label>
                </div>
              )}
              {!data.transactions.items.length ? (
                <Empty
                  title="Aucune transaction"
                  description="Ajoutez un revenu ou une dépense, ou changez les filtres."
                />
              ) : (
                <div className="personal-transactions">
                  {data.transactions.items.slice(0, list ? 50 : 6).map((transaction) => (
                    <article key={transaction.id}>
                      <div
                        className={`personal-transaction-icon ${transaction.type.toLowerCase()}`}
                      >
                        {transaction.type === "INCOME" ? (
                          <ArrowDownLeft size={18} />
                        ) : (
                          <ArrowUpRight size={18} />
                        )}
                      </div>
                      <div className="personal-transaction-description">
                        <strong>{transaction.description}</strong>
                        <small>
                          {transactionDate(transaction.date)} ·{" "}
                          {transaction.category?.name ?? typeLabels[transaction.type]}
                        </small>
                        <small>
                          {transaction.account.name}
                          {transaction.destinationAccount
                            ? ` → ${transaction.destinationAccount.name}`
                            : ""}
                        </small>
                        {transaction.attachment && (
                          <a href={`/api/personal/attachments/${transaction.attachment.id}`}>
                            <Paperclip size={13} /> Justificatif
                          </a>
                        )}
                      </div>
                      <strong className={transaction.type === "INCOME" ? "personal-positive" : ""}>
                        {transaction.type === "INCOME"
                          ? "+"
                          : transaction.type === "EXPENSE"
                            ? "−"
                            : ""}
                        {money(transaction.amountMinor, transaction.currency)}
                      </strong>
                      <button
                        className="icon-button"
                        aria-label={`Modifier ${transaction.description}`}
                        onClick={() =>
                          setForm({
                            kind: "transaction",
                            type: transaction.type,
                            record: transaction,
                          })
                        }
                      >
                        <Pencil size={17} />
                      </button>
                    </article>
                  ))}
                </div>
              )}
              {list && data.transactions.total > 50 && (
                <nav className="personal-pagination" aria-label="Pages des transactions">
                  <button
                    className="button secondary"
                    disabled={page <= 1}
                    onClick={() => setPage((value) => value - 1)}
                  >
                    Précédent
                  </button>
                  <span>
                    Page {page} / {Math.ceil(data.transactions.total / 50)}
                  </span>
                  <button
                    className="button secondary"
                    disabled={page * 50 >= data.transactions.total}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Suivant
                  </button>
                </nav>
              )}
            </section>
          )}
          {section === "parametres" && (
            <div className="personal-settings">
              <section className="personal-card">
                <PersonalProfile
                  name={String(user.name)}
                  email={String(user.email)}
                  usageType={String(user.usageType)}
                />
                <p>Devise personnelle : {data.currency}</p>
                <h3>Apparence</h3>
                <ThemeOptions />
                <p>
                  <Link href="/pricing">Voir les offres FREE / PRO</Link>
                </p>
              </section>
              <section className="personal-card">
                <PersonalPassword />
              </section>
            </div>
          )}
          {form && (
            <PersonalEditor
              key={`${form.kind}-${form.kind === "transaction" ? (form.record?.id ?? "new") : "new"}`}
              form={form}
              data={data}
              close={() => setForm(null)}
              saved={saved}
            />
          )}
        </>
      )}
      {toast && <Toast message={toast} clear={() => setToast("")} />}
    </div>
  );
}
