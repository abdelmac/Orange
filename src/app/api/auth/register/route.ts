import {
  consumeAuthAttempt,
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { assertSameOrigin, json, readJson, withApi } from "@/lib/http";
import { registrationInput, registerAccount } from "@/services/account.service";

export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    const input = registrationInput.parse(await readJson(request));
    await consumeAuthAttempt(input.email, "register");
    if (process.env.TRUST_PROXY === "true")
      await consumeAuthAttempt(
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
        "register-ip",
      );
    const user = await registerAccount(input);
    const session = await createSession(user.id, user.companyId);
    const response = json({ ok: true, redirectTo: "/onboarding" }, 201);
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
    return response;
  });
}
