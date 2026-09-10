import { getActor } from "@/lib/auth";
import { assertSameOrigin, json, readJson, withApi } from "@/lib/http";
import { createDirectoryItem } from "@/services/directory.service";
import { listDirectory } from "@/services/directory-read.service";

type Context = { params: Promise<{ collection: string }> };
export async function GET(request: Request, context: Context) {
  return withApi(async () => {
    const actor = await getActor(request);
    const { collection } = await context.params;
    return { items: await listDirectory(actor, collection, new URL(request.url).searchParams) };
  });
}

export async function POST(request: Request, context: Context) {
  return withApi(async () => {
    assertSameOrigin(request);
    const actor = await getActor(request);
    const { collection } = await context.params;
    return json(await createDirectoryItem(actor, collection, await readJson(request)), 201);
  });
}
