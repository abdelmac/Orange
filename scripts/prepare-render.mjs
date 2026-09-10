import { access, cp, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const standalone = path.join(projectRoot, ".next", "standalone");

await access(path.join(standalone, "server.js"));
// npm run build already verifies Prisma and removes private configuration.
// Refuse an unsafe artifact instead of carrying configuration into production.
const entries = await readdir(standalone);
if (entries.some((name) => name === ".env" || name.startsWith(".env.")))
  throw new Error(
    "Configuration privée détectée dans le build standalone. Relancer npm run build.",
  );

// Next standalone does not copy these two public asset directories itself.
await cp(path.join(projectRoot, "public"), path.join(standalone, "public"), {
  recursive: true,
  force: true,
});
await cp(path.join(projectRoot, ".next", "static"), path.join(standalone, ".next", "static"), {
  recursive: true,
  force: true,
});

console.log("Render : ressources publiques copiées dans le build standalone.");
