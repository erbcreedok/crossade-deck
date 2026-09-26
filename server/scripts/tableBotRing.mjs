// БОТЫ И КРУГ ХОДА — вживую, трое без человека: лишней карты в круге не бывает никогда.
//
// За живым столом закрывший круг бот клал следующую карту поверх несгребённой кучи — четвёртую в
// круг на троих, пятую в круг на четверых. Юнит-тесты это ловят по частям (`view.test`, `plays.test`,
// `nudge.test`), а здесь — целиком: настоящая комната, настоящий такт ботов, настоящий крупье.
//
//   TABLE_SECRET=probe TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test CROSSADE_DB_FILE=":memory:" PORT=2597 npx tsx src/index.ts
//   node scripts/tableBotRing.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2597";
const secret = process.argv[3] ?? "probe";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "test";
/** Сколько смотреть на партию, мс. За это время трое успевают закрыть не один круг. */
const WATCH_MS = 75_000;
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);

const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const ask = (p, i = {}) => fetch(base + p, { ...i, headers: { "x-table-secret": secret, "content-type": "application/json" } });
const run = async (command) => (await ask(`/table/rooms/${room}/run`, { method: "POST", body: JSON.stringify({ by: "tg:7", command }) })).json();
function initData(id, name) {
  const f = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: name, username: name.toLowerCase() }) };
  const sum = Object.keys(f).sort().map((k) => `${k}=${f[k]}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  return new URLSearchParams({ ...f, hash: createHmac("sha256", key).update(sum).digest("hex") }).toString();
}

await ask("/table/rooms", { method: "POST", body: JSON.stringify({ by: "tg:7", home: { kind: "inline", message: "m" }, kind: "krest", room }) });

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
p.on("pageerror", (e) => console.log("ERROR", e.message));
await p.addInitScript((d) => {
  const a = {};
  Object.defineProperty(a, "WebApp", { value: { initData: d, initDataUnsafe: {}, ready() {}, expand() {} } });
  Object.defineProperty(window, "Telegram", { value: a });
}, initData(7, "Ye"));
await p.goto(`${base}/table/?room=${room}&name=Ye`);
await p.waitForSelector("[data-section]");
await p.waitForSelector(".crossade-loading", { state: "detached" });
await p.waitForTimeout(600);

const state = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__tableState())));
await run({ t: "bots", n: 3 });
await p.waitForTimeout(2500);
const bots = (await state()).chairs.filter((c) => c.owner?.startsWith("bot:игрок")).map((c) => c.id);
check("трое без человека за столом", bots.length === 3, bots);

// РАЗДАЁТСЯ ТОЛЬКО ИМ: человек смотрит, очередь до него не доходит и партию не держит.
const dealt = await run({ t: "deal", rule: "each", n: 5, seats: bots, force: true });
check("раздача троим принята", dealt.ok === true, dealt);

let most = 0;
let swept = 0;
let moves = 0;
let wasFull = false;
let lastRing = "";
let over = null;
const t0 = Date.now();
while (Date.now() - t0 < WATCH_MS) {
  await p.waitForTimeout(150);
  const s = await state();
  const ring = s.piles.find((one) => one.id === "ring")?.cards.map((c) => c.id) ?? [];
  const key = ring.join();
  if (key !== lastRing) moves += 1;
  lastRing = key;
  // ИГРОКОВ В КРУГЕ НЕ БОЛЬШЕ ТРОИХ — и карт в нём не больше, чем игроков.
  if (ring.length > most) most = ring.length;
  if (ring.length > bots.length) over ??= { ring: ring.length, at: Date.now() - t0 };
  if (ring.length >= 2) wasFull = true;
  if (wasFull && ring.length === 0) {
    swept += 1;
    wasFull = false;
  }
  if (s.play?.loser) break;
}
check("в круге ни разу не больше карт, чем игроков", over === null && most <= bots.length, { most, over });
check("круги закрывались и уходили крупье", swept >= 2, { swept, most });
check("партия шла, а не стояла", moves >= 8, moves);

await browser.close();
for (const one of checks) console.log(one.ok ? "✓" : "✗", one.name, one.ok ? "" : JSON.stringify(one.got));
console.log(`${checks.filter((one) => one.ok).length}/${checks.length}`);
if (checks.some((one) => !one.ok)) process.exitCode = 1;
