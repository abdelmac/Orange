import { getActor } from "@/lib/auth";
import { assertSameOrigin, readJson, withApi } from "@/lib/http";
import { reverseTransaction } from "@/services/transaction.service";
import { z } from "zod";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
    assertSameOrigin(request);
    const actor = await getActor(request),
      { id } = await context.params;
    const body = z.record(z.string(), z.unknown()).parse(await readJson(request));
    return reverseTransaction(actor, { ...body, id });
  });
}
