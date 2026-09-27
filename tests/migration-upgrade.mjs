import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

process.loadEnvFile();
const url = new URL(process.env.DATABASE_URL ?? "http://missing");
if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1"].includes(url.hostname))
  throw new Error("Upgrade tests require a local database.");
const schemaName = `plans_upgrade_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
url.searchParams.set("schema", schemaName);
process.env.DATABASE_URL = url.toString();
const folder = path.resolve(".local", schemaName);
const schemaPath = path.join(folder, "schema.prisma");
const migrations = path.resolve("prisma", "migrations");
const directories = (await readdir(migrations, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
assert.equal(directories.at(-1), "20260927090000_plans_personal_workspaces");
await mkdir(path.join(folder, "migrations"), { recursive: true });
await cp("prisma/schema.prisma", schemaPath);
await cp(
  path.join(migrations, "migration_lock.toml"),
  path.join(folder, "migrations", "migration_lock.toml"),
);
for (const directory of directories.slice(0, -1))
  await cp(path.join(migrations, directory), path.join(folder, "migrations", directory), {
    recursive: true,
  });

function prisma(...args) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", ...args, "--schema", schemaPath],
    { env: process.env, encoding: "utf8" },
  );
  if (result.status !== 0)
    throw new Error(`Prisma verification failed: ${result.stdout}\n${result.stderr}`);
}

prisma("migrate", "deploy");
console.log("PASS: original four migrations applied to a fresh isolated local schema");
const ids = Object.fromEntries(
  [
    "company",
    "otherCompany",
    "admin",
    "secondAdmin",
    "inactiveAdmin",
    "employee",
    "otherUser",
    "adminRole",
    "employeeRole",
    "permission",
    "client",
    "cash",
    "sale",
    "invoice",
    "payment",
    "transaction",
    "receipt",
    "audit",
  ].map((key) => [key, randomUUID()]),
);
const fixture = `BEGIN;
INSERT INTO "Company"(id,name,"updatedAt") VALUES ('${ids.company}','Historic business',CURRENT_TIMESTAMP),('${ids.otherCompany}','Other historic business',CURRENT_TIMESTAMP);
INSERT INTO "User"(id,"companyId",name,email,"passwordHash",active,"createdAt","updatedAt") VALUES
('${ids.admin}','${ids.company}','First active admin','upgrade-admin@example.test','invalid-test-hash',true,'2020-01-01',CURRENT_TIMESTAMP),
('${ids.secondAdmin}','${ids.company}','Second admin','upgrade-admin2@example.test','invalid-test-hash',true,'2021-01-01',CURRENT_TIMESTAMP),
('${ids.inactiveAdmin}','${ids.company}','Inactive old admin','upgrade-inactive@example.test','invalid-test-hash',false,'2018-01-01',CURRENT_TIMESTAMP),
('${ids.employee}','${ids.company}','Employee','upgrade-employee@example.test','invalid-test-hash',true,'2019-01-01',CURRENT_TIMESTAMP),
('${ids.otherUser}','${ids.otherCompany}','Other user','upgrade-other@example.test','invalid-test-hash',true,'2022-01-01',CURRENT_TIMESTAMP);
INSERT INTO "Role"(id,"companyId",name,label) VALUES ('${ids.adminRole}','${ids.company}','ADMIN','Administrateur'),('${ids.employeeRole}','${ids.company}','EMPLOYEE','Employe');
INSERT INTO "Permission"(id,key) VALUES ('${ids.permission}','settings.edit');
INSERT INTO "RolePermission"("companyId","roleId","permissionId") VALUES ('${ids.company}','${ids.adminRole}','${ids.permission}');
INSERT INTO "UserRole"("companyId","userId","roleId") VALUES ('${ids.company}','${ids.admin}','${ids.adminRole}'),('${ids.company}','${ids.secondAdmin}','${ids.adminRole}'),('${ids.company}','${ids.inactiveAdmin}','${ids.adminRole}'),('${ids.company}','${ids.employee}','${ids.employeeRole}');
INSERT INTO "Client"(id,"companyId",name,"salespersonId","updatedAt") VALUES ('${ids.client}','${ids.company}','Historic client','${ids.employee}',CURRENT_TIMESTAMP);
INSERT INTO "CashAccount"(id,"companyId",name,"responsibleId","updatedAt") VALUES ('${ids.cash}','${ids.company}','Historic cash','${ids.admin}',CURRENT_TIMESTAMP);
INSERT INTO "Sale"(id,"companyId",number,"clientId","salespersonId",status,"subtotalMinor","totalMinor","createdById","idempotencyKey","updatedAt") VALUES ('${ids.sale}','${ids.company}','VTE-2026-000001','${ids.client}','${ids.employee}','PARTIALLY_PAID',1000000,1000000,'${ids.admin}','${randomUUID()}',CURRENT_TIMESTAMP);
INSERT INTO "Invoice"(id,"companyId",number,"saleId","clientId","salespersonId","dueDate",status,"subtotalMinor","totalMinor","paidMinor","createdById","updatedAt") VALUES ('${ids.invoice}','${ids.company}','FAC-2026-000001','${ids.sale}','${ids.client}','${ids.employee}','2026-10-27','PARTIALLY_PAID',1000000,1000000,400000,'${ids.admin}',CURRENT_TIMESTAMP);
INSERT INTO "Payment"(id,"companyId",number,"invoiceId","clientId","amountMinor",method,"cashAccountId","createdById","idempotencyKey","updatedAt") VALUES ('${ids.payment}','${ids.company}','PAY-2026-000001','${ids.invoice}','${ids.client}',400000,'CASH','${ids.cash}','${ids.admin}','${randomUUID()}',CURRENT_TIMESTAMP);
INSERT INTO "FinancialTransaction"(id,"companyId",number,type,"amountMinor","destinationCashAccountId","clientId","invoiceId","paymentId","createdById","validatedById","idempotencyKey","updatedAt") VALUES ('${ids.transaction}','${ids.company}','TRX-2026-000001','PAYMENT',400000,'${ids.cash}','${ids.client}','${ids.invoice}','${ids.payment}','${ids.admin}','${ids.admin}','${randomUUID()}',CURRENT_TIMESTAMP);
INSERT INTO "TransactionReceipt"(id,"companyId","transactionId",number,snapshot,"issuedById") VALUES ('${ids.receipt}','${ids.company}','${ids.transaction}','REC-2026-000001','{"amountMinor":"400000","currency":"EUR"}','${ids.admin}');
INSERT INTO "AuditLog"(id,"companyId","userId","userName",action,entity,"entityId",after) VALUES ('${ids.audit}','${ids.company}','${ids.admin}','First active admin','PAYMENT','Payment','${ids.payment}','{"amountMinor":"400000"}');
COMMIT;`;
const fixturePath = path.join(folder, "fixture.sql");
await writeFile(fixturePath, fixture, "utf8");
prisma("db", "execute", "--file", fixturePath);
const db = new PrismaClient({ datasourceUrl: url.toString() });
const tables = [
  "Sale",
  "Invoice",
  "Payment",
  "FinancialTransaction",
  "TransactionReceipt",
  "AuditLog",
  "CashAccount",
  "Client",
  "UserRole",
  "RolePermission",
];
async function snapshots() {
  const result = {};
  for (const table of tables) {
    // table is a fixed internal allowlist, never caller-controlled.
    const rows = await db.$queryRawUnsafe(
      `SELECT to_jsonb(t) - 'customizationSnapshot' AS value FROM "${table}" t ORDER BY to_jsonb(t)::text`,
    );
    result[table] = JSON.stringify(rows);
  }
  return result;
}

try {
  const before = await snapshots();
  console.log(
    "PASS: old schema populated with two tenants, five users, roles, partial invoice, payment, ledger, receipt and audit",
  );
  await cp(
    path.join(migrations, directories.at(-1)),
    path.join(folder, "migrations", directories.at(-1)),
    { recursive: true },
  );
  prisma("migrate", "deploy");
  assert.deepEqual(await snapshots(), before);
  console.log(
    "PASS: upgrade preserves all financial rows, numbers, amounts, statuses, receipt and audit byte-for-byte",
  );
  const members = await db.companyMembership.findMany({ orderBy: { userId: "asc" } });
  assert.equal(members.length, 5);
  assert.equal(members.find((row) => row.userId === ids.admin).isOwner, true);
  assert.equal(members.filter((row) => row.isOwner).length, 1);
  assert.equal(members.find((row) => row.userId === ids.inactiveAdmin).active, false);
  assert.equal(await db.user.count({ where: { usageType: "BUSINESS" } }), 5);
  assert.equal(await db.subscription.count({ where: { plan: { code: "LEGACY" } } }), 2);
  assert.equal(
    (await db.invoice.findUniqueOrThrow({ where: { id: ids.invoice } })).customizationSnapshot,
    null,
  );
  console.log(
    "PASS: memberships, oldest active admin ownership, BUSINESS default, LEGACY plans and original invoices backfilled correctly",
  );
  const constraints =
    await db.$queryRaw`SELECT conname, conrelid::regclass::text AS tab, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype='f' AND confrelid='"CompanyMembership"'::regclass`;
  assert.equal(constraints.length, 27);
  assert(
    constraints.some(
      (row) => row.conname === "FinancialTransaction_destinationSalespersonId_membership_fk",
    ),
  );
  assert(constraints.some((row) => row.conname === "Invoice_createdById_membership_fk"));
  assert(constraints.some((row) => row.conname === "Attachment_uploadedById_membership_fk"));
  const legacy =
    await db.$queryRaw`SELECT conname FROM pg_constraint WHERE contype='f' AND confrelid='"User"'::regclass AND cardinality(conkey)=2`;
  assert.equal(legacy.length, 0);
  await assert.rejects(() =>
    db.client.create({
      data: { companyId: ids.company, name: "Cross tenant rejected", salespersonId: ids.otherUser },
    }),
  );
  await db.companyMembership.create({
    data: { companyId: ids.company, userId: ids.otherUser, active: true },
  });
  const joinedClient = await db.client.create({
    data: { companyId: ids.company, name: "Invited member works", salespersonId: ids.otherUser },
  });
  assert.equal(joinedClient.salespersonId, ids.otherUser);
  await assert.rejects(() =>
    db.invoice.update({
      where: { id: ids.invoice },
      data: { customizationSnapshot: { forbidden: true } },
    }),
  );
  await assert.rejects(() => db.financialTransaction.delete({ where: { id: ids.transaction } }));
  console.log(
    "PASS: all 27 membership constraints restored, cross-tenant writes rejected, joined members accepted and immutable documents protected",
  );
  await writeFile(
    path.join(folder, "result.json"),
    JSON.stringify(
      {
        schema: schemaName,
        companies: 2,
        users: 5,
        immutableTablesCompared: tables.length,
        membershipForeignKeys: constraints.length,
        passed: true,
      },
      null,
      2,
    ),
  );
  console.log(`Migration upgrade verified in ${schemaName}. No existing schema was modified.`);
} finally {
  await db.$disconnect();
}
