// КАМЕРА СВЕРХУ: палец/левая кнопка двигает камеру по столу (точка под пальцем остаётся под ним), правая кнопка и Ctrl/Cmd+левая поворачивают,
// двумя пальцами — масштаб, поворот и движение. Быстрый: без долгих ожиданий.   node top-cam-check.mjs [base]
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch();
const errors = [], checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const p = await ctx.newPage();
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`${base}/?stand&cam=top`);
await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
await p.evaluate(() => window.__t3d.setCamLocked?.(false));
const id = await p.evaluate(() => { const c = window.__t3d.state().chairs.find((q) => q.owner === "me").hand.at(0); window.__t3d.dropFeltAt(c.id, -2, 0); return c.id; });
const at = async () => { let a = await p.evaluate((i) => window.__t3d.screenOf(i), id); for (let k = 0; k < 30; k++) { await p.waitForTimeout(60); const b = await p.evaluate((i) => window.__t3d.screenOf(i), id); if (Math.hypot(a.x - b.x, a.y - b.y) < 0.2) return b; a = b; } return a; };
const c0 = await at();
// 1. Левая кнопка по пустому месту: карта уезжает за пальцем.
await p.mouse.move(300, 700); await p.mouse.down(); await p.mouse.move(340, 640, { steps: 6 }); await p.mouse.up();
const c1 = await at(), pan1 = await p.evaluate(() => window.__t3d.panInfo());
check("левая кнопка двигает камеру: карта сместилась вслед за пальцем", Math.abs((c1.x - c0.x) - 40) < 6 && Math.abs((c1.y - c0.y) + 60) < 6, { c0, c1 });
check("камера сдвинулась по столу", Math.hypot(pan1.x, pan1.z) > 0.2, pan1);
// 2. Правая кнопка и Ctrl+левая: поворот, без сдвига.
await p.mouse.move(300, 700); await p.mouse.down({ button: "right" }); await p.mouse.move(380, 700, { steps: 6 }); await p.mouse.up({ button: "right" });
const c2 = await at(), pan2 = await p.evaluate(() => window.__t3d.panInfo());
check("правая кнопка поворачивает (карта обошла центр), камера не ездит", Math.hypot(c2.x - c1.x, c2.y - c1.y) > 15 && Math.hypot(pan2.x - pan1.x, pan2.z - pan1.z) < 1e-6, { c1, c2, pan1, pan2 });
await p.keyboard.down("Control"); await p.mouse.move(300, 700); await p.mouse.down(); await p.mouse.move(380, 700, { steps: 6 }); await p.mouse.up(); await p.keyboard.up("Control");
const c3 = await at(), pan3 = await p.evaluate(() => window.__t3d.panInfo());
check("Ctrl+левая поворачивает, камера не ездит", Math.hypot(c3.x - c2.x, c3.y - c2.y) > 15 && Math.hypot(pan3.x - pan2.x, pan3.z - pan2.z) < 1e-6, { c2, c3 });
// 3. Два пальца: поворот пальцев — поворот камеры (по часовой — стол по часовой), расхождение — масштаб.
const cdp = await ctx.newCDPSession(p);
const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
const cy = 600, cx = 195, r = 70;
const deg = (a) => [[cx + r * Math.cos(a), cy + r * Math.sin(a)], [cx - r * Math.cos(a), cy - r * Math.sin(a)]];
const before = await at();
await touch("touchStart", deg(0));
for (let k = 1; k <= 10; k++) await touch("touchMove", deg((k * 6 * Math.PI) / 180));
await touch("touchEnd", []);
const after = await at();
const ang = (c) => Math.atan2(c.y - 422, c.x - 195);
const turned = ((((ang(after) - ang(before)) * 180) / Math.PI + 540) % 360) - 180;
check("двумя пальцами поворот на ~60° по часовой — стол повернулся по часовой", turned > 30 && turned < 90, { turned });
// 4. Несу карту и держу палец у правого края: камера едет вправо, карта остаётся под пальцем; у низа камера стоит (там рука).
{
  const pan0 = await p.evaluate(() => window.__t3d.panInfo()), me = await at();
  await p.mouse.move(me.x, me.y); await p.mouse.down(); await p.mouse.move(me.x + 20, me.y - 10, { steps: 3 });
  await p.mouse.move(386, me.y, { steps: 6 }); await p.waitForTimeout(500);
  const pan1 = await p.evaluate(() => window.__t3d.panInfo()), under = await p.evaluate((i) => window.__t3d.screenOf(i), id);
  check("палец с картой у правого края — камера едет", Math.hypot(pan1.x - pan0.x, pan1.z - pan0.z) > 0.5, { pan0, pan1 });
  check("карта осталась под пальцем", Math.hypot(under.x - 386, under.y - me.y) < 40, { under });
  await p.mouse.move(195, 838, { steps: 4 }); const pb = await p.evaluate(() => window.__t3d.panInfo()); await p.waitForTimeout(400);
  const pc = await p.evaluate(() => window.__t3d.panInfo());
  check("у самой кромки низа камера едет вниз", pc.z - pb.z > 0.3, { pb, pc });
  await p.mouse.move(195, 760, { steps: 3 }); const pd = await p.evaluate(() => window.__t3d.panInfo()); await p.waitForTimeout(300);
  const pe = await p.evaluate(() => window.__t3d.panInfo());
  check("чуть выше кромки (над рукой) камера стоит", Math.hypot(pe.x - pd.x, pe.z - pd.z) < 0.05, { pd, pe });
  await p.mouse.up();
}
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const k of checks) console.log(k.ok ? "ok  " : "FAIL", k.name, k.ok ? "" : JSON.stringify(k.got));
process.exit(checks.every((k) => k.ok) ? 0 : 1);
