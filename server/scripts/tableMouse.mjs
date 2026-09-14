// КАМЕРА МЫШЬЮ НА ДЕСКТОПЕ — как в 2ГИС: обычный захват ведёт стол, Ctrl/Cmd или правая кнопка —
// поворот (влево-вправо) и наклон (вверх-вниз) от точки захвата; отпустил Ctrl — стол сразу едет.
//   node scripts/tableMouse.mjs [base]      сервер с TABLE_GUESTS=1 уже поднят
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2590";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("ERROR", e.message));
await page.goto(`${base}/table/?stand`);
await page.waitForSelector("[data-bar]");
await page.waitForTimeout(300);

const view = async () => (await page.getAttribute("canvas", "data-view")).split(",").map(Number);
const deck = async () => JSON.parse(await page.getAttribute("canvas", "data-spots")).middle;
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
async function drag(from, to, { button = "left", key, releaseAt } = {}) {
  if (key) await page.keyboard.down(key);
  await page.mouse.move(...from);
  await page.mouse.down({ button });
  for (let i = 1; i <= 12; i += 1) {
    if (key && releaseAt === i) await page.keyboard.up(key);
    await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 12, from[1] + ((to[1] - from[1]) * i) / 12);
  }
  await page.mouse.up({ button });
  if (key && !releaseAt) await page.keyboard.up(key);
  await page.waitForTimeout(150);
}
const menu = page.evaluate(() => new Promise((r) => { addEventListener("contextmenu", (e) => r(e.defaultPrevented), { once: true }); }));

// Ctrl-захват прямо с колоды: карта не берётся, стол поворачивается и наклоняется.
const v0 = await view();
const m = await deck();
await drag([m.x, m.y], [m.x + 100, m.y - 60], { key: "Control" });
const v1 = await view();
check("Ctrl + мышь вправо — стол повернулся", Math.abs(v1[3] - v0[3] - 30) < 1, [v0, v1]);
check("Ctrl + мышь вверх — стол наклонился", v1[4] > v0[4] + 5, [v0, v1]);
check("Ctrl-захват с колоды не взял карту", (await page.locator("[data-mark]").count()) === 0 && Math.abs(v1[3] - v0[3]) > 1, v1);

await drag([m.x + 40, m.y + 40], [m.x - 20, m.y + 100], { key: "Meta" });
const v2 = await view();
check("Cmd — тоже поворот и наклон назад", v2[3] < v1[3] - 10 && v2[4] < v1[4], [v1, v2]);

await drag([m.x + 40, m.y + 40], [m.x + 100, m.y + 40], { button: "right" });
const v3 = await view();
check("правая кнопка — поворот", Math.abs(v3[3] - v2[3] - 18) < 1, [v2, v3]);
check("меню браузера по правой кнопке не открылось", await menu, false);

// Приблизить, чтобы стол было куда вести, затем отпустить Ctrl посреди жеста.
// Колесо камере стола не отдано, поэтому приближаем щипком — стол у края кадра иначе вести некуда.
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
await touch("touchStart", [[m.x - 30, m.y + 40], [m.x + 30, m.y + 40]]);
for (let i = 1; i <= 16; i += 1) await touch("touchMove", [[m.x - 30 - i * 6, m.y + 40], [m.x + 30 + i * 6, m.y + 40]]);
await touch("touchEnd", []);
await page.waitForTimeout(700);
const v4 = await view();
await drag([m.x + 40, m.y + 40], [m.x - 80, m.y + 40], { key: "Control", releaseAt: 4 });
const v5 = await view();
const turned = Math.abs(v5[3] - v4[3]);
check("отпустил Ctrl — поворот встал, дальше стол едет", Math.abs(turned - 9) < 1 && Math.hypot(v5[0] - v4[0], v5[1] - v4[1]) > 0.15, [v4, v5]);

const v6 = await view();
await drag([m.x + 40, m.y + 40], [m.x - 40, m.y + 100]);
const v7 = await view();
check("обычный захват — только ведёт, без поворота и наклона", v7[3] === v6[3] && v7[4] === v6[4] && Math.hypot(v7[0] - v6[0], v7[1] - v6[1]) > 0.3, [v6, v7]);

await page.screenshot({ path: process.argv[3] ?? "mouse.png" });
await browser.close();
for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
if (checks.some((c) => !c.ok)) process.exitCode = 1;
