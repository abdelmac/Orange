import { getActor } from "@/lib/auth";
import { assertSameOrigin, readJson, withApi } from "@/lib/http";
import { transferCash } from "@/services/cash.service";
export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    return transferCash(await getActor(request), await readJson(request));
  });
}
