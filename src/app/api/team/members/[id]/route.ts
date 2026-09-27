import { getActor } from "@/lib/auth";
import { assertSameOrigin, readJson, withApi } from "@/lib/http";
import { updateMember } from "@/services/team.service";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
    assertSameOrigin(request);
    return updateMember(
      await getActor(request),
      (await context.params).id,
      await readJson(request),
    );
  });
}
