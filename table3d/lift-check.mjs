// ПОДЪЁМ КАРТЫ ПОД ПАЛЕЦ: карта, которую взяли, поднимается ВДОЛЬ луча на палец — на экране она не стартует снизу и не залетает дальше пальца, пока растёт на высоту.
//   node lift-check.mjs [base]
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
await p.waitForTimeout(1500);
const top = await p.evaluate(() => { const s = window.__t3d.state(); const q = [...s.piles].sort((a, b) => b.cards.length - a.cards.length)[0]; const id = q.cards.at(-1).id; return { id, at: window.__t3d.screenOf(id) }; });
const x = top.at.x, y = top.at.y;
await p.evaluate((id) => { window.__trace = []; const loop = () => { const a = window.__t3d.screenOf(id); window.__trace.push([a.x, a.y]); if (window.__trace.length < 120) requestAnimationFrame(loop); }; loop(); }, top.id);
// Палец тянет вверх-влево: карта ни в один кадр не должна оказаться ниже (по экрану) и старта, и пальца.
const fx = x - 70, fy = y - 50;
await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(fx, fy, { steps: 4 });
await p.waitForTimeout(700);
const trace = await p.evaluate(() => window.__trace);
const lowest = Math.max(...trace.map((q) => q[1]));
check("карта при подъёме не уходит ниже старта и пальца", lowest <= Math.max(y, fy) + 6, { lowest, start: y, finger: fy });
await p.mouse.up();
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
