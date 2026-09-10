import { getActor } from "@/lib/auth";
import { assertSameOrigin, readJson, withApi } from "@/lib/http";
import { adjustCash } from "@/services/cash.service";
export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    return adjustCash(await getActor(request), await readJson(request));
  });
}
