import { Prisma } from "@prisma/client";
import type { Actor, Tx } from "../lib/finance-context";

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item)),
  );
}

export async function audit(
  tx: Tx,
  actor: Actor,
  event: { action: string; entity: string; entityId: string; before?: unknown; after?: unknown },
) {
  return tx.auditLog.create({
    data: {
      companyId: actor.companyId,
      userId: actor.id,
      userName: actor.name,
      ip: actor.ip,
      action: event.action,
      entity: event.entity,
      entityId: event.entityId,
      ...(event.before !== undefined ? { before: jsonValue(event.before) } : {}),
      ...(event.after !== undefined ? { after: jsonValue(event.after) } : {}),
    },
  });
}

export async function notify(
  tx: Tx,
  actor: Actor,
  title: string,
  message: string,
  href: string,
  permission?: string,
) {
  const users = permission
    ? await tx.user.findMany({
        where: {
          companyId: actor.companyId,
          active: true,
          roles: { some: { role: { permissions: { some: { permission: { key: permission } } } } } },
        },
        select: { id: true },
      })
    : [{ id: actor.id }];
  if (users.length)
    await tx.notification.createMany({
      data: users.map((user) => ({
        companyId: actor.companyId,
        userId: user.id,
        title,
        message,
        href,
      })),
    });
}
