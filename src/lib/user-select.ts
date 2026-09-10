import type { Prisma } from "@prisma/client";

// Explicit projection: session tokens and password hashes never leave server code.
export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  active: true,
  locale: true,
  createdAt: true,
  roles: { select: { role: { select: { id: true, name: true, label: true } } } },
} satisfies Prisma.UserSelect;
