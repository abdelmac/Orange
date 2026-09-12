import { getActor } from "@/lib/auth";
import { withApi } from "@/lib/http";
import { getDaybook } from "@/services/daybook.service";

export async function GET(request: Request) {
  return withApi(async () =>
    getDaybook(await getActor(request), new URL(request.url).searchParams),
  );
}
