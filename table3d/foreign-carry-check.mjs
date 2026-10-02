// ЧУЖАЯ КАРТА В МОЮ РУКУ: сосед несёт карту мне — на моём худе она в щели, куда он целится, и двигается влево-вправо вместе с его прицелом (а не стоит на месте у его руки).
// Нужен живой стол (две вкладки в одной комнате), страница — с самого сервера:
//   TABLE_SECRET=dev TABLE_GUESTS=1 PORT=2599 npx tsx src/index.ts   (в server/)
//   node foreign-carry-check.mjs [base] [secret]
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
const open = async (name) => { const p = await browser.newPage({ viewport: { width: 390, height: 844 } }); p.on("pageerror", (e) => errors.push(e.message)); await p.goto(`${base}/table/3d?room=${room}&name=${name}&test`); await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"), null, { timeout: 15000 }); return p; };
const a = await open("A"), b = await open("B");
await a.waitForTimeout(1500);
await a.evaluate(() => window.__t3d.fillHand(5));
await a.waitForTimeout(1500);
const mine = await a.evaluate(() => { const s = window.__t3d.state(); const c = s.chairs.find((x) => x.owner === window.__t3d.me()); return { chair: c.id, n: c.hand.length }; });
// B берёт карту с колоды в руку и несёт её «в руку A», целясь в щели 1 и потом 4.
await b.evaluate(() => window.__t3d.fillHand(1));
await b.waitForTimeout(1200);
const card = await b.evaluate(() => { const s = window.__t3d.state(); const c = s.chairs.find((x) => x.owner === window.__t3d.me()); return c.hand.at(-1).id; });
await b.evaluate(([id, chair]) => window.__t3d.carryTo(id, chair, 1), [card, mine.chair]);
await a.waitForTimeout(900);
const x1 = await a.evaluate((id) => window.__t3d.cardOnHud(id), card);
check("карта соседа над моей рукой — на моём худе (в кадре руки), а не у его руки", x1 && x1.onCamera, x1);
await b.evaluate(([id, chair]) => window.__t3d.carryTo(id, chair, 4), [card, mine.chair]);
await a.waitForTimeout(900);
const x2 = await a.evaluate((id) => window.__t3d.cardOnHud(id), card);
check("он перевёл прицел вправо — карта на моём худе сдвинулась вправо", x2 && x1 && x2.x > x1.x + 0.05, { x1, x2 });
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
