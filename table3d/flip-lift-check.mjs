// ПЕРЕВОРОТ НА СТОЛЕ: пока карта кувыркается, ни один её угол не уходит под стол — приподнимается ровно настолько, чтобы край не прошёл сквозь сукно.
//   node flip-lift-check.mjs [base]
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
const id = await p.evaluate(() => { const s = window.__t3d.state(); const c = s.chairs.find((x) => x.owner === "me").hand.at(0); window.__t3d.dropFeltAt(c.id, -1.2, 0.4); return c.id; });
await p.waitForTimeout(900);
await p.evaluate((i) => { window.__minY = Infinity; window.__maxY = 0; const loop = () => { const y = window.__t3d.cardMinY(i), top = window.__t3d.cardTarget(i)[1]; window.__minY = Math.min(window.__minY, y); window.__maxY = Math.max(window.__maxY, y); if (window.__frames++ < 150) requestAnimationFrame(loop); }; window.__frames = 0; loop(); window.__t3d.turnCard(i); }, id);
await p.waitForTimeout(2500);
const { minY, maxY } = await p.evaluate(() => ({ minY: window.__minY, maxY: window.__maxY }));
check("при перевороте ни один угол не уходит под стол", minY > -0.003, { minY });
check("карта действительно приподнималась на повороте", maxY > 0.2, { maxY });
const rest = await p.evaluate((i) => window.__t3d.cardMinY(i), id);
check("после переворота карта снова лежит на столе", rest < 0.03, { rest });
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
