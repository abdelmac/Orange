import { getActor } from "@/lib/auth";
import { withApi } from "@/lib/http";
import { downloadAttachment } from "@/services/attachment.service";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return withApi(async () =>
    downloadAttachment(await getActor(request), (await context.params).id),
  );
}
