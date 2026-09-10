import { getActor } from "@/lib/auth";
import { assertSameOrigin, readJson, withApi } from "@/lib/http";
import { handoverCash } from "@/services/salesperson.service";
export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    return handoverCash(await getActor(request), await readJson(request));
  });
}
