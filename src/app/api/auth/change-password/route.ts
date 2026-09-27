import { z } from "zod";
import { db } from "@/lib/db";
import {
  consumeAuthAttempt,
  getIdentity,
  hashPassword,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";
import { assertSameOrigin, HttpError, json, readJson, withApi } from "@/lib/http";
import { passwordInput } from "@/lib/validation";

export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    const actor = await getIdentity(request);
    await consumeAuthAttempt(actor.id, "change-password");
    const input = z
      .object({ currentPassword: z.string().max(128), newPassword: passwordInput })
      .parse(await readJson(request));
    const user = await db.user.findFirstOrThrow({
      where: { id: actor.id },
    });
    if (!(await verifyPassword(input.currentPassword, user.passwordHash)))
      throw new HttpError(400, "Le mot de passe actuel est incorrect.");
    const passwordHash = await hashPassword(input.newPassword);
    await db.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: { id: actor.id, passwordHash: user.passwordHash },
        data: { passwordHash },
      });
      if (changed.count !== 1)
        throw new HttpError(409, "Votre mot de passe a déjà changé. Reconnectez-vous.");
      await tx.session.deleteMany({ where: { userId: actor.id } });
      await tx.passwordResetToken.deleteMany({ where: { userId: actor.id } });
      await tx.auditLog.createMany({
        data: actor.memberships.map((membership) => ({
          companyId: membership.companyId,
          userId: actor.id,
          userName: actor.name,
          action: "PASSWORD_CHANGED",
          entity: "User",
          entityId: actor.id,
          after: { passwordChanged: true },
        })),
      });
    });
    const response = json({ ok: true, message: "Mot de passe modifié. Reconnectez-vous." });
    response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(new Date(0)));
    return response;
  });
}
