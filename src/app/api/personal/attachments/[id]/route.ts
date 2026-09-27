import { getIdentity } from "@/lib/auth";
import { withApi } from "@/lib/http";
import { downloadPersonalAttachment } from "@/services/personal-attachment.service";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return withApi(async () =>
    downloadPersonalAttachment(await getIdentity(request), (await context.params).id),
  );
}
