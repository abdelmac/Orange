"use client";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  Clock3,
  CreditCard,
  FileText,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { date, money, related, Row, value } from "@/lib/format";
import { translate } from "@/lib/i18n";
import { useSession } from "./app-shell";
import { Badge, Empty } from "./ui";

export function DashboardMetrics({ metrics, currency }: { metrics: Row; currency: string }) {
  const { user, can } = useSession();
  const commercial = user.role === "SALESPERSON",
    cashier = user.role === "CASHIER",
    employee = user.role === "EMPLOYEE";
  const canCash = can("cash.view"),
    canSales = can("sales.view"),
    canExpenses = can("expenses.view"),
    canReceivables = can("invoices.view") && !cashier;
  const count = [canCash, canSales, canExpenses, canReceivables].filter(Boolean).length;
  return (
    <section
      className={`metric-grid metric-count-${count}`}
      aria-label="Indicateurs financiers autorisés"
    >
      {canCash && (
        <article className="metric-card featured">
          <div className="metric-label">
            {commercial ? "Mon portefeuille" : cashier ? "Ma caisse" : "Solde total disponible"}
            <span className="metric-icon">
              <Wallet size={19} />
            </span>
          </div>
          <strong>
            {money(
              commercial
                ? metrics.salespersonHeldMinor
                : cashier
                  ? metrics.cashMinor
                  : metrics.availableMinor,
              currency,
            )}
          </strong>
          <div className="metric-description">
            <span className="small-dot" />
            {commercial
              ? "Fonds encaissés à remettre à la caisse"
              : cashier
                ? "Solde des caisses dont vous êtes responsable"
                : "Caisses et fonds accessibles à votre rôle"}
          </div>
          <div className="featured-decoration" />
        </article>
      )}
      {canSales && (
        <article className="metric-card">
          <div className="metric-label">
            {commercial ? "Mes ventes du mois" : "Ventes du mois"}
            <span className="metric-icon orange">
              <TrendingUp size={19} />
            </span>
          </div>
          <strong>{money(metrics.salesMonthMinor, currency)}</strong>
          <div className="metric-description">
            <span className="text-green">
              <ArrowUpRight size={14} />
              {money(metrics.salesTodayMinor, currency)}
            </span>
            aujourd’hui
          </div>
        </article>
      )}
      {canExpenses && (
        <article className="metric-card">
          <div className="metric-label">
            {employee || commercial
              ? "Mes dépenses réglées"
              : cashier
                ? "Dépenses de mes caisses"
                : "Dépenses du mois"}
            <span className="metric-icon pink">
              <CreditCard size={19} />
            </span>
          </div>
          <strong>{money(metrics.expensesMonthMinor, currency)}</strong>
          <div className="metric-description">
            <span>{money(metrics.expensesTodayMinor, currency)}</span>aujourd’hui
            {(employee || commercial) && " · Total du mois ci-dessus"}
          </div>
        </article>
      )}
      {canReceivables && (
        <article className="metric-card">
          <div className="metric-label">
            {commercial ? "Créances de mes clients" : "Créances clients"}
            <span className="metric-icon blue">
              <FileText size={19} />
            </span>
          </div>
          <strong>{money(metrics.receivablesMinor, currency)}</strong>
          <div className="metric-description">
            <span className="amber-dot" />
            {value(metrics, "unpaidInvoices", "0")} facture(s) à régler
          </div>
        </article>
      )}
    </section>
  );
}

export function CashPanel({
  metrics,
  accounts,
  currency,
}: {
  metrics: Row;
  accounts: Row[];
  currency: string;
}) {
  const { user, can } = useSession();
  if (!can("cash.view")) return null;
  if (user.role === "SALESPERSON")
    return (
      <section className="card cash-summary">
        <div className="card-heading">
          <div>
            <h2>Mon portefeuille</h2>
            <p>Des encaissements à leur remise en caisse</p>
          </div>
          <BriefcaseBusiness size={20} className="muted" />
        </div>
        <div className="cash-summary-total">
          <span>Montant restant à remettre</span>
          <strong>{money(metrics.salespersonHeldMinor, currency)}</strong>
        </div>
        <div className="portfolio-explanation">
          <Wallet size={28} />
          <p>
            Les paiements que vous recevez restent dans votre portefeuille jusqu’à leur remise à une
            caisse de l’entreprise.
          </p>
        </div>
        {can("payments.view") && (
          <div className="held-summary">
            <ArrowDownLeft size={18} />
            <span>Mes encaissements sur la période</span>
            <strong>{money(metrics.collectedMinor, currency)}</strong>
          </div>
        )}
        {can("cash.handover") && (
          <Link className="card-footer-link" href="/caisse?action=handover">
            Effectuer une remise caisse
            <ArrowRight size={15} />
          </Link>
        )}
      </section>
    );
  const cashier = user.role === "CASHIER";
  return (
    <section className="card cash-summary">
      <div className="card-heading">
        <div>
          <h2>{cashier ? "Mes caisses" : "Votre trésorerie"}</h2>
          <p>
            {cashier ? "Les caisses dont vous êtes responsable" : "Chaque euro, au bon endroit"}
          </p>
        </div>
        <Wallet size={20} className="muted" />
      </div>
      <div className="cash-summary-total">
        <span>Solde des caisses accessibles</span>
        <strong>{money(metrics.cashMinor, currency)}</strong>
      </div>
      <div className="cash-list">
        {accounts.length ? (
          accounts.slice(0, 4).map((account, index) => (
            <div key={value(account, "id")}>
              <span className={`cash-icon tone-${index % 3}`}>
                <Wallet size={17} />
              </span>
              <span>
                <strong>{value(account, "name")}</strong>
                <small>{translate(account.type)}</small>
              </span>
              <b>{money(account.balanceMinor, currency)}</b>
            </div>
          ))
        ) : (
          <p className="muted">Aucune caisse ne vous est encore attribuée.</p>
        )}
      </div>
      {can("salespeople.view") && !cashier && (
        <div className="held-summary">
          <BriefcaseBusiness size={18} />
          <span>Détenu par les commerciaux</span>
          <strong>{money(metrics.salespersonHeldMinor, currency)}</strong>
        </div>
      )}
      <Link href="/caisse" className="card-footer-link">
        {cashier ? "Ouvrir mes caisses" : "Gérer les caisses"}
        <ArrowRight size={15} />
      </Link>
    </section>
  );
}

export function RecentPanel({ transactions, currency }: { transactions: Row[]; currency: string }) {
  const { user, can } = useSession();
  if (!can("transactions.view")) return null;
  const own = user.role === "SALESPERSON" || user.role === "CASHIER";
  return (
    <section className="card recent-card">
      <div className="card-heading">
        <div>
          <h2>{own ? "Mes dernières transactions" : "Dernières transactions"}</h2>
          <p>
            {own
              ? "Les mouvements de votre périmètre"
              : "Les mouvements récents de votre entreprise"}
          </p>
        </div>
        <Link className="text-link" href="/transactions">
          Tout voir
          <ArrowRight size={14} />
        </Link>
      </div>
      {transactions.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Opération</th>
                <th>Date</th>
                <th>Statut</th>
                <th className="align-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              {transactions.slice(0, 6).map((transaction) => {
                const outgoing = transaction.type === "EXPENSE";
                return (
                  <tr key={value(transaction, "id")}>
                    <td>
                      <div className="table-identity">
                        <span className={`operation-icon ${outgoing ? "out" : "in"}`}>
                          {outgoing ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                        </span>
                        <div>
                          <strong>{translate(transaction.type)}</strong>
                          <small>
                            {value(transaction, "number")} ·{" "}
                            {value(
                              related(transaction, "client"),
                              "name",
                              value(related(transaction, "creator"), "name", ""),
                            )}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>{date(transaction.date)}</td>
                    <td>
                      <Badge status={transaction.status} />
                    </td>
                    <td
                      className={`align-right amount ${outgoing ? "text-red" : transaction.type === "PAYMENT" ? "text-green" : ""}`}
                    >
                      {outgoing ? "−" : ""}
                      {money(transaction.amountMinor, currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="Aucune transaction pour cette période" />
      )}
    </section>
  );
}

export function PendingPanel({
  expenses,
  metrics,
  currency,
}: {
  expenses: Row[];
  metrics: Row;
  currency: string;
}) {
  const { user, can } = useSession();
  if (!can("expenses.view")) return null;
  const own = user.role === "EMPLOYEE" || user.role === "SALESPERSON";
  return (
    <section className="card pending-card">
      <div className="card-heading">
        <div>
          <h2>
            {own ? "Mes demandes en attente" : "À suivre"}
            <span className="count amber">{value(metrics, "pendingExpenses", "0")}</span>
          </h2>
          <p>
            {own ? "Suivez la validation de vos dépenses" : "Les demandes en attente de validation"}
          </p>
        </div>
        <Clock3 size={19} className="muted" />
      </div>
      {expenses.length ? (
        <div className="pending-list">
          {expenses.slice(0, 6).map((expense) => (
            <Link href={`/depenses?detail=${value(expense, "id")}`} key={value(expense, "id")}>
              <span className="pending-icon">
                <CreditCard size={18} />
              </span>
              <div>
                <strong>{value(expense, "description")}</strong>
                <small>{value(related(expense, "requester"), "name", "Demande de dépense")}</small>
                <Badge status={expense.status} />
              </div>
              <b>{money(expense.amountMinor, currency)}</b>
            </Link>
          ))}
        </div>
      ) : (
        <div className="all-clear">
          <span>
            <Check size={24} />
          </span>
          <h3>Tout est à jour</h3>
          <p>
            {own
              ? "Vous n’avez aucune demande en attente de validation."
              : "Aucune dépense en attente de validation dans votre périmètre."}
          </p>
        </div>
      )}
      {can("suppliers.view") && !own && user.role !== "CASHIER" && (
        <div className="supplier-reminder">
          <span>Dettes fournisseurs</span>
          <strong>{money(metrics.payablesMinor, currency)}</strong>
        </div>
      )}
      <Link href="/depenses" className="card-footer-link">
        {own ? "Consulter mes demandes" : "Consulter les dépenses"}
        <ArrowRight size={15} />
      </Link>
    </section>
  );
}
