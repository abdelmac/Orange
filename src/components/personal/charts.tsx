import { money } from "@/lib/format";
import type { PersonalOverview } from "./types";

function width(value: bigint, max: bigint) {
  return max > 0n ? Number((value * 100n) / max) : 0;
}
export function PersonalCharts({ data }: { data: PersonalOverview }) {
  const days = Array.from(new Set(data.daily.map((day) => day.date)));
  const daily = days.map((date) => ({
    date,
    income: data.daily
      .filter((entry) => entry.date === date && entry.type === "INCOME")
      .reduce((sum, entry) => sum + BigInt(entry.amountMinor), 0n),
    expense: data.daily
      .filter((entry) => entry.date === date && entry.type === "EXPENSE")
      .reduce((sum, entry) => sum + BigInt(entry.amountMinor), 0n),
  }));
  const max = daily.reduce(
    (max, day) =>
      day.income > max
        ? day.income > day.expense
          ? day.income
          : day.expense
        : day.expense > max
          ? day.expense
          : max,
    0n,
  );
  const categoryMax = data.categoryExpenses.reduce(
    (max, entry) => (BigInt(entry.amountMinor) > max ? BigInt(entry.amountMinor) : max),
    0n,
  );
  return (
    <div className="personal-chart-grid">
      <section className="personal-card">
        <h2>Dépenses par catégorie</h2>
        {!data.categoryExpenses.length && <p>Aucune dépense ce mois-ci.</p>}
        <div className="personal-category-chart">
          {data.categoryExpenses.map((entry) => (
            <div key={entry.name}>
              <div>
                <span>{entry.name}</span>
                <strong>{money(entry.amountMinor, data.currency)}</strong>
              </div>
              <div className="personal-track">
                <span
                  style={{
                    width: `${width(BigInt(entry.amountMinor), categoryMax)}%`,
                    background: entry.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="personal-card">
        <h2>Revenus et dépenses</h2>
        <p className="personal-chart-legend">
          <span>● Revenus</span>
          <span>● Dépenses</span>
        </p>
        {!daily.length && <p>Aucune transaction ce mois-ci.</p>}
        <div
          className="personal-day-chart"
          tabIndex={0}
          aria-label="Évolution quotidienne, défiler horizontalement pour voir les jours"
        >
          {daily.map((day) => (
            <div key={day.date} className="personal-day">
              <div className="personal-bars">
                <span className="income" style={{ height: `${width(day.income, max)}%` }} />
                <span className="expense" style={{ height: `${width(day.expense, max)}%` }} />
              </div>
              <small>{day.date.slice(8)}</small>
              <span className="sr-only">
                {day.date} : revenus {money(day.income, data.currency)}, dépenses{" "}
                {money(day.expense, data.currency)}.
              </span>
            </div>
          ))}
        </div>
        <details>
          <summary>Afficher les montants par jour</summary>
          <ul>
            {daily.map((day) => (
              <li key={day.date}>
                {day.date} : +{money(day.income, data.currency)} / −
                {money(day.expense, data.currency)}
              </li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  );
}
