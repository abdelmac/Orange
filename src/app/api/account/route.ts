import { getIdentity } from "@/lib/auth";
import { assertSameOrigin, readJson, withApi } from "@/lib/http";
import { updateAccount } from "@/services/account.service";
export async function GET(request: Request) {
  return withApi(async () => {
    const { sessionId: _sessionId, ...identity } = await getIdentity(request);
    void _sessionId;
    return identity;
  });
}
export async function PATCH(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    return updateAccount(await getIdentity(request), await readJson(request));
  });
}
