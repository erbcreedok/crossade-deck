// УДАР КАРТОЙ ОБ СТОЛ: несомая карта падает сразу и жёстко под себя, камера вздрагивает. Мышь: левая держит, правая — удар; пробел; телефон: второй палец — двойной тап.
//   node slam-check.mjs [base]
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch();
const errors = [], checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const open = async (touch, cam = "head") => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: !!touch });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${base}/?stand&cam=${cam}`);
  await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await p.waitForTimeout(500);
  const id = await p.evaluate(() => { const c = window.__t3d.state().chairs.find((q) => q.owner === "me").hand.at(0); window.__t3d.dropFeltAt(c.id, -1.5, -1.5); return c.id; });
  let c = await p.evaluate((i) => window.__t3d.screenOf(i), id);
  for (let k = 0; k < 40; k++) { await p.waitForTimeout(100); const n = await p.evaluate((i) => window.__t3d.screenOf(i), id); const still = Math.hypot(n.x - c.x, n.y - c.y) < 0.3; c = n; if (still) break; }
  const felt = () => p.evaluate((i) => window.__t3d.state().felt.find((x) => x.id === i) ?? null, id);
  // Был ли толчок за окно наблюдения: считаем, сколько раз счётчик вырос.
  const watchShake = async (ms) => { const c0 = (await p.evaluate(() => window.__t3d.shakeInfo())).count; let seen = false; for (let t = 0; t < ms; t += 30) { await p.waitForTimeout(30); const s = await p.evaluate(() => window.__t3d.shakeInfo()); if (s.active) seen = true; } return { seen, grew: (await p.evaluate(() => window.__t3d.shakeInfo())).count - c0 }; };
  return { ctx, p, id, c, felt, watchShake };
};
const lift = async (p, c) => { await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c.x + 20, c.y - 30, { steps: 5 }); await p.waitForTimeout(300); };

for (const cam of ["head", "top"]) {
  // Мышь: правая кнопка при левой.
  {
    const { p, id, c, felt, watchShake } = await open(false, cam);
    await lift(p, c);
    const held = await p.evaluate((i) => window.__t3d.cardTarget(i), id);
    await p.mouse.down({ button: "right" });
    const r = await watchShake(700);
    const dragNow = await p.evaluate(() => window.__t3d.draggingId());
    const f = await felt();
    check(`${cam}/мышь: левая держит, правая — удар: карта отпущена`, dragNow === null, dragNow);
    check(`${cam}/мышь: камера вздрогнула`, r.seen && r.grew === 1, r);
    check(`${cam}/мышь: упала строго вниз, туда где висела`, f && Math.hypot(f.x - held[0], f.y - held[2]) < 0.35, { held, f });
    await p.mouse.up({ button: "right" }); await p.mouse.up();
    await p.close();
  }
  // Пробел.
  {
    const { p, id, c, watchShake } = await open(false, cam);
    await lift(p, c);
    await p.keyboard.press("Space");
    const r = await watchShake(700);
    check(`${cam}/пробел при несомой карте — удар`, r.seen && (await p.evaluate(() => window.__t3d.draggingId())) === null, r);
    await p.mouse.up();
    await p.close();
  }
}
// Без карты в руке: пробел и правая кнопка не бьют.
{
  const { p, c, watchShake } = await open(false, "head");
  await p.keyboard.press("Space");
  await p.mouse.click(c.x + 150, c.y + 100, { button: "right" });
  const r = await watchShake(400);
  check("без несомой карты — ни пробел, ни правая кнопка не трясут камеру", !r.seen && r.grew === 0, r);
  await p.close();
}
// Телефон: первый палец держит, вторым — двойной тап.
{
  const { ctx, p, c, watchShake } = await open(true, "head");
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
  const f1 = [c.x, c.y, 1];
  await touch("touchStart", [f1]); await p.waitForTimeout(500);
  await touch("touchMove", [[c.x + 10, c.y - 20, 1]]); await p.waitForTimeout(200);
  const hold = [c.x + 10, c.y - 20, 1], s2 = [c.x + 90, c.y + 140, 2];
  const draggedBefore = await p.evaluate(() => window.__t3d.draggingId());
  await touch("touchStart", [hold, s2]); await touch("touchEnd", [s2]);
  const afterOne = await p.evaluate(() => window.__t3d.draggingId());
  await touch("touchStart", [hold, s2]); await touch("touchEnd", [s2]);
  const r = await watchShake(700);
  check("телефон: один тап вторым пальцем карту не бросает", draggedBefore !== null && afterOne !== null, { draggedBefore, afterOne });
  check("телефон: двойной тап вторым пальцем — удар", r.seen && (await p.evaluate(() => window.__t3d.draggingId())) === null, r);
  await touch("touchEnd", [hold]);
  await p.close();
}
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const k of checks) console.log(k.ok ? "ok  " : "FAIL", k.name, k.ok ? "" : JSON.stringify(k.got));
process.exit(checks.every((k) => k.ok) ? 0 : 1);
