// Перегенерирует все размеры PNG-иконок из public/icons/icon-512.png (Modern Ledger).
import sharp from 'sharp';
import { resolve } from 'node:path';

const sizes = [48, 72, 96, 128, 144, 152, 167, 180, 192, 256, 384];
const src = resolve('public/icons/icon-512.png');

for (const s of sizes) {
  const out = resolve(`public/icons/icon-${s}.png`);
  await sharp(src).resize(s, s).png().toFile(out);
  console.log(`  ${out} (${s}×${s})`);
}
console.log('done');
