import { getActor } from "@/lib/auth";
import { assertSameOrigin, HttpError, readBoundedBody, withApi } from "@/lib/http";
import { listAttachments, uploadAttachment } from "@/services/attachment.service";
export async function GET(request: Request) {
  return withApi(async () =>
    listAttachments(await getActor(request), Object.fromEntries(new URL(request.url).searchParams)),
  );
}
export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    const actor = await getActor(request);
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.startsWith("multipart/form-data;"))
      throw new HttpError(415, "Un formulaire de téléversement est attendu.");
    const bytes = await readBoundedBody(request, 11 * 1024 * 1024);
    let formData: FormData;
    try {
      formData = await new Response(bytes, { headers: { "Content-Type": contentType } }).formData();
    } catch {
      throw new HttpError(400, "Le formulaire de téléversement est invalide.");
    }
    return uploadAttachment(actor, formData);
  });
}
