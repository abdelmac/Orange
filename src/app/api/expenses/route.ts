import { getActor } from "@/lib/auth";
import { assertSameOrigin, readJson, withApi } from "@/lib/http";
import { createExpense } from "@/services/expense.service";
import { listCollection } from "@/services/directory.service";
export async function GET(request: Request) {
  return withApi(async () =>
    listCollection(await getActor(request), "expenses", new URL(request.url).searchParams),
  );
}
export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    return createExpense(await getActor(request), await readJson(request));
  });
}
