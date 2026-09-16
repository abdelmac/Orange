import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

// Reuse the existing brand artwork; no font downloads or remote image service.
const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve("next/package.json"));
const sharp = nextRequire("sharp");
const root = path.resolve(import.meta.dirname, "..");
const svg = await readFile(path.join(root, "public/icon.svg"));
const icon = async (relative, size) => {
  const file = path.join(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await sharp(svg)
    .resize(size, size)
    .flatten({ background: "#e96532" })
    .removeAlpha()
    .png()
    .toFile(file);
};
await icon("mobile/ios/OrangeFinance/Assets.xcassets/AppIcon.appiconset/icon-1024.png", 1024);
await icon("docs/mobile/assets/play-icon-512.png", 512);
await icon("docs/mobile/assets/apple-icon-1024.png", 1024);
for (const [density, size] of Object.entries({
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
})) {
  await icon(`mobile/android/app/src/main/res/mipmap-${density}/ic_launcher.png`, size);
}
await mkdir(path.join(root, "docs/mobile/assets"), { recursive: true });
await sharp(await readFile(path.join(root, "docs/mobile/assets/play-feature.svg")))
  .removeAlpha()
  .png()
  .toFile(path.join(root, "docs/mobile/assets/play-feature-1024x500.png"));
await writeFile(
  path.join(root, "docs/mobile/assets/README.md"),
  "# Visuels mobiles\n\nGénérés par `node scripts/generate-mobile-icons.mjs`. Icônes opaques issues de `public/icon.svg` : Apple 1024 × 1024 et Google Play 512 × 512. La bannière Google Play 1024 × 500 est issue de `play-feature.svg` ; elle illustre les fonctions du produit, ce n’est pas une capture d’écran.\n\nLes captures doivent provenir des applications natives réellement exécutées. Le nom et la marque restent à confirmer avant publication.\n",
);
console.log("Icônes Android, iOS et boutiques générées.");
