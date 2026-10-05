// УДЕРЖАНИЕ ПОДНИМАЕТ КАРТУ: палец лёг на карту и стоит на месте — через ~0,35 с карта поднята (взята); тап (коротко) карту не трогает.
//   node hold-pick-check.mjs [base]
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch();
const errors = [];
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`${base}/?stand&cam=top`);
await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
// Долгое удержание над стопкой поднимает её; часы стоят, чтобы медленная машина не делала этого сама посреди проверки.
await p.evaluate(() => (window.__t3dScreens ?? []).forEach((s) => s.holdClock(0)));
await p.waitForTimeout(1500);
const id = await p.evaluate(() => { const s = window.__t3d.state(); const c = s.chairs.find((x) => x.owner === "me").hand.at(0); window.__t3d.dropFeltAt(c.id, -1.2, 0.4); return c.id; });
await p.waitForTimeout(900);
// Ждём, пока карта осядет (пружина), и только потом целимся.
let c = await p.evaluate((i) => window.__t3d.screenOf(i), id);
for (let k = 0; k < 40; k++) { await p.waitForTimeout(150); const n = await p.evaluate((i) => window.__t3d.screenOf(i), id); const still = Math.hypot(n.x - c.x, n.y - c.y) < 0.3; c = n; if (still) break; }
const info = () => p.evaluate(() => ({ drag: window.__t3d.draggingId(), locks: Object.keys(window.__t3d.state().locks).length }));
const before = await p.evaluate((i) => JSON.stringify(window.__t3d.state().felt.find((x) => x.id === i)), id);
// 1. Тап: коротко нажал и отпустил — ничего.
await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.waitForTimeout(120); const tapMid = await info(); await p.mouse.up(); await p.waitForTimeout(1500);
check("тап: карта не поднимается", tapMid.drag === null && tapMid.locks === 0, tapMid);
check("тап: карта на месте и не перевёрнута", (await p.evaluate((i) => JSON.stringify(window.__t3d.state().felt.find((x) => x.id === i)), id)) === before);
// 2. Удержание: нажал и держу, не двигаясь — карта поднята.
await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.waitForTimeout(700);
const held = await info();
check("удержание без движения: карта поднята и взята", held.drag === id && held.locks === 1, held);
const y = await p.evaluate((i) => window.__t3d.cardTarget(i)[1], id);
check("удержание: карта на высоте над столом", y > 0.5, { y });
await p.mouse.up(); await p.waitForTimeout(700);
check("отпустил — карта легла обратно, замок снят", (await info()).locks === 0);
// 3. Удержание, потом ведёт — идёт за пальцем как обычно.
await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.waitForTimeout(600); await p.mouse.move(c.x + 60, c.y + 20, { steps: 5 }); await p.waitForTimeout(400);
const moved = await p.evaluate((i) => window.__t3d.screenOf(i), id);
check("после удержания палец ведёт карту", Math.hypot(moved.x - (c.x + 60), moved.y - (c.y + 20)) < 40, { moved, finger: [c.x + 60, c.y + 20] });
await p.mouse.up();
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const k of checks) console.log(k.ok ? "ok  " : "FAIL", k.name, k.ok ? "" : JSON.stringify(k.got));
process.exit(checks.every((k) => k.ok) ? 0 : 1);
