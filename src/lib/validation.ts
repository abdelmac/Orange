import { z } from "zod";

export const uuid = z.uuid();
export const optionalId = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  uuid.optional(),
);
export const optionalText = z.string().trim().max(4000).optional();
export const optionalEmail = z.union([z.email().max(254), z.literal("")]).optional();
export const amountInput = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Saisissez un montant positif avec au plus deux décimales.");
export const passwordInput = z.string().min(12, "Utilisez au moins 12 caractères.").max(128);

export const clientInput = z.object({
  name: z.string().trim().min(2).max(150),
  companyName: optionalText,
  businessName: optionalText,
  phone: optionalText,
  email: optionalEmail,
  address: optionalText,
  city: optionalText,
  country: optionalText,
  taxId: optionalText,
  taxNumber: optionalText,
  notes: optionalText,
  salespersonId: optionalId,
  creditLimit: amountInput.optional(),
  active: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export const supplierInput = z.object({
  name: z.string().trim().min(2).max(150),
  companyName: optionalText,
  businessName: optionalText,
  phone: optionalText,
  email: optionalEmail,
  address: optionalText,
  taxId: optionalText,
  taxNumber: optionalText,
  bankDetails: optionalText,
  notes: optionalText,
  active: z.boolean().optional(),
});
export const userInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: passwordInput,
  roleId: uuid,
  active: z.boolean().optional(),
});
export const userPatchInput = userInput.omit({ password: true }).partial();
export const cashAccountInput = z
  .object({
    name: z.string().trim().min(2).max(120),
    type: z.enum(["CASH", "BANK", "PETTY_CASH", "OTHER"]).default("CASH"),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default("EUR"),
    responsibleId: optionalId,
    active: z.boolean().optional(),
  })
  .strict();
