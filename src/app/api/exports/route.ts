import { getActor } from "@/lib/auth";
import { withApi } from "@/lib/http";
import { exportReport } from "@/services/export.service";
export async function GET(request: Request) {
  return withApi(async () =>
    exportReport(await getActor(request), new URL(request.url).searchParams),
  );
}
