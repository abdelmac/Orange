import { getActor } from "@/lib/auth";
import { assertSameOrigin, readJson, withApi } from "@/lib/http";
import { invoicePreview } from "@/services/pdf.service";

export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    return invoicePreview(await getActor(request), await readJson(request));
  });
}
