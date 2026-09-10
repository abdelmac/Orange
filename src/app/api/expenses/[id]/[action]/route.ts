import { getActor } from "@/lib/auth";
import { assertSameOrigin, HttpError, readJson, withApi } from "@/lib/http";
import { approveExpense, rejectExpense, payExpense } from "@/services/expense.service";
import { z } from "zod";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; action: string }> },
) {
  return withApi(async () => {
    assertSameOrigin(request);
    const actor = await getActor(request),
      { id, action } = await context.params;
    const body = z.record(z.string(), z.unknown()).parse(await readJson(request));
    const input = { ...body, id };
    if (action === "approve") return approveExpense(actor, input);
    if (action === "reject") return rejectExpense(actor, input);
    if (action === "pay") return payExpense(actor, input);
    throw new HttpError(404, "Action introuvable.");
  });
}
