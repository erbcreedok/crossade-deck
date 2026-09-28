// ЗАКАЗ СПРАЙТА — agy рисует часть скина по брифу (и, если дано, по фото), скрипт проверяет формат и собирает лист.
//
//   node scripts/sprite.mjs --id pirate --slot head --look 3d [--like pirate] [--photo ~/face.jpg] [--keep "#c98a4b"] "бриф словами"
//
//   --id     папка скина (латиница, цифры, дефис): design/persona/skins/<id>/
//   --slot   head | hair (шапка, причёска) | body | legs — одна часть за запуск; набор целиком — несколько запусков
//   --look   2d — плоская, как карта (2 стороны: лицо и спина) | 3d — как в Doom (6 сторон: +правый бок, верх, низ)
//   --sides  1 | 2 | 4 | 6 — вместо --look, если нужно точно (4 — лицо, спина, правый бок)
//   --like   папка готовой части: та же фигура — черты, цвета, детали (голова понравилась → по ней тело и ноги)
//   --photo  картинка-референс (лицо и т.п.): agy смотрит на неё, в репо она не попадает
//   --keep   свои цвета, которые не перекрашиваются палитрой (шерсть, кожа), через запятую
//
// Что делает: пишет задание (формат — как у колоды, крестоносца и ботов), запускает agy без терминала, проверяет
// каждую сторону (есть ли, viewBox, цвета, без <text>/<image>/градиентов), при ошибках — ещё один круг с их списком.
// В конце — лист `<id>-sheet.png` (все стороны в трёх расцветках) рядом с логом. В каталог (`skins.ts`) не пишет:
// это решение — после того, как лист посмотрели.

import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { basename, extname, join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { createRequire } from "node:module";

const ROOT = resolve(import.meta.dirname, "../..");
const SKINS = join(ROOT, "design/persona/skins");
const AGY = join(homedir(), ".local/bin/agy");
const RECOLOR = ["#b3221f", "#1d4f80", "#f2c14e"];
const NEUTRAL = ["#0b0704", "#f7f1e6", "#5d666e", "#ffffff", "#000000"];
const VIEWS = { 1: ["front"], 2: ["front", "back"], 4: ["front", "back", "right"], 6: ["front", "back", "right", "top", "bottom"] };
const BOX = { head: "0 0 100 100", hair: "0 0 100 100", body: "0 0 120 100", legs: "0 0 120 100" };
const LOOK = { "2d": "2", "3d": "6" };
const PALETTES = [["#b3221f", "#1d4f80", "#f2c14e"], ["#2f7d4f", "#173a2c", "#e7c766"], ["#3f8fbf", "#1b3550", "#dfe9f2"]];

function args(argv) {
  const out = { brief: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) out[a.slice(2)] = argv[++i];
    else out.brief.push(a);
  }
  return out;
}

/** Задание agy: бриф, стороны, формат. */
export function taskFor({ id, slot, views, brief, photo, keep, like }) {
  const mirror = views.includes("right") ? " Левый бок НЕ рисуй — его получают зеркалом правого." : "";
  const tb = views.includes("top") ? "\ntop — вид строго сверху (верх картинки = затылок/спина, низ = лицо/грудь); bottom — строго снизу (верх картинки = лицо/грудь)." : "";
  const shape = {
    head: `голова — viewBox="${BOX.head}", предмет по центру, заполняет ~80%; ставится на ворот туловища`,
    body: `туловище с плечами, без головы — viewBox="${BOX.body}", линия плеч у верха (~y=18), низ обрезан по y=100 (ниже — стол)`,
    legs: `ноги стоящего от пояса до пола — viewBox="${BOX.legs}", пояс у верха, ступни у низа`,
    hair: `шапка или причёска — viewBox="${BOX.hair}", сидит на макушке головы: низ предмета — линия лба у низа картинки (~y=80), без самой головы и лица`,
  }[slot];
  return `Нарисуй часть скина для карточного стола Crossade Deck — в том же стиле и формате, что уже нарисованные тобой крестоносец и боты (design/persona/skins/crusader/, design/persona/skins/bot/).

ЧТО: ${brief}
${like ? `\nТА ЖЕ ФИГУРА: design/persona/skins/${like}/ — уже нарисованная часть этого персонажа. Посмотри все её файлы и повтори черты, цвета, детали и толщину линий, чтобы новая часть и та сидели вместе как один персонаж.\n` : ""}${photo ? `\nРЕФЕРЕНС: посмотри картинку ${photo} — нарисуй ПО МОТИВАМ неё (узнаваемые черты: причёска, форма лица, очки, борода, цвет волос через разрешённые цвета), но в стиле колоды: плоско, контур, без фотореализма и без мелких деталей.\n` : ""}
ЧАСТЬ: ${shape}.
Папка: design/persona/skins/${id}/ (уже создана). Файлы: ${views.map((v) => `${v}-${slot}.svg`).join(", ")}.

СТОРОНЫ: front — лицом к зрителю${views.includes("back") ? "; back — со спины" : ""}${views.includes("right") ? "; right — правый профиль" : ""}.${mirror}${tb}
Все стороны — один и тот же предмет, те же пропорции и детали, узнаваемо с любой стороны.

ФОРМАТ
- Чистый SVG, без растра, без <text>, без <image>, без внешних ссылок, без фильтров и градиентов.
- Обводка ровно #0b0704, толщина 2.5–3, stroke-linejoin="round".
- ЦВЕТ — через три перекрашиваемых цвета (их подменяет расцветка игрока):
    #b3221f — основной, #1d4f80 — второй, #f2c14e — акцент.
  Нейтральные: белый #f7f1e6, металл #5d666e, тёмный #0b0704.${keep.length ? `\n  Свои, не перекрашиваются: ${keep.join(", ")}.` : ""}
  Других цветов не вводи.
- Стиль — как карты колоды: плоская заливка, толстый контур, читается в 40 px.

НЕ запускай никаких команд терминала (ни cp, ни ls, ни mkdir) — только создавай и правь файлы инструментом записи файлов. Больше ничего в репо не трогай, не коммить.`;
}

/** Проверка формата: список бед по файлам; пусто — годно. */
export function problemsOf(files, { slot, views, keep }) {
  const allowed = new Set([...RECOLOR, ...NEUTRAL, ...keep].map((c) => c.toLowerCase()));
  const out = [];
  for (const view of views) {
    const name = `${view}-${slot}.svg`, svg = files[name];
    if (svg === undefined) { out.push(`${name}: нет файла`); continue; }
    if (!/<svg\b/.test(svg)) out.push(`${name}: это не SVG`);
    const box = svg.match(/viewBox="([^"]+)"/)?.[1]?.trim().replace(/\s+/g, " ");
    if (box !== BOX[slot]) out.push(`${name}: viewBox "${box ?? "нет"}", нужен "${BOX[slot]}"`);
    for (const bad of ["<text", "<image", "Gradient", "<filter", "href=\"http"]) if (svg.includes(bad)) out.push(`${name}: нельзя ${bad}`);
    const colors = [...new Set((svg.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((c) => c.toLowerCase()))].filter((c) => !allowed.has(c));
    if (colors.length) out.push(`${name}: лишние цвета ${colors.join(", ")} — замени на разрешённые`);
    if (!svg.toLowerCase().includes("#b3221f") && !svg.toLowerCase().includes("#1d4f80")) out.push(`${name}: нет ни одного перекрашиваемого цвета (#b3221f, #1d4f80) — у игрока не сработает расцветка`);
  }
  return out;
}

const run = (prompt, extra, log) => new Promise((done) => {
  const child = spawn(AGY, ["-p", prompt, "--mode", "accept-edits", "--print-timeout", "1800s", ...extra], { cwd: ROOT });
  let text = "";
  child.stdout.on("data", (d) => (text += d));
  child.stderr.on("data", (d) => (text += d));
  child.on("close", async (code) => { await writeFile(log, text, { flag: "a" }); done({ code, text }); });
});

async function sheet(dir, id, slot, views, out) {
  const require = createRequire(join(ROOT, "server/package.json"));
  const { chromium } = require("playwright");
  const rows = await Promise.all(PALETTES.map(async (pal) => {
    const cells = await Promise.all(views.map(async (v) => {
      const svg = (await readFile(join(dir, `${v}-${slot}.svg`), "utf8")).replace(/#b3221f/gi, pal[0]).replace(/#1d4f80/gi, pal[1]).replace(/#f2c14e/gi, pal[2]);
      return `<div style="text-align:center"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" style="width:140px;height:120px;object-fit:contain;background:#2a1e14;border-radius:8px"><br>${v}</div>`;
    }));
    return `<div style="display:flex;gap:8px;margin:6px 0">${cells.join("")}</div>`;
  }));
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 40 + views.length * 148, height: 60 + PALETTES.length * 150 } });
  await p.setContent(`<body style="margin:12px;background:#1a120c;color:#eee;font:12px sans-serif"><b>${id} · ${slot}</b>${rows.join("")}</body>`);
  await p.waitForTimeout(300);
  await p.screenshot({ path: out });
  await b.close();
}

async function main() {
  const a = args(process.argv.slice(2));
  const id = a.id, slot = a.slot ?? "head", views = VIEWS[a.sides ?? LOOK[a.look ?? "3d"]], brief = a.brief.join(" ").trim(), like = a.like;
  const keep = (a.keep ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  if (!/^[a-z0-9-]+$/.test(id ?? "") || !BOX[slot] || !views || !brief || (like !== undefined && !existsSync(join(SKINS, like)))) {
    console.error('usage: node scripts/sprite.mjs --id <a-z0-9-> --slot head|hair|body|legs --look 2d|3d [--sides 1|2|4|6] [--like <папка>] [--photo file] [--keep "#hex,..."] "бриф"');
    process.exit(2);
  }
  const dir = join(SKINS, id);
  await mkdir(dir, { recursive: true });
  const work = join(tmpdir(), `sprite-${id}-${Date.now()}`);
  await mkdir(work, { recursive: true });
  const log = join(work, "agy.log");
  // Фото — рядом с заданием, вне репо: agy видит его через --add-dir, в git оно не попадает.
  let photo = null;
  if (a.photo) {
    photo = join(work, `ref${extname(a.photo) || ".jpg"}`);
    await copyFile(resolve(a.photo.replace(/^~/, homedir())), photo);
  }
  const extra = photo ? ["--add-dir", work] : [];
  const read = async () => Object.fromEntries(await Promise.all((await readdir(dir)).filter((f) => f.endsWith(".svg")).map(async (f) => [f, await readFile(join(dir, f), "utf8")])));
  console.log(`agy рисует ${id} (${slot}, ${views.length} стор.) — лог ${log}`);
  await run(taskFor({ id, slot, views, brief, photo, keep, like }), extra, log);
  let problems = problemsOf(await read(), { slot, views, keep });
  for (let round = 1; problems.length && round <= 2; round += 1) {
    console.log(`круг ${round + 1}: поправить —\n  ${problems.join("\n  ")}`);
    await run(`Проверка формата нашла ошибки в design/persona/skins/${id}/. Исправь ТОЛЬКО их, те же правила формата:\n- ${problems.join("\n- ")}\nНЕ запускай команд терминала.`, ["-c", ...extra], log);
    problems = problemsOf(await read(), { slot, views, keep });
  }
  if (problems.length) {
    console.log(`НЕ ГОДНО:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  const out = join(work, `${id}-sheet.png`);
  await sheet(dir, id, slot, views, out);
  console.log(`ГОДНО: ${views.map((v) => `${v}-${slot}.svg`).join(", ")}\nлист: ${out}`);
}

if (basename(process.argv[1] ?? "") === "sprite.mjs") await main();
