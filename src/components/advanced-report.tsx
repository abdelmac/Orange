"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BarChart3, Crown } from "lucide-react";
import { api } from "./api";
import { ErrorMessage, Loading } from "./ui";
import { hasFeature } from "@/lib/plans";
import { money } from "@/lib/format";
import "./advanced-report.css";

interface AdvancedReportData {
  currency: string;
  asOf: string;
  monthly: { month: string; salesMinor: string; expensesMinor: string; differenceMinor: string }[];
  receivables: { key: string; label: string; count: number; amountMinor: string }[];
  totals: { salesMinor: string; expensesMinor: string; receivablesMinor: string };
}
export function AdvancedReport() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [data, setData] = useState<AdvancedReportData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const entitlement = await api<{ features: string[] }>("/api/billing", {
          signal: controller.signal,
        });
        const allowed = hasFeature(entitlement, "advanced_reports");
        setEnabled(allowed);
        if (allowed)
          setData(
            await api<AdvancedReportData>("/api/reports/advanced", { signal: controller.signal }),
          );
      } catch (error) {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : "Rapport indisponible.");
      }
    }
    void load();
    return () => controller.abort();
  }, []);
  const maximum =
    data?.monthly.reduce(
      (max, entry) =>
        [BigInt(entry.salesMinor), BigInt(entry.expensesMinor)].reduce(
          (a, b) => (b > a ? b : a),
          max,
        ),
      1n,
    ) ?? 1n;
  return (
    <section className="card advanced-report">
      <header>
        <BarChart3 size={22} />
        <div>
          <h2>Analyse sur 12 mois</h2>
          <p>Ventes, dépenses payées et ancienneté des créances.</p>
        </div>
        <span className="badge">PRO</span>
      </header>
      {error && <ErrorMessage message={error} />}
      {enabled === false ? (
        <div className="advanced-upsell">
          <Crown size={24} />
          <h3>Cette fonctionnalité est disponible avec PRO.</h3>
          <p>Comparez vos mois et repérez les factures à relancer.</p>
          <strong>PRO — 4 €/mois</strong>
          <Link className="button primary" href="/abonnement">
            Découvrir PRO
          </Link>
        </div>
      ) : !data && !error ? (
        <Loading />
      ) : (
        data && (
          <>
            <p className="advanced-note">
              Situation au {data.asOf}. Les dépenses correspondent aux paiements effectués. L’écart
              présenté est indicatif et ne constitue pas un bénéfice comptable.
            </p>
            <div
              className="advanced-bars"
              tabIndex={0}
              aria-label="Comparaison mensuelle des ventes et dépenses, données détaillées dans le tableau suivant"
            >
              {data.monthly.map((month) => (
                <div key={month.month}>
                  <div>
                    <span
                      className="advanced-sales"
                      title={`Ventes : ${money(month.salesMinor, data.currency)}`}
                      style={{ height: `${Number((BigInt(month.salesMinor) * 100n) / maximum)}%` }}
                    />
                    <span
                      className="advanced-expenses"
                      title={`Dépenses : ${money(month.expensesMinor, data.currency)}`}
                      style={{
                        height: `${Number((BigInt(month.expensesMinor) * 100n) / maximum)}%`,
                      }}
                    />
                  </div>
                  <small>
                    {month.month.slice(5)}/{month.month.slice(2, 4)}
                  </small>
                </div>
              ))}
            </div>
            <div className="advanced-table" tabIndex={0} aria-label="Données du rapport mensuel">
              <table>
                <thead>
                  <tr>
                    <th>Mois</th>
                    <th>Ventes</th>
                    <th>Dépenses payées</th>
                    <th>Écart indicatif</th>
                  </tr>
                </thead>
                <tbody>
                  {data.monthly.map((month) => (
                    <tr key={month.month}>
                      <th>{month.month}</th>
                      <td>{money(month.salesMinor, data.currency)}</td>
                      <td>{money(month.expensesMinor, data.currency)}</td>
                      <td>{money(month.differenceMinor, data.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>Créances clients par ancienneté</h3>
            <div className="advanced-aging">
              {data.receivables.map((bucket) => (
                <article key={bucket.key}>
                  <span>{bucket.label}</span>
                  <strong>{money(bucket.amountMinor, data.currency)}</strong>
                  <small>{bucket.count} facture(s)</small>
                </article>
              ))}
            </div>
            <p className="advanced-total">
              Total à recouvrer :{" "}
              <strong>{money(data.totals.receivablesMinor, data.currency)}</strong>
            </p>
          </>
        )
      )}
    </section>
  );
}
