"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownLeft,
  CalendarDays,
  CreditCard,
  Download,
  Plus,
  ScanLine,
  ShoppingBag,
  Users,
  Wallet,
} from "lucide-react";
import { api } from "./api";
import { useSession } from "./app-shell";
import { date, money, related, Row, rows, value } from "@/lib/format";
import { CashPanel, DashboardMetrics, PendingPanel, RecentPanel } from "./dashboard-panels";
import { Empty, ErrorMessage, Loading, PeriodFilter } from "./ui";

export function ActivityChart({
  series,
  showExpenses = true,
}: {
  series: Row[];
  showExpenses?: boolean;
}) {
  // Number is used only for relative SVG coordinates, never to calculate financial totals.
  const points = series.map((r) => ({
    date: value(r, "date"),
    sales: Number(r.salesMinor ?? 0),
    expenses: Number(r.expensesMinor ?? 0),
  }));
  const max = Math.max(1, ...points.flatMap((p) => [p.sales, p.expenses]));
  const point = (n: number, i: number) =>
    `${40 + (i * 640) / Math.max(1, points.length - 1)},${185 - (n / max) * 145}`;
  const sales = points.map((p, i) => point(p.sales, i)).join(" "),
    expenses = points.map((p, i) => point(p.expenses, i)).join(" ");
  if (!points.length)
    return (
      <Empty
        title="Votre activité commence ici"
        description={
          showExpenses
            ? "Les premières ventes et dépenses dessineront votre courbe."
            : "Vos premières ventes dessineront votre courbe."
        }
      />
    );
  return (
    <div
      className="activity-chart"
      role="img"
      aria-label={
        showExpenses
          ? "Évolution des ventes et dépenses sur la période sélectionnée"
          : "Évolution des ventes sur la période sélectionnée"
      }
    >
      <svg viewBox="0 0 720 230">
        <defs>
          <linearGradient id="sales-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-sales)" stopOpacity=".16" />
            <stop offset="100%" stopColor="var(--chart-sales)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[40, 88, 136, 185].map((y, i) => (
          <g key={y}>
            <line x1="40" y1={y} x2="685" y2={y} stroke="var(--chart-grid)" strokeDasharray="4 5" />
            <text x="30" y={y + 4} textAnchor="end" fontSize="10" fill="var(--chart-label)">
              {i === 3 ? "0" : `${Math.round((max * (3 - i)) / 3 / 100)}`}
            </text>
          </g>
        ))}
        <polygon points={`40,185 ${sales} 680,185`} fill="url(#sales-fill)" />
        <polyline
          points={sales}
          fill="none"
          stroke="var(--chart-sales)"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {showExpenses && (
          <polyline
            points={expenses}
            fill="none"
            stroke="var(--chart-expenses)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {points
          .filter(
            (_, i) =>
              i === 0 ||
              i === points.length - 1 ||
              i % Math.max(1, Math.floor(points.length / 5)) === 0,
          )
          .map((p) => (
            <text
              key={p.date}
              x={40 + (points.indexOf(p) * 640) / Math.max(1, points.length - 1)}
              y="216"
              textAnchor="middle"
              fontSize="10"
              fill="var(--chart-label)"
            >
              {date(p.date).slice(0, 7)}
            </text>
          ))}
      </svg>
    </div>
  );
}

export function Dashboard({ report = false }: { report?: boolean }) {
  const { user, company, can } = useSession();
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState("");
  const [period, setPeriod] = useState("month"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const canSales = can("sales.view"),
    canCash = can("cash.view"),
    canExpenses = can("expenses.view"),
    canTransactions = can("transactions.view");
  const commercial = user.role === "SALESPERSON",
    employee = user.role === "EMPLOYEE",
    cashier = user.role === "CASHIER";
  const canReceive = commercial ? can("payments.create") : can("cash.deposit");
  const load = useCallback(() => {
    setError("");
    api<Row>(`/api/${report ? "reports" : "dashboard"}?period=${period}&from=${from}&to=${to}`)
      .then(setData)
      .catch((error) => setError(error.message));
  }, [period, from, to, report]);
  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);
  const currency = value(company, "currency", "EUR"),
    metrics = related(data ?? {}, "metrics");
  const cash = rows(data?.cashAccounts),
    recent = rows(data?.recentTransactions ?? data?.items),
    pending = rows(data?.pendingExpenses);
  const breakdown = rows(data?.expenseBreakdown),
    salespeople = rows(data?.salespersonCollections);
  const actions = [
    {
      label: "Encaisser",
      desc: "Saisie rapide et reçu immédiat",
      href: "/saisie?direction=IN",
      icon: ArrowDownLeft,
      permission: commercial ? "payments.create" : "cash.deposit",
    },
    {
      label: can("expenses.create") ? "Demander une dépense" : "Payer une dépense",
      desc: can("expenses.create") ? "Envoyer pour validation" : "Régler une dépense validée",
      href: can("expenses.create") ? "/saisie?direction=OUT" : "/depenses?status=APPROVED",
      icon: CreditCard,
      permission: can("expenses.create") ? "expenses.create" : "expenses.pay",
    },
    {
      label: "Journal quotidien",
      desc: "Retrouver les mouvements du jour",
      href: "/journal",
      icon: CalendarDays,
      permission: "transactions.view",
    },
    {
      label: "Nouvelle vente",
      desc: "Créer une vente et sa facture",
      href: "/ventes?new=1",
      icon: ShoppingBag,
      permission: "sales.create",
    },
    {
      label: "Remise caisse",
      desc: "Remettre les fonds encaissés",
      href: "/caisse?action=handover",
      icon: Wallet,
      permission: "cash.handover",
    },
    {
      label: "Nouveau client",
      desc: "Agrandir votre portefeuille",
      href: "/clients?new=1",
      icon: Users,
      permission: "clients.create",
    },
    {
      label: "Ajouter justificatif",
      desc: "Photographier un reçu",
      href: "/depenses?attachment=1",
      icon: ScanLine,
      permission: "attachments.create",
    },
  ].filter((action) => can(action.permission));
  const reports = [
    ["transactions", "Transactions", "transactions.view"],
    ["sales", "Ventes", "sales.view"],
    ["expenses", "Dépenses", "expenses.view"],
    ["cash", "Caisses", "cash.view"],
    ["clients", "Créances clients", "clients.view"],
    ["salespeople", "Commerciaux", "salespeople.view"],
    ["invoices", "Factures", "invoices.view"],
    ["suppliers", "Fournisseurs", "suppliers.view"],
  ].filter(([, , permission]) => can(permission));
  return (
    <div className="dashboard">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {report ? "PILOTAGE & ANALYSE" : "VOTRE ACTIVITÉ EN UN COUP D’ŒIL"}
          </div>
          <h1>
            {report
              ? "Rapports financiers"
              : `Bonjour, ${value(user, "name", "vous").split(" ")[0]}`}{" "}
            {!report && <span className="greeting-dot">☀</span>}
          </h1>
          <p>
            {report
              ? "Les chiffres utiles pour prendre les bonnes décisions."
              : employee
                ? "Retrouvez vos demandes de dépenses et leurs justificatifs."
                : commercial
                  ? "Vos ventes, vos clients et les fonds à remettre à la caisse."
                  : cashier
                    ? "Vos caisses, vos encaissements et les paiements à effectuer."
                    : "Voici ce qui se passe dans votre entreprise aujourd’hui."}
          </p>
        </div>
        <div className="heading-actions">
          {can("reports.export") && canTransactions && (
            <a
              className="button secondary"
              href={`/api/exports?type=transactions&format=csv&period=${period}&from=${from}&to=${to}`}
            >
              <Download size={16} />
              Exporter
            </a>
          )}
          {!report && canTransactions && (
            <Link className="button secondary" href="/journal">
              <CalendarDays size={16} />
              Journal quotidien
            </Link>
          )}
          {!report && canReceive && (
            <Link className="button primary" href="/saisie?direction=IN">
              <ArrowDownLeft size={18} />
              Encaisser
            </Link>
          )}
          {!report && !canReceive && can("expenses.create") && (
            <Link className="button primary" href="/saisie?direction=OUT">
              <Plus size={17} />
              Demander une dépense
            </Link>
          )}
        </div>
      </div>
      <div className="dashboard-toolbar">
        <div className="overview-title">
          <span className="live-dot" />
          {employee || commercial || cashier ? "Mon activité" : "Vue d’ensemble"}
          <span className="muted">· {date(new Date().toISOString())}</span>
        </div>
        <PeriodFilter
          period={period}
          change={setPeriod}
          from={from}
          to={to}
          setFrom={setFrom}
          setTo={setTo}
        />
      </div>
      {error && <ErrorMessage message={error} retry={load} />}
      {!data && !error ? (
        <Loading />
      ) : (
        data && (
          <>
            {!report && actions.length > 0 && (
              <section
                className={`mobile-quick-actions quick-count-${actions.length}`}
                aria-label="Actions rapides"
              >
                {actions.map((action) => (
                  <Link key={action.label} href={action.href}>
                    <action.icon size={24} />
                    <span>{action.label}</span>
                  </Link>
                ))}
              </section>
            )}
            <DashboardMetrics metrics={metrics} currency={currency} />
            {(canSales || canCash) && (
              <div className={`dashboard-middle ${canSales && canCash ? "" : "single-column"}`}>
                {canSales && (
                  <section className="card activity-card">
                    <div className="card-heading">
                      <div>
                        <h2>
                          {commercial ? "Évolution de mes ventes" : "Évolution de l’activité"}
                        </h2>
                        <p>
                          {canExpenses
                            ? "Ventes et dépenses sur la période"
                            : "Ventes sur la période"}
                        </p>
                      </div>
                      <div className="chart-legend">
                        <span>
                          <i className="orange-dot" />
                          Ventes
                        </span>
                        {canExpenses && (
                          <span>
                            <i className="green-dot" />
                            Dépenses
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="chart-totals">
                      {can("payments.view") && (
                        <div>
                          <span>{commercial ? "Mes encaissements" : "Encaissements"}</span>
                          <strong>{money(metrics.collectedMinor, currency)}</strong>
                        </div>
                      )}
                      {canExpenses && !commercial && (
                        <div>
                          <span>Résultat estimé</span>
                          <strong>{money(metrics.estimatedProfitMinor, currency)}</strong>
                        </div>
                      )}
                    </div>
                    <ActivityChart series={rows(data.series)} showExpenses={canExpenses} />
                  </section>
                )}
                {canCash && <CashPanel metrics={metrics} accounts={cash} currency={currency} />}
              </div>
            )}
            {!report && actions.length > 0 && (
              <section
                className={`desktop-quick-actions quick-count-${Math.min(4, actions.length)}`}
                aria-label="Créer une opération"
              >
                {actions.slice(0, 4).map((action) => (
                  <Link key={action.label} href={action.href}>
                    <span className="quick-icon">
                      <action.icon size={20} />
                    </span>
                    <div>
                      <strong>{action.label}</strong>
                      <small>{action.desc}</small>
                    </div>
                    <Plus size={17} />
                  </Link>
                ))}
              </section>
            )}
            {(canTransactions || canExpenses) && (
              <div
                className={`dashboard-bottom ${canTransactions && canExpenses ? "" : "single-column"}`}
              >
                {canTransactions && <RecentPanel transactions={recent} currency={currency} />}
                {canExpenses && (
                  <PendingPanel expenses={pending} metrics={metrics} currency={currency} />
                )}
              </div>
            )}
            {report && (
              <div className="report-grid">
                {canExpenses && (
                  <section className="card">
                    <div className="card-heading">
                      <h2>Dépenses par catégorie</h2>
                    </div>
                    {breakdown.length ? (
                      breakdown.map((entry, index) => (
                        <div className="report-row" key={index}>
                          <span>{value(entry, "name", value(entry, "category", "Autre"))}</span>
                          <strong>{money(entry.amountMinor, currency)}</strong>
                        </div>
                      ))
                    ) : (
                      <Empty />
                    )}
                  </section>
                )}
                {can("salespeople.view") && can("payments.view") && !cashier && (
                  <section className="card">
                    <div className="card-heading">
                      <h2>Encaissements par commercial</h2>
                    </div>
                    {salespeople.length ? (
                      salespeople.map((entry, index) => (
                        <div className="report-row" key={index}>
                          <span>{value(entry, "name")}</span>
                          <strong>{money(entry.amountMinor, currency)}</strong>
                        </div>
                      ))
                    ) : (
                      <Empty />
                    )}
                  </section>
                )}
                {can("reports.export") && (
                  <section className="card report-exports">
                    <div className="card-heading">
                      <h2>Télécharger un rapport</h2>
                    </div>
                    {reports.map(([type, label]) => (
                      <div className="report-row" key={type}>
                        <span>{label}</span>
                        <span>
                          <a
                            href={`/api/exports?type=${type}&format=csv&period=${period}&from=${from}&to=${to}`}
                          >
                            CSV
                          </a>
                          <a
                            href={`/api/exports?type=${type}&format=pdf&period=${period}&from=${from}&to=${to}`}
                          >
                            PDF
                          </a>
                        </span>
                      </div>
                    ))}
                  </section>
                )}
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
