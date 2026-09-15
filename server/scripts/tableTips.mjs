// ОКНА ЧУЖИХ РУК И КАМЕРА — касаниями, на стенде: окна уходят от середины стола, не выходят за кадр,
// открываются по несколько и закрываются стулом или кнопкой.
//   node scripts/tableTips.mjs [base] [screenshot]
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
async function gesture(from, to, steps = 14) {
  await touch("touchStart", from);
  for (let i = 1; i <= steps; i += 1) await touch("touchMove", from.map(([x, y], k) => [x + ((to[k][0] - x) * i) / steps, y + ((to[k][1] - y) * i) / steps]));
  await touch("touchEnd", []);
  await page.waitForTimeout(700);
}
const tap = async (x, y) => {
  await touch("touchStart", [[x, y]]);
  await touch("touchEnd", []);
  await page.waitForTimeout(200);
};
const scene = async () => JSON.parse(await page.getAttribute("canvas", "data-spots"));
const tips = () =>
  page.$$eval("[data-tip]", (els) => els.map((e) => ({ key: e.dataset.tip, ...JSON.parse(JSON.stringify(e.getBoundingClientRect())) })));
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

/** Точка стула, не закрытая ни одним окном и лежащая в кадре, — куда тапать. */
function chairPoint(seat, boxes, frame) {
  for (const f of [0.35, 0.6, 0.8]) {
    for (let a = 0; a < 360; a += 30) {
      const p = { x: seat.x + Math.cos((a * Math.PI) / 180) * seat.chair * f, y: seat.y + Math.sin((a * Math.PI) / 180) * seat.chair * f };
      const inFrame = p.x > 2 && p.x < frame.w - 2 && p.y > 2 && p.y < frame.h - 2;
      const free = boxes.every((b) => p.x < b.left || p.x > b.right || p.y < b.top || p.y > b.bottom);
      if (inFrame && free) return p;
    }
  }
  return null;
}

/** Окно целиком в кадре и не накрывает середину стола. */
async function placed(label) {
  const { frame, middle, seats, k } = await scene();
  const all = await tips();
  for (const [i, t] of all.entries()) {
    for (const u of all.slice(i + 1)) {
      const cross = t.left < u.right && t.right > u.left && t.top < u.bottom && t.bottom > u.top;
      check(`${label}: окна ${t.key} и ${u.key} не друг на друге`, !cross, { t, u });
    }
    const inside = t.left >= 0 && t.top >= 0 && t.right <= frame.w + 0.5 && t.bottom <= frame.h + 0.5;
    check(`${label}: окно ${t.key} в кадре`, inside, { t, frame });
    const seat = seats.find((s) => s.key === t.key);
    // От середины — наружу: середина окна дальше от середины стола, чем сам человек, по крайней мере
    // пока человек в кадре; упёршееся в край окно проверяется только на кадр.
    const seatInFrame = seat.x > 0 && seat.x < frame.w && seat.y > 0 && seat.y < frame.h;
    if (seatInFrame) {
      const onDeck = t.left < middle.x + 0.5 * k && t.right > middle.x - 0.5 * k && t.top < middle.y + 0.7 * k && t.bottom > middle.y - 0.7 * k;
      check(`${label}: окно ${t.key} не на колоде`, !onDeck, { t, middle, k });
      check(`${label}: стул ${t.key} виден хотя бы краем`, chairPoint(seat, all, frame) !== null, { all, seat });
    }
  }
}

const s0 = await scene();
// Стулья — по id; Алия сидит, стул Тимура на стенде покинут.
const alia = s0.seats.find((s) => s.who === "Алия");
const timur = s0.seats.find((s) => s.who === undefined);
await tap(alia.x, alia.y);
await tap(timur.x, timur.y);
check("открыто сразу два окна", (await tips()).length === 2, await tips());
await placed("зум 1");

// Приблизить и повернуть — окна идут за людьми и остаются в кадре.
// Жесты — по сукну, не задевая окон: окно ловит палец само, камере он не достаётся.
const free = async () => {
  const { frame } = await scene();
  const boxes = await tips();
  for (let y = frame.h - 30; y > 30; y -= 10) {
    if (boxes.every((b) => y < b.top - 20 || y > b.bottom + 20)) return y;
  }
  return frame.h - 30;
};
let y = await free();
await gesture([[170, y], [220, y]], [[120, y], [270, y]]);
const pinched = JSON.parse(`[${await page.getAttribute("canvas", "data-view")}]`);
check("щипок мимо окон приблизил стол", pinched[2] > 1.2, pinched);
await placed("после щипка");
y = await free();
await gesture([[140, y], [250, y]], [[140, y - 90], [250, y - 90]]);
const leaned = JSON.parse(`[${await page.getAttribute("canvas", "data-view")}]`);
check("наклон мимо окон наклонил стол", leaned[4] > 5, leaned);
await placed("после наклона");

// Закрыть: одно — тапом по стулу (не по диску), другое — кнопкой.
// Вернуть взгляд домой (щипок обратно), чтобы оба стула были в кадре.
y = await free();
await gesture([[90, y], [300, y]], [[180, y], [210, y]]);
const s1 = await scene();
const a1 = s1.seats.find((s) => s.key === alia.key);
const hitA = chairPoint(a1, await tips(), s1.frame);
if (hitA) {
  await tap(hitA.x, hitA.y);
  check("тап по стулу закрывает его окно", !(await tips()).some((t) => t.key === alia.key), await tips());
} else check("стул Алии достижим для тапа", false, a1);
const shut = await page.locator(`[data-shut="${timur.key}"]`).boundingBox();
await tap(shut.x + shut.width / 2, shut.y + shut.height / 2);
check("кнопка «Закрыть» закрывает окно", !(await tips()).some((t) => t.key === timur.key), await tips());

// Тап по стулу открывает обратно.
const s2 = await scene();
const a2 = s2.seats.find((s) => s.key === alia.key);
const hitA2 = chairPoint(a2, await tips(), s2.frame);
if (hitA2) await tap(hitA2.x, hitA2.y);
else console.log("нет точки стула:", JSON.stringify({ a2, tips: await tips(), view: await page.getAttribute("canvas", "data-view") }));
check("тап по стулу открывает окно", (await tips()).some((t) => t.key === alia.key), await tips());

await page.screenshot({ path: process.argv[3] ?? "tips.png" });
await browser.close();
for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
if (checks.some((c) => !c.ok)) process.exitCode = 1;
