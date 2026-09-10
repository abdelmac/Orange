import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, tokenHash } from "@/lib/auth";
import { assertSameOrigin, HttpError, readJson, withApi } from "@/lib/http";
import { passwordInput } from "@/lib/validation";

export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    const input = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: passwordInput })
      .parse(await readJson(request));
    const passwordHash = await hashPassword(input.password);
    await db.$transaction(async (tx) => {
      const reset = await tx.passwordResetToken.findUnique({
        where: { tokenHash: tokenHash(input.token) },
        include: { user: { select: { active: true, companyId: true, name: true } } },
      });
      if (
        !reset ||
        reset.usedAt ||
        reset.expiresAt <= new Date() ||
        !reset.user.active ||
        reset.companyId !== reset.user.companyId
      )
        throw new HttpError(400, "Le lien est expiré ou déjà utilisé. Demandez un nouveau lien.");
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: reset.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw new HttpError(400, "Le lien a déjà été utilisé.");
      await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: reset.userId } });
      await tx.passwordResetToken.updateMany({
        where: { userId: reset.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          companyId: reset.companyId,
          userId: reset.userId,
          userName: reset.user.name,
          action: "PASSWORD_RESET",
          entity: "User",
          entityId: reset.userId,
          after: { passwordChanged: true },
        },
      });
    });
    return { ok: true, message: "Mot de passe modifié. Vous pouvez vous connecter." };
  });
}
