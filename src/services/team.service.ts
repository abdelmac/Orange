import { randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { z } from "zod";
import { db } from "@/lib/db";
import { atomic, type Actor, type Tx } from "@/lib/finance-context";
import { getIdentity, tokenHash } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { HttpError } from "@/lib/http";
import { permissionDefinitions, roleLabels, rolePermissions } from "@/lib/rbac";
import { passwordInput } from "@/lib/validation";
import { getEntitlements, requireFeature } from "./entitlement.service";
import { initializeRoles } from "./account.service";
import { audit } from "./audit.service";
import { APP_NAME } from "@/lib/brand";

export const invitationToken = z.string().regex(/^[a-f0-9]{64}$/);
export const inviteInput = z.object({
  email: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase().trim()),
  role: z.enum([
    "ADMIN",
    "ACCOUNTANT",
    "MEMBER",
    "VIEWER",
    "MANAGER",
    "CASHIER",
    "SALESPERSON",
    "EMPLOYEE",
  ]),
});
export const memberInput = z
  .object({
    role: inviteInput.shape.role.optional(),
    active: z.boolean().optional(),
    permissions: z
      .array(z.object({ permissionKey: z.enum(permissionDefinitions), allowed: z.boolean() }))
      .max(permissionDefinitions.length)
      .optional(),
  })
  .strict();

export async function assertTeamOwner(actor: Actor, tx: Tx = db) {
  const member = await tx.companyMembership.findUnique({
    where: { companyId_userId: { companyId: actor.companyId, userId: actor.id } },
  });
  if (!member?.active || !member.isOwner)
    throw new HttpError(403, "Seul le propriétaire peut gérer l’équipe.");
}

export async function checkTeamCapacity(companyId: string, tx: Tx, excludeInvitationId?: string) {
  await requireFeature(companyId, "teams", tx);
  const entitlement = await getEntitlements(companyId, tx);
  const [members, invitations] = await Promise.all([
    tx.companyMembership.count({ where: { companyId, active: true } }),
    tx.teamInvitation.count({
      where: {
        companyId,
        status: "PENDING",
        expiresAt: { gt: new Date() },
        ...(excludeInvitationId ? { id: { not: excludeInvitationId } } : {}),
      },
    }),
  ]);
  if (
    entitlement.limits.maxTeamMembers !== null &&
    members + invitations >= entitlement.limits.maxTeamMembers
  )
    throw new HttpError(
      409,
      "La limite de membres de votre offre est atteinte. Annulez une invitation ou retirez un membre.",
    );
}

async function lockTeam(tx: Tx, companyId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`team:${companyId}`}))`;
}

export async function listTeam(actor: Actor) {
  await assertTeamOwner(actor);
  const [members, invitations, entitlement] = await Promise.all([
    db.companyMembership.findMany({
      where: { companyId: actor.companyId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.teamInvitation.findMany({
      where: { companyId: actor.companyId, status: "PENDING" },
      select: {
        id: true,
        email: true,
        expiresAt: true,
        status: true,
        createdAt: true,
        role: { select: { name: true, label: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    getEntitlements(actor.companyId),
  ]);
  const [roles, overrides] = await Promise.all([
    db.userRole.findMany({
      where: { companyId: actor.companyId },
      include: { role: { select: { name: true } } },
    }),
    db.membershipPermission.findMany({ where: { companyId: actor.companyId } }),
  ]);
  return {
    members: members.map((member) => ({
      ...member.user,
      active: member.active,
      isOwner: member.isOwner,
      role: roles.find((role) => role.userId === member.userId)?.role.name ?? "MEMBER",
      permissions: overrides
        .filter((permission) => permission.userId === member.userId)
        .map(({ permissionKey, allowed }) => ({ permissionKey, allowed })),
    })),
    invitations: invitations.map((item) => ({
      ...item,
      status: item.expiresAt <= new Date() ? "EXPIRED" : item.status,
    })),
    entitlement,
    roleLabels,
    permissionDefinitions,
    rolePermissions,
  };
}

function invitationMailer() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM || !process.env.APP_URL)
    throw new HttpError(
      503,
      "L’envoi des invitations nécessite la configuration email SMTP du serveur.",
    );
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_PORT === "465",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
}

export async function inviteMember(actor: Actor, input: unknown, invitationId?: string) {
  const data = inviteInput.parse(input);
  await assertTeamOwner(actor);
  await requireFeature(actor.companyId, "teams");
  const mailer = invitationMailer();
  const token = randomBytes(32).toString("hex");
  const invitation = await atomic(async (tx) => {
    await assertTeamOwner(actor, tx);
    await lockTeam(tx, actor.companyId);
    await checkTeamCapacity(actor.companyId, tx, invitationId);
    if (
      await tx.companyMembership.findFirst({
        where: { companyId: actor.companyId, active: true, user: { email: data.email } },
      })
    )
      throw new HttpError(409, "Cette personne fait déjà partie de votre équipe.");
    if (
      !invitationId &&
      (await tx.teamInvitation.findFirst({
        where: {
          companyId: actor.companyId,
          email: data.email,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
      }))
    )
      throw new HttpError(409, "Une invitation est déjà en attente pour cette adresse.");
    await initializeRoles(tx, actor.companyId);
    const role = await tx.role.findUniqueOrThrow({
      where: { companyId_name: { companyId: actor.companyId, name: data.role } },
    });
    const fields = {
      email: data.email,
      roleId: role.id,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: "PENDING" as const,
    };
    if (invitationId) {
      const previous = await tx.teamInvitation.findFirst({
        where: {
          id: invitationId,
          companyId: actor.companyId,
          status: { in: ["PENDING", "EXPIRED"] },
        },
      });
      if (!previous || previous.email !== data.email)
        throw new HttpError(404, "Invitation introuvable.");
    }
    const saved = invitationId
      ? await tx.teamInvitation.update({ where: { id: invitationId }, data: fields })
      : await tx.teamInvitation.create({
          data: { ...fields, companyId: actor.companyId, invitedById: actor.id },
        });
    await audit(tx, actor, {
      action: invitationId ? "RESEND_INVITATION" : "INVITE_MEMBER",
      entity: "TeamInvitation",
      entityId: saved.id,
      after: { email: data.email, role: data.role },
    });
    return saved;
  });
  const company = await db.company.findUniqueOrThrow({
    where: { id: actor.companyId },
    select: { name: true },
  });
  const url = new URL("/invitation", process.env.APP_URL);
  url.searchParams.set("token", token);
  try {
    await mailer.sendMail({
      from: process.env.SMTP_FROM,
      to: data.email,
      subject: `${APP_NAME} — Invitation à rejoindre ${company.name}`,
      text: `${actor.name} vous invite à rejoindre ${company.name}. Ouvrez ce lien pour accepter : ${url.toString()}\n\nCe lien est personnel, valable 7 jours et utilisable une seule fois. Si vous n’attendiez pas cette invitation, ignorez cet email.`,
    });
  } catch {
    await db.teamInvitation.updateMany({
      where: { id: invitation.id, tokenHash: tokenHash(token), status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    throw new HttpError(
      503,
      "L’email n’a pas pu être envoyé. Vérifiez la messagerie, puis réessayez.",
    );
  }
  return { ok: true, id: invitation.id };
}

export async function cancelInvitation(actor: Actor, id: string) {
  z.uuid().parse(id);
  return atomic(async (tx) => {
    await assertTeamOwner(actor, tx);
    const changed = await tx.teamInvitation.updateMany({
      where: { id, companyId: actor.companyId, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    if (!changed.count) throw new HttpError(404, "Invitation introuvable ou déjà traitée.");
    await audit(tx, actor, { action: "CANCEL_INVITATION", entity: "TeamInvitation", entityId: id });
    return { ok: true };
  });
}

export async function invitationPreview(token: string) {
  invitationToken.parse(token);
  const invitation = await db.teamInvitation.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { company: { select: { name: true } }, role: { select: { label: true } } },
  });
  if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt <= new Date())
    throw new HttpError(410, "Cette invitation a expiré ou a déjà été utilisée.");
  return {
    email: invitation.email,
    companyName: invitation.company.name,
    roleLabel: invitation.role.label,
  };
}

export async function acceptInvitation(
  input: unknown,
  identity: Awaited<ReturnType<typeof getIdentity>> | null,
) {
  const data = z
    .object({
      token: invitationToken,
      name: z.string().trim().min(2).max(120).optional(),
      password: passwordInput.optional(),
    })
    .parse(input);
  await invitationPreview(data.token);
  const passwordHash = data.password ? await hashPassword(data.password) : undefined;
  return atomic(async (tx) => {
    const invitation = await tx.teamInvitation.findUnique({
      where: { tokenHash: tokenHash(data.token) },
    });
    if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt <= new Date())
      throw new HttpError(410, "Cette invitation a expiré ou a déjà été utilisée.");
    await lockTeam(tx, invitation.companyId);
    await checkTeamCapacity(invitation.companyId, tx, invitation.id);
    let user = await tx.user.findUnique({ where: { email: invitation.email } });
    if (user) {
      if (!identity || identity.id !== user.id || !user.active)
        throw new HttpError(
          403,
          "Connectez-vous avec l’adresse invitée pour rejoindre cette équipe.",
        );
    } else {
      if (identity)
        throw new HttpError(
          403,
          "Déconnectez-vous pour créer le compte associé à l’adresse invitée.",
        );
      if (!passwordHash || !data.name)
        throw new HttpError(400, "Indiquez votre nom et un mot de passe pour créer votre compte.");
      user = await tx.user.create({
        data: { email: invitation.email, name: data.name, passwordHash, usageType: "BUSINESS" },
      });
    }
    const claimed = await tx.teamInvitation.updateMany({
      where: { id: invitation.id, status: "PENDING", expiresAt: { gt: new Date() } },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    if (claimed.count !== 1) throw new HttpError(409, "Cette invitation vient d’être utilisée.");
    const membership = await tx.companyMembership.findUnique({
      where: { companyId_userId: { companyId: invitation.companyId, userId: user.id } },
    });
    if (membership?.isOwner)
      throw new HttpError(409, "Le propriétaire appartient déjà à l’équipe.");
    await tx.companyMembership.upsert({
      where: { companyId_userId: { companyId: invitation.companyId, userId: user.id } },
      create: { companyId: invitation.companyId, userId: user.id },
      update: { active: true },
    });
    await tx.userRole.deleteMany({ where: { companyId: invitation.companyId, userId: user.id } });
    await tx.membershipPermission.deleteMany({
      where: { companyId: invitation.companyId, userId: user.id },
    });
    await tx.userRole.create({
      data: { companyId: invitation.companyId, userId: user.id, roleId: invitation.roleId },
    });
    const role = await tx.role.findUniqueOrThrow({ where: { id: invitation.roleId } });
    if (role.name === "SALESPERSON")
      await tx.salespersonProfile.upsert({
        where: { companyId_userId: { companyId: invitation.companyId, userId: user.id } },
        create: { companyId: invitation.companyId, userId: user.id },
        update: {},
      });
    if (user.usageType === "PERSONAL")
      await tx.user.update({ where: { id: user.id }, data: { usageType: "BOTH" } });
    await audit(
      tx,
      {
        id: user.id,
        companyId: invitation.companyId,
        name: user.name,
        role: role.name,
        permissions: [],
      },
      {
        action: "ACCEPT_INVITATION",
        entity: "TeamInvitation",
        entityId: invitation.id,
        after: { userId: user.id, role: role.name },
      },
    );
    return { id: user.id, companyId: invitation.companyId };
  });
}

export async function updateMember(actor: Actor, userId: string, input: unknown) {
  z.uuid().parse(userId);
  const data = memberInput.parse(input);
  return atomic(async (tx) => {
    await assertTeamOwner(actor, tx);
    await lockTeam(tx, actor.companyId);
    const member = await tx.companyMembership.findUnique({
      where: { companyId_userId: { companyId: actor.companyId, userId } },
    });
    if (!member) throw new HttpError(404, "Membre introuvable.");
    if (member.isOwner || userId === actor.id)
      throw new HttpError(
        400,
        "Le propriétaire ne peut pas être retiré ou modifier ses propres droits.",
      );
    if (data.active !== false || data.role || data.permissions) {
      await requireFeature(actor.companyId, "teams", tx);
      if (!member.active && data.active === true) await checkTeamCapacity(actor.companyId, tx);
    }
    if (data.role || data.active === false) {
      const [incoming, outgoing] = await Promise.all([
        tx.financialTransaction.aggregate({
          where: {
            companyId: actor.companyId,
            destinationSalespersonId: userId,
            status: "VALIDATED",
          },
          _sum: { amountMinor: true },
        }),
        tx.financialTransaction.aggregate({
          where: { companyId: actor.companyId, sourceSalespersonId: userId, status: "VALIDATED" },
          _sum: { amountMinor: true },
        }),
      ]);
      if ((incoming._sum.amountMinor ?? 0n) !== (outgoing._sum.amountMinor ?? 0n))
        throw new HttpError(
          409,
          "Ce membre doit remettre ses fonds avant un changement de rôle ou son retrait.",
        );
    }
    if (data.role) {
      await initializeRoles(tx, actor.companyId);
      const role = await tx.role.findUniqueOrThrow({
        where: { companyId_name: { companyId: actor.companyId, name: data.role } },
      });
      await tx.userRole.deleteMany({ where: { companyId: actor.companyId, userId } });
      await tx.userRole.create({ data: { companyId: actor.companyId, userId, roleId: role.id } });
      if (data.role === "SALESPERSON")
        await tx.salespersonProfile.upsert({
          where: { companyId_userId: { companyId: actor.companyId, userId } },
          create: { companyId: actor.companyId, userId },
          update: {},
        });
    }
    if (data.permissions) {
      if (
        new Set(data.permissions.map((permission) => permission.permissionKey)).size !==
        data.permissions.length
      )
        throw new HttpError(400, "Une permission ne peut être indiquée qu’une fois.");
      await tx.membershipPermission.deleteMany({ where: { companyId: actor.companyId, userId } });
      await tx.membershipPermission.createMany({
        data: data.permissions.map((permission) => ({
          ...permission,
          companyId: actor.companyId,
          userId,
        })),
      });
    }
    if (data.active !== undefined)
      await tx.companyMembership.update({
        where: { companyId_userId: { companyId: actor.companyId, userId } },
        data: { active: data.active },
      });
    await tx.session.deleteMany({ where: { userId, companyId: actor.companyId } });
    await audit(tx, actor, {
      action: data.active === false ? "REMOVE_MEMBER" : "UPDATE_MEMBER",
      entity: "CompanyMembership",
      entityId: userId,
      after: data,
    });
    return { ok: true };
  });
}
