import { getActor } from "@/lib/auth";
import { withApi } from "@/lib/http";
import { getReports } from "@/services/report.service";
export async function GET(request: Request) {
  return withApi(async () =>
    getReports(await getActor(request), new URL(request.url).searchParams),
  );
}
