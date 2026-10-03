// ЧУЖАЯ СТОПКА В ВОЗДУХЕ: сосед несёт стопку за язычок (со стола и бесхозную у пустого стула) — у меня её карты поднимаются и идут за его пальцем целиком, лицом к нему.
// Нужен живой стол (две вкладки в одной комнате), страница — с самого сервера:
//   TABLE_SECRET=dev TABLE_GUESTS=1 PORT=2599 npx tsx src/index.ts   (в server/)
//   node stack-carry-check.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:2599", secret = process.argv[3] ?? "dev";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);
await fetch(`${base}/table/rooms`, { method: "POST", headers: { "x-table-secret": secret, "content-type": "application/json" }, body: JSON.stringify({ by: "tg:1", home: { kind: "inline", message: "m" }, kind: "cards", room }) });
const browser = await chromium.launch();
const errors = [];
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const open = async (name, cam) => { const p = await browser.newPage({ viewport: { width: 390, height: 844 } }); p.on("pageerror", (e) => errors.push(e.message)); await p.goto(`${base}/table/3d?room=${room}&name=${name}&test&cam=${cam}`); await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"), null, { timeout: 15000 }); return p; };
const a = await open("A", "top"), b = await open("B", "top");
await a.waitForTimeout(1800);
// Стопка со стола: самая толстая.
const pile = await a.evaluate(() => { const s = window.__t3d.state(); const p = [...s.piles].sort((x, y) => y.cards.length - x.cards.length)[0]; return { id: p.id, top: p.cards.at(-1).id, n: p.cards.length }; });
const tab = await a.evaluate((id) => window.__t3d.tabInfo(id)?.screen ?? null, pile.id);
check("у стопки есть язычок", !!tab, tab);
const before = await b.evaluate((id) => window.__t3d.cardTarget(id), pile.top);
await a.mouse.move(tab.x, tab.y); await a.mouse.down(); await a.mouse.move(tab.x + 4, tab.y - 30, { steps: 4 }); await a.mouse.move(150, 300, { steps: 8 });
await b.waitForTimeout(900);
const air = await b.evaluate((id) => window.__t3d.cardTarget(id), pile.top);
check("стопку несут — у соседа её верхняя карта поднята над столом", air && before && air[1] > before[1] + 0.3, { before, air });
const low = await b.evaluate((id) => window.__t3d.cardTarget(id), (await a.evaluate((p) => window.__t3d.state().piles.find((x) => x.id === p).cards[0].id, pile.id)));
check("и нижняя карта едет вместе с верхней, стопка не рассыпалась (рядом по плоскости)", low && air && Math.hypot(low[0] - air[0], low[2] - air[2]) < 0.5, { low, air });
await a.mouse.up();
await b.waitForTimeout(1500);
const after = await b.evaluate((id) => window.__t3d.cardTarget(id), pile.top);
check("отпустили — стопка у соседа опустилась на стол", after && after[1] < air[1] - 0.3, { air, after });
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
