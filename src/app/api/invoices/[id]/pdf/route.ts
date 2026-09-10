import { getActor } from "@/lib/auth";
import { withApi } from "@/lib/http";
import { invoicePdf } from "@/services/pdf.service";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return withApi(async () => invoicePdf(await getActor(request), (await context.params).id));
}
