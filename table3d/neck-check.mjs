// ГОЛОВА НАЗАД И ВБОК — отъезд (щипок к себе) откидывает голову от стола по радиусу, как приближение двигает её вперёд; два пальца вбок
// ведут голову по кругу вокруг стола (расстояние до середины то же); шея одна: натяг держится недолго и возвращается сам.
//   node neck-check.mjs [base]     (стенд: `npm run dev`, порт 9590)
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const cam = () => p.evaluate(() => window.__t3d.cam());
const radius = (c) => Math.hypot(c.pos[0], c.pos[2]);
await p.goto(`${base}/?stand`);
await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
await p.waitForTimeout(600);
const rest = await cam();
await p.evaluate(() => { for (let i = 0; i < 6; i++) window.__t3d.zoomBy(0.6); });
await p.waitForTimeout(200);
const back = await cam();
check("отъезд: голова откинулась назад (наклон меньше нуля)", back.lean < -0.3, { lean: back.lean });
check("назад — дальше от середины стола и выше, чем в покое", radius(back) > radius(rest) + 1 && back.pos[1] > rest.pos[1], { rest: [radius(rest), rest.pos[1]], back: [radius(back), back.pos[1]] });
await p.evaluate(() => window.__t3d.sideBy(0.5));
await p.waitForTimeout(200);
const side = await cam();
check("вбок: голова пошла по кругу — та же дальность от середины, другое место", Math.abs(radius(side) - radius(back)) < 0.05 && Math.hypot(side.pos[0] - back.pos[0], side.pos[2] - back.pos[2]) > 1, { back: back.pos, side: side.pos });
await p.waitForTimeout(5800);
const later = await cam();
check("шея одна: натяг вернулся сам (и вперёд, и назад, и вбок)", Math.abs(later.lean) <= 0.06 && Math.abs(later.side) <= 0.06, { lean: later.lean, side: later.side });
await p.evaluate(() => window.__t3d.zoomBy(1.8));
await p.waitForTimeout(200);
const fwd = await cam();
check("приближение по-прежнему тянет голову вперёд", fwd.lean > 0 || (later.neck && later.neck.back > 0), { lean: fwd.lean, rest: later.neck });
// ДВОЙНОЙ ТАП ПО СТОЛУ: голова едет в ту сторону (ближе к точке), смотрит туда; потом шея сама возвращает.
await p.waitForTimeout(4200);
const before = await cam();
const tapAt = { x: 300, y: 330 };
const felt = await p.evaluate((pt) => window.__t3d.feltAt?.(pt.x, pt.y) ?? null, tapAt);
await p.mouse.click(tapAt.x, tapAt.y); await p.waitForTimeout(90); await p.mouse.click(tapAt.x, tapAt.y);
await p.waitForTimeout(900);
const zoomed = await cam();
const distTo = (c) => felt ? Math.hypot(c.pos[0] - felt.x, c.pos[2] - felt.y) : NaN;
check("двойной тап по столу: голова ближе к тому месту", felt && distTo(zoomed) < distTo(before) - 0.8, { felt, before: distTo(before), after: distTo(zoomed), lean: zoomed.lean, side: zoomed.side });
await p.waitForTimeout(5800);
const back2 = await cam();
check("и шея вернула голову сама, как после обычного натяга", Math.abs(back2.lean) <= 0.06 && Math.abs(back2.side) <= 0.06, { lean: back2.lean, side: back2.side });
// ПОСАДКА — стул едет вместе с телом: отодвинули — камера дальше от стола и остаётся (шея не возвращает); ближе, чем сидишь, нельзя.
await p.waitForTimeout(5500);
const r0 = radius(await cam());
await p.evaluate(() => window.__t3d.seatBy(-1));
await p.waitForTimeout(3500);
const far = await cam();
check("посадка дальше — камера дальше от середины и остаётся (шея не возвращает)", radius(far) > r0 + 0.5 && far.neck.back === 0, { r0, r: radius(far) });
await p.evaluate(() => window.__t3d.seatBy(3));
await p.waitForTimeout(300);
check("ближе, чем сидишь, не придвинуться", Math.abs(radius(await cam()) - r0) < 0.05, { r0, r: radius(await cam()) });
const chairNow = await p.evaluate(() => { const c = window.__t3d.state().chairs.find((x) => x.owner === window.__t3d.me()); return { at: window.__t3d.chairAt(c.id) }; });
await p.evaluate(() => window.__t3d.seatBy(-2));
await p.waitForTimeout(300);
const chairFar = await p.evaluate(() => { const c = window.__t3d.state().chairs.find((x) => x.owner === window.__t3d.me()); return window.__t3d.chairAt(c.id); });
check("стул едет с телом: отодвинулись — стул дальше от стола", Math.hypot(chairFar[0], chairFar[2]) > Math.hypot(chairNow.at[0], chairNow.at[2]) + 1, { chairNow, chairFar });
await p.evaluate(() => window.__t3d.seatBy(3));
// ЖЕСТ ПОСАДКИ: вниз по экрану — ближе к столу, вверх — дальше (правая кнопка мыши — тот же жест, что два пальца).
{
  await p.evaluate(() => window.__t3d.seatBy(-1.5));
  await p.waitForTimeout(200);
  const rb = radius(await cam());
  await p.mouse.move(195, 400); await p.mouse.down({ button: "right" }); await p.mouse.move(195, 470, { steps: 6 }); await p.mouse.up({ button: "right" });
  const down = radius(await cam());
  check("вниз по экрану — посадка ближе к столу", down < rb - 0.3, { rb, down });
  await p.mouse.move(195, 470); await p.mouse.down({ button: "right" }); await p.mouse.move(195, 380, { steps: 6 }); await p.mouse.up({ button: "right" });
  const up = radius(await cam());
  check("вверх по экрану — посадка дальше от стола", up > down + 0.3, { down, up });
}
// ЩИПОК ДВУМЯ ПАЛЬЦАМИ работает как зум шеей, а два пальца вверх-вниз посадку не двигают (она — правой кнопкой и Shift+колесом).
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const t = await ctx.newPage();
  await t.goto(`${base}/?stand`);
  await t.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await t.waitForTimeout(800);
  const cdp = await ctx.newCDPSession(t);
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const lean = () => t.evaluate(() => window.__t3d.cam().lean);
  await touch("touchStart", [[150, 300], [240, 300]]);
  for (let i = 1; i <= 10; i++) await touch("touchMove", [[150 - i * 6, 300], [240 + i * 6, 300]]);
  await touch("touchEnd", []);
  const spread = await lean();
  check("щипок врозь двумя пальцами — голова вперёд (зум работает)", spread > 0.2, spread);
  await touch("touchStart", [[170, 300], [220, 300]]);
  for (let i = 1; i <= 10; i++) await touch("touchMove", [[170, 300 + i * 8], [220, 300 + i * 8]]);
  await touch("touchEnd", []);
  check("два пальца вниз вместе — посадка не двигается", (await t.evaluate(() => window.__t3d.seatNow())) === 0, await t.evaluate(() => window.__t3d.seatNow()));
  await ctx.close();
}
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
