import { getActor } from "@/lib/auth";
import { assertSameOrigin, readJson, withApi } from "@/lib/http";
import {
  getInvoiceCustomization,
  updateInvoiceCustomization,
} from "@/services/invoice-customization.service";

export async function GET(request: Request) {
  return withApi(async () => getInvoiceCustomization(await getActor(request)));
}
export async function PUT(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    return updateInvoiceCustomization(await getActor(request), await readJson(request));
  });
}
