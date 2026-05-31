// Массовая замена хардкоженных цветов editorial-палитры на Modern Ledger.
// Запуск: node scripts/rebrand-modern-ledger.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const replacements = [
  // ---- Burgundy → Navy ----
  [/#9f1239\b/gi, '#173a54'],
  [/#881337\b/gi, '#0f293d'],
  [/rgba\(\s*159\s*,\s*18\s*,\s*57/gi, 'rgba(23, 58, 84'],

  // ---- Bg / surfaces ----
  [/#faf8f3\b/gi, '#f6f2e9'],   // page bg → paper
  [/#f5f3ee\b/gi, '#efe9db'],   // subtle fills

  // ---- Text ramp (warm grey → cool grey) ----
  [/#1c1917\b/gi, '#1b2531'],
  [/#57534e\b/gi, '#515c68'],
  [/#78716c\b/gi, '#7a8590'],
  [/#a8a29e\b/gi, '#a6afb8'],
  [/#d6d3d1\b/gi, '#c7cdd3'],

  // ---- Lines (warm) ----
  [/#e7e5e0\b/gi, '#e4ddcd'],
  [/#ede9df\b/gi, '#ece6d8'],

  // ---- Income / expense / transfer accents ----
  [/#15803d\b/gi, '#167a4a'],
  [/#b91c1c\b/gi, '#c0432b'],
  [/#991b1b\b/gi, '#a53825'],
  [/#1d4ed8\b/gi, '#2f6296'],

  // ---- Warning / yellow tints (badges) -> brass-soft ----
  [/#fef3c7\b/gi, '#f4ead3'],
  [/#854d0e\b/gi, '#846630'],

  // ---- Pure white surface → warm white ----
  // Только когда явно используется как background для карточек.
  // НЕ трогаем '#fff' в логике color: '#fff' (текст на тёмном) — оставляем.
  [/background:\s*"#fff"/g, 'background: "#fffdf7"'],
  [/background:\s*"#ffffff"/gi, 'background: "#fffdf7"'],
  [/background:\s*'#fff'/g, "background: '#fffdf7'"],
  [/background:\s*'#ffffff'/gi, "background: '#fffdf7'"],

  // ---- Fonts in JSX (если где-то ссылаются по имени) ----
  [/'Source Serif 4'/g, "'Spectral'"],
  [/"Source Serif 4"/g, '"Spectral"'],
  [/\bInter\b(?!\.)/g, 'Golos Text'],
];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === 'android' || name === '.vite') continue;
      walk(p);
    } else if (['.jsx', '.js', '.tsx', '.ts', '.css', '.html'].includes(extname(name))) {
      processFile(p);
    }
  }
}

let changedFiles = 0;
let totalReplacements = 0;

function processFile(p) {
  const src = readFileSync(p, 'utf8');
  let out = src;
  let fileReplacements = 0;
  for (const [re, to] of replacements) {
    const before = out;
    out = out.replace(re, to);
    if (out !== before) {
      // count substring diffs roughly by re-matching the original
      const matches = before.match(re);
      fileReplacements += matches ? matches.length : 0;
    }
  }
  if (out !== src) {
    writeFileSync(p, out);
    changedFiles++;
    totalReplacements += fileReplacements;
    console.log(`  ${p.replace(process.cwd() + '\\', '').replace(process.cwd() + '/', '')} — ${fileReplacements} replacements`);
  }
}

console.log('Modern Ledger rebrand pass\n');
walk('src');
console.log(`\nDone. ${changedFiles} files changed, ${totalReplacements} replacements.`);
