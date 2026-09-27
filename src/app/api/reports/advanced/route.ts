import { getActor } from "@/lib/auth";
import { withApi } from "@/lib/http";
import { getAdvancedReport } from "@/services/advanced-report.service";
export async function GET(request: Request) {
  return withApi(async () => getAdvancedReport(await getActor(request)));
}
