import { getIdentity } from "@/lib/auth";
import { withApi } from "@/lib/http";
import { billingSummary } from "@/services/billing.service";
export function GET(request: Request) {
  return withApi(async () => billingSummary(await getIdentity(request)));
}
