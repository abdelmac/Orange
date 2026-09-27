import { getIdentity } from "@/lib/auth";
import { assertSameOrigin, HttpError, withApi } from "@/lib/http";
import { startCheckout, openBillingPortal, changeRenewal } from "@/services/billing.service";
export function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  return withApi(async () => {
    assertSameOrigin(request);
    if (/OrangeFinanceNative/.test(request.headers.get("user-agent") ?? ""))
      throw new HttpError(403, "L’achat d’abonnement n’est pas disponible dans cette application.");
    const identity = await getIdentity(request),
      { action } = await context.params;
    if (action === "checkout") return startCheckout(identity);
    if (action === "portal") return openBillingPortal(identity);
    if (action === "cancel" || action === "resume")
      return changeRenewal(identity, action === "cancel");
    throw new HttpError(404, "Action inconnue.");
  });
}
