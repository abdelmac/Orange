import { describe, expect, it } from "vitest";
import { csvCell } from "@/services/export.service";
describe("Protection des cellules CSV", () => {
  it("neutralise les formules et échappe les guillemets", () => {
    expect(csvCell('=HYPERLINK("https://example.com")')).toBe(
      '"\'=HYPERLINK(""https://example.com"")"',
    );
    expect(csvCell("  +SUM(A1:A2)")).toBe('"\'  +SUM(A1:A2)"');
    expect(csvCell("Nom; société")).toBe('"Nom; société"');
  });
});
