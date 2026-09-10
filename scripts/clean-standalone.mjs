import { cp, readdir, unlink } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

// Next copies loaded .env files independently of its dependency tracing.
// Runtime configuration must be supplied by the host, never shipped in the build.
const standalone = path.resolve(".next", "standalone");
// Prisma's generated client and native engine are runtime dependencies that
// Next's file tracing does not reliably retain. Copy both explicitly.
for (const packagePath of ["@prisma/client", ".prisma/client"]) {
  await cp(
    path.resolve("node_modules", packagePath),
    path.join(standalone, "node_modules", packagePath),
    { recursive: true, force: true },
  );
}
const standaloneRequire = createRequire(path.join(standalone, "package.json"));
if (typeof standaloneRequire("@prisma/client").PrismaClient !== "function")
  throw new Error("Prisma runtime missing from standalone build");
const entries = await readdir(standalone, { withFileTypes: true });
for (const entry of entries) {
  if (entry.isFile() && (entry.name === ".env" || entry.name.startsWith(".env."))) {
    const target = path.resolve(standalone, entry.name);
    if (path.dirname(target) !== standalone)
      throw new Error("Invalid standalone configuration path");
    await unlink(target);
  }
}
console.log("Standalone : moteur Prisma vérifié, configuration privée exclue de l’artefact.");
