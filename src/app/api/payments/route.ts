import { getActor } from "@/lib/auth";
import { assertSameOrigin, readJson, withApi } from "@/lib/http";
import { createPayment } from "@/services/payment.service";
import { listCollection } from "@/services/directory.service";
export async function GET(request: Request) {
  return withApi(async () =>
    listCollection(await getActor(request), "payments", new URL(request.url).searchParams),
  );
}
export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    return createPayment(await getActor(request), await readJson(request));
  });
}
