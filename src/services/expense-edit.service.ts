import { z } from "zod";
import {
  type Actor,
  assertCompany,
  atomic,
  BusinessError,
  dateInput,
  idInput,
  paymentMethod,
  requirePermission,
} from "@/lib/finance-context";
import { moneyInput, parseMoney } from "@/lib/money";
import { audit } from "./audit.service";

export async function updateExpense(actor: Actor, id: string, raw: unknown) {
  requirePermission(actor, "expenses.edit");
  idInput.parse(id);
  const input = z
    .object({
      description: z.string().trim().min(3).max(5000).optional(),
      amount: moneyInput.optional(),
      categoryId: idInput.optional(),
      supplierId: idInput.optional(),
      date: dateInput,
      method: paymentMethod.optional(),
      cashAccountId: idInput.optional(),
      comment: z.string().max(5000).optional(),
    })
    .strict()
    .parse(raw);
  const amountMinor = input.amount === undefined ? undefined : parseMoney(input.amount);
  if (amountMinor !== undefined && amountMinor <= 0n)
    throw new BusinessError("Le montant doit être supérieur à zéro.");
  return atomic(async (tx) => {
    const before = await tx.expense.findFirst({ where: { id, companyId: actor.companyId } });
    if (!before) throw new BusinessError("Dépense introuvable.", 404);
    if (before.requesterId !== actor.id && actor.role !== "ADMIN")
      throw new BusinessError("Vous pouvez modifier uniquement vos propres demandes.", 403);
    if (!["PENDING", "DRAFT"].includes(before.status))
      throw new BusinessError(
        "Seules les demandes en attente ou en brouillon peuvent être modifiées.",
        409,
      );
    if (input.categoryId)
      await assertCompany(tx, "expenseCategory", input.categoryId, actor.companyId);
    if (input.supplierId) await assertCompany(tx, "supplier", input.supplierId, actor.companyId);
    if (input.cashAccountId)
      await assertCompany(tx, "cashAccount", input.cashAccountId, actor.companyId);
    const item = await tx.expense.update({
      where: { id },
      data: {
        description: input.description,
        categoryId: input.categoryId,
        supplierId: input.supplierId,
        cashAccountId: input.cashAccountId,
        method: input.method,
        comment: input.comment,
        amountMinor,
        date: input.date ? new Date(input.date) : undefined,
      },
    });
    await audit(tx, actor, {
      action: "UPDATE",
      entity: "Expense",
      entityId: id,
      before,
      after: item,
    });
    return item;
  });
}
