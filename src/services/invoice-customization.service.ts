import { PDFDocument } from "pdf-lib";
import { db } from "../lib/db";
import {
  atomic,
  BusinessError,
  requirePermission,
  type Actor,
  type Tx,
} from "../lib/finance-context";
import {
  defaultInvoiceSettings,
  invoiceCustomizationInput,
  invoicePresentation,
  type InvoiceCustomizationSettings,
} from "../lib/invoice-customization";
import { getEntitlements, requireFeature } from "./entitlement.service";
import { audit } from "./audit.service";

export async function createInvoicePresentation(
  tx: Tx,
  companyId: string,
  draft?: InvoiceCustomizationSettings,
) {
  const [company, stored, entitlements] = await Promise.all([
    tx.company.findUniqueOrThrow({ where: { id: companyId } }),
    tx.invoiceCustomization.findUnique({ where: { companyId } }),
    getEntitlements(companyId, tx),
  ]);
  const settings =
    draft ?? invoiceCustomizationInput.parse(stored?.settings ?? { currency: company.currency });
  return invoicePresentation(
    company,
    settings,
    {
      customization: entitlements.features.includes("invoice_customization"),
      removeBranding: entitlements.features.includes("remove_branding"),
      logo: entitlements.features.includes("invoice_customization"),
      colors: entitlements.features.includes("invoice_customization"),
      fields: entitlements.features.includes("invoice_customization"),
      template: entitlements.features.includes("invoice_customization"),
    },
    { data: stored?.logoData ?? null, mime: stored?.logoMime ?? null },
  );
}

export async function getInvoiceCustomization(actor: Actor) {
  requirePermission(actor, "settings.edit");
  const [record, company, entitlements] = await Promise.all([
    db.invoiceCustomization.findUnique({
      where: { companyId: actor.companyId },
      select: { settings: true, logoMime: true, updatedAt: true },
    }),
    db.company.findUniqueOrThrow({ where: { id: actor.companyId } }),
    getEntitlements(actor.companyId),
  ]);
  return {
    settings: entitlements.features.includes("invoice_customization")
      ? { ...invoiceCustomizationInput.parse(record?.settings ?? {}), currency: company.currency }
      : defaultInvoiceSettings(company.currency),
    company: {
      name: company.name,
      currency: company.currency,
      address: company.address,
      phone: company.phone,
      email: company.email,
      taxNumber: company.taxNumber,
    },
    hasLogo: !!record?.logoMime,
    canCustomize: entitlements.features.includes("invoice_customization"),
  };
}

export async function updateInvoiceCustomization(actor: Actor, raw: unknown) {
  requirePermission(actor, "settings.edit");
  const settings = invoiceCustomizationInput.parse(raw);
  return atomic(async (tx) => {
    await requireFeature(actor.companyId, "invoice_customization", tx);
    if (settings.removeBranding) await requireFeature(actor.companyId, "remove_branding", tx);
    const company = await tx.company.findUniqueOrThrow({ where: { id: actor.companyId } });
    if (settings.currency !== company.currency)
      throw new BusinessError(
        "La devise doit correspondre à celle de l’entreprise. Les factures et la caisse utilisent la même devise.",
      );
    const before = await tx.invoiceCustomization.findUnique({
      where: { companyId: actor.companyId },
      select: { settings: true },
    });
    const result = await tx.invoiceCustomization.upsert({
      where: { companyId: actor.companyId },
      create: { companyId: actor.companyId, settings },
      update: { settings },
      select: { id: true, settings: true },
    });
    await audit(tx, actor, {
      action: "UPDATE",
      entity: "InvoiceCustomization",
      entityId: result.id,
      before: before?.settings ?? {},
      after: settings,
    });
    return result;
  });
}

export const MAX_LOGO_BYTES = 1_000_000;
/** Decode the actual image before storing it; file extensions and request MIME are not trusted. */
export async function validateInvoiceLogo(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_LOGO_BYTES)
    throw new BusinessError("Le logo doit faire moins de 1 Mo.", 413);
  const png = Buffer.from(bytes.subarray(0, 8)).equals(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!png && !jpg) throw new BusinessError("Choisissez un logo PNG ou JPEG.");
  // Inspect declared dimensions before the PNG decoder allocates its pixel buffer.
  if (png && bytes.length >= 24) {
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (data.getUint32(16) > 2400 || data.getUint32(20) > 2400)
      throw new BusinessError("Le logo ne doit pas dépasser 2 400 pixels de côté.");
  }
  try {
    const document = await PDFDocument.create();
    const image = png ? await document.embedPng(bytes) : await document.embedJpg(bytes);
    if (image.width > 2400 || image.height > 2400 || image.width < 1 || image.height < 1)
      throw new BusinessError("Le logo ne doit pas dépasser 2 400 pixels de côté.");
  } catch (error) {
    if (error instanceof BusinessError) throw error;
    throw new BusinessError("Ce fichier image est invalide.");
  }
  return png ? "image/png" : "image/jpeg";
}

export async function updateInvoiceLogo(actor: Actor, bytes: Uint8Array | null) {
  requirePermission(actor, "settings.edit");
  await requireFeature(actor.companyId, "invoice_customization");
  const mime = bytes ? await validateInvoiceLogo(bytes) : null;
  return atomic(async (tx) => {
    await requireFeature(actor.companyId, "invoice_customization", tx);
    const record = await tx.invoiceCustomization.upsert({
      where: { companyId: actor.companyId },
      create: {
        companyId: actor.companyId,
        logoData: bytes ? Buffer.from(bytes) : null,
        logoMime: mime,
      },
      update: { logoData: bytes ? Buffer.from(bytes) : null, logoMime: mime },
      select: { id: true },
    });
    await audit(tx, actor, {
      action: bytes ? "LOGO_UPLOAD" : "LOGO_REMOVE",
      entity: "InvoiceCustomization",
      entityId: record.id,
      after: { mime, bytes: bytes?.length ?? 0 },
    });
    return { hasLogo: !!bytes };
  });
}

export async function invoiceLogoResponse(actor: Actor) {
  requirePermission(actor, "settings.edit");
  const record = await db.invoiceCustomization.findUnique({
    where: { companyId: actor.companyId },
    select: { logoData: true, logoMime: true },
  });
  if (!record?.logoData || !record.logoMime) throw new BusinessError("Aucun logo enregistré.", 404);
  return new Response(new Uint8Array(record.logoData), {
    headers: {
      "Content-Type": record.logoMime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
