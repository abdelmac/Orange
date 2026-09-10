import { getActor } from "@/lib/auth";
import { withApi } from "@/lib/http";
import { getDashboard } from "@/services/report.service";
export async function GET(request: Request) {
  return withApi(async () =>
    getDashboard(await getActor(request), new URL(request.url).searchParams),
  );
}
