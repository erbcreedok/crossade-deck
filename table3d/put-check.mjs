// ПОЛОЖИТЬ НА МЕСТЕ: поднял карту, остановил палец и отпустил — она ложится ровно под собой, не уезжает вперёд по лучу камеры;
// отпустил на скорости — летит дальше. Тень несомой карты — одна, вертикально под ней, пока карта в воздухе.   node put-check.mjs [base]
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch();
const errors = [], checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
for (const cam of ["head", "top"]) {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${base}/?stand&cam=${cam}`);
  await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await p.waitForTimeout(800);
  const id = await p.evaluate(() => { const c = window.__t3d.state().chairs.find((q) => q.owner === "me").hand.at(0); window.__t3d.dropFeltAt(c.id, -1.5, -1.5); return c.id; });
  const settle = async () => { let c = await p.evaluate((i) => window.__t3d.screenOf(i), id); for (let k = 0; k < 40; k++) { await p.waitForTimeout(100); const n = await p.evaluate((i) => window.__t3d.screenOf(i), id); const still = Math.hypot(n.x - c.x, n.y - c.y) < 0.3; c = n; if (still) break; } return c; };
  const spot = () => p.evaluate((i) => { const f = window.__t3d.state().felt.find((x) => x.id === i); return f ? { x: f.x, y: f.y } : null; }, id);
  const c = await settle();
  await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c.x + 25, c.y - 40, { steps: 6 }); await p.waitForTimeout(500);
  const held = await p.evaluate((i) => ({ at: window.__t3d.cardTarget(i), shadow: window.__t3d.dropShadow?.(i) }), id);
  check(`${cam}: у несомой карты есть тень под ней`, held.shadow && held.shadow.on && Math.hypot(held.shadow.x - held.at[0], held.shadow.z - held.at[2]) < 0.6, held);
  await p.mouse.up(); await p.waitForTimeout(500);
  const put = await spot();
  check(`${cam}: положил на месте — легла под картой`, put && Math.hypot(put.x - held.at[0], put.y - held.at[2]) < 0.3, { held: held.at, put });
  const d = await settle();
  await p.mouse.move(d.x, d.y); await p.mouse.down(); await p.mouse.move(d.x + 10, d.y - 10, { steps: 2 }); await p.waitForTimeout(150);
  await p.mouse.move(d.x + 10, d.y - 190, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(500);
  const thrown = await spot();
  check(`${cam}: бросок на скорости — улетела дальше`, Math.hypot(thrown.x - put.x, thrown.y - put.y) > 1, { put, thrown });
  await p.close();
}
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const k of checks) console.log(k.ok ? "ok  " : "FAIL", k.name, k.ok ? "" : JSON.stringify(k.got));
process.exit(checks.every((k) => k.ok) ? 0 : 1);
