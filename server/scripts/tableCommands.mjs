// КОМАНДЫ СТОЛА ИЗ БОТА — глазами сидящих: раздача идёт картами по одной, бот несёт их курсором со своим
// именем, перемешивание видно, козырь ложится под колоду, «от лица раздающего» — его имя и его след.
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableCommands.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const secret = process.argv[3] ?? "dev";
const TOKEN = "test";
const H = { "content-type": "application/json", "x-table-secret": secret };
const post = async (path, json) => (await fetch(`${base}${path}`, { method: "POST", headers: H, body: JSON.stringify(json) })).json();

const card = await post("/table/rooms", { home: { kind: "chat", chat: `-${Date.now()}` }, by: "tg:7", title: "Команды" });
const room = card.room;
const run = (command, by = "tg:7") => post(`/table/rooms/${room}/run`, { by, command });

function initData(id, name) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: name, username: name.toLowerCase() }) };
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  return new URLSearchParams({ ...fields, hash: createHmac("sha256", key).update(check).digest("hex") }).toString();
}

const browser = await chromium.launch();
const open = async (name, tg) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message));
  if (tg) await p.addInitScript((data) => {
    // Скрипт Telegram на странице перезаписал бы WebApp пустым — держим свой.
    const tg = {};
    Object.defineProperty(tg, "WebApp", { value: { initData: data, initDataUnsafe: {}, ready() {}, expand() {} }, writable: false });
    Object.defineProperty(window, "Telegram", { value: tg, writable: false });
  }, initData(tg, name));
  await p.goto(`${base}/table/?room=${room}&name=${name}`);
  await p.waitForSelector("[data-section]");
  await p.waitForTimeout(400);
  return p;
};
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const spots = async (p) => JSON.parse(await p.getAttribute("canvas", "data-spots"));
const handCount = (p) => p.evaluate(() => {
  const s = JSON.parse(document.querySelector("canvas").dataset.spots);
  const bottom = [...document.querySelectorAll("[data-card]")].filter((el) => el.getBoundingClientRect().top > 600);
  return bottom.length;
});
const tagsSeen = (p) => p.evaluate(() => { window.__tags = new Set(); window.__shuffles = 0; new MutationObserver((l) => l.forEach((m) => m.addedNodes.forEach((n) => { if (n.dataset?.shuffle) window.__shuffles += 1; }))).observe(document.body, { childList: true, subtree: true }); setInterval(() => document.querySelectorAll('[data-carry] [data-g="who"]').forEach((el) => window.__tags.add(el.textContent)), 20); });

const A = await open("Admin", 7);
const B = await open("Bee");
await tagsSeen(A);
await tagsSeen(B);

// ── 1. Не админ — отказ; админ — раздача по 3, постепенно ─────────────────────────────────────
check("не админу отказ", (await run({ t: "deal", rule: "each", n: 3 }, "tg:8")).error === "not-admin", null);
const first = await run({ t: "deal", rule: "each", n: 3 });
check("админу — ok", first.ok === true, first);
await B.waitForTimeout(350);
const midB = await handCount(B);
check("раздача идёт по одной: через 0.35 с у B не все 3", midB < 3, midB);
check("пока идёт — второй командой не перебить", (await run({ t: "shuffle" })).error === "busy", null);
await B.waitForTimeout(1500);
check("в конце у A 3, у B 3", (await handCount(A)) === 3 && (await handCount(B)) === 3, [await handCount(A), await handCount(B)]);
check("B видел курсор бота с именем", (await B.evaluate(() => [...window.__tags])).some((t) => /Crossader/i.test(t)), await B.evaluate(() => [...window.__tags]));
check("и A тоже", (await A.evaluate(() => [...window.__tags])).some((t) => /Crossader/i.test(t)), null);
check("бот не сел на стул", (await spots(A)).seats.length === 2, (await spots(A)).seats);

// ── 2. Не собрано — просит; пресет дурака на 52 с джокерами собирает, набирает 54, мешает ────────
check("не собрано — needs-collect", (await run({ t: "deal", rule: "durak" })).error === "needs-collect", null);
check("пресет — ok", (await run({ t: "preset", game: "durak", size: 52, jokers: true })).ok === true, null);
await A.waitForTimeout(6 * 80 + 1400 + 900);
check("руки собраны", (await handCount(A)) === 0 && (await handCount(B)) === 0, null);
check("в колоде 54", (await spots(B)).deck === 54, (await spots(B)).deck);
check("перемешивание было видно", (await B.evaluate(() => window.__shuffles)) >= 8, await B.evaluate(() => window.__shuffles));

// ── 3. Дурак от лица B: по 6, козырь под колоду; курсор с именем B у обоих, след «двигал Bee» ──
await A.evaluate(() => window.__tags.clear());
await B.evaluate(() => window.__tags.clear());
check("дурак от лица B — ok", (await run({ t: "deal", rule: "durak", dealer: "@bee", asDealer: true })).ok === true, null);
await A.waitForTimeout(13 * 150 + 1000);
check("по 6 каждому", (await handCount(A)) === 6 && (await handCount(B)) === 6, [await handCount(A), await handCount(B)]);
const trump = (await spots(A)).felt;
check("козырь — одна карта поперёк", trump.length === 1 && Math.abs(Math.abs(trump[0].angle) - 90) < 1, trump);
check("в колоде 54 − 12 − 1", (await spots(A)).deck === 41, (await spots(A)).deck);
check("A видел курсор с именем Bee", (await A.evaluate(() => [...window.__tags])).includes("Bee"), await A.evaluate(() => [...window.__tags]));
check("и сам Bee видел свой курсор раздачи", (await B.evaluate(() => [...window.__tags])).includes("Bee"), await B.evaluate(() => [...window.__tags]));
const t0 = trump[0];
const dt = (await spots(A)).deckTop;
await A.mouse.move(t0.x + (t0.x - dt.x) * 0.6, t0.y + (t0.y - dt.y) * 0.6);
await A.mouse.down();
await A.mouse.up();
await A.waitForTimeout(300);
const tip = await A.evaluate(() => document.querySelector('[data-g="card-tip"]')?.textContent ?? null);
check("тап по торчащему козырю — его тултип: лицом, двигал Bee", tip && !/Рубашкой/.test(tip) && /двигал Bee/.test(tip), tip);

// ── 4. Поза чужой руки: у админа — в окне стула, у самой руки; у не-админа её там нет ─────────────
const bSeat = (await spots(A)).seats.find((x) => x.who === "Bee");
await A.mouse.click(bSeat.x, bSeat.y);
await A.waitForTimeout(400);
check("у админа в окне стула B — поза руки", (await A.locator(`[data-pose][data-chair="${bSeat.key}"]`).count()) === 3, null);
await A.locator(`[data-pose="shrink"][data-chair="${bSeat.key}"]`).dispatchEvent("pointerdown");
await B.waitForTimeout(500);
const bCards = await B.evaluate(() => [...document.querySelectorAll("[data-card]")].filter((el) => el.getBoundingClientRect().top > 600).map((el) => Math.round(el.getBoundingClientRect().left)));
check("админ сжал руку B — у B она стопкой", bCards.length === 6 && new Set(bCards).size === 1, bCards);
const aSpot = (await spots(B)).seats.find((x) => x.who === "Admin");
await B.mouse.click(aSpot.x, aSpot.y);
await B.waitForTimeout(400);
check("у не-админа в окне чужого стула позы нет", (await B.locator("[data-pose]").count()) === 0, null);

const bad = checks.filter((c) => !c.ok);
for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
console.log(`tableCommands ${checks.length - bad.length}/${checks.length}`);
await browser.close();
process.exit(bad.length ? 1 : 0);
