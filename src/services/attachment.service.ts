import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/finance-context";
import { accessibleRecord } from "@/lib/record-access";
import { HttpError } from "@/lib/http";
import { audit } from "@/services/audit.service";
import { z } from "zod";

const referenceSchema = z.object({
  entityType: z.enum(["INVOICE", "EXPENSE", "PAYMENT", "TRANSACTION"]),
  entityId: z.uuid(),
});
const maxSize = 10 * 1024 * 1024;
// Runtime files live in a private volume and must never be bundled by Next.js.
const storageRoot = () =>
  path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR || "uploads");
const publicSelect = {
  id: true,
  entity: true,
  entityId: true,
  filename: true,
  mimeType: true,
  size: true,
  createdAt: true,
} as const;

function detectType(buffer: Buffer) {
  if (buffer.subarray(0, 5).toString() === "%PDF-")
    return { mimeType: "application/pdf", extension: ".pdf" };
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return { mimeType: "image/jpeg", extension: ".jpg" };
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return { mimeType: "image/png", extension: ".png" };
  if (buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP")
    return { mimeType: "image/webp", extension: ".webp" };
  throw new HttpError(
    400,
    "Format non pris en charge. Choisissez un PDF ou une image JPEG, PNG ou WebP.",
  );
}

export async function listAttachments(actor: Actor, input: unknown) {
  const { entityType: entity, entityId } = referenceSchema.parse(input);
  await accessibleRecord(actor, entity, entityId);
  return {
    items: await db.attachment.findMany({
      where: { companyId: actor.companyId, entity, entityId },
      select: publicSelect,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  };
}

export async function uploadAttachment(actor: Actor, data: FormData) {
  const { entityType: entity, entityId } = referenceSchema.parse({
    entityType: data.get("entityType"),
    entityId: data.get("entityId"),
  });
  await accessibleRecord(actor, entity, entityId, true);
  const file = data.get("file");
  if (!(file instanceof File) || file.size === 0)
    throw new HttpError(400, "Choisissez un fichier.");
  if (file.size > maxSize) throw new HttpError(413, "Le fichier ne doit pas dépasser 10 Mo.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const { mimeType, extension } = detectType(buffer);
  const storageKey = `${actor.companyId}/${randomUUID()}${extension}`;
  const destination = path.join(storageRoot(), storageKey);
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await writeFile(destination, buffer, { flag: "wx", mode: 0o600 });
  try {
    return await db.$transaction(async (tx) => {
      const lockKey = `${actor.companyId}:${entity}:${entityId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      const existing = await tx.attachment.count({
        where: { companyId: actor.companyId, entity, entityId },
      });
      if (existing >= 20)
        throw new HttpError(400, "Une opération peut recevoir jusqu’à 20 justificatifs.");
      const attachment = await tx.attachment.create({
        data: {
          companyId: actor.companyId,
          entity,
          entityId,
          filename:
            path
              .basename(file.name)
              .replace(/[\x00-\x1f\x7f]/g, "")
              .slice(0, 200) || `justificatif${extension}`,
          storageKey,
          mimeType,
          size: file.size,
          uploadedById: actor.id,
        },
        select: publicSelect,
      });
      await audit(tx, actor, {
        action: "ATTACHMENT_UPLOADED",
        entity: "Attachment",
        entityId: attachment.id,
        after: { filename: attachment.filename, entity, entityId, size: file.size },
      });
      return attachment;
    });
  } catch (error) {
    await unlink(destination).catch(() => undefined);
    throw error;
  }
}

export async function downloadAttachment(actor: Actor, id: string) {
  z.uuid().parse(id);
  const attachment = await db.attachment.findFirst({ where: { id, companyId: actor.companyId } });
  if (!attachment) throw new HttpError(404, "Justificatif introuvable.");
  await accessibleRecord(actor, attachment.entity, attachment.entityId);
  const destination = path.resolve(storageRoot(), attachment.storageKey);
  if (!destination.startsWith(storageRoot() + path.sep))
    throw new HttpError(404, "Justificatif introuvable.");
  let buffer: Buffer;
  try {
    buffer = await readFile(/* turbopackIgnore: true */ destination);
  } catch {
    throw new HttpError(404, "Le fichier est absent du stockage. Contactez l’administrateur.");
  }
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(buffer.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
}
