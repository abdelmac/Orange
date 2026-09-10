import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "./db";
import type { Actor } from "./finance-context";
import { HttpError } from "./http";
import { hashPassword, verifyPassword } from "./password";
export { hashPassword, verifyPassword } from "./password";

export const SESSION_COOKIE = "orange_session";
const SESSION_LIFETIME = 8 * 60 * 60 * 1000;
const rolePriority = ["ADMIN", "MANAGER", "ACCOUNTANT", "CASHIER", "SALESPERSON", "EMPLOYEE"];
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const dummyHash = hashPassword(randomBytes(24).toString("hex"));

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.APP_URL
      ? new URL(process.env.APP_URL).protocol === "https:"
      : process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

export async function getSessionToken(request?: Request) {
  if (!request) return (await cookies()).get(SESSION_COOKIE)?.value;
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
}

export async function getActor(request?: Request): Promise<Actor> {
  const token = await getSessionToken(request);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new HttpError(401, "Veuillez vous connecter.");
  const session = await db.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: {
      user: {
        include: {
          roles: {
            include: { role: { include: { permissions: { include: { permission: true } } } } },
          },
          cashAccounts: { select: { id: true, companyId: true } },
        },
      },
    },
  });
  if (
    !session ||
    session.expiresAt <= new Date() ||
    !session.user.active ||
    session.companyId !== session.user.companyId
  )
    throw new HttpError(401, "Votre session a expiré. Veuillez vous reconnecter.");
  const user = session.user;
  const userRoles = user.roles.filter(
    (item) => item.companyId === user.companyId && item.role.companyId === user.companyId,
  );
  const role = rolePriority.find((name) => userRoles.some((item) => item.role.name === name));
  if (!role) throw new HttpError(403, "Aucun rôle actif n’est associé à votre compte.");
  const requestHeaders = request?.headers ?? (await headers());
  return {
    id: user.id,
    companyId: user.companyId,
    name: user.name,
    role,
    permissions: [
      ...new Set(
        userRoles.flatMap((item) => item.role.permissions.map((grant) => grant.permission.key)),
      ),
    ],
    cashAccountIds: user.cashAccounts
      .filter((account) => account.companyId === user.companyId)
      .map((account) => account.id),
    ip:
      process.env.TRUST_PROXY === "true"
        ? requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
        : undefined,
  };
}

export const requireActor = getActor;

export async function authenticate(email: string, password: string) {
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, companyId: true, passwordHash: true, active: true, name: true },
  });
  const valid = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
  if (!user || !valid || !user.active)
    throw new HttpError(401, "Adresse email ou mot de passe incorrect.");
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME);
  await db.session.create({
    data: { userId: user.id, companyId: user.companyId, tokenHash: tokenHash(token), expiresAt },
  });
  return { token, expiresAt, user };
}

export async function consumeAuthAttempt(email: string, action: string) {
  const key = tokenHash(`${action}:${email}`);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    const since = new Date(Date.now() - 15 * 60 * 1000);
    const count = await tx.loginAttempt.count({ where: { key, createdAt: { gte: since } } });
    if (count >= (action === "reset" ? 4 : 10))
      throw new HttpError(429, "Trop de tentatives. Réessayez dans 15 minutes.");
    await tx.loginAttempt.create({ data: { key } });
    await tx.loginAttempt.deleteMany({ where: { key, createdAt: { lt: since } } });
  });
}
