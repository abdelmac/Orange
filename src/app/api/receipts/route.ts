import { getActor } from "@/lib/auth";
import { assertSameOrigin, HttpError, withApi } from "@/lib/http";
import { issueReceiptForEntity } from "@/services/receipt.service";
import { receiptPdfResponse } from "@/services/receipt-pdf.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return withApi(async () => {
    if (request.headers.get("sec-fetch-site") === "cross-site")
      throw new HttpError(403, "Ouvrez le reçu depuis votre application.");
    if (request.headers.has("origin")) assertSameOrigin(request);
    const actor = await getActor(request);
    const params = new URL(request.url).searchParams;
    const receipt = await issueReceiptForEntity(actor, {
      entity: params.get("entity"),
      id: params.get("id"),
    });
    return receiptPdfResponse(receipt, params.get("inline") === "1");
  });
}
