// «ЗАКРЫТЬ КРУГ» — вживую: крестовый, я и бот, крупье. Играем круг, пока я его не закрою, — тогда у меня
// над рукой кнопка; нажал — охапка круга в руке крупье, кнопки больше нет. Пока круг закрыл не я — кнопки нет.
//
//   TABLE_SECRET=probe TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test CROSSADE_DB_FILE=":memory:" PORT=2611 npx tsx src/index.ts
//   node scripts/tableCloseRing.mjs [base] [secret] [скриншот.png]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2611";
const secret = process.argv[3] ?? "probe";
const shot = process.argv[4] ?? null;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "test";
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
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
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
const spots = () => p.evaluate(() => JSON.parse(document.querySelector("canvas").dataset.spots));
await run({ t: "bots", n: 1 });
await p.waitForTimeout(2000);
let s = await state();
const mine = s.chairs.find((c) => c.owner === "tg:7")?.id;
const bot = s.chairs.find((c) => c.owner?.startsWith("bot:игрок"))?.id;
check("я и бот за крестовым, есть крупье", mine && bot && s.chairs.some((c) => c.croupier), { mine, bot });
const dealt = await run({ t: "deal", rule: "each", n: 4, seats: [mine, bot], force: true });
check("раздача принята", dealt.ok === true, dealt);
await p.waitForTimeout(1500);

/** Положить свою карту в круг — пальцем, как человек. */
const lay = async () => {
  const card = await p.evaluate((me) => { const e = document.querySelector(`[data-card][data-owner="${me}"]`); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 3 }; }, mine);
  const mid = (await spots()).middle;
  if (!card) return false;
  await p.mouse.move(card.x, card.y); await p.mouse.down();
  await p.mouse.move(mid.x, mid.y, { steps: 12 }); await p.mouse.up();
  return true;
};

let sawButtonForOther = false;
let ready = null;
const t0 = Date.now();
while (Date.now() - t0 < 60_000) {
  await p.waitForTimeout(400);
  s = await state();
  const ring = s.piles.find((x) => x.id === "ring")?.cards.length ?? 0;
  const button = (await p.locator("[data-close-ring]").count()) > 0;
  if (process.env.DEBUG) console.log(Math.round((Date.now() - t0) / 1000), JSON.stringify({ turn: s.play?.turn, closer: s.play?.closer, ring, hand: s.chairs.find((c) => c.id === mine)?.hand.length, botHand: s.chairs.find((c) => c.id === bot)?.hand.length }));
  if (button && s.play?.closer !== "tg:7") sawButtonForOther = true;
  if (ring > 0 && s.play?.closer === "tg:7") { ready = { ring, button }; break; }
  // Мой ход и круг не полон (нас двое) — кладу. «Закрывший» держится от прошлого круга, по нему не ждём.
  if (s.play?.turn === "tg:7" && ring < 2) { await lay(); await p.waitForTimeout(900); }
}
check("круг закрыл я — над рукой «Закрыть круг»", ready?.button === true, ready);
check("пока круг закрыл не я — кнопки не было", !sawButtonForOther);
if (shot) await p.screenshot({ path: shot });
if (ready) {
  const croupier = (await state()).chairs.find((c) => c.croupier);
  const before = croupier.hand.length;
  await p.locator("[data-close-ring]").click();
  await p.waitForTimeout(1200);
  s = await state();
  const after = s.chairs.find((c) => c.croupier).hand.length;
  check("нажал — охапка круга у крупье", (s.piles.find((x) => x.id === "ring")?.cards.length ?? 0) === 0 && after === before + ready.ring, { before, after, ring: ready.ring });
  check("и кнопки больше нет", (await p.locator("[data-close-ring]").count()) === 0);
}
check("без ошибок на странице", errors.length === 0, errors.slice(0, 2));
await browser.close();
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.ok || c.got === undefined ? "" : ` — ${JSON.stringify(c.got)}`}`);
const bad = checks.filter((c) => !c.ok).length;
console.log(bad ? `\nУПАЛО: ${bad}` : "\nвсё зелёное");
process.exit(bad ? 1 : 0);
