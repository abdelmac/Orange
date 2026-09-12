import { z } from "zod";

const text = z.string().max(6500);
const party = z.object({
  kind: z.string().max(60),
  name: z.string().min(1).max(6500),
  phone: text.nullable(),
});
const actor = z.object({ id: z.uuid(), name: text });
const reference = z.object({ id: z.uuid(), number: text });

export const receiptSnapshotSchema = z.object({
  version: z.literal(1),
  number: z.string().regex(/^REC-\d{4}-\d{6,}$/),
  issuedAt: z.iso.datetime(),
  issuedBy: actor,
  company: z.object({
    id: z.uuid(),
    name: text,
    address: text.nullable(),
    phone: text.nullable(),
    email: text.nullable(),
    taxNumber: text.nullable(),
  }),
  operation: z.object({
    id: z.uuid(),
    number: text,
    type: z.string().max(60),
    date: z.iso.datetime(),
    amountMinor: z.string().regex(/^\d{1,20}$/),
    currency: z.string().regex(/^[A-Z]{3}$/),
    method: z.string().max(60).nullable(),
    description: text,
    reference: text.nullable(),
    comment: text.nullable(),
  }),
  payer: party,
  payee: party,
  source: party,
  destination: party,
  recordedBy: actor,
  validatedBy: actor,
  requester: actor.nullable(),
  invoice: reference.nullable(),
  expense: reference.nullable(),
  reversalOf: reference.extend({ date: z.iso.datetime() }).nullable(),
});

export type ReceiptSnapshot = z.infer<typeof receiptSnapshotSchema>;
export type ReceiptCancellation = { id: string; number: string; date: string } | null;

export function receiptText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const clean = value
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "")
    .trim();
  return clean.length > 6400 ? `${clean.slice(0, 6350)} [texte abrégé]` : clean;
}
