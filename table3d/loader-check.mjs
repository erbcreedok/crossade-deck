// ЛОАДЕР 3D: объёмный крест — та же форма, что у плоского лоадера (`CROSS_PATH`), краска та же, крутится, подпись видна, `done()` убирает.
//   node loader-check.mjs [base]     (стенд: `npm run dev`, порт 9590; стенд лоадера — `/?loader`)
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
await p.goto(`${base}/?loader=spin`);
await p.waitForSelector(".crossade-loader3d canvas");
check("подпись видна", (await p.textContent(".crossade-loader3d .said")).includes("Стол собирается"), await p.textContent(".crossade-loader3d .said"));
// Форма: вершины те же, что у плоского креста (13 точек контура), и симметрия креста сохраняется.
const shape = await p.evaluate(async () => { const m = await import("/src/loader.ts"); const CROSS_PATH = m.CROSS_PATH; const pts = m.crossPoints(); return { n: pts.length, path: (CROSS_PATH.match(/[ML]/g) ?? []).length, xs: [Math.min(...pts.map((q) => q.x)), Math.max(...pts.map((q) => q.x))], ys: [Math.min(...pts.map((q) => q.y)), Math.max(...pts.map((q) => q.y))] }; });
check("форма — те же вершины, что у плоского креста (13)", shape.n === 13 && shape.path === 13, shape);
check("крест симметричный, ширина и высота по 2", Math.abs(shape.xs[0] + 1) < 0.02 && Math.abs(shape.xs[1] - 1) < 0.02 && Math.abs(shape.ys[0] + 1) < 0.02 && Math.abs(shape.ys[1] - 1) < 0.02, shape);
// Кадры: красное есть (краска `danger`), и картинка меняется — крест крутится.
const grab = () => p.evaluate(() => { const c = document.querySelector(".crossade-loader3d canvas"); const g = document.createElement("canvas"); g.width = g.height = 66; const x = g.getContext("2d"); x.drawImage(c, 0, 0, 66, 66); const d = x.getImageData(0, 0, 66, 66).data; let red = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 120 && d[i + 1] < 90 && d[i + 2] < 90 && d[i + 3] > 200) red++; return { red, sig: Array.from(d.filter((_, i) => i % 40 === 0)).join(",") }; });
const a = await grab();
check("крест нарисован красным (краска danger)", a.red > 90, a.red);
await p.waitForTimeout(450);
const b = await grab();
check("и крутится: кадры разные", a.sig !== b.sig, null);
// Варианты листаются тапом и каждый рисует.
const names = [];
for (let i = 0; i < 3; i++) { names.push(await p.textContent(".crossade-loader3d .said")); await p.mouse.click(195, 420); await p.waitForTimeout(500); const g = await grab(); check(`вариант ${names.at(-1)}: рисует крест`, g.red > 60, g.red); }
check("три варианта: spin, flip, build", ["spin", "flip", "build"].every((v) => names.some((n) => n.includes(v))), names);
// done() убирает.
await p.evaluate(async () => { const m = await import("/src/loader.ts"); window.__l = m.loader3d(document.body, "тест"); window.__l.done(); });
await p.waitForTimeout(500);
check("done(): лишних экранов не остаётся", (await p.locator(".crossade-loader3d").count()) === 1, await p.locator(".crossade-loader3d").count());
// ДО ПЕРВОГО СКРИПТА: страница уже несёт экран загрузки — тот же цвет, подпись, размер и место, что у настоящего лоадера (без скачка).
{
  const html = await (await fetch(`${base}/`)).text();
  const mark = await p.evaluate(async () => (await import("/src/loader.ts")).loader3dMarkup("Стол собирается"));
  check("страница несёт ту же разметку, что модуль (loader3dMarkup)", html.includes(mark), mark.slice(0, 80));
  const early = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await early.route(/\/src\/main\.ts/, (r) => r.abort());
  await early.goto(`${base}/?loader`);
  await early.waitForSelector(".crossade-loader3d .slot");
  const rect = (pg, sel) => pg.evaluate((q) => { const e = document.querySelector(q), r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bg: getComputedStyle(document.querySelector(".crossade-loader3d")).backgroundColor, text: document.querySelector(".crossade-loader3d .said").textContent }; }, sel);
  const a = await rect(early, ".crossade-loader3d .slot"), aSaid = await rect(early, ".crossade-loader3d .said");
  await early.close();
  const live = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await live.goto(`${base}/?loader=spin`);
  await live.waitForSelector(".crossade-loader3d canvas");
  const b = await rect(live, ".crossade-loader3d canvas"), bSaid = await rect(live, ".crossade-loader3d .said");
  await live.close();
  check("до скрипта: подпись «Стол собирается» видна", aSaid.text.startsWith("Стол собирается"), aSaid.text);
  check("тот же цвет фона до и после", a.bg === b.bg, { a: a.bg, b: b.bg });
  check("крест на том же месте и того же размера", Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 && a.w === b.w && a.h === b.h, { a, b });
  check("подпись на той же строке и по центру (у стенда текст длиннее: «· spin»)", Math.abs(aSaid.y - bSaid.y) <= 1 && Math.abs(aSaid.x + aSaid.w / 2 - (bSaid.x + bSaid.w / 2)) <= 1, { aSaid, bSaid });
}
// ЛОАДЕР НЕ ВЕЧНЫЙ: когда стол собрался, экран загрузки уходит (стенд).
{
  const st = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await st.goto(`${base}/?stand`);
  await st.waitForFunction(() => document.querySelector("#stage canvas"));
  await st.waitForTimeout(1200);
  check("стенд: экран загрузки ушёл, когда стол собрался", (await st.locator(".crossade-loader3d").count()) === 0, await st.locator(".crossade-loader3d").count());
  await st.close();
}
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
