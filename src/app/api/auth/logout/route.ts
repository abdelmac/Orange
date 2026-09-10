import { db } from "@/lib/db";
import { getSessionToken, SESSION_COOKIE, sessionCookieOptions, tokenHash } from "@/lib/auth";
import { assertSameOrigin, json, withApi } from "@/lib/http";

export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    const token = await getSessionToken(request);
    if (token) await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
    const response = json({ ok: true });
    response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(new Date(0)));
    return response;
  });
}
