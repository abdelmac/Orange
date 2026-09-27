import {
  getIdentity,
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
  consumeAuthAttempt,
} from "@/lib/auth";
import { assertSameOrigin, HttpError, json, readJson, withApi } from "@/lib/http";
import { acceptInvitation, invitationPreview, invitationToken } from "@/services/team.service";
export async function GET(request: Request) {
  return withApi(async () =>
    invitationPreview(new URL(request.url).searchParams.get("token") ?? ""),
  );
}
export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    const input = await readJson(request);
    const token = invitationToken.parse(
      input && typeof input === "object" && "token" in input ? input.token : undefined,
    );
    await consumeAuthAttempt(token, "accept-invitation");
    if (process.env.TRUST_PROXY === "true")
      await consumeAuthAttempt(
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
        "accept-invitation-ip",
      );
    let identity: Awaited<ReturnType<typeof getIdentity>> | null = null;
    try {
      identity = await getIdentity(request);
    } catch (error) {
      if (!(error instanceof HttpError && error.status === 401)) throw error;
    }
    const user = await acceptInvitation(input, identity);
    const session = await createSession(user.id, user.companyId);
    const response = json({ ok: true, redirectTo: "/" });
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
    return response;
  });
}
