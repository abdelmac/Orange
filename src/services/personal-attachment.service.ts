import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { requirePersonal, type PersonalIdentity } from "@/lib/personal";
import { personalWrite } from "./personal.service";

const root = () =>
  path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR || "uploads", "personal");
const maxSize = 10 * 1024 * 1024;
function documentType(buffer: Buffer) {
  if (buffer.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP")
    return "image/webp";
  throw new HttpError(400, "Choisissez un PDF ou une image JPEG, PNG ou WebP.");
}

export async function uploadPersonalAttachment(identity: PersonalIdentity, form: FormData) {
  const userId = requirePersonal(identity);
  const transactionId = z.uuid().parse(form.get("transactionId"));
  const file = form.get("file");
  if (!(file instanceof File) || !file.size)
    throw new HttpError(400, "Choisissez un justificatif.");
  if (file.size > maxSize) throw new HttpError(413, "Le justificatif ne doit pas dépasser 10 Mo.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = documentType(buffer);
  // Check ownership before touching storage; recheck under the owner lock before attach.
  if (
    !(await db.personalTransaction.findFirst({
      where: { id: transactionId, userId },
      select: { id: true },
    }))
  )
    throw new HttpError(404, "Transaction personnelle introuvable.");
  const storageKey = `${userId}/${randomUUID()}`;
  const destination = path.join(root(), storageKey);
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await writeFile(destination, buffer, { flag: "wx", mode: 0o600 });
  try {
    return await personalWrite(identity, async (tx) => {
      const transaction = await tx.personalTransaction.findFirst({
        where: { id: transactionId, userId },
      });
      if (!transaction) throw new HttpError(404, "Transaction personnelle introuvable.");
      if (transaction.attachmentId)
        throw new HttpError(409, "Un justificatif est déjà joint à cette transaction.");
      const document = await tx.personalAttachment.create({
        data: {
          userId,
          storageKey,
          mimeType,
          size: file.size,
          originalName:
            path
              .basename(file.name)
              .replace(/[\x00-\x1f\x7f]/g, "")
              .slice(0, 200) || "justificatif",
        },
      });
      await tx.personalTransaction.update({
        where: { userId_id: { id: transactionId, userId } },
        data: { attachmentId: document.id },
      });
      return { id: document.id, originalName: document.originalName };
    });
  } catch (error) {
    await unlink(destination).catch(() => undefined);
    throw error;
  }
}

export async function downloadPersonalAttachment(identity: PersonalIdentity, id: string) {
  const userId = requirePersonal(identity);
  z.uuid().parse(id);
  const document = await db.personalAttachment.findFirst({ where: { id, userId } });
  if (!document) throw new HttpError(404, "Justificatif personnel introuvable.");
  const destination = path.resolve(root(), document.storageKey);
  if (!destination.startsWith(path.join(root(), userId) + path.sep))
    throw new HttpError(404, "Justificatif introuvable.");
  let buffer: Buffer;
  try {
    buffer = await readFile(/* turbopackIgnore: true */ destination);
  } catch {
    throw new HttpError(404, "Le justificatif est absent du stockage.");
  }
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Length": String(buffer.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.originalName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
}
