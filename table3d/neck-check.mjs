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
// ПОСАДКА — два пальца вверх-вниз двигают стул к столу и от него, и это не шея: само не возвращается.
const r0 = radius(await cam());
await p.evaluate(() => window.__t3d.seatBy(1));
await p.waitForTimeout(3500);
const near = await cam();
check("посадка ближе — камера ближе к середине и остаётся (шея не возвращает)", radius(near) < r0 - 0.5 && near.neck.back === 0, { r0, r: radius(near) });
await p.evaluate(() => window.__t3d.seatBy(-2));
await p.waitForTimeout(300);
check("посадка дальше — камера дальше от середины", radius(await cam()) > radius(near) + 1, radius(await cam()));
await p.evaluate(() => window.__t3d.seatBy(1));
// ЗОНЫ И ЗАПАС: слабый натяг держится дольше сильного; красная падает ступенькой в жёлтую; по простою голова плавно едет на плечи.
const sim = await p.evaluate(async () => {
  const { holdOf, neckNew, neckStep, STRAIN } = await import("/src/camera.ts");
  const hold = [0.04, 0.1, 0.4, 0.7, 1].map(holdOf);
  const run = (m0, idle, secs) => { const n = neckNew(); let m = m0, first = null, after = null; for (let t = 0; t < secs * 1000; t += 16) { const was = m; m = neckStep(n, m, 16, idle); if (first === null && n.back > 0) first = t; if (first !== null && n.back === 0 && after === null) after = m; if (n.back > 0 && m > STRAIN.yellow) { /* оттягивают */ } } return { first, after, end: m }; };
  const pull = (m0, m1) => { const n = neckNew(); n.back = 1; n.to = 0; let m = m0, t = 0; while (m > m1) { m = neckStep(n, m, 16, false); t += 16; } return (m0 - m1) / (t / 1000); };
  return { pull: { red: pull(1, 0.8), yellow: pull(0.4, 0.2), near: pull(0.15, 0.1) }, hold, red: run(0.95, false, 6), weak: run(0.1, false, 8), idleHalf: run(0.5, true, 2), idleLate: run(0.5, true, 6) };
});
check("возврат: чем дальше от туловища, тем быстрее (скорость, 1/с: красная > жёлтая > у самого тела)", sim.pull.red > sim.pull.yellow && sim.pull.yellow > sim.pull.near, sim.pull);
check("запас: слабее натяг — дольше можно держать (и в зелёной — бесконечно)", sim.hold[0] === null || sim.hold[0] > 1e9, sim.hold);
check("запас: 0.1 > 0.4 > 0.7 > 1 по времени", sim.hold[1] > sim.hold[2] && sim.hold[2] > sim.hold[3] && sim.hold[3] > sim.hold[4], sim.hold);
check("красная зона у предела оттягивает меньше чем за 2 с — и в жёлтую, а не в ноль", sim.red.first !== null && sim.red.first < 2000 && sim.red.after > 0.3 && sim.red.after < 0.6, sim.red);
check("слабый натяг 0.1 за 8 с не оттягивают", sim.weak.first === null, sim.weak);
check("простой: до 3 с голова стоит, потом плавно едет к плечам", sim.idleHalf.end > 0.45 && sim.idleLate.end < 0.1, { idleHalf: sim.idleHalf, idleLate: sim.idleLate });
// ЖЕСТ ПОСАДКИ: вниз по экрану — ближе к столу, вверх — дальше (правая кнопка мыши — тот же жест, что два пальца).
{
  const rb = radius(await cam());
  await p.mouse.move(195, 400); await p.mouse.down({ button: "right" }); await p.mouse.move(195, 470, { steps: 6 }); await p.mouse.up({ button: "right" });
  const down = radius(await cam());
  check("вниз по экрану — посадка ближе к столу", down < rb - 0.3, { rb, down });
  await p.mouse.move(195, 470); await p.mouse.down({ button: "right" }); await p.mouse.move(195, 380, { steps: 6 }); await p.mouse.up({ button: "right" });
  const up = radius(await cam());
  check("вверх по экрану — посадка дальше от стола", up > down + 0.3, { down, up });
}
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
