import Stripe from "stripe";
import { BusinessError } from "./finance-context";

export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key)
    throw new BusinessError(
      "Le paiement PRO n’est pas encore configuré. Contactez le support.",
      503,
    );
  return new Stripe(key, { maxNetworkRetries: 1, timeout: 8000 });
}
export function billingConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_PRO_PRICE_ID &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    process.env.APP_URL,
  );
}
export function billingOrigin() {
  if (!process.env.APP_URL)
    throw new BusinessError("Adresse de retour du paiement non configurée.", 503);
  return new URL(process.env.APP_URL).origin;
}
export function verifyBillingSignature(body: Uint8Array, signature: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new BusinessError("Webhook non configuré.", 503);
  if (!signature) throw new BusinessError("Signature Stripe manquante.", 400);
  try {
    return stripeClient().webhooks.constructEvent(Buffer.from(body), signature, secret);
  } catch {
    throw new BusinessError("Signature Stripe invalide.", 400);
  }
}
