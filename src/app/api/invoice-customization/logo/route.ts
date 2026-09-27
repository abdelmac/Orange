import { getActor } from "@/lib/auth";
import { assertSameOrigin, readBoundedBody, withApi } from "@/lib/http";
import {
  invoiceLogoResponse,
  MAX_LOGO_BYTES,
  updateInvoiceLogo,
} from "@/services/invoice-customization.service";

export async function GET(request: Request) {
  return withApi(async () => invoiceLogoResponse(await getActor(request)));
}
export async function PUT(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    const actor = await getActor(request);
    return updateInvoiceLogo(actor, await readBoundedBody(request, MAX_LOGO_BYTES));
  });
}
export async function DELETE(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    return updateInvoiceLogo(await getActor(request), null);
  });
}
