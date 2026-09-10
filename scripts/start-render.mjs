import { randomUUID } from "node:crypto";
import { mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

class StartupError extends Error {}

async function main() {
  const projectRoot = fileURLToPath(new URL("../", import.meta.url));
  const onRender = process.env.RENDER === "true";
  const configuredUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  if (!configuredUrl)
    throw new StartupError("Définir APP_URL ou utiliser l’URL fournie par Render.");

  let publicUrl;
  try {
    publicUrl = new URL(configuredUrl);
  } catch {
    throw new StartupError("APP_URL doit contenir une origine HTTP(S) valide.");
  }
  if (
    !["http:", "https:"].includes(publicUrl.protocol) ||
    publicUrl.username ||
    publicUrl.password ||
    publicUrl.pathname !== "/" ||
    publicUrl.search ||
    publicUrl.hash
  )
    throw new StartupError(
      "APP_URL doit contenir uniquement une origine, sans chemin ni identifiants.",
    );
  if (onRender && publicUrl.protocol !== "https:")
    throw new StartupError("APP_URL doit utiliser HTTPS sur Render.");

  process.env.APP_URL = publicUrl.origin;
  process.env.NODE_ENV = "production";
  process.env.HOSTNAME = "0.0.0.0";
  process.env.PORT ||= onRender ? "10000" : "3000";

  const uploadDirectory = path.resolve(
    projectRoot,
    process.env.UPLOAD_DIR || (onRender ? "/var/data/uploads" : "uploads"),
  );
  // Resolve before Next's generated server changes the process working directory.
  process.env.UPLOAD_DIR = uploadDirectory;
  const probePath = path.join(uploadDirectory, `.write-check-${randomUUID()}`);
  let probe;
  try {
    await mkdir(uploadDirectory, { recursive: true, mode: 0o700 });
    probe = await open(probePath, "wx", 0o600);
    await probe.writeFile("ok");
  } catch {
    throw new StartupError(
      "Le répertoire privé des justificatifs n’est pas accessible en écriture.",
    );
  } finally {
    if (probe) {
      await probe.close();
      await unlink(probePath);
    }
  }

  await import(pathToFileURL(path.join(projectRoot, ".next", "standalone", "server.js")).href);
}

main().catch((error) => {
  // Environment variables can contain credentials: never print raw startup errors.
  console.error(
    error instanceof StartupError
      ? error.message
      : "Échec du démarrage Render. Vérifier la configuration et le build standalone.",
  );
  process.exitCode = 1;
});
