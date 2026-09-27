import { db } from "@/lib/db";
import { BusinessError, type Tx } from "@/lib/finance-context";
import {
  effectivePlanCode,
  getPlanLimits,
  hasFeature,
  PLAN_DEFINITIONS,
  type Feature,
  type PlanCode,
} from "@/lib/plans";

export async function ensurePlan(code: PlanCode, tx: Tx = db) {
  const definition = PLAN_DEFINITIONS[code];
  return tx.subscriptionPlan.upsert({
    where: { code },
    update: {},
    create: {
      code,
      name: definition.name,
      monthlyPriceMinor: definition.monthlyPriceMinor,
      currency: definition.currency,
      features: [...definition.features],
    },
  });
}
export async function ensureFreeSubscription(companyId: string, tx: Tx = db) {
  const plan = await ensurePlan("FREE", tx);
  return tx.subscription.upsert({
    where: { companyId },
    update: {},
    create: { companyId, planId: plan.id, status: "FREE" },
  });
}
export async function ensurePersonalSubscription(userId: string, tx: Tx = db) {
  const plan = await ensurePlan("FREE", tx);
  return tx.subscription.upsert({
    where: { userId },
    update: {},
    create: { userId, planId: plan.id, status: "FREE" },
  });
}
export async function getEntitlements(companyId: string, tx: Tx = db) {
  const subscription = await tx.subscription.findUnique({
    where: { companyId },
    include: { plan: true },
  });
  return describeEntitlements(subscription);
}
export function describeEntitlements(
  subscription:
    (NonNullable<Parameters<typeof effectivePlanCode>[0]> & { cancelAtPeriodEnd?: boolean }) | null,
) {
  const code = effectivePlanCode(subscription);
  const definition = PLAN_DEFINITIONS[code];
  return {
    plan: {
      code,
      name: definition.name,
      monthlyPriceMinor: definition.monthlyPriceMinor,
      currency: definition.currency,
    },
    features: [...definition.features] as string[],
    limits: getPlanLimits(code),
    status: subscription?.status ?? "FREE",
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
  };
}
export async function requireFeature(companyId: string, feature: Feature, tx: Tx = db) {
  const entitlements = await getEntitlements(companyId, tx);
  if (!hasFeature(entitlements, feature))
    throw new BusinessError("Cette fonctionnalité nécessite l’offre PRO.", 403);
  return entitlements;
}
