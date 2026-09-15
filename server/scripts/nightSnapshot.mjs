// СНИМОК НОЧНОЙ СБОРКИ — кладёт клиент стола на момент тега `night/b<номер>` в `server/data/builds/<номер>/`.
// Оттуда его собирает `/table/app.js?build=<номер>`: утром можно щёлкать между сборками, не трогая живое дерево.
//   node scripts/nightSnapshot.mjs <номер> [ref]
import { execFileSync } from "child_process";
import { mkdirSync, rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const build = process.argv[2];
if (!/^[0-9]{1,9}$/.test(build ?? "")) {
  console.error("нужен номер сборки: node scripts/nightSnapshot.mjs <номер> [ref]");
  process.exit(1);
}
const ref = process.argv[3] ?? `night/b${build}`;
const server = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(server, "data", "builds", build);
// Всё, что клиент тянет на себя: свой каталог, контракт стола и общие библиотеки вида.
const PATHS = ["server/table-client", "server/src", "game-kit/src", "look/src", "apps/hub/src"];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
execFileSync("git", ["archive", "--format=tar", ref, ...PATHS, "-o", join(out, "snap.tar")], { cwd: join(server, "..") });
execFileSync("tar", ["-xf", join(out, "snap.tar"), "-C", out]);
rmSync(join(out, "snap.tar"));
console.log(`сборка ${build} снята из ${ref} → data/builds/${build}`);
