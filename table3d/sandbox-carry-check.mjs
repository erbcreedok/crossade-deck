// ПЕСОЧНИЦА: что я несу — вижу не только я. Экран Алии (второй экран песочницы) видит мою карту и мою стопку в воздухе, пока их несут, а не после дропа.
//   node sandbox-carry-check.mjs [base]
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [], checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`${base}/?stand&cam=top`);
await p.waitForFunction(() => window.__t3d && window.__t3dScreens?.length >= 2 && document.querySelector("#stage canvas"));
await p.waitForTimeout(1800);
const alia = (fn, arg) => p.evaluate(([f, a]) => window.__t3dScreens[1][f](a), [fn, arg]);
// 1. карта с колоды
const top = await p.evaluate(() => window.__t3d.state().piles[0].cards.at(-1).id);
const before = await alia("cardTarget", top);
let A = await p.evaluate((i) => window.__t3d.screenOf(i), top);
await p.mouse.move(A.x, A.y); await p.mouse.down(); await p.mouse.move(A.x + 20, A.y + 30, { steps: 4 }); await p.mouse.move(A.x + 60, A.y + 40, { steps: 6 });
await p.waitForTimeout(700);
const air = await alia("cardTarget", top);
check("несу карту — на экране Алии она в воздухе, а не лежит на колоде", before && air && air[1] > before[1] + 0.3, { before, air });
await p.mouse.up(); await p.waitForTimeout(1200);
const down = await alia("cardTarget", top);
check("отпустил — карта у Алии опустилась на стол", down && down[1] < air[1] - 0.3, { air, down });
// 2. стопка за язычок
await p.evaluate(() => { const ids = window.__t3d.state().felt.map((c) => c.id); window.__me?.send; });
const pile = await p.evaluate(() => { const q = window.__t3d.state().piles[0]; return { id: q.id, top: q.cards.at(-1).id }; });
const tab = await p.evaluate((id) => window.__t3d.tabs().find((t) => t.pile === id), pile.id);
const b2 = await alia("cardTarget", pile.top);
await p.mouse.move(tab.x, tab.y); await p.mouse.down(); await p.mouse.move(tab.x + 12, tab.y, { steps: 3 }); await p.mouse.move(tab.x + 70, tab.y - 30, { steps: 8 });
await p.waitForTimeout(800);
const a2 = await alia("cardTarget", pile.top);
check("несу стопку — на экране Алии она в воздухе и двигается вместе с рукой, а не стоит на месте до дропа", b2 && a2 && Math.hypot(a2[0] - b2[0], a2[2] - b2[2]) > 0.3 && a2[1] > b2[1] + 0.3, { b2, a2 });
await p.mouse.up();
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
