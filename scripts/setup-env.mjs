import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
if (existsSync(".env")) {
  console.log("Le fichier .env existe déjà ; aucune modification.");
} else {
  const password = randomBytes(24).toString("hex");
  const demo = `Demo-${randomBytes(12).toString("base64url")}!`;
  writeFileSync(
    ".env",
    `POSTGRES_USER=orange\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=orange\nDATABASE_URL=postgresql://orange:${password}@localhost:5434/orange?schema=public\nAPP_URL=http://localhost:3000\nUPLOAD_DIR=./uploads\nDEMO_PASSWORD=${demo}\n`,
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    "Fichier .env créé avec des secrets aléatoires. Le mot de passe des comptes de démonstration est dans DEMO_PASSWORD (développement uniquement).",
  );
}
