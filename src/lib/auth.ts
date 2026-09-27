import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "./db";
import type { Actor } from "./finance-context";
import { HttpError } from "./http";
import { hashPassword, verifyPassword } from "./password";
import { resolvePermissions } from "./rbac";
export { hashPassword, verifyPassword } from "./password";

export const SESSION_COOKIE = "orange_session";
const SESSION_LIFETIME = 8 * 60 * 60 * 1000;
const rolePriority = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "ACCOUNTANT",
  "CASHIER",
  "SALESPERSON",
  "EMPLOYEE",
  "MEMBER",
  "VIEWER",
];
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

export async function getIdentity(request?: Request) {
  const token = await getSessionToken(request);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new HttpError(401, "Veuillez vous connecter.");
  const session = await db.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: {
      user: {
        include: {
          memberships: {
            where: { active: true },
            include: { company: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.active)
    throw new HttpError(401, "Votre session a expiré. Veuillez vous reconnecter.");
  const user = session.user;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    active: user.active,
    usageType: user.usageType,
    personalCurrency: user.personalCurrency,
    sessionId: session.id,
    companyId: session.companyId,
    memberships: user.memberships.map((membership) => ({
      companyId: membership.companyId,
      name: membership.company.name,
      isOwner: membership.isOwner,
      active: membership.active,
    })),
  };
}

export async function getActor(request?: Request): Promise<Actor> {
  const identity = await getIdentity(request);
  const companyId = identity.companyId;
  if (!companyId)
    throw new HttpError(403, "Sélectionnez votre espace entreprise pour cette opération.");
  const membership = identity.memberships.find((item) => item.companyId === companyId);
  if (!membership) throw new HttpError(403, "Vous n’avez plus accès à cette entreprise.");
  const userRoles = await db.userRole.findMany({
    where: { userId: identity.id, companyId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  const role = rolePriority.find((name) => userRoles.some((item) => item.role.name === name));
  if (!role) throw new HttpError(403, "Aucun rôle actif n’est associé à votre compte.");
  const requestHeaders = request?.headers ?? (await headers());
  const [overrides, accounts] = await Promise.all([
    db.membershipPermission.findMany({ where: { userId: identity.id, companyId } }),
    db.cashAccount.findMany({
      where: { responsibleId: identity.id, companyId },
      select: { id: true },
    }),
  ]);
  return {
    id: identity.id,
    companyId,
    name: identity.name,
    role,
    permissions: resolvePermissions(
      userRoles.flatMap((item) => item.role.permissions.map((grant) => grant.permission.key)),
      overrides,
    ),
    cashAccountIds: accounts.map((account) => account.id),
    ip:
      process.env.TRUST_PROXY === "true"
        ? requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
        : undefined,
  };
}

export const requireActor = getActor;

export async function createSession(userId: string, companyId: string | null) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME);
  await db.session.create({ data: { userId, companyId, tokenHash: tokenHash(token), expiresAt } });
  return { token, expiresAt };
}

export async function authenticate(email: string, password: string) {
  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      companyId: true,
      passwordHash: true,
      active: true,
      name: true,
      usageType: true,
      memberships: {
        where: { active: true },
        orderBy: { createdAt: "asc" },
        select: { companyId: true },
      },
    },
  });
  const valid = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
  if (!user || !valid || !user.active)
    throw new HttpError(401, "Adresse email ou mot de passe incorrect.");
  const companyId =
    user.usageType === "PERSONAL"
      ? null
      : (user.memberships.find((item) => item.companyId === user.companyId)?.companyId ??
        user.memberships[0]?.companyId ??
        null);
  return {
    ...(await createSession(user.id, companyId)),
    user,
    redirectTo: companyId ? "/" : "/personal",
  };
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
