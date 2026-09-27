import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).default("");
export const invoiceCustomizationInput = z
  .object({
    displayName: text(200),
    address: text(2000),
    phone: text(100),
    email: z.union([z.email(), z.literal("")]).default(""),
    taxNumber: text(150),
    legalInformation: text(3000),
    bankDetails: text(1000),
    primaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#253f42"),
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#ee6425"),
    template: z.enum(["CLASSIC", "MODERN", "MINIMAL"]).default("CLASSIC"),
    showLogo: z.boolean().default(true),
    showContact: z.boolean().default(true),
    removeBranding: z.boolean().default(false),
    headerText: text(1000),
    footerText: text(2000),
    terms: text(5000),
    thankYou: text(500),
    defaultNotes: text(5000),
    defaultDueDays: z.number().int().min(0).max(365).default(30),
    prefix: z
      .string()
      .trim()
      .regex(
        /^[A-Z0-9][A-Z0-9-]{0,15}$/,
        "Préfixe : 1 à 16 lettres majuscules, chiffres ou tirets.",
      )
      .default("FAC"),
    numberFormat: z.enum(["DASH", "SLASH"]).default("DASH"),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default("EUR"),
    dateFormat: z.enum(["FR", "ISO", "LONG"]).default("FR"),
    columns: z
      .object({
        quantity: z.boolean().default(true),
        unitPrice: z.boolean().default(true),
        tax: z.boolean().default(true),
        discount: z.boolean().default(true),
      })
      .default({ quantity: true, unitPrice: true, tax: true, discount: true }),
    customFields: z
      .array(
        z
          .object({ label: z.string().trim().min(1).max(80), value: z.string().trim().max(500) })
          .strict(),
      )
      .max(8)
      .default([]),
  })
  .strict();

export type InvoiceCustomizationSettings = z.infer<typeof invoiceCustomizationInput>;
export type InvoiceIssuer = {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxNumber: string | null;
  currency: string;
};
export const invoicePresentationInput = z.object({
  version: z.literal(1),
  settings: invoiceCustomizationInput,
  issuer: z.object({
    name: z.string(),
    address: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    taxNumber: z.string().nullable(),
    currency: z.string(),
  }),
  brandingVisible: z.boolean(),
  logoBase64: z.string().max(1_400_000).nullable(),
  logoMime: z.enum(["image/png", "image/jpeg"]).nullable(),
});
export type InvoicePresentation = z.infer<typeof invoicePresentationInput>;

export function defaultInvoiceSettings(currency: string) {
  return invoiceCustomizationInput.parse({ currency });
}

/** No request-provided entitlement or branding decision is accepted here. */
export function invoicePresentation(
  company: InvoiceIssuer,
  settings: InvoiceCustomizationSettings,
  features: {
    customization: boolean;
    removeBranding: boolean;
    logo: boolean;
    colors: boolean;
    fields: boolean;
    template: boolean;
  },
  logo?: { data: Uint8Array | null; mime: string | null },
): InvoicePresentation {
  const effective = features.customization
    ? { ...settings }
    : defaultInvoiceSettings(company.currency);
  if (!features.colors) {
    effective.primaryColor = "#253f42";
    effective.accentColor = "#ee6425";
  }
  if (!features.fields) effective.customFields = [];
  if (!features.template) effective.template = "CLASSIC";
  effective.currency = company.currency;
  const showLogo =
    features.customization &&
    features.logo &&
    effective.showLogo &&
    logo?.data &&
    (logo.mime === "image/png" || logo.mime === "image/jpeg");
  return {
    version: 1,
    settings: effective,
    issuer: {
      name: effective.displayName || company.name,
      address: effective.address || company.address,
      phone: effective.phone || company.phone,
      email: effective.email || company.email,
      taxNumber: effective.taxNumber || company.taxNumber,
      currency: company.currency,
    },
    brandingVisible: !(
      features.customization &&
      features.removeBranding &&
      effective.removeBranding
    ),
    logoBase64: showLogo ? Buffer.from(logo.data!).toString("base64") : null,
    logoMime: showLogo ? (logo.mime as "image/png" | "image/jpeg") : null,
  };
}

export function formatInvoiceNumber(
  sequence: number,
  year: number,
  settings: Pick<InvoiceCustomizationSettings, "prefix" | "numberFormat">,
) {
  const separator = settings.numberFormat === "SLASH" ? "/" : "-";
  return [settings.prefix, year, String(sequence).padStart(6, "0")].join(separator);
}

export function invoiceDate(value: Date, format: InvoiceCustomizationSettings["dateFormat"]) {
  if (format === "ISO") return value.toISOString().slice(0, 10);
  return value.toLocaleDateString("fr-FR", {
    timeZone: "UTC",
    ...(format === "LONG" ? ({ day: "numeric", month: "long", year: "numeric" } as const) : {}),
  });
}
