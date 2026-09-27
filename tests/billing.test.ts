import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac, randomBytes } from "node:crypto";
import type Stripe from "stripe";
import { verifyBillingSignature } from "../src/lib/stripe";
import { effectivePlanCode, hasFeature } from "../src/lib/plans";
import { stripeSubscriptionStatus } from "../src/services/billing.service";
import { describeEntitlements } from "../src/services/entitlement.service";

afterEach(() => vi.unstubAllEnvs());

describe("validation serveur des abonnements", () => {
  it("vérifie le corps brut signé Stripe et rejette falsification, absence et replay ancien", () => {
    const secret = `whsec_${randomBytes(24).toString("hex")}`;
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_unit_fixture_no_network");
    const payload = JSON.stringify({
      id: "evt_signed_fixture",
      object: "event",
      type: "customer.subscription.updated",
      data: { object: { object: "subscription", id: "sub_fixture" } },
    });
    const sign = (time: number) =>
      `t=${time},v1=${createHmac("sha256", secret).update(`${time}.${payload}`).digest("hex")}`;
    const time = Math.floor(Date.now() / 1000);
    expect(verifyBillingSignature(Buffer.from(payload), sign(time)).id).toBe("evt_signed_fixture");
    expect(() =>
      verifyBillingSignature(Buffer.from(payload.replace("sub_fixture", "sub_forged")), sign(time)),
    ).toThrow("invalide");
    expect(() => verifyBillingSignature(Buffer.from(payload), null)).toThrow("manquante");
    expect(() => verifyBillingSignature(Buffer.from(payload), sign(time - 600))).toThrow(
      "invalide",
    );
  });

  it("ne débloque PRO que pour une période active et non expirée", () => {
    const now = new Date("2026-09-27T00:00:00Z");
    const active = {
      status: "ACTIVE",
      currentPeriodEnd: new Date("2026-10-27T00:00:00Z"),
      plan: { code: "PRO" },
    };
    expect(effectivePlanCode(null, now)).toBe("FREE");
    expect(effectivePlanCode(active, now)).toBe("PRO");
    for (const status of ["PAST_DUE", "CANCELLED", "EXPIRED", "FREE"])
      expect(effectivePlanCode({ ...active, status }, now)).toBe("FREE");
    expect(effectivePlanCode({ ...active, currentPeriodEnd: now }, now)).toBe("FREE");
    expect(effectivePlanCode({ ...active, currentPeriodEnd: null }, now)).toBe("FREE");
  });

  it("une résiliation programmée conserve les droits jusqu’à la fin payée", () => {
    const description = describeEntitlements({
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 86400000),
      plan: { code: "PRO" },
      cancelAtPeriodEnd: true,
    });
    expect(description.cancelAtPeriodEnd).toBe(true);
    expect(hasFeature(description, "remove_branding")).toBe(true);
    expect(hasFeature(describeEntitlements(null), "remove_branding")).toBe(false);
  });

  it("n’assimile pas un essai ni un paiement incomplet à un abonnement payé", () => {
    const status = (value: Stripe.Subscription.Status) =>
      stripeSubscriptionStatus({ status: value } as Stripe.Subscription);
    expect(status("active")).toBe("ACTIVE");
    expect(status("trialing")).toBe("FREE");
    expect(status("incomplete")).toBe("FREE");
    expect(status("incomplete_expired")).toBe("EXPIRED");
    expect(status("canceled")).toBe("CANCELLED");
    for (const value of ["unpaid", "past_due", "paused"] as const)
      expect(status(value)).toBe("PAST_DUE");
  });
});
