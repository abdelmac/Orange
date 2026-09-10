import { z } from "zod";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertSameOrigin, readJson, withApi } from "@/lib/http";
import { assertPermission } from "@/lib/rbac";
import { audit } from "@/services/audit.service";

export async function PATCH(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    const actor = await getActor(request);
    assertPermission(actor, "settings.edit");
    const input = z
      .object({
        name: z.string().trim().min(2).max(200),
        address: z.string().max(2000).optional(),
        phone: z.string().max(100).optional(),
        email: z.union([z.email(), z.literal("")]).optional(),
        taxNumber: z.string().max(150).optional(),
      })
      .partial()
      .strict()
      .parse(await readJson(request));
    return db.$transaction(async (tx) => {
      const before = await tx.company.findUniqueOrThrow({ where: { id: actor.companyId } });
      const item = await tx.company.update({ where: { id: actor.companyId }, data: input });
      await audit(tx, actor, {
        action: "UPDATE",
        entity: "Company",
        entityId: actor.companyId,
        before,
        after: item,
      });
      return item;
    });
  });
}
