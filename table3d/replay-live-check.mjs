// РЕПЛЕЙ НА ЖИВОМ СТОЛЕ (две вкладки): сосед несёт стопку за язычок по столу; я нажимаю «Реплей», отматываю на этот жест и играю — вижу, как стопка поднялась и
// поехала так, как её вели (траектория в реальном времени), и как опустилась.
// Нужен живой стол, страница — с самого сервера:
//   TABLE_SECRET=dev TABLE_GUESTS=1 PORT=2599 npx tsx src/index.ts   (в server/)
//   node replay-live-check.mjs [base] [secret]
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
const pile = await a.evaluate(() => { const s = window.__t3d.state(); const p = [...s.piles].sort((x, y) => y.cards.length - x.cards.length)[0]; return { id: p.id, top: p.cards.at(-1).id }; });
const tab = await a.evaluate((id) => window.__t3d.tabInfo(id)?.screen ?? null, pile.id);
// A тащит стопку по дуге: вверх от язычка, потом вбок и обратно — около полутора секунд.
await a.mouse.move(tab.x, tab.y); await a.mouse.down(); await a.mouse.move(tab.x + 4, tab.y - 30, { steps: 4 });
for (let i = 0; i <= 12; i++) { await a.mouse.move(195 + Math.cos(i / 2) * 90, 300 + Math.sin(i / 2) * 40); await a.waitForTimeout(100); }
await a.mouse.up();
await b.waitForTimeout(1200);
// B смотрит реплей.
await b.click("[data-replay]"); await b.waitForTimeout(500);
check("в ленте есть событие «несёт»", (await b.$$(".rp-tile.moment")).length >= 1, (await b.$$(".rp-tile")).length);
await b.click("[data-rp-jump='-1']"); await b.waitForTimeout(400);
await b.click("[data-rp-speed]");
await b.click("[data-rp-play='1']");
const track = [];
for (let i = 0; i < 18; i++) { track.push(await b.evaluate((id) => window.__t3d.cardTarget(id), pile.top)); await b.waitForTimeout(100); }
const ys = track.filter(Boolean).map((p) => p[1]), xs = track.filter(Boolean).map((p) => p[0]), zs = track.filter(Boolean).map((p) => p[2]);
check("в реплее стопка поднимается над столом", Math.max(...ys) - Math.min(...ys) > 0.3, { ys: [Math.min(...ys), Math.max(...ys)] });
check("и едет по столу по траектории (не стоит на месте)", Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) > 1, { x: [Math.min(...xs), Math.max(...xs)], z: [Math.min(...zs), Math.max(...zs)] });
await b.click("[data-rp-live]"); await b.waitForTimeout(500);
check("«К живому» — стопка снова на столе", (await b.evaluate((id) => window.__t3d.cardTarget(id), pile.top))[1] < 1, await b.evaluate((id) => window.__t3d.cardTarget(id), pile.top));
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
