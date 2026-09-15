// ЖЕСТЫ СТОЛА ПАЛЬЦАМИ — настоящие касания (CDP), а не мышь: камера, наклон и то, что страница
// не едет под пальцем (свайп вниз в Mini App закрывает окно).
//   node scripts/tableGestures.mjs [base]      сервер с TABLE_GUESTS=1 уже поднят
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2590";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("ERROR", e.message));
await page.goto(`${base}/table/?stand`);
await page.waitForSelector("[data-section]");
const cdp = await ctx.newCDPSession(page);

const touch = (type, points) =>
  cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
async function gesture(from, to, steps = 12) {
  await touch("touchStart", from);
  for (let i = 1; i <= steps; i += 1) {
    await touch("touchMove", from.map(([x, y], k) => [x + ((to[k][0] - x) * i) / steps, y + ((to[k][1] - y) * i) / steps]));
  }
  await touch("touchEnd", []);
  await page.waitForTimeout(700); // бросок докатывается
}
const view = async () => (await page.getAttribute("canvas", "data-view")).split(",").map(Number);
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

await gesture([[140, 470], [250, 470]], [[140, 360], [250, 360]], 16);
const tilted = await view();
check("два пальца вверх вместе — стол наклоняется", tilted[4] > 10, tilted);

await gesture([[170, 400], [220, 400]], [[110, 400], [280, 400]], 16);
const zoomed = await view();
check("щипок — зум", zoomed[2] > tilted[2] * 1.3, zoomed);

// Пан — у приближенного стола: целиком влезший в кадр камера кита листать не даёт, некуда.
await gesture([[120, 430]], [[220, 500]]);
const panned = await view();
check("один палец по пустому сукну ведёт приближенный стол", Math.hypot(panned[0] - zoomed[0], panned[1] - zoomed[1]) > 0.5, panned);

// Страница не едет: отменённый touchmove и нулевая прокрутка.
const prevented = await page.evaluate(() => {
  const t = new Touch({ identifier: 9, target: document.body, clientX: 10, clientY: 10 });
  const e = new TouchEvent("touchmove", { touches: [t], cancelable: true, bubbles: true });
  document.body.dispatchEvent(e);
  return e.defaultPrevented && scrollY === 0 && document.scrollingElement.scrollTop === 0;
});
check("touchmove страницы отменён, прокрутки нет", prevented, prevented);

// КАРТА ИЗ РУКИ ТЯНЕТСЯ ПАЛЬЦЕМ — и каждый touchmove отменён, даже когда рука под пальцем перерисована и
// карта оторвана от документа (иначе Mini App уезжает вниз). Счётчик сидит на самом элементе касания.
await page.evaluate(() => {
  window.__moves = { all: 0, kept: 0 };
  // Слушатель — на самой карте, которая сейчас оторвётся: до документа её касания не дойдут.
  document.querySelector("[data-card]").addEventListener("touchmove", (m) => {
    window.__moves.all += 1;
    if (m.defaultPrevented) window.__moves.kept += 1;
  });
});
{
  const hand = await page.locator("[data-card]").first().boundingBox();
  await gesture([[hand.x + hand.width / 2, hand.y + hand.height / 2]], [[hand.x + hand.width / 2, hand.y - 200]], 10);
}
const moves = await page.evaluate(() => window.__moves);
check("карта из руки: страница не тянется — все touchmove отменены, и у оторванной карты тоже", moves.all > 0 && moves.all === moves.kept, moves);

// Карта из руки на наклонённый стол: палец на карту — камера стоит, карта едет.
const cam = await view();
const card = await page.locator("[data-card]").first().boundingBox();
await gesture([[card.x + card.width / 2, card.y + card.height / 2]], [[195, 300]], 14);
const after = await view();
const onFelt = await page.evaluate(() => document.querySelectorAll("[data-card]").length);
check("карта из руки на сукно — камера не сдвинулась", after.join() === cam.join(), after);
check("в руке стало на одну меньше", onFelt === 5, onFelt);

await page.screenshot({ path: process.argv[3] ?? "gestures.png" });
await browser.close();
for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
if (checks.some((c) => !c.ok)) process.exitCode = 1;
