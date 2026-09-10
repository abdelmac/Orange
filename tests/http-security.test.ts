import { afterEach, describe, expect, it, vi } from "vitest";
import { assertSameOrigin, json, readBoundedBody, readJson } from "../src/lib/http";

afterEach(() => vi.unstubAllEnvs());

describe("Protection des routes HTTP", () => {
  it("exige l’origine de l’application pour toute mutation", () => {
    vi.stubEnv("APP_URL", "https://orange.example");
    expect(() =>
      assertSameOrigin(new Request("https://orange.example/api/clients", { method: "POST" })),
    ).toThrow();
    expect(() =>
      assertSameOrigin(
        new Request("https://orange.example/api/clients", {
          method: "POST",
          headers: { origin: "https://attacker.example" },
        }),
      ),
    ).toThrow();
    expect(() =>
      assertSameOrigin(
        new Request("https://orange.example/api/clients", {
          method: "POST",
          headers: { origin: "https://orange.example" },
        }),
      ),
    ).not.toThrow();
  });
  it("refuse un corps dépassant 1 Mo même sans Content-Length", async () => {
    const request = new Request("https://orange.example/api/clients", {
      method: "POST",
      body: `{"data":"${"a".repeat(1_000_000)}"}`,
    });
    expect(request.headers.has("content-length")).toBe(false);
    await expect(readJson(request)).rejects.toMatchObject({ status: 413 });
  });
  it("valide le JSON et préserve le texte Unicode", async () => {
    await expect(
      readJson(
        new Request("https://orange.example", {
          method: "POST",
          body: '{"name":"Dépenses — مصاريف"}',
        }),
      ),
    ).resolves.toEqual({ name: "Dépenses — مصاريف" });
    await expect(
      readJson(new Request("https://orange.example", { method: "POST", body: "{invalid}" })),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("sérialise les centimes sans perte et interdit le cache privé", async () => {
    const response = json({ amountMinor: 9007199254740993123n });
    expect(await response.json()).toEqual({ amountMinor: "9007199254740993123" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("applique la limite binaire avant le parsing multipart", async () => {
    const bytes = new Uint8Array(1025);
    await expect(
      readBoundedBody(new Request("https://orange.example", { method: "POST", body: bytes }), 1024),
    ).rejects.toMatchObject({ status: 413 });
    expect(
      (
        await readBoundedBody(
          new Request("https://orange.example", { method: "POST", body: bytes }),
          1025,
        )
      ).byteLength,
    ).toBe(1025);
  });
});
