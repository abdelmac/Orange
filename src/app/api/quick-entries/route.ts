import { getActor } from "@/lib/auth";
import { assertSameOrigin, readJson, withApi } from "@/lib/http";
import { createQuickEntry } from "@/services/quick-entry.service";

export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    return createQuickEntry(await getActor(request), await readJson(request));
  });
}
