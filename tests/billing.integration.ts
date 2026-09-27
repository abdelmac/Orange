import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import type Stripe from "stripe";
import type { getIdentity } from "../src/lib/auth";
import { db } from "../src/lib/db";
import { verifyBillingSignature } from "../src/lib/stripe";
import {
  billingAccount,
  changeRenewal,
  openBillingPortal,
  processBillingEvent,
  startCheckout,
} from "../src/services/billing.service";
import { getEntitlements } from "../src/services/entitlement.service";

const url = new URL(process.env.DATABASE_URL ?? "http://missing");
if (
  process.env.NODE_ENV === "production" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !url.searchParams.get("schema")?.startsWith("plans_qa_")
)
  throw new Error("Tests uniquement dans le schéma PostgreSQL local plans_qa_ isolé.");
// Deliberately fake credentials: this test injects a local Stripe adapter; no network call.
process.env.STRIPE_SECRET_KEY = "sk_test_integration_fixture_no_network";
process.env.STRIPE_WEBHOOK_SECRET = `whsec_${randomUUID()}`;
process.env.STRIPE_PRO_PRICE_ID = "price_fixture_four_euros";
process.env.APP_URL = "http://localhost:3107";
type Identity = Awaited<ReturnType<typeof getIdentity>>;
let checks = 0;
async function check(name: string, work: () => Promise<void>) {
  await work();
  console.log(`PASS ${++checks}: ${name}`);
}

async function main() {
  const run = randomUUID();
  const company = await db.company.create({ data: { name: `Billing QA ${run}` } });
  const user = await db.user.create({
    data: {
      companyId: company.id,
      name: "Billing Owner",
      email: `billing-${run}@example.test`,
      passwordHash: "test-only-unusable",
    },
  });
  await db.companyMembership.upsert({
    where: { companyId_userId: { companyId: company.id, userId: user.id } },
    create: { companyId: company.id, userId: user.id, isOwner: true },
    update: { isOwner: true },
  });
  const identity: Identity = {
    id: user.id,
    name: user.name,
    email: user.email,
    active: true,
    usageType: "BUSINESS",
    personalCurrency: "EUR",
    sessionId: randomUUID(),
    companyId: company.id,
    memberships: [{ companyId: company.id, name: company.name, active: true, isOwner: true }],
  };
  const price = {
    id: process.env.STRIPE_PRO_PRICE_ID,
    active: true,
    unit_amount: 400,
    currency: "eur",
    recurring: { interval: "month", interval_count: 1 },
    billing_scheme: "per_unit",
    transform_quantity: null,
  };
  let providerCalls = 0,
    checkoutCalls = 0,
    customerCalls = 0;
  const requests: { params: Stripe.Checkout.SessionCreateParams; key?: string }[] = [];
  const renewalRequests: { id: string; cancel: boolean | undefined }[] = [];
  const remote = new Map<string, Stripe.Subscription>();
  const customerId = `cus_${run}`;
  const stripe = {
    prices: { retrieve: async () => price },
    customers: {
      create: async (_params: unknown, options: { idempotencyKey: string }) => {
        assert.match(options.idempotencyKey, /^orange-customer-/);
        customerCalls++;
        return { id: customerId };
      },
    },
    checkout: {
      sessions: {
        create: async (
          params: Stripe.Checkout.SessionCreateParams,
          options: { idempotencyKey?: string },
        ) => {
          checkoutCalls++;
          requests.push({ params, key: options.idempotencyKey });
          return { id: `cs_${run}`, status: "open", url: "https://checkout.stripe.test/session" };
        },
        retrieve: async () => ({
          id: `cs_${run}`,
          status: "open",
          url: "https://checkout.stripe.test/session",
        }),
      },
    },
    subscriptions: {
      retrieve: async (id: string) => {
        providerCalls++;
        const value = remote.get(id);
        assert(value, "Only test subscription IDs may be requested");
        return structuredClone(value);
      },
      update: async (id: string, params: Stripe.SubscriptionUpdateParams) => {
        renewalRequests.push({ id, cancel: params.cancel_at_period_end });
        return {};
      },
    },
    billingPortal: {
      sessions: {
        create: async (params: { customer: string; return_url: string }) => {
          assert.equal(params.customer, customerId);
          assert.equal(params.return_url, "http://localhost:3107/abonnement");
          return { url: "https://billing.stripe.test/session" };
        },
      },
    },
  } as unknown as Stripe;
  const initial = (await billingAccount(identity)).subscription;

  await check("l’espace personnel reste gratuit sans checkout PRO", async () => {
    await assert.rejects(
      () => startCheckout({ ...identity, companyId: null }, stripe),
      /personnelles restent gratuites/,
    );
    assert.equal(checkoutCalls, 0);
  });

  await check("propriétaire requis avant toute création Stripe", async () => {
    await db.companyMembership.update({
      where: { companyId_userId: { companyId: company.id, userId: user.id } },
      data: { isOwner: false },
    });
    await assert.rejects(() => startCheckout(identity, stripe), /propriétaire/);
    await assert.rejects(() => openBillingPortal(identity, stripe), /propriétaire/);
    assert.equal(customerCalls, 0);
    assert.equal(checkoutCalls, 0);
    await db.companyMembership.update({
      where: { companyId_userId: { companyId: company.id, userId: user.id } },
      data: { isOwner: true },
    });
  });
  await check("refuse un tarif autre que 4 EUR mensuels avant le paiement", async () => {
    price.unit_amount = 500;
    await assert.rejects(() => startCheckout(identity, stripe), /4 EUR/);
    price.unit_amount = 400;
    price.currency = "usd";
    await assert.rejects(() => startCheckout(identity, stripe), /4 EUR/);
    price.currency = "eur";
    assert.equal(checkoutCalls, 0);
  });
  await check("checkout idempotent, prix fixé au serveur et abonnement toujours FREE", async () => {
    assert.equal(
      (await startCheckout(identity, stripe)).url,
      "https://checkout.stripe.test/session",
    );
    assert.equal(
      (await startCheckout(identity, stripe)).url,
      "https://checkout.stripe.test/session",
    );
    assert.equal(checkoutCalls, 1);
    assert.equal(customerCalls, 1);
    assert.equal(requests[0].params.line_items?.[0].price, process.env.STRIPE_PRO_PRICE_ID);
    assert.equal(requests[0].params.line_items?.[0].quantity, 1);
    assert.equal(requests[0].params.metadata?.appSubscriptionId, initial.id);
    assert.match(requests[0].key!, /^orange-checkout-/);
    assert.equal((await getEntitlements(company.id)).plan.code, "FREE");
  });
  const subscriptionId = `sub_${run}`;
  const providerSubscription = (
    overrides: Partial<Stripe.Subscription> = {},
  ): Stripe.Subscription =>
    ({
      id: subscriptionId,
      object: "subscription",
      status: "active",
      customer: customerId,
      metadata: { appSubscriptionId: initial.id },
      cancel_at_period_end: false,
      items: {
        object: "list",
        data: [
          {
            id: `si_${run}`,
            object: "subscription_item",
            price,
            quantity: 1,
            current_period_start: Math.floor(Date.now() / 1000) - 3600,
            current_period_end: Math.floor(Date.now() / 1000) + 86400,
          },
        ],
      },
      ...overrides,
    }) as Stripe.Subscription;
  function event(
    object: Record<string, unknown> = {
      id: subscriptionId,
      object: "subscription",
      status: "active",
    },
    type = "customer.subscription.updated",
  ) {
    const payload = JSON.stringify({
      id: `evt_${randomUUID()}`,
      object: "event",
      type,
      data: { object },
    });
    const time = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET!)
      .update(`${time}.${payload}`)
      .digest("hex");
    return verifyBillingSignature(Buffer.from(payload), `t=${time},v1=${signature}`);
  }
  await check("webhook signé active PRO et un doublon ne refait aucun traitement", async () => {
    remote.set(subscriptionId, providerSubscription());
    const first = event();
    await processBillingEvent(first, stripe);
    assert.equal((await getEntitlements(company.id)).plan.code, "PRO");
    const count = providerCalls;
    await processBillingEvent(first, stripe);
    assert.equal(providerCalls, count);
    assert.equal(await db.billingEvent.count({ where: { id: first.id } }), 1);
    assert.equal(
      await db.auditLog.count({ where: { companyId: company.id, action: "SUBSCRIPTION_SYNC" } }),
      1,
    );
    await assert.rejects(() => startCheckout(identity, stripe), /existe déjà/);
  });
  await check("résiliation et réactivation attendent la confirmation du webhook", async () => {
    await changeRenewal(identity, true, stripe);
    assert.equal((await getEntitlements(company.id)).cancelAtPeriodEnd, false);
    remote.set(subscriptionId, providerSubscription({ cancel_at_period_end: true }));
    await processBillingEvent(event(), stripe);
    assert.equal((await getEntitlements(company.id)).cancelAtPeriodEnd, true);
    assert.equal((await getEntitlements(company.id)).plan.code, "PRO");
    await changeRenewal(identity, false, stripe);
    remote.set(subscriptionId, providerSubscription({ cancel_at_period_end: false }));
    await processBillingEvent(event(), stripe);
    assert.equal((await getEntitlements(company.id)).cancelAtPeriodEnd, false);
    assert.deepEqual(
      renewalRequests.map((request) => request.cancel),
      [true, false],
    );
    assert.equal(
      (await openBillingPortal(identity, stripe)).url,
      "https://billing.stripe.test/session",
    );
  });
  await check(
    "paiement en échec et événements reçus dans le désordre ne réactivent pas PRO",
    async () => {
      remote.set(subscriptionId, providerSubscription({ status: "past_due" }));
      const invoice = {
        id: `in_${run}`,
        object: "invoice",
        parent: { subscription_details: { subscription: subscriptionId } },
      };
      await processBillingEvent(event(invoice, "invoice.payment_failed"), stripe);
      assert.equal((await getEntitlements(company.id)).status, "PAST_DUE");
      await processBillingEvent(event(invoice, "invoice.paid"), stripe);
      assert.equal((await getEntitlements(company.id)).plan.code, "FREE");
      remote.set(subscriptionId, providerSubscription({ status: "canceled" }));
      await processBillingEvent(event(), stripe);
      assert.equal((await getEntitlements(company.id)).status, "CANCELLED");
      assert.equal((await getEntitlements(company.id)).plan.code, "FREE");
    },
  );
  await check("mauvais client Stripe et mauvais prix ne donnent aucun droit", async () => {
    remote.set(subscriptionId, providerSubscription({ customer: "cus_foreign" }));
    await processBillingEvent(event(), stripe);
    assert.equal((await getEntitlements(company.id)).status, "CANCELLED");
    const invalid = providerSubscription();
    invalid.items.data[0].price = { ...invalid.items.data[0].price, id: "price_foreign" };
    remote.set(subscriptionId, invalid);
    await processBillingEvent(event(), stripe);
    assert.equal((await getEntitlements(company.id)).status, "EXPIRED");
    assert.equal((await getEntitlements(company.id)).plan.code, "FREE");
    remote.set(
      subscriptionId,
      providerSubscription({
        metadata: { appSubscriptionId: "------------------------------------" },
      }),
    );
    await processBillingEvent(event(), stripe);
    assert.equal((await getEntitlements(company.id)).status, "EXPIRED");
  });
  await check(
    "un ancien abonnement distinct ne remplace pas un abonnement actuel actif",
    async () => {
      remote.set(subscriptionId, providerSubscription());
      await processBillingEvent(event(), stripe);
      const previous = `sub_previous_${run}`;
      remote.set(previous, providerSubscription({ id: previous, status: "canceled" }));
      await processBillingEvent(
        event({ id: previous, object: "subscription" }, "customer.subscription.deleted"),
        stripe,
      );
      assert.equal((await getEntitlements(company.id)).plan.code, "PRO");
      assert.equal(
        (await db.subscription.findUniqueOrThrow({ where: { id: initial.id } }))
          .externalSubscriptionId,
        subscriptionId,
      );
    },
  );
  await check("des livraisons concurrentes du même événement restent uniques", async () => {
    const concurrent = event();
    const count = providerCalls;
    await Promise.all([
      processBillingEvent(concurrent, stripe),
      processBillingEvent(concurrent, stripe),
    ]);
    assert.equal(providerCalls, count + 1);
    assert.equal(await db.billingEvent.count({ where: { id: concurrent.id } }), 1);
  });
  console.log(
    `${checks} vérifications PostgreSQL abonnement réussies (Stripe simulé, signatures réelles).`,
  );
}
main()
  .finally(() => db.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
