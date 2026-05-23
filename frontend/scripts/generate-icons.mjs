// Генерация PNG-иконок всех размеров из public/icon.svg
// Запуск: node scripts/generate-icons.mjs
import sharp from "sharp";
import { readFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const svgPath = join(root, "public", "icon.svg");
const outDir = join(root, "public", "icons");

mkdirSync(outDir, { recursive: true });

const svg = readFileSync(svgPath);
const sizes = [48, 72, 96, 128, 144, 152, 167, 180, 192, 256, 384, 512];

for (const size of sizes) {
  const out = join(outDir, `icon-${size}.png`);
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(out);
  console.log(`✓ icon-${size}.png`);
}

console.log(`Готово: ${sizes.length} иконок -> public/icons/`);
