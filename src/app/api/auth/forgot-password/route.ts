import { randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { z } from "zod";
import { db } from "@/lib/db";
import { consumeAuthAttempt, tokenHash } from "@/lib/auth";
import { assertSameOrigin, readJson, withApi } from "@/lib/http";

export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    const { email } = z
      .object({
        email: z
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
      })
      .parse(await readJson(request));
    await consumeAuthAttempt(email, "reset");
    const user = await db.user.findUnique({ where: { email } });
    const message =
      "Si ce compte existe et que la messagerie est configurée, un lien de réinitialisation vous sera envoyé.";
    if (!user?.active || !process.env.SMTP_HOST || !process.env.APP_URL || !process.env.SMTP_FROM)
      return { ok: true, message };
    const token = randomBytes(32).toString("hex");
    await db.passwordResetToken.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_PORT === "465",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
    const url = new URL("/reset-password", process.env.APP_URL);
    url.searchParams.set("token", token);
    try {
      await transport.sendMail({
        from: process.env.SMTP_FROM,
        to: user.email,
        subject: "Orange — Réinitialiser votre mot de passe",
        text: `Vous avez demandé un nouveau mot de passe. Ce lien est valable 30 minutes et utilisable une seule fois : ${url.toString()}\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez cet email.`,
      });
    } catch {
      console.error("Password reset email delivery failed");
    }
    return { ok: true, message };
  });
}
