import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import type { getIdentity } from "@/lib/auth";
import { db } from "@/lib/db";
import { atomic, BusinessError, idInput, type Tx } from "@/lib/finance-context";
import { billingConfigured, billingOrigin, stripeClient } from "@/lib/stripe";
import {
  describeEntitlements,
  ensureFreeSubscription,
  ensurePersonalSubscription,
  ensurePlan,
} from "./entitlement.service";

type Identity = Awaited<ReturnType<typeof getIdentity>>;
export async function billingAccount(identity: Identity, ownerRequired = false) {
  const member = identity.companyId
    ? await db.companyMembership.findUnique({
        where: { companyId_userId: { companyId: identity.companyId, userId: identity.id } },
      })
    : null;
  if (identity.companyId && !member?.active) throw new BusinessError("Espace inaccessible.", 403);
  const canManage = !identity.companyId || Boolean(member?.isOwner);
  if (ownerRequired && !canManage)
    throw new BusinessError("Seul le propriétaire peut gérer l’abonnement.", 403);
  const subscription = identity.companyId
    ? await ensureFreeSubscription(identity.companyId)
    : await ensurePersonalSubscription(identity.id);
  return { subscription, canManage };
}
export async function billingSummary(identity: Identity) {
  const { subscription, canManage } = await billingAccount(identity);
  const plan = await db.subscriptionPlan.findUniqueOrThrow({ where: { id: subscription.planId } });
  return {
    ...describeEntitlements({ ...subscription, plan }),
    canManage,
    configured: Boolean(identity.companyId) && billingConfigured(),
    hasCustomer: Boolean(subscription.stripeCustomerId),
    scope: identity.companyId ? "BUSINESS" : "PERSONAL",
  };
}
function assertPrice(price: Stripe.Price) {
  if (
    !price.active ||
    price.unit_amount !== 400 ||
    price.currency !== "eur" ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1 ||
    price.billing_scheme !== "per_unit" ||
    price.transform_quantity
  )
    throw new BusinessError("Le tarif Stripe doit être de 4 EUR par mois, par abonnement.", 503);
}
export async function startCheckout(identity: Identity, stripe = stripeClient()) {
  if (!identity.companyId)
    throw new BusinessError(
      "L’offre PRO concerne l’espace entreprise. Vos finances personnelles restent gratuites.",
      409,
    );
  if (!billingConfigured())
    throw new BusinessError("Le paiement PRO n’est pas encore configuré.", 503);
  const { subscription: initial } = await billingAccount(identity, true);
  const priceId = process.env.STRIPE_PRO_PRICE_ID!;
  assertPrice(await stripe.prices.retrieve(priceId));
  // Stable idempotency survives a server crash between Stripe creation and the local write.
  let customer = initial.stripeCustomerId;
  if (!customer) {
    const created = await stripe.customers.create(
      { email: identity.email, name: identity.name, metadata: { appSubscriptionId: initial.id } },
      { idempotencyKey: `orange-customer-${initial.id}` },
    );
    customer = created.id;
    await db.subscription.updateMany({
      where: { id: initial.id, stripeCustomerId: null },
      data: { stripeCustomerId: customer },
    });
  }
  const reserved = await atomic(async (tx) => {
    const current = await tx.subscription.findUniqueOrThrow({ where: { id: initial.id } });
    if (
      current.externalSubscriptionId &&
      !["CANCELLED", "EXPIRED", "FREE"].includes(current.status)
    )
      throw new BusinessError("Un abonnement existe déjà. Utilisez le portail de gestion.", 409);
    if (
      current.checkoutAttempt &&
      current.checkoutExpiresAt &&
      current.checkoutExpiresAt.getTime() > Date.now() + 60_000
    )
      return current;
    return tx.subscription.update({
      where: { id: initial.id },
      data: {
        checkoutAttempt: randomUUID(),
        checkoutSessionId: null,
        checkoutExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    });
  });
  if (reserved.checkoutSessionId) {
    const session = await stripe.checkout.sessions.retrieve(reserved.checkoutSessionId);
    if (session.status === "open" && session.url) return { url: session.url };
    throw new BusinessError(
      "Le paiement est en cours de confirmation. Actualisez dans un instant.",
      409,
    );
  }
  const origin = billingOrigin();
  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer,
      line_items: [{ price: priceId, quantity: 1 }],
      locale: "fr",
      client_reference_id: initial.id,
      metadata: { appSubscriptionId: initial.id },
      subscription_data: { metadata: { appSubscriptionId: initial.id } },
      expires_at: Math.floor(reserved.checkoutExpiresAt!.getTime() / 1000),
      success_url: `${origin}/abonnement?checkout=success`,
      cancel_url: `${origin}/abonnement?checkout=cancelled`,
    },
    { idempotencyKey: `orange-checkout-${reserved.checkoutAttempt}` },
  );
  await db.subscription.updateMany({
    where: { id: initial.id, checkoutAttempt: reserved.checkoutAttempt },
    data: { checkoutSessionId: session.id },
  });
  if (!session.url) throw new BusinessError("Impossible d’ouvrir le paiement.", 502);
  return { url: session.url };
}
export async function openBillingPortal(identity: Identity, stripe = stripeClient()) {
  const { subscription } = await billingAccount(identity, true);
  if (!subscription.stripeCustomerId) throw new BusinessError("Aucun abonnement Stripe à gérer.");
  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${billingOrigin()}/abonnement`,
  });
  return { url: session.url };
}
export async function changeRenewal(identity: Identity, cancel: boolean, stripe = stripeClient()) {
  const { subscription } = await billingAccount(identity, true);
  if (
    !subscription.externalSubscriptionId ||
    ["FREE", "CANCELLED", "EXPIRED"].includes(subscription.status)
  )
    throw new BusinessError("Aucun abonnement actif à modifier.");
  // The signed webhook, not the browser response, updates entitlements.
  await stripe.subscriptions.update(subscription.externalSubscriptionId, {
    cancel_at_period_end: cancel,
  });
  return {
    ok: true,
    message: cancel
      ? "Résiliation demandée à la fin de la période payée."
      : "Renouvellement réactivé. Confirmation en cours.",
  };
}

export function stripeSubscriptionStatus(subscription: Stripe.Subscription) {
  if (subscription.status === "active") return "ACTIVE" as const;
  if (
    subscription.status === "past_due" ||
    subscription.status === "unpaid" ||
    subscription.status === "paused"
  )
    return "PAST_DUE" as const;
  if (subscription.status === "canceled") return "CANCELLED" as const;
  if (subscription.status === "incomplete_expired") return "EXPIRED" as const;
  return "FREE" as const;
}
function subscriptionId(event: Stripe.Event) {
  const object = event.data.object;
  if (object.object === "subscription") return object.id;
  if (object.object === "checkout.session")
    return typeof object.subscription === "string" ? object.subscription : object.subscription?.id;
  if (object.object === "invoice") {
    const subscription = object.parent?.subscription_details?.subscription;
    return typeof subscription === "string" ? subscription : subscription?.id;
  }
  return undefined;
}
async function synchronizeSubscription(tx: Tx, subscription: Stripe.Subscription) {
  const appId = subscription.metadata.appSubscriptionId;
  if (!appId || !idInput.safeParse(appId).success) return;
  // Distinct Stripe subscription IDs can still target the same local account.
  // Serialize at that boundary too before deciding whether a purchase supersedes another.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing-account:${appId}`}))`;
  const current = await tx.subscription.findUnique({ where: { id: appId } });
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  if (!current || current.stripeCustomerId !== customerId) return;
  // A late event from a cancelled subscription cannot overwrite a newer purchase.
  if (
    current.externalSubscriptionId &&
    current.externalSubscriptionId !== subscription.id &&
    !["CANCELLED", "EXPIRED", "FREE"].includes(current.status)
  )
    return;
  const item = subscription.items.data[0];
  const validPrice =
    subscription.items.data.length === 1 &&
    item?.price.id === process.env.STRIPE_PRO_PRICE_ID &&
    item.price.unit_amount === 400 &&
    item.price.currency === "eur" &&
    item.quantity === 1 &&
    item.price.recurring?.interval === "month" &&
    item.price.recurring.interval_count === 1;
  const status = validPrice ? stripeSubscriptionStatus(subscription) : "EXPIRED";
  const plan = await ensurePlan("PRO", tx);
  const next = {
    planId: plan.id,
    status,
    currentPeriodStart: item ? new Date(item.current_period_start * 1000) : null,
    currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    externalSubscriptionId: subscription.id,
    ...(["ACTIVE", "CANCELLED", "EXPIRED"].includes(status)
      ? { checkoutSessionId: null, checkoutAttempt: null, checkoutExpiresAt: null }
      : {}),
  };
  await tx.subscription.update({ where: { id: current.id }, data: next });
  if (current.companyId)
    await tx.auditLog.create({
      data: {
        companyId: current.companyId,
        userName: "Stripe (webhook signé)",
        action: "SUBSCRIPTION_SYNC",
        entity: "Subscription",
        entityId: current.id,
        before: { status: current.status, cancelAtPeriodEnd: current.cancelAtPeriodEnd },
        after: { status, cancelAtPeriodEnd: next.cancelAtPeriodEnd },
      },
    });
}
const supportedEvents = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);
export async function processBillingEvent(event: Stripe.Event, stripe = stripeClient()) {
  if (!supportedEvents.has(event.type)) return { received: true };
  const externalId = subscriptionId(event);
  if (!externalId) return { received: true };
  // Serialize each Stripe subscription and fetch its CURRENT state under the lock.
  // Replayed/out-of-order payloads cannot restore old rights. No card data is stored.
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing:${externalId}`}))`;
      if (await tx.billingEvent.findUnique({ where: { id: event.id } }))
        return { received: true, duplicate: true };
      const subscription = await stripe.subscriptions.retrieve(externalId);
      await synchronizeSubscription(tx, subscription);
      await tx.billingEvent.create({ data: { id: event.id, type: event.type } });
      return { received: true };
    },
    { timeout: 20000, maxWait: 10000 },
  );
}
