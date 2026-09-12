import { getActor } from "@/lib/auth";
import { withApi, json } from "@/lib/http";
import { accountingExport } from "@/services/accounting-export.service";

export async function GET(request: Request) {
  return withApi(async () => {
    const data = await accountingExport(await getActor(request), new URL(request.url).searchParams);
    const response = json(data);
    response.headers.set(
      "Content-Disposition",
      `attachment; filename="orange-comptabilite-v1-page-${data.page}.json"`,
    );
    return response;
  });
}
