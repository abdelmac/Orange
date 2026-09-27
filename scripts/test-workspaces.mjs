import { spawnSync } from "node:child_process";

try {
  process.loadEnvFile();
} catch {
  /* CI may supply the environment directly. */
}
if (process.env.NODE_ENV === "production") throw new Error("Tests interdits en production.");
const url = new URL(process.env.DATABASE_URL ?? "http://missing");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  !url.protocol.startsWith("postgres")
)
  throw new Error("DATABASE_URL doit désigner PostgreSQL en local.");
const schema = process.env.TEST_DATABASE_SCHEMA ?? "plans_qa_suite";
if (!/^plans_qa_[a-zA-Z0-9_]+$/.test(schema))
  throw new Error("Le schéma de test doit commencer par plans_qa_.");
url.searchParams.set("schema", schema);
process.env.DATABASE_URL = url.toString();
process.env.ALLOW_PERSONAL_TESTS = "true";
process.env.APP_URL = "http://localhost:3107";
const suites = {
  accounts: "tests/accounts-team.integration.ts",
  owner: "tests/free-owner.integration.ts",
  personal: "tests/personal.integration.ts",
  invoices: "tests/invoice-customization.integration.ts",
  billing: "tests/billing.integration.ts",
  workspaces: "tests/workspace-reports.integration.ts",
  reports: "tests/advanced-reports.integration.ts",
};
const suite = process.argv[2] ?? "all";
if (suite !== "all" && suite !== "serve" && !(suite in suites)) throw new Error("Suite inconnue.");
function run(...args) {
  const result = spawnSync(process.execPath, args, { env: process.env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(
  `Vérification sur PostgreSQL local, schéma isolé ${schema}. Les données existantes restent inchangées.`,
);
run("node_modules/prisma/build/index.js", "migrate", "deploy");
if (suite === "serve") {
  run("node_modules/tsx/dist/cli.mjs", "prisma/seed.ts");
  run(
    "node_modules/next/dist/bin/next",
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3107",
  );
} else {
  for (const file of suite === "all" ? Object.values(suites) : [suites[suite]])
    run("node_modules/tsx/dist/cli.mjs", file);
}
