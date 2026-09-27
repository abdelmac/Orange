export const FEATURES = [
  "clients",
  "invoices",
  "expenses",
  "incomes",
  "dashboard",
  "invoice_pdf",
  "invoice_customization",
  "remove_branding",
  "teams",
  "advanced_reports",
] as const;
export type Feature = (typeof FEATURES)[number];
export type PlanLimits = {
  maxTeamMembers: number | null;
  maxClients: number | null;
  maxInvoicesPerMonth: number | null;
};
const core: Feature[] = ["clients", "invoices", "expenses", "incomes", "dashboard", "invoice_pdf"];
export const PLAN_DEFINITIONS = {
  FREE: {
    name: "FREE",
    monthlyPriceMinor: 0,
    currency: "EUR",
    features: core,
    limits: { maxTeamMembers: 1, maxClients: null, maxInvoicesPerMonth: null },
  },
  PRO: {
    name: "PRO",
    monthlyPriceMinor: 400,
    currency: "EUR",
    features: [...FEATURES],
    limits: { maxTeamMembers: 25, maxClients: null, maxInvoicesPerMonth: null },
  },
  LEGACY: {
    name: "Accès existant",
    monthlyPriceMinor: 0,
    currency: "EUR",
    features: [...core, "teams", "advanced_reports"] as Feature[],
    limits: { maxTeamMembers: null, maxClients: null, maxInvoicesPerMonth: null },
  },
} as const;
export type PlanCode = keyof typeof PLAN_DEFINITIONS;
export function hasFeature(entitlements: { features: readonly string[] }, feature: Feature) {
  return entitlements.features.includes(feature);
}
export function getPlanLimits(code: string): PlanLimits {
  return PLAN_DEFINITIONS[code as PlanCode]?.limits ?? PLAN_DEFINITIONS.FREE.limits;
}
export function effectivePlanCode(
  subscription: { status: string; currentPeriodEnd: Date | null; plan: { code: string } } | null,
  now = new Date(),
): PlanCode {
  if (!subscription) return "FREE";
  if (subscription.plan.code === "LEGACY") return "LEGACY";
  if (
    subscription.plan.code === "PRO" &&
    subscription.status === "ACTIVE" &&
    subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd > now
  )
    return "PRO";
  return "FREE";
}
