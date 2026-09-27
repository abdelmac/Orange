import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { db } from "../src/lib/db";
import {
  authenticate,
  createSession,
  getActor,
  getIdentity,
  SESSION_COOKIE,
  tokenHash,
} from "../src/lib/auth";
import { registerAccount, switchWorkspace } from "../src/services/account.service";
import { ensurePlan } from "../src/services/entitlement.service";
import {
  acceptInvitation,
  inviteMember,
  listTeam,
  updateMember,
  cancelInvitation,
} from "../src/services/team.service";
import { createDirectoryItem, updateDirectoryItem } from "../src/services/directory.service";
import { listDirectory } from "../src/services/directory-read.service";

const databaseUrl = new URL(process.env.DATABASE_URL ?? "http://missing");
if (
  process.env.NODE_ENV === "production" ||
  !["localhost", "127.0.0.1"].includes(databaseUrl.hostname) ||
  !databaseUrl.searchParams.get("schema")?.startsWith("plans_qa_")
)
  throw new Error("Exécuter dans un schéma PostgreSQL local plans_qa_ isolé.");
const emails: string[] = [];
const smtp = createServer((socket) => {
  let buffer = "",
    message = "",
    inData = false;
  socket.write("220 localhost ESMTP test\r\n");
  socket.on("data", (chunk) => {
    buffer += chunk.toString();
    while (buffer.includes("\r\n")) {
      const at = buffer.indexOf("\r\n"),
        line = buffer.slice(0, at);
      buffer = buffer.slice(at + 2);
      if (inData) {
        if (line === ".") {
          emails.push(message);
          message = "";
          inData = false;
          socket.write("250 accepted\r\n");
        } else message += `${line}\r\n`;
      } else if (/^EHLO|^HELO/.test(line)) socket.write("250 localhost\r\n");
      else if (line === "DATA") {
        inData = true;
        socket.write("354 Send message\r\n");
      } else if (line === "QUIT") socket.end("221 bye\r\n");
      else socket.write("250 OK\r\n");
    }
  });
});
let checks = 0;
async function check(name: string, work: () => Promise<void>) {
  await work();
  console.log(`PASS ${++checks}: ${name}`);
}
function request(token: string) {
  return new Request("http://localhost/api/me", {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });
}
function lastToken() {
  const decoded = emails.at(-1)!.replace(/=\r\n/g, "").replace(/=3D/g, "=");
  const token = decoded.match(/token=([a-f0-9]{64})/)?.[1];
  assert.ok(token);
  return token;
}
async function main() {
  await new Promise<void>((resolve) => smtp.listen(0, "127.0.0.1", resolve));
  const address = smtp.address();
  assert.ok(address && typeof address === "object");
  Object.assign(process.env, {
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(address.port),
    SMTP_FROM: "test@example.test",
    APP_URL: "http://localhost:3107",
  });
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;
  const run = randomUUID(),
    password = `Accounts-qa-${randomUUID()}`;
  const register = (usageType: "BUSINESS" | "PERSONAL" | "BOTH", suffix: string) =>
    registerAccount({
      usageType,
      name: `QA ${suffix}`,
      companyName: `Entreprise ${suffix} ${run}`,
      email: `${suffix}-${run}@example.test`,
      password,
      currency: "EUR",
    });
  const business = await register("BUSINESS", "business"),
    personal = await register("PERSONAL", "personal"),
    both = await register("BOTH", "both");
  await check("inscription BUSINESS gratuite avec propriétaire, rôles et caisse", async () => {
    assert.ok(business.companyId);
    const member = await db.companyMembership.findUniqueOrThrow({
      where: { companyId_userId: { companyId: business.companyId!, userId: business.id } },
    });
    assert.ok(member.isOwner);
    assert.equal(
      (
        await db.subscription.findUniqueOrThrow({
          where: { companyId: business.companyId! },
          include: { plan: true },
        })
      ).plan.code,
      "FREE",
    );
    assert.equal(await db.cashAccount.count({ where: { companyId: business.companyId! } }), 1);
  });
  await check("PERSONAL ne crée aucune entreprise et reçoit catégories et offre FREE", async () => {
    assert.equal(personal.companyId, null);
    assert.equal(await db.companyMembership.count({ where: { userId: personal.id } }), 0);
    assert.equal(await db.personalCategory.count({ where: { userId: personal.id } }), 21);
    assert.equal(
      (
        await db.subscription.findUniqueOrThrow({
          where: { userId: personal.id },
          include: { plan: true },
        })
      ).plan.code,
      "FREE",
    );
  });
  await check("BOTH possède les deux espaces sans mélanger les données", async () => {
    assert.ok(both.companyId);
    assert.equal(await db.personalCategory.count({ where: { userId: both.id } }), 21);
  });
  const ownerSession = await authenticate(`business-${run}@example.test`, password),
    owner = await getActor(request(ownerSession.token));
  const personalSession = await authenticate(`personal-${run}@example.test`, password),
    personalIdentity = await getIdentity(request(personalSession.token));
  await check("authentification personnelle distincte du contexte entreprise", async () => {
    assert.equal(personalSession.redirectTo, "/personal");
    await assert.rejects(getActor(request(personalSession.token)), /espace entreprise/);
    await assert.rejects(
      switchWorkspace(personalIdentity, { companyId: business.companyId }),
      /accès/,
    );
  });
  await check("FREE interdit invitations et ancien endpoint de création utilisateur", async () => {
    await assert.rejects(
      inviteMember(owner, { email: `blocked-${run}@example.test`, role: "ACCOUNTANT" }),
      /PRO/,
    );
    const role = await db.role.findUniqueOrThrow({
      where: { companyId_name: { companyId: owner.companyId, name: "ACCOUNTANT" } },
    });
    await assert.rejects(
      createDirectoryItem(owner, "users", {
        name: "Blocked",
        email: `blocked-${run}@example.test`,
        password,
        roleId: role.id,
      }),
      /PRO/,
    );
  });
  const pro = await ensurePlan("PRO");
  await db.subscription.update({
    where: { companyId: owner.companyId },
    data: { planId: pro.id, status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 86400000) },
  });
  let inviteToken = "",
    invitationId = "";
  await check("PRO invite un membre par email avec uniquement un hash en base", async () => {
    const result = await inviteMember(owner, { email: personalIdentity.email, role: "ACCOUNTANT" });
    invitationId = result.id;
    inviteToken = lastToken();
    const saved = await db.teamInvitation.findUniqueOrThrow({ where: { id: invitationId } });
    assert.equal(saved.tokenHash, tokenHash(inviteToken));
    assert.ok(!JSON.stringify(result).includes(inviteToken));
    assert.ok(!JSON.stringify(await listTeam(owner)).includes(saved.tokenHash));
  });
  await check("acceptation exige le compte associé à l’email invité", async () => {
    await assert.rejects(
      acceptInvitation({ token: inviteToken }, await getIdentity(request(ownerSession.token))),
      /adresse invitée/,
    );
  });
  await check("acceptation existante conserve identité et historique personnel", async () => {
    const joined = await acceptInvitation({ token: inviteToken }, personalIdentity);
    assert.equal(joined.id, personal.id);
    const saved = await db.user.findUniqueOrThrow({ where: { id: personal.id } });
    assert.equal(saved.companyId, null);
    assert.equal(saved.usageType, "BOTH");
    assert.equal(await db.personalCategory.count({ where: { userId: personal.id } }), 21);
    await assert.rejects(
      acceptInvitation({ token: inviteToken }, personalIdentity),
      /expiré|utilisée/,
    );
  });
  const memberSession = await createSession(personal.id, owner.companyId),
    member = await getActor(request(memberSession.token));
  await check("rôle comptable et propriétaires appliqués côté serveur", async () => {
    assert.equal(member.role, "ACCOUNTANT");
    assert.ok(member.permissions.includes("invoices.create"));
    await assert.rejects(listTeam(member), /propriétaire/);
    await assert.rejects(updateMember(owner, owner.id, { active: false }), /propriétaire/);
    await assert.rejects(
      updateDirectoryItem(owner, "users", personal.id, { email: `hijack-${run}@example.test` }),
      /informations personnelles/,
    );
  });
  await check(
    "changement rôle et permissions invalide les sessions entreprise uniquement",
    async () => {
      await updateMember(owner, personal.id, {
        role: "VIEWER",
        permissions: [
          { permissionKey: "clients.create", allowed: true },
          { permissionKey: "invoices.view", allowed: false },
        ],
      });
      await assert.rejects(getActor(request(memberSession.token)), /expiré/);
      assert.equal((await getIdentity(request(personalSession.token))).id, personal.id);
      const fresh = await createSession(personal.id, owner.companyId),
        actor = await getActor(request(fresh.token));
      assert.equal(actor.role, "VIEWER");
      assert.ok(actor.permissions.includes("clients.create"));
      assert.ok(!actor.permissions.includes("invoices.view"));
    },
  );
  await check("annulation et renvoi invalident les anciens liens", async () => {
    const pending = await inviteMember(owner, { email: `new-${run}@example.test`, role: "MEMBER" });
    const old = lastToken();
    await inviteMember(owner, { email: `new-${run}@example.test`, role: "MEMBER" }, pending.id);
    await assert.rejects(
      acceptInvitation({ token: old, name: "Nouveau", password }, null),
      /expiré|utilisée/,
    );
    await cancelInvitation(owner, pending.id);
    await assert.rejects(
      acceptInvitation({ token: lastToken(), name: "Nouveau", password }, null),
      /expiré|utilisée/,
    );
  });
  await check("nouveau compte invité rejoint atomiquement l’équipe", async () => {
    await inviteMember(owner, { email: `newaccount-${run}@example.test`, role: "MEMBER" });
    const token = lastToken();
    const outcomes = await Promise.allSettled([
      acceptInvitation({ token, name: "New member", password }, null),
      acceptInvitation({ token, name: "New member", password }, null),
    ]);
    assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
    const newUser = await db.user.findUniqueOrThrow({
      where: { email: `newaccount-${run}@example.test` },
    });
    assert.equal(
      await db.companyMembership.count({
        where: { userId: newUser.id, companyId: owner.companyId, active: true },
      }),
      1,
    );
  });
  await check("isolation utilisateurs et suppression logique locale à l’entreprise", async () => {
    const rows = await listDirectory(owner, "users");
    assert.ok(rows.some((item) => "id" in item && item.id === personal.id));
    assert.ok(!rows.some((item) => "id" in item && item.id === both.id));
    await updateMember(owner, personal.id, { active: false });
    assert.ok((await db.user.findUniqueOrThrow({ where: { id: personal.id } })).active);
    const session = await createSession(personal.id, owner.companyId);
    await assert.rejects(getActor(request(session.token)), /accès/);
    assert.equal((await getIdentity(request(personalSession.token))).id, personal.id);
  });
  await check("audit conserve invitations et modifications sans secret", async () => {
    const audit = await db.auditLog.findMany({ where: { companyId: owner.companyId } });
    assert.ok(audit.some((item) => item.action === "ACCEPT_INVITATION"));
    assert.ok(audit.some((item) => item.action === "REMOVE_MEMBER"));
    assert.ok(!JSON.stringify(audit).includes(inviteToken));
  });
  console.log(`${checks} scénarios comptes et équipes validés sur PostgreSQL local.`);
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    smtp.close();
    await db.$disconnect();
  });
