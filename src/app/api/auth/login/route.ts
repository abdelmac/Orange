import { z } from "zod";
import { authenticate, consumeAuthAttempt, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { assertSameOrigin, json, readJson, withApi } from "@/lib/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    const input = z
      .object({
        email: z
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
        password: z.string().min(1).max(128),
      })
      .parse(await readJson(request));
    await consumeAuthAttempt(input.email, "login");
    const { token, expiresAt } = await authenticate(input.email, input.password);
    const response = json({ ok: true });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    return response;
  });
}
