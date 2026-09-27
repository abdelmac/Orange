import { getActor } from "@/lib/auth";
import { assertSameOrigin, readJson, withApi } from "@/lib/http";
import { inviteMember, listTeam } from "@/services/team.service";
export async function GET(request: Request) {
  return withApi(async () => listTeam(await getActor(request)));
}
export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    return inviteMember(await getActor(request), await readJson(request));
  });
}
