import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { createPrivateKey, createPublicKey, randomBytes, X509Certificate } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const usage = `Préparer une signature Apple depuis Windows ou macOS :
  node scripts/ios/signing-material.mjs csr --name "Votre nom légal" --email "votre@email.fr"
  node scripts/ios/signing-material.mjs package --certificate "chemin/apple_distribution.cer"

Les fichiers privés restent dans .local/apple-signing, exclu de Git.
OPENSSL_PATH permet de préciser le chemin d’OpenSSL.
Le script ne contacte pas Apple et n’envoie aucun secret.`;

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: repository,
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
  if (result.error || result.status !== 0) {
    // Do not print command arguments or tool output: both can contain signing data.
    throw new Error(`Échec de ${path.basename(executable)} (${args[0]}).`);
  }
  return result.stdout;
}

function findOpenSSL() {
  const candidates = [process.env.OPENSSL_PATH, "openssl"];
  if (process.platform === "win32") {
    const git = spawnSync("where.exe", ["git"], { encoding: "utf8", windowsHide: true });
    for (const location of (git.stdout || "").trim().split(/\r?\n/)) {
      if (location) candidates.push(path.resolve(path.dirname(location), "../usr/bin/openssl.exe"));
    }
  }
  for (const executable of candidates.filter(Boolean)) {
    const result = spawnSync(executable, ["version"], { encoding: "utf8", windowsHide: true });
    if (!result.error && result.status === 0 && /^OpenSSL\s/.test(result.stdout)) return executable;
  }
  throw new Error("OpenSSL introuvable. Installer Git pour Windows ou définir OPENSSL_PATH.");
}

function privateDirectory(folder) {
  const local = path.join(repository, ".local");
  if (existsSync(local) && lstatSync(local).isSymbolicLink()) {
    throw new Error(".local doit être un répertoire local, pas un lien.");
  }
  mkdirSync(local, { recursive: true, mode: 0o700 });
  const destination = path.resolve(repository, folder || ".local/apple-signing");
  if (path.dirname(destination) !== local || destination === local) {
    throw new Error("Le répertoire de signature doit être un sous-dossier direct de .local.");
  }
  if (existsSync(destination) && lstatSync(destination).isSymbolicLink()) {
    throw new Error("Le répertoire de signature ne peut pas être un lien.");
  }
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  if (path.dirname(realpathSync(destination)) !== realpathSync(local)) {
    throw new Error("Destination de signature incorrecte.");
  }
  run("git", ["check-ignore", "-q", path.join(destination, "distribution.key")]);
  if (process.platform === "win32") {
    const sid = run("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
    ]).trim();
    if (!/^S-1-[0-9-]+$/.test(sid)) throw new Error("Identité Windows introuvable.");
    run("icacls.exe", [destination, "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`]);
  } else {
    chmodSync(destination, 0o700);
  }
  return destination;
}

function newFile(target, data) {
  writeFileSync(target, data, { flag: "wx", mode: 0o600 });
}

function refuseOverwrite(files) {
  if (files.some((file) => existsSync(file))) {
    throw new Error(
      "Des fichiers de signature existent déjà. Ils sont conservés, sans écrasement.",
    );
  }
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help") return console.log(usage);
  if (!["csr", "package"].includes(command)) throw new Error(usage);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const allowed =
      command === "csr" ? ["--name", "--email", "--directory"] : ["--certificate", "--directory"];
    if (!allowed.includes(args[i]) || !args[i + 1] || options[args[i]]) throw new Error(usage);
    options[args[i]] = args[i + 1];
  }
  if (command === "csr") {
    if (!options["--name"]?.trim() || /[\x00-\x1f\x7f]/.test(options["--name"])) {
      throw new Error("Indiquer un nom pour la demande avec --name.");
    }
    if (
      !/^[A-Za-z0-9.!#$%&'*+?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(
        options["--email"] || "",
      )
    ) {
      throw new Error("Indiquer une adresse email valide avec --email.");
    }
  } else if (!options["--certificate"])
    throw new Error("Indiquer le certificat Apple .cer avec --certificate.");

  const openssl = findOpenSSL();
  const folder = privateDirectory(options["--directory"]);
  const key = path.join(folder, "distribution.key");
  const password = path.join(folder, "key-password.txt");
  if (command === "csr") {
    const csr = path.join(folder, "distribution.certSigningRequest");
    refuseOverwrite([key, password, csr]);
    newFile(password, randomBytes(32).toString("base64url"));
    run(openssl, [
      "genpkey",
      "-algorithm",
      "RSA",
      "-pkeyopt",
      "rsa_keygen_bits:2048",
      "-aes-256-cbc",
      "-pass",
      `file:${password}`,
      "-out",
      key,
    ]);
    const escape = (value) => value.replace(/[\\/+="<>;]/g, "\\$&");
    run(openssl, [
      "req",
      "-new",
      "-sha256",
      "-utf8",
      "-key",
      key,
      "-passin",
      `file:${password}`,
      "-subj",
      `/CN=${escape(options["--name"].trim())}/emailAddress=${escape(options["--email"])}`,
      "-out",
      csr,
    ]);
    if (process.platform !== "win32") chmodSync(key, 0o600);
    console.log(
      `Demande créée : ${path.relative(repository, csr)}\nTransmettre uniquement ce fichier CSR au portail Apple. La clé privée reste ici.`,
    );
    return;
  }

  const certificate = new X509Certificate(readFileSync(path.resolve(options["--certificate"])));
  const now = Date.now();
  if (Date.parse(certificate.validFrom) > now || Date.parse(certificate.validTo) <= now) {
    throw new Error("Certificat expiré ou pas encore valide.");
  }
  if (!/(?:^|\n)CN=Apple Distribution:/.test(certificate.subject)) {
    throw new Error("Utiliser un certificat Apple Distribution pour l’App Store.");
  }
  const privateKey = createPrivateKey({
    key: readFileSync(key),
    passphrase: readFileSync(password, "utf8"),
  });
  const publicKey = createPublicKey(privateKey).export({ type: "spki", format: "der" });
  if (!publicKey.equals(certificate.publicKey.export({ type: "spki", format: "der" }))) {
    throw new Error("Ce certificat ne correspond pas à la clé privée de la demande CSR.");
  }
  const pem = path.join(folder, "distribution.cer.pem");
  const p12 = path.join(folder, "distribution.p12");
  const p12Password = path.join(folder, "p12-password.txt");
  const base64 = path.join(folder, "distribution.p12.base64.txt");
  refuseOverwrite([pem, p12, p12Password, base64]);
  newFile(pem, certificate.toString());
  newFile(p12Password, randomBytes(32).toString("base64url"));
  run(openssl, [
    "pkcs12",
    "-export",
    "-inkey",
    key,
    "-passin",
    `file:${password}`,
    "-in",
    pem,
    "-name",
    "Orange Finance distribution",
    "-out",
    p12,
    "-passout",
    `file:${p12Password}`,
  ]);
  if (process.platform !== "win32") chmodSync(p12, 0o600);
  newFile(base64, readFileSync(p12).toString("base64"));
  console.log(
    `P12 chiffré créé dans ${path.relative(repository, folder)}.\nFichiers pour GitHub Secrets : distribution.p12.base64.txt et p12-password.txt. Aucun secret affiché.`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Préparation de la signature impossible.");
  process.exitCode = 1;
}
