// ПОВТОРНЫЙ ЗАХВАТ СРАЗУ ПОСЛЕ БРОСКА: карту потянули из стопки и вернули на место, тут же взяли снова — она идёт за пальцем сразу, а не «замерзает» на время посадки.
//   node redrag-check.mjs [base]
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
// 1. Потянули и вернули на то же место.
await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 70, y + 50, { steps: 6 }); await p.waitForTimeout(150);
await p.mouse.move(x, y, { steps: 6 }); await p.waitForTimeout(80); await p.mouse.up();
// 2. Сразу берём снова и ведём вбок.
const rest = await p.evaluate((id) => window.__t3d.cardTarget(id), top.id);
await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 80, y + 10, { steps: 5 }); await p.waitForTimeout(250);
const moved = await p.evaluate((id) => window.__t3d.cardTarget(id), top.id);
check("повторный захват сразу: карта идёт за пальцем", Math.hypot(moved[0] - rest[0], moved[2] - rest[2]) > 0.5, { rest, moved });
await p.mouse.up();
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
