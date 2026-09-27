import { getActor } from "@/lib/auth";
import { assertSameOrigin, readJson, withApi } from "@/lib/http";
import { inviteMember, cancelInvitation } from "@/services/team.service";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
    assertSameOrigin(request);
    return inviteMember(
      await getActor(request),
      await readJson(request),
      (await context.params).id,
    );
  });
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
    assertSameOrigin(request);
    return cancelInvitation(await getActor(request), (await context.params).id);
  });
}
