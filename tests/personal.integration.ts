import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { createSession, getActor, SESSION_COOKIE } from "../src/lib/auth";
import { initializeRoles } from "../src/services/account.service";
import {
  createPersonalAccount,
  createPersonalCategory,
  ensurePersonalCategories,
  savePersonalBudget,
  savePersonalTransaction,
  updatePersonalAccount,
} from "../src/services/personal.service";
import { getPersonalOverview } from "../src/services/personal-report.service";
import {
  uploadPersonalAttachment,
  downloadPersonalAttachment,
} from "../src/services/personal-attachment.service";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^plans_qa_[a-zA-Z0-9_]+$/.test(url.searchParams.get("schema") ?? "") ||
    process.env.ALLOW_PERSONAL_TESTS !== "true"
  )
    throw new Error(
      "Tests autorisés uniquement sur une base locale dédiée avec ALLOW_PERSONAL_TESTS=true.",
    );
  const run = randomUUID();
  process.env.UPLOAD_DIR = `.local/personal-test-uploads/${run}`;
  const company = await db.company.create({ data: { name: `Personal isolation ${run}` } });
  const owner = await db.user.create({
    data: {
      name: "Propriétaire",
      email: `personal-owner-${run}@example.test`,
      passwordHash: "not-a-login-hash",
      usageType: "BOTH",
      companyId: company.id,
    },
  });
  const colleague = await db.user.create({
    data: {
      name: "Administrateur entreprise",
      email: `personal-colleague-${run}@example.test`,
      passwordHash: "not-a-login-hash",
      usageType: "BOTH",
      companyId: company.id,
    },
  });
  // Both identities share a business. No business role or ownership changes personal authorization.
  await db.companyMembership.createMany({
    skipDuplicates: true,
    data: [
      { companyId: company.id, userId: owner.id, isOwner: true },
      { companyId: company.id, userId: colleague.id },
    ],
  });
  await db.$transaction((tx) => initializeRoles(tx, company.id));
  const adminRole = await db.role.findUniqueOrThrow({
    where: { companyId_name: { companyId: company.id, name: "ADMIN" } },
  });
  await db.userRole.create({
    data: { companyId: company.id, userId: colleague.id, roleId: adminRole.id },
  });
  const adminSession = await createSession(colleague.id, company.id);
  const adminActor = await getActor(
    new Request("http://localhost:3107/api/me", {
      headers: { cookie: `${SESSION_COOKIE}=${adminSession.token}` },
    }),
  );
  assert.equal(adminActor.role, "ADMIN");
  assert(adminActor.permissions.includes("users.edit"));
  const identity = { id: owner.id, usageType: "BOTH", personalCurrency: "EUR" };
  const other = { ...identity, id: colleague.id };
  const date = "2026-09-27";
  const snapshot = () => getPersonalOverview(identity, { month: "2026-09" });
  await ensurePersonalCategories(identity);
  await ensurePersonalCategories(identity);
  assert.equal(await db.personalCategory.count({ where: { userId: owner.id } }), 21);
  const current = await createPersonalAccount(identity, { name: "Compte courant" });
  const savings = await createPersonalAccount(identity, { name: "Épargne", type: "SAVINGS" });
  const foreign = await createPersonalAccount(other, { name: "Compte privé collègue" });
  const category = await db.personalCategory.findFirstOrThrow({
    where: { userId: owner.id, name: "Alimentation", type: "EXPENSE" },
  });
  const common = {
    accountId: current.id,
    description: "Transaction test",
    date,
    idempotencyKey: randomUUID(),
  };
  await savePersonalTransaction(identity, { ...common, type: "INCOME", amount: "2000" });
  const expenseInput = {
    ...common,
    idempotencyKey: randomUUID(),
    type: "EXPENSE",
    amount: "100",
    categoryId: category.id,
  };
  const [expense, repeat] = await Promise.all([
    savePersonalTransaction(identity, expenseInput),
    savePersonalTransaction(identity, expenseInput),
  ]);
  assert.equal(expense.id, repeat.id);
  let overview = await snapshot();
  assert.equal(overview.summary.balanceMinor, 190000n);
  assert.equal(overview.summary.incomeMinor, 200000n);
  assert.equal(overview.summary.expenseMinor, 10000n);
  await savePersonalBudget(identity, {
    categoryId: category.id,
    limit: "500",
    month: 9,
    year: 2026,
  });
  overview = await snapshot();
  assert.equal(overview.budgets[0].remainingMinor, 40000n);
  assert.equal(overview.budgets[0].percent, 20);
  await savePersonalTransaction(identity, {
    ...common,
    type: "TRANSFER",
    amount: "300",
    destinationAccountId: savings.id,
    idempotencyKey: randomUUID(),
  });
  overview = await snapshot();
  assert.equal(overview.summary.balanceMinor, 190000n);
  assert.equal(overview.accounts.find((item) => item.id === current.id)?.balanceMinor, 160000n);
  assert.equal(overview.accounts.find((item) => item.id === savings.id)?.balanceMinor, 30000n);
  assert.equal(overview.summary.expenseMinor, 10000n);
  const edited = await savePersonalTransaction(
    identity,
    { ...expenseInput, amount: "400", updatedAt: expense.updatedAt.toISOString() },
    expense.id,
  );
  assert.equal((await snapshot()).budgets[0].status, "WARNING");
  await assert.rejects(
    () =>
      savePersonalTransaction(
        identity,
        { ...expenseInput, amount: "600", updatedAt: expense.updatedAt.toISOString() },
        expense.id,
      ),
    /modifiée/,
  );
  await savePersonalTransaction(
    identity,
    { ...expenseInput, amount: "500", updatedAt: edited.updatedAt.toISOString() },
    expense.id,
  );
  assert.equal((await snapshot()).budgets[0].status, "EXCEEDED");
  assert.equal((await getPersonalOverview(other, { month: "2026-09" })).transactions.total, 0);
  await assert.rejects(
    () =>
      savePersonalTransaction(other, {
        ...expenseInput,
        accountId: current.id,
        idempotencyKey: randomUUID(),
      }),
    /indisponible/,
  );
  await assert.rejects(
    () =>
      savePersonalTransaction(identity, {
        ...common,
        type: "TRANSFER",
        amount: "1",
        destinationAccountId: foreign.id,
        idempotencyKey: randomUUID(),
      }),
    /indisponible/,
  );
  await assert.rejects(
    () =>
      savePersonalTransaction(identity, {
        ...common,
        type: "TRANSFER",
        amount: "1",
        destinationAccountId: current.id,
        idempotencyKey: randomUUID(),
      }),
    /distincts/,
  );
  await assert.rejects(
    () =>
      savePersonalBudget(other, { categoryId: category.id, limit: "500", month: 9, year: 2026 }),
    /introuvable/,
  );
  await assert.rejects(
    () => updatePersonalAccount(other, current.id, { name: "Intrusion", isArchived: true }),
    /introuvable/,
  );
  const ownCategory = await createPersonalCategory(other, { name: "Privée", type: "EXPENSE" });
  await assert.rejects(
    () =>
      savePersonalTransaction(identity, {
        ...expenseInput,
        categoryId: ownCategory.id,
        idempotencyKey: randomUUID(),
      }),
    /introuvable/,
  );
  await assert.rejects(
    () =>
      db.personalTransaction.create({
        data: {
          userId: colleague.id,
          accountId: current.id,
          type: "EXPENSE",
          amountMinor: 100n,
          currency: "EUR",
          description: "DB intrusion",
          date: new Date(date),
          idempotencyKey: randomUUID(),
        },
      }),
    /Foreign key/,
  );
  const form = new FormData();
  form.set("transactionId", expense.id);
  form.set("file", new File(["%PDF-1.4\nTest"], "justificatif.pdf", { type: "application/pdf" }));
  const attachment = await uploadPersonalAttachment(identity, form);
  assert.equal((await downloadPersonalAttachment(identity, attachment.id)).status, 200);
  await assert.rejects(() => downloadPersonalAttachment(other, attachment.id), /introuvable/);
  await assert.rejects(() => uploadPersonalAttachment(other, form), /introuvable/);
  await updatePersonalAccount(identity, savings.id, { name: savings.name, isArchived: true });
  await assert.rejects(
    () =>
      savePersonalTransaction(identity, {
        ...common,
        type: "TRANSFER",
        amount: "1",
        destinationAccountId: savings.id,
        idempotencyKey: randomUUID(),
      }),
    /indisponible/,
  );
  const searched = await getPersonalOverview(identity, {
    month: "2026-09",
    type: "EXPENSE",
    categoryId: category.id,
    q: "test",
  });
  assert.equal(searched.transactions.total, 1);
  console.log(
    "PASS personal: income 2000, expense 100, balance 1900; exact monthly budget; atomic transfer; concurrent idempotency; editing and conflict; 80/100 alerts; same-company admin isolation; DB composite FK; private attachments; archive; filters.",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
