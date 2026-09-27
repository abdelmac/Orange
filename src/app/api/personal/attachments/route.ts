import { getIdentity } from "@/lib/auth";
import { assertSameOrigin, HttpError, readBoundedBody, withApi } from "@/lib/http";
import { uploadPersonalAttachment } from "@/services/personal-attachment.service";
export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    const identity = await getIdentity(request);
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.startsWith("multipart/form-data;"))
      throw new HttpError(415, "Un formulaire de téléversement est attendu.");
    const bytes = await readBoundedBody(request, 11 * 1024 * 1024);
    let form: FormData;
    try {
      form = await new Response(bytes, { headers: { "Content-Type": contentType } }).formData();
    } catch {
      throw new HttpError(400, "Formulaire invalide.");
    }
    return uploadPersonalAttachment(identity, form);
  });
}
