export type Row = Record<string, unknown>;
export function value(row: Row | undefined | null, key: string, fallback = "—"): string {
  const item = row?.[key];
  return item === null || item === undefined || item === "" ? fallback : String(item);
}
export function related(row: Row, key: string): Row {
  const item = row[key];
  return item && typeof item === "object" && !Array.isArray(item) ? (item as Row) : {};
}
export function rows(input: unknown): Row[] {
  return Array.isArray(input) ? (input as Row[]) : [];
}
export function money(input: unknown, currency = "EUR"): string {
  try {
    const minor = BigInt(String(input ?? "0"));
    const absolute = minor < 0n ? -minor : minor;
    const whole = new Intl.NumberFormat("fr-FR").format(absolute / 100n);
    const cents = String(absolute % 100n).padStart(2, "0");
    return `${minor < 0n ? "−" : ""}${whole},${cents}\u00a0${currency === "EUR" ? "€" : currency}`;
  } catch {
    return "—";
  }
}
export function date(input: unknown, time = false): string {
  if (!input) return "—";
  const parsed = new Date(String(input));
  return Number.isNaN(parsed.getTime())
    ? "—"
    : new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        ...(time ? ({ hour: "2-digit", minute: "2-digit" } as const) : {}),
      }).format(parsed);
}
export function decimalInput(input: unknown): string {
  try {
    const n = BigInt(String(input ?? "0"));
    return `${n / 100n}.${String(n % 100n).padStart(2, "0")}`;
  } catch {
    return "0.00";
  }
}
export function invoiceStatus(row: Row): string {
  const status = value(row, "status", "");
  if (["PAID", "CANCELLED", "DRAFT"].includes(status)) return status;
  const overdue =
    row.overdue === true || (row.dueDate && new Date(String(row.dueDate)).getTime() < Date.now());
  return overdue ? "OVERDUE" : status;
}
