// ПОВОРОТ КАРТЫ: меню (30/60/90 по часовой), правая кнопка ведёт угол без меню, Ctrl/Cmd при переносе, второй палец (вертикаль — поворот, горизонталь — переворот, режим держится).
//   node spin-check.mjs [base]
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch();
const errors = [], checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const open = async (touch) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: !!touch });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${base}/?stand&cam=top`);
  await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await p.waitForTimeout(500);
  const id = await p.evaluate(() => { const c = window.__t3d.state().chairs.find((q) => q.owner === "me").hand.at(0); window.__t3d.dropFeltAt(c.id, -1.5, -1.5); return c.id; });
  let c = await p.evaluate((i) => window.__t3d.screenOf(i), id);
  for (let k = 0; k < 40; k++) { await p.waitForTimeout(100); const n = await p.evaluate((i) => window.__t3d.screenOf(i), id); const still = Math.hypot(n.x - c.x, n.y - c.y) < 0.3; c = n; if (still) break; }
  const card = () => p.evaluate((i) => { const f = window.__t3d.state().felt.find((x) => x.id === i); return f ? { angle: f.angle, up: f.up, x: f.x, y: f.y } : null; }, id);
  return { ctx, p, id, c, card };
};
const dang = (a, b) => ((((b - a) % 360) + 540) % 360) - 180;

// 1. Правая кнопка: клик без движения — меню; «Повернуть на 90°» поворачивает по часовой на месте.
{
  const { p, c, card } = await open(false);
  const a0 = (await card()).angle;
  await p.mouse.move(c.x, c.y); await p.mouse.click(c.x, c.y, { button: "right" }); await p.waitForTimeout(200);
  const labels = await p.evaluate(() => [...document.querySelectorAll("div[style*=\"z-index: 60\"] button")].map((b) => b.textContent));
  check("правый клик по карте — меню с «Перевернуть» и поворотами 30/60/90", ["Перевернуть", "Повернуть на 30°", "Повернуть на 60°", "Повернуть на 90°"].every((t) => labels.includes(t)), labels);
  await p.evaluate(() => [...document.querySelectorAll("div[style*=\"z-index: 60\"] button")].find((b) => b.textContent === "Повернуть на 90°").click()); await p.waitForTimeout(300);
  const a1 = (await card()).angle;
  check("«Повернуть на 90°» — на 90 по часовой", Math.abs(dang(a0, a1) - 90) < 1, { a0, a1 });
  await p.close();
}
// 2. Правая кнопка зажата и ведётся вокруг центра карты — вращает без меню; зажал, подержал и отпустил на месте — меню.
{
  const { p, c, card } = await open(false);
  const a0 = (await card()).angle;
  await p.mouse.move(c.x + 12, c.y); await p.mouse.down({ button: "right" });
  for (let k = 1; k <= 12; k++) { const t = (k * 7.5 * Math.PI) / 180; await p.mouse.move(c.x + 12 * Math.cos(t), c.y + 12 * Math.sin(t)); }
  await p.mouse.up({ button: "right" }); await p.waitForTimeout(300);
  const a1 = (await card()).angle, menu = await p.evaluate(() => [...document.querySelectorAll("div[style*=\"z-index: 60\"] button")].length);
  check("правая кнопка + круг на 90° вокруг карты — карта повернулась на ~90 по часовой", Math.abs(dang(a0, a1) - 90) < 8, { a0, a1 });
  check("после вращения меню не открывается", menu === 0, menu);
  await p.mouse.move(c.x, c.y); await p.mouse.down({ button: "right" }); await p.waitForTimeout(600); await p.mouse.up({ button: "right" }); await p.waitForTimeout(200);
  check("зажал и отпустил, не двигая, — меню", (await p.evaluate(() => [...document.querySelectorAll("div[style*=\"z-index: 60\"] button")].length)) > 0);
  await p.close();
}
// 3. Ctrl при переносе: карта стоит и вращается за мышью, бросок сохраняет угол.
{
  const { p, id, c, card } = await open(false);
  await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c.x + 20, c.y - 20, { steps: 4 }); await p.waitForTimeout(200);
  const h0 = await p.evaluate(() => window.__t3d.heldAngle());
  await p.keyboard.down("Control"); await p.mouse.move(c.x + 20 + 100, c.y - 20, { steps: 8 }); await p.keyboard.up("Control"); await p.waitForTimeout(250);
  const h1 = await p.evaluate(() => window.__t3d.heldAngle());
  check("Ctrl + мышь вправо на 100 px при переносе — угол вырос на ~45", Math.abs(dang(h0, h1) - 45) < 6, { h0, h1 });
  await p.mouse.up(); await p.waitForTimeout(700);
  const a = (await card()).angle;
  check("брошенная карта сохранила угол", Math.abs(dang(h1, a)) < 3, { h1, a });
  await p.close();
}
// 4. Второй палец: вертикаль поворачивает, горизонталь переворачивает, режим держится до отрыва пальца.
{
  const { ctx, p, c, card } = await open(true);
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
  const f1 = [c.x, c.y, 1];
  await touch("touchStart", [f1]); await p.waitForTimeout(500);
  const before = await card();
  let s = [c.x + 100, c.y + 150, 2];
  await touch("touchStart", [f1, s]);
  for (let k = 1; k <= 8; k++) { s = [s[0], s[1] + 12, 2]; await touch("touchMove", [f1, s]); }
  const rotating = await p.evaluate(() => window.__t3d.heldAngle()), fl = await p.evaluate(() => window.__t3d.flipInfo());
  check("второй палец вниз на ~100 px — карта в руке повёрнута (~45 по часовой)", Math.abs(dang(before.angle, rotating) - 45) < 8, { before: before.angle, rotating });
  for (let k = 1; k <= 8; k++) { s = [s[0] + 14, s[1] + 3, 2]; await touch("touchMove", [f1, s]); }
  const mid = await p.evaluate(() => ({ flip: window.__t3d.flipInfo(), ang: window.__t3d.heldAngle() }));
  check("после начала поворота движение вбок не переворачивает (режим держится)", mid.flip.deg === 0 && mid.flip.up === fl.up, { fl, mid });
  await touch("touchEnd", [s]); await p.waitForTimeout(100);
  s = [c.x + 60, c.y + 150, 3];
  await touch("touchStart", [f1, s]);
  for (let k = 1; k <= 10; k++) { s = [s[0] + 18, s[1], 3]; await touch("touchMove", [f1, s]); }
  const flipped = await p.evaluate(() => window.__t3d.flipInfo());
  check("новый второй палец вбок — переворот (угол переворота растёт)", flipped.deg !== 0 || flipped.up !== fl.up, flipped);
  const ang0 = await p.evaluate(() => window.__t3d.heldAngle());
  for (let k = 1; k <= 8; k++) { s = [s[0], s[1] + 12, 3]; await touch("touchMove", [f1, s]); }
  const ang1 = await p.evaluate(() => window.__t3d.heldAngle());
  check("после начала переворота движение по вертикали карту не крутит", Math.abs(dang(ang0, ang1)) < 2, { ang0, ang1 });
  await touch("touchEnd", [s]); await touch("touchEnd", [f1]);
  await p.close();
}
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const k of checks) console.log(k.ok ? "ok  " : "FAIL", k.name, k.ok ? "" : JSON.stringify(k.got));
process.exit(checks.every((k) => k.ok) ? 0 : 1);
