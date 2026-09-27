import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { createSession, SESSION_COOKIE } from "../src/lib/auth";
import { rolePermissions } from "../src/lib/rbac";
import { initializeRoles } from "../src/services/account.service";
import { getDashboard } from "../src/services/report.service";
import { exportReport } from "../src/services/export.service";
import { withTransactionLabels } from "../src/services/transaction-labels.service";
import { GET as search } from "../src/app/api/search/route";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !/^plans_qa_[a-zA-Z0-9_]+$/.test(url.searchParams.get("schema") ?? "")
  )
    throw new Error("Schéma de tests local isolé obligatoire.");
  const run = randomUUID();
  const first = await db.company.create({ data: { name: `Primary ${run}` } });
  const second = await db.company.create({ data: { name: `Invited ${run}` } });
  await db.$transaction(async (tx) => {
    await initializeRoles(tx, first.id);
    await initializeRoles(tx, second.id);
  });
  const firstRole = await db.role.update({
    where: { companyId_name: { companyId: first.id, name: "ADMIN" } },
    data: { label: "SECRET ROLE FROM OTHER COMPANY" },
  });
  const secondRole = await db.role.findUniqueOrThrow({
    where: { companyId_name: { companyId: second.id, name: "ADMIN" } },
  });
  const member = await db.user.create({
    data: {
      name: `Multicompany ${run}`,
      email: `multi-${run}@example.test`,
      passwordHash: "not-a-login-hash",
      companyId: first.id,
      usageType: "BOTH",
    },
  });
  const outsider = await db.user.create({
    data: {
      name: `Outside ${run}`,
      email: `outside-${run}@example.test`,
      passwordHash: "not-a-login-hash",
      companyId: first.id,
    },
  });
  await db.companyMembership.create({ data: { userId: member.id, companyId: second.id } });
  await db.userRole.createMany({
    data: [
      { userId: member.id, companyId: first.id, roleId: firstRole.id },
      { userId: member.id, companyId: second.id, roleId: secondRole.id },
    ],
  });
  await db.salespersonProfile.createMany({
    data: [
      { userId: member.id, companyId: first.id },
      { userId: member.id, companyId: second.id },
      { userId: outsider.id, companyId: first.id },
    ],
  });
  const actor = {
    id: member.id,
    companyId: second.id,
    name: member.name,
    role: "ADMIN",
    permissions: rolePermissions.ADMIN,
  };
  const dashboard = await getDashboard(actor);
  assert(
    dashboard.salespersonCollections.some((person) => person.id === member.id),
    "Invited member must appear despite a different home company",
  );
  assert(
    !dashboard.salespersonCollections.some((person) => person.id === outsider.id),
    "Other company salesperson must stay hidden",
  );
  const csv = await (
    await exportReport(actor, new URLSearchParams({ type: "users", format: "csv" }))
  ).text();
  assert(csv.includes(member.name));
  assert(!csv.includes(outsider.name));
  assert(!csv.includes("SECRET ROLE FROM OTHER COMPANY"));
  const movement = {
    sourceCashAccountId: null,
    destinationCashAccountId: null,
    sourceSalespersonId: member.id,
    destinationSalespersonId: outsider.id,
  };
  const [labeled] = await withTransactionLabels(actor, [movement]);
  assert.equal(labeled.sourceLabel, member.name);
  assert.equal(labeled.destinationSalesperson, null);
  const session = await createSession(member.id, second.id);
  const response = await search(
    new Request(`http://localhost:3107/api/search?q=${run}`, {
      headers: { cookie: `${SESSION_COOKIE}=${session.token}` },
    }),
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert(result.items.some((item: { id: string }) => item.id === member.id));
  assert(!result.items.some((item: { id: string }) => item.id === outsider.id));
  await db.companyMembership.update({
    where: { companyId_userId: { companyId: second.id, userId: member.id } },
    data: { active: false },
  });
  const history = await withTransactionLabels(actor, [movement]);
  assert.equal(
    history[0].sourceLabel,
    member.name,
    "Removing membership must preserve historical financial attribution",
  );
  const rejected = await search(
    new Request(`http://localhost:3107/api/search?q=${run}`, {
      headers: { cookie: `${SESSION_COOKIE}=${session.token}` },
    }),
  );
  assert.equal(rejected.status, 403, "Removed member session loses access");
  console.log(
    "PASS workspace reports: invited member lookup/search/dashboard; company-only roles in CSV; outsider excluded; historical names retained; removed member denied.",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
