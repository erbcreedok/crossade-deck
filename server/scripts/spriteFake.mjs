// ЗАГЛУШКА `/sprite` ДЛЯ ПРОГОНОВ — те же аргументы и тот же вывод, что у `sprite.mjs`, но вместо agy за пару секунд
// кладёт простой кружок на каждую сторону и крошечный лист. Стол берёт её вместо настоящего через TABLE_SPRITE_SCRIPT.
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const a = { brief: [] };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) if (argv[i].startsWith("--")) a[argv[i].slice(2)] = argv[++i]; else a.brief.push(argv[i]);
const views = { 1: ["front"], 2: ["front", "back"], 4: ["front", "back", "right"], 6: ["front", "back", "right", "top", "bottom"] }[a.sides ?? "2"];
const box = a.slot === "body" || a.slot === "legs" ? "0 0 120 100" : "0 0 100 100";
const dir = join(ROOT, "design/persona/skins", a.id);
await mkdir(dir, { recursive: true });
console.log(`agy рисует ${a.id} (${a.slot}, ${views.length} стор.) — лог ${join(a.work, "agy.log")}`);
await writeFile(join(a.work, "agy.log"), "заглушка: рисую…\n");
await new Promise((r) => setTimeout(r, 2500));
for (const v of views) await writeFile(join(dir, `${v}-${a.slot}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}"><circle cx="50" cy="50" r="40" fill="#b3221f" stroke="#0b0704" stroke-width="3"/><circle cx="50" cy="40" r="12" fill="#1d4f80"/></svg>`);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
await writeFile(join(a.work, `${a.id}-sheet.png`), png);
console.log(`ГОДНО: ${views.map((v) => `${v}-${a.slot}.svg`).join(", ")}\nлист: ${join(a.work, `${a.id}-sheet.png`)}`);
