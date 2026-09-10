import { getActor } from "@/lib/auth";
import { assertSameOrigin, readJson, withApi } from "@/lib/http";
import { createSale } from "@/services/invoice.service";
import { listCollection } from "@/services/directory.service";
export async function GET(request: Request) {
  return withApi(async () =>
    listCollection(await getActor(request), "sales", new URL(request.url).searchParams),
  );
}
export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    return createSale(await getActor(request), await readJson(request));
  });
}
