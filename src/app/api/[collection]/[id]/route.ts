import { getActor } from "@/lib/auth";
import { assertSameOrigin, HttpError, readJson, withApi } from "@/lib/http";
import { updateDirectoryItem } from "@/services/directory.service";
import { getDirectoryItem } from "@/services/directory-read.service";

type Context = { params: Promise<{ collection: string; id: string }> };
export async function GET(request: Request, context: Context) {
  return withApi(async () => {
    const actor = await getActor(request);
    const { collection, id } = await context.params;
    return getDirectoryItem(actor, collection, id);
  });
}

export async function PATCH(request: Request, context: Context) {
  return withApi(async () => {
    assertSameOrigin(request);
    const actor = await getActor(request);
    const { collection, id } = await context.params;
    return updateDirectoryItem(actor, collection, id, await readJson(request));
  });
}

export async function DELETE(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    await getActor(request);
    throw new HttpError(
      405,
      "La suppression définitive n’est pas autorisée. Archivez les fiches ou annulez les transactions par une contre-écriture.",
    );
  });
}
