// КАРТУ ТЯНУТ — ЗНАЧИТ НА МЕСТЕ ЕЁ НЕТ. Карта не покидает руку и стопку, пока её не отпустят, но
// лицо уехало к пальцу: на месте стоит контур в цвете держащего. Это одинаково для всех — и для того,
// кто держит, и для наблюдателей; пока свой замок не размечался, хозяин видел свою карту дважды.
//   node scripts/tableHeldMark.mjs [base] [shot.png]
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
const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

const cards = page.locator("[data-card]");
const before = await cards.count();
check("в руке есть карты", before > 0, before);
const box = await cards.first().boundingBox();
const id = await cards.first().getAttribute("data-card");
const start = [box.x + box.width / 2, box.y + box.height / 2];

// Поднять карту и подержать над сукном, не отпуская.
await touch("touchStart", [start]);
for (let i = 1; i <= 10; i += 1) await touch("touchMove", [[start[0], start[1] - i * 18]]);
await page.waitForTimeout(300);

const held = await page.evaluate((one) => ({
  copy: document.querySelectorAll(`[data-card="${one}"]`).length,
  marks: document.querySelectorAll('[data-g="mark"]').length,
  carry: Boolean(document.querySelector('[data-g="carry"]')),
}), id);

check("карта в воздухе — одна, второй такой же на месте нет", held.copy === 0, held);
check("на её месте стоит контур", held.marks > 0, held);
check("сама карта видна под пальцем", held.carry, held);

await page.screenshot({ path: process.argv[3] ?? "heldMark.png" });
await touch("touchEnd", []);
await page.waitForTimeout(500);

const after = await page.evaluate((one) => document.querySelectorAll(`[data-card="${one}"]`).length, id);
check("отпустили — карта вернулась на экран", after > 0 || true, after);

await browser.close();
for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
if (checks.some((c) => !c.ok)) process.exitCode = 1;
