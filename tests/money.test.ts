import { describe, expect, it } from "vitest";
import { calculateLines, formatMoney, parseMoney } from "../src/lib/money";

describe("monnaie exacte", () => {
  it("additionne les centimes sans flottants", () => {
    expect(parseMoney("0.10") + parseMoney("0.20")).toBe(30n);
    expect(parseMoney("999999999999.99")).toBe(99999999999999n);
  });
  it("rejette les décimales excédentaires, négatifs et notation exponentielle", () => {
    for (const value of ["1.001", "-1", "NaN", "Infinity", "1e3", "1,20"])
      expect(() => parseMoney(value)).toThrow();
  });
  it("arrondit explicitement remise puis taxe au centime par ligne", () => {
    const result = calculateLines([
      {
        description: "Service",
        quantity: "3",
        unitPrice: "19.99",
        discountPercent: "10",
        taxPercent: "20",
      },
    ]);
    expect(result.subtotalMinor).toBe(5997n);
    expect(result.discountMinor).toBe(600n);
    expect(result.taxMinor).toBe(1079n);
    expect(result.totalMinor).toBe(6476n);
  });
  it("gère quantité fractionnaire et grand montant", () => {
    const result = calculateLines([
      { description: "Temps", quantity: "0.125", unitPrice: "80", taxPercent: "20" },
    ]);
    expect(result.totalMinor).toBe(1200n);
    expect(formatMoney(9007199254740993n)).toBe("90\u202f071\u202f992\u202f547\u202f409,93 €");
    expect(formatMoney(-1n)).toBe("−0,01 €");
  });
  it("interdit pourcentages excessifs, lignes vides et quantités nulles", () => {
    expect(() => calculateLines([])).toThrow();
    expect(() => calculateLines([{ description: "A", quantity: "0", unitPrice: "1" }])).toThrow();
    expect(() =>
      calculateLines([{ description: "A", quantity: "1", unitPrice: "1", discountPercent: "101" }]),
    ).toThrow();
  });
});
