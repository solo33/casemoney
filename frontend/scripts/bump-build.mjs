import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const versionFile = fileURLToPath(new URL("../src/config/version.js", import.meta.url));
const source = await readFile(versionFile, "utf8");
const match = source.match(/export const APP_BUILD = (\d+);/);

if (!match) {
  throw new Error("Не удалось найти APP_BUILD в src/config/version.js");
}

const nextBuild = Number(match[1]) + 1;
await writeFile(
  versionFile,
  source.replace(match[0], `export const APP_BUILD = ${nextBuild};`),
  "utf8",
);

console.log(`CaseMoney: номер сборки увеличен до ${nextBuild}`);
