// Конвертирует SVG-исходники в PNG нужных размеров для @capacitor/assets:
//   assets/icon.png            1024×1024 (main icon)
//   assets/icon-foreground.png 1024×1024 (adaptive icon foreground)
//   assets/icon-background.png 1024×1024 (adaptive icon background, бордовая плашка)
//   assets/splash.png          2732×2732 (universal splash)
//   assets/splash-dark.png     2732×2732 (тот же, в тёмном режиме)
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const iconSvg = readFileSync(resolve(here, 'icon-source.svg'));
const splashSvg = readFileSync(resolve(here, 'splash-source.svg'));

async function svgToPng(svgBuffer, size, outFile, bg = '#f6f2e9') {
  await sharp(svgBuffer, { density: 384 })
    .resize(size, size, { fit: 'contain', background: bg })
    .flatten({ background: bg })
    .png()
    .toFile(resolve(here, outFile));
  console.log(`wrote ${outFile} (${size}×${size})`);
}

async function solidPng(size, outFile, color) {
  await sharp({
    create: { width: size, height: size, channels: 3, background: color },
  }).png().toFile(resolve(here, outFile));
  console.log(`wrote ${outFile} (${size}×${size}) solid ${color}`);
}

await svgToPng(iconSvg, 1024, 'icon.png');
// foreground для adaptive icon — тот же логотип, центрированный с запасом по полям;
// @capacitor/assets сам обрежет по safe zone.
await svgToPng(iconSvg, 1024, 'icon-foreground.png');
await solidPng(1024, 'icon-background.png', '#f6f2e9');
await svgToPng(splashSvg, 2732, 'splash.png');
await svgToPng(splashSvg, 2732, 'splash-dark.png');
