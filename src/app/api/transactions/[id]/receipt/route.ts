import { getActor } from "@/lib/auth";
import { assertSameOrigin, HttpError, withApi } from "@/lib/http";
import { issueReceipt } from "@/services/receipt.service";
import { receiptPdfResponse } from "@/services/receipt-pdf.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
    if (request.headers.get("sec-fetch-site") === "cross-site")
      throw new HttpError(403, "Ouvrez le reçu depuis votre application.");
    if (request.headers.has("origin")) assertSameOrigin(request);
    const actor = await getActor(request);
    const { id } = await context.params;
    return receiptPdfResponse(
      await issueReceipt(actor, id),
      new URL(request.url).searchParams.get("inline") === "1",
    );
  });
}
