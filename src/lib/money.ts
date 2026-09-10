import Decimal from "decimal.js";
import { z } from "zod";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export const decimalInput = z
  .string()
  .trim()
  .regex(/^\d{1,12}(?:\.\d{1,4})?$/, "Nombre décimal positif attendu.");
export const moneyInput = z
  .string()
  .trim()
  .regex(/^\d{1,12}(?:\.\d{1,2})?$/, "Montant attendu, avec au plus deux décimales.");
export const lineInput = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: decimalInput,
  unitPrice: decimalInput,
  discountPercent: decimalInput.default("0"),
  taxPercent: decimalInput.default("0"),
});
export type LineInput = z.input<typeof lineInput>;

export function parseMoney(value: string): bigint {
  const valid = moneyInput.parse(value);
  return BigInt(new Decimal(valid).times(100).toFixed(0));
}

export function formatMoney(value: bigint | string, currency = "EUR"): string {
  const minor = BigInt(value);
  const absolute = minor < 0n ? -minor : minor;
  const whole = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
  return `${minor < 0n ? "−" : ""}${whole},${(absolute % 100n).toString().padStart(2, "0")} ${currency === "EUR" ? "€" : currency}`;
}

export function calculateLines(input: LineInput[]) {
  const lines = z
    .array(lineInput)
    .min(1)
    .max(100)
    .parse(input)
    .map((line, position) => {
      const quantity = new Decimal(line.quantity);
      const unitPrice = new Decimal(line.unitPrice);
      const discountPercent = new Decimal(line.discountPercent);
      const taxPercent = new Decimal(line.taxPercent);
      if (quantity.lte(0) || discountPercent.gt(100) || taxPercent.gt(100))
        throw Object.assign(new Error("Quantité ou pourcentage invalide."), { status: 400 });
      const subtotalMinor = BigInt(quantity.times(unitPrice).times(100).toFixed(0));
      const discountMinor = BigInt(
        new Decimal(subtotalMinor.toString()).times(discountPercent).div(100).toFixed(0),
      );
      const net = subtotalMinor - discountMinor;
      const taxMinor = BigInt(new Decimal(net.toString()).times(taxPercent).div(100).toFixed(0));
      return {
        ...line,
        position,
        subtotalMinor,
        discountMinor,
        taxMinor,
        totalMinor: net + taxMinor,
      };
    });
  const totals = lines.reduce(
    (acc, line) => ({
      subtotalMinor: acc.subtotalMinor + line.subtotalMinor,
      discountMinor: acc.discountMinor + line.discountMinor,
      taxMinor: acc.taxMinor + line.taxMinor,
      totalMinor: acc.totalMinor + line.totalMinor,
    }),
    { subtotalMinor: 0n, discountMinor: 0n, taxMinor: 0n, totalMinor: 0n },
  );
  if (totals.totalMinor <= 0n || totals.totalMinor > 9_000_000_000_000_000n)
    throw Object.assign(new Error("Le total doit être positif et respecter la limite autorisée."), {
      status: 400,
    });
  return { ...totals, lines };
}
