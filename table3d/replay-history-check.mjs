// ИСТОРИЯ ДО МОЕГО ПРИХОДА (живой стол, диск): A играет — берёт карты в руку и тащит карту по сукну; B заходит ПОЗЖЕ (свежая страница, лента пуста), жмёт «Реплей», уходит влево —
// и лента подгружает прошлое с сервера: события, как A тащил карту (траектория), прошлый стол; чужую закрытую руку B в истории не видит.
//   TABLE_SECRET=dev TABLE_GUESTS=1 PORT=2599 npx tsx src/index.ts   (в server/)
//   node replay-history-check.mjs [base] [secret]
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
const a = await open("A", "top");
await a.waitForTimeout(1800);
// A: две карты в свою руку (скрыты от B), потом тащит третью по сукну по дуге и кладёт.
await a.evaluate(() => window.__t3d.fillHand(2)); await a.waitForTimeout(800);
const mine = await a.evaluate(() => { const s = window.__t3d.state(); const c = s.chairs.find((x) => x.owner === window.__t3d.me()); return c.hand.map((h) => ({ id: h.id, face: h.face ?? null })); });
const pick = await a.evaluate(() => { const s = window.__t3d.state(); const p = [...s.piles].sort((x, y) => y.cards.length - x.cards.length)[0]; return p.cards.at(-1).id; });
await a.evaluate((id) => window.__t3d.dropFeltAt(id, -2, 0), pick); await a.waitForTimeout(1200);
const at = await a.evaluate((id) => window.__t3d.screenOf(id), pick);
await a.mouse.move(at.x, at.y); await a.mouse.down(); await a.mouse.move(at.x + 4, at.y - 20, { steps: 3 });
for (let i = 0; i <= 14; i++) { await a.mouse.move(195 + Math.cos(i / 2) * 110, 300 + Math.sin(i / 2) * 60); await a.waitForTimeout(90); }
await a.mouse.up(); await a.waitForTimeout(2600);
const a5 = await a.evaluate(() => window.__t3d.state().felt.length);
// B заходит ПОЗЖЕ: ленты у него нет.
const b = await open("B", "top");
await b.waitForTimeout(1500);
await b.click("[data-replay]"); await b.waitForTimeout(500);
const stateOf = () => b.evaluate(() => { const s = window.__t3d.state(); return { felt: s.felt.length, hands: s.chairs.map((c) => c.hand.map((h) => ({ id: h.id, face: h.face ?? null }))) }; });
// Пока ждём ответа сервера, лента должна подгрузить прошлое сама.
let tiles = 0;
for (let i = 0; i < 40 && tiles < 3; i++) { await b.waitForTimeout(250); tiles = (await b.$$(".rp-tile.moment")).length; }
check("B зашёл позже, но лента подгрузила прошлое с сервера: есть события", tiles >= 3, tiles);
for (let i = 0; i < 30; i++) await b.click("[data-rp-jump='-1']");
await b.waitForTimeout(500);
check("лента дошла до начала: у края «начало»", await b.evaluate(() => [...document.querySelectorAll(".rp-tile.edge")].some((e) => e.textContent.trim() === "начало")), await b.evaluate(() => [...document.querySelectorAll(".rp-tile.edge")].map((e) => e.textContent)));
const early = await stateOf();
check("отмотал к началу: на сукне ещё пусто (стол из прошлого)", early.felt === 0, early.felt);
// Карты руки A: у B лиц в прошлом нет или подставные — настоящих нет.
const aHand = early.hands.flat().filter((h) => mine.some((m) => m.id === h.id));
check("чужая рука в прошлом без настоящих лиц", aHand.every((h) => !h.face || !mine.find((m) => m.id === h.id).face || JSON.stringify(h.face) !== JSON.stringify(mine.find((m) => m.id === h.id).face)), { aHand, mine });
// Траектория: играем вперёд на 2× и снимаем, где летящая карта.
await b.click("[data-rp-speed]");
await b.click("[data-rp-mode='time']");
const track = new Set();
await b.click("[data-rp-play='1']");
for (let i = 0; i < 70; i++) { const t = await b.evaluate((id) => window.__t3d.cardTarget(id), pick); if (t) track.add(`${Math.round(t[0] * 2)},${Math.round(t[2] * 2)},${Math.round(t[1] * 4)}`); await b.waitForTimeout(100); }
check("в истории карта ехала по траектории (много разных мест), а не прыгнула", track.size >= 6, track.size);
await b.click("[data-rp-live]"); await b.waitForTimeout(600);
check("к живому — стол как у всех", (await stateOf()).felt === a5, { live: (await stateOf()).felt, a: a5 });
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
