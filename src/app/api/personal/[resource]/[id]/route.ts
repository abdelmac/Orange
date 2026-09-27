import { getIdentity } from "@/lib/auth";
import { assertSameOrigin, HttpError, readJson, withApi } from "@/lib/http";
import { savePersonalTransaction, updatePersonalAccount } from "@/services/personal.service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ resource: string; id: string }> },
) {
  return withApi(async () => {
    assertSameOrigin(request);
    const identity = await getIdentity(request);
    const { resource, id } = await context.params;
    const body = await readJson(request);
    if (resource === "transactions") return savePersonalTransaction(identity, body, id);
    if (resource === "accounts") return updatePersonalAccount(identity, id, body);
    throw new HttpError(404, "Ressource personnelle introuvable.");
  });
}
