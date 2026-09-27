import { getActor, getIdentity } from "@/lib/auth";
import { db } from "@/lib/db";
import { withApi } from "@/lib/http";

export async function GET(request: Request) {
  return withApi(async () => {
    const identity = await getIdentity(request);
    const member = identity.memberships.find((item) => item.companyId === identity.companyId);
    const actor = member ? await getActor(request) : null;
    const company = actor
      ? await db.company.findUniqueOrThrow({ where: { id: actor.companyId } })
      : null;
    return {
      user: {
        id: identity.id,
        name: identity.name,
        email: identity.email,
        active: identity.active,
        usageType: identity.usageType,
        personalCurrency: identity.personalCurrency,
        role: actor?.role ?? "PERSONAL",
        isOwner: member?.isOwner ?? false,
        cashAccountIds: actor?.cashAccountIds ?? [],
      },
      company,
      permissions: actor?.permissions ?? [],
      memberships: identity.memberships,
      workspace: actor ? "BUSINESS" : "PERSONAL",
    };
  });
}
