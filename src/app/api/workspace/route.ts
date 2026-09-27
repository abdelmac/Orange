import { getIdentity } from "@/lib/auth";
import { assertSameOrigin, readJson, withApi } from "@/lib/http";
import { switchWorkspace } from "@/services/account.service";
export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    return switchWorkspace(await getIdentity(request), await readJson(request));
  });
}
