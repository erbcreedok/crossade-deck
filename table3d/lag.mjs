// СТОЛ ОТВЕЧАЕТ НЕ СРАЗУ — стенд с `&lag=400`: отпущенная карта остаётся там, куда её положили, и не возвращается на старое место,
// пока стол думает (иначе она летела бы дважды: назад, а потом на место).
//   node lag.mjs [base]     (стенд: `npm run dev`, порт 9590)
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch();
const checks = [];
const fr = (p, n = 40) => p.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k > n ? r() : requestAnimationFrame(f)); f(); }), n);

async function drop(name, pick) {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(`${base}/?stand&cam=orbit&lag=400`);
  await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await fr(p);
  const hand = await p.evaluate(() => { const s = window.__t3d.state(); const seat = s.people.find((x) => x.key === window.__t3d.me()).seat; return s.chairs.find((c) => c.id === seat).hand.map((c) => c.id); });
  const { id, to } = await pick(p, hand);
  const from = await p.evaluate((i) => window.__t3d.screenOf(i), id);
  await p.mouse.move(from.x, from.y); await p.mouse.down(); await p.mouse.move(to.x, to.y, { steps: 10 });
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const track = p.evaluate((i) => new Promise((r) => { const out = []; const t0 = performance.now(); const f = () => { const a = window.__t3d.screenOf(i); out.push([performance.now() - t0, a.x, a.y]); performance.now() - t0 < 700 ? requestAnimationFrame(f) : r(out); }; f(); }), id);
  await p.mouse.up();
  const out = await track;
  // Первые 300 мс стол ещё не ответил (ответ — через 400): карта не дальше 60 px от того места, где отпустили.
  const waiting = out.filter(([t]) => t < 300), worst = Math.max(...waiting.map(([, x, y]) => Math.hypot(x - waiting[0][1], y - waiting[0][2])));
  checks.push({ name: `${name}: пока стол не ответил, карта не возвращается на старое место`, ok: worst < 60, got: Math.round(worst) });
  await p.close();
}

await drop("из руки на сукно", async (p, hand) => ({ id: hand.at(-1), to: { x: 140, y: 420 } }));
await drop("перекладка в руке", async (p, hand) => ({ id: hand.at(-1), to: await p.evaluate((i) => window.__t3d.screenOf(i), hand[0]) }));
await browser.close();
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
