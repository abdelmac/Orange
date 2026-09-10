import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { withApi } from "@/lib/http";

export async function GET(request: Request) {
  return withApi(async () => {
    const actor = await getActor(request);
    const [user, company] = await Promise.all([
      db.user.findFirstOrThrow({
        where: { id: actor.id, companyId: actor.companyId },
        select: { id: true, name: true, email: true, active: true },
      }),
      db.company.findUniqueOrThrow({ where: { id: actor.companyId } }),
    ]);
    return {
      user: { ...user, role: actor.role, cashAccountIds: actor.cashAccountIds },
      company,
      permissions: actor.permissions,
    };
  });
}
