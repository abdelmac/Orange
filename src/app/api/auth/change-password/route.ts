import { z } from "zod";
import { db } from "@/lib/db";
import {
  consumeAuthAttempt,
  getActor,
  hashPassword,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";
import { assertSameOrigin, HttpError, json, readJson, withApi } from "@/lib/http";
import { passwordInput } from "@/lib/validation";
import { audit } from "@/services/audit.service";

export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    const actor = await getActor(request);
    await consumeAuthAttempt(actor.id, "change-password");
    const input = z
      .object({ currentPassword: z.string().max(128), newPassword: passwordInput })
      .parse(await readJson(request));
    const user = await db.user.findFirstOrThrow({
      where: { id: actor.id, companyId: actor.companyId },
    });
    if (!(await verifyPassword(input.currentPassword, user.passwordHash)))
      throw new HttpError(400, "Le mot de passe actuel est incorrect.");
    const passwordHash = await hashPassword(input.newPassword);
    await db.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: { id: actor.id, companyId: actor.companyId, passwordHash: user.passwordHash },
        data: { passwordHash },
      });
      if (changed.count !== 1)
        throw new HttpError(409, "Votre mot de passe a déjà changé. Reconnectez-vous.");
      await tx.session.deleteMany({ where: { userId: actor.id, companyId: actor.companyId } });
      await tx.passwordResetToken.deleteMany({ where: { userId: actor.id } });
      await audit(tx, actor, {
        action: "PASSWORD_CHANGED",
        entity: "User",
        entityId: actor.id,
        after: { passwordChanged: true },
      });
    });
    const response = json({ ok: true, message: "Mot de passe modifié. Reconnectez-vous." });
    response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(new Date(0)));
    return response;
  });
}
