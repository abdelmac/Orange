import { getIdentity } from "@/lib/auth";
import { assertSameOrigin, HttpError, readJson, withApi } from "@/lib/http";
import {
  createPersonalAccount,
  createPersonalCategory,
  savePersonalBudget,
  savePersonalTransaction,
} from "@/services/personal.service";
import { getPersonalOverview } from "@/services/personal-report.service";

type Context = { params: Promise<{ resource: string }> };
export async function GET(request: Request, context: Context) {
  return withApi(async () => {
    const { resource } = await context.params;
    if (resource !== "overview") throw new HttpError(404, "Ressource personnelle introuvable.");
    return getPersonalOverview(
      await getIdentity(request),
      Object.fromEntries(new URL(request.url).searchParams),
    );
  });
}
export async function POST(request: Request, context: Context) {
  return withApi(async () => {
    assertSameOrigin(request);
    const identity = await getIdentity(request);
    const { resource } = await context.params;
    const body = await readJson(request);
    switch (resource) {
      case "accounts":
        return createPersonalAccount(identity, body);
      case "categories":
        return createPersonalCategory(identity, body);
      case "transactions":
        return savePersonalTransaction(identity, body);
      case "budgets":
        return savePersonalBudget(identity, body);
      default:
        throw new HttpError(404, "Ressource personnelle introuvable.");
    }
  });
}
