import { readBoundedBody, withApi } from "@/lib/http";
import { verifyBillingSignature } from "@/lib/stripe";
import { processBillingEvent } from "@/services/billing.service";
export const runtime = "nodejs";
export function POST(request: Request) {
  return withApi(async () =>
    processBillingEvent(
      verifyBillingSignature(
        await readBoundedBody(request),
        request.headers.get("stripe-signature"),
      ),
    ),
  );
}
