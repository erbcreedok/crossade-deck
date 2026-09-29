// «ВСЕ СТОЛЫ» — страница хозяина: хозяин по подписи Telegram видит столы, кто сидел и записи партий,
// и «Смотреть» открывает запись; не хозяин — отказ.
//   TABLE_OWNERS=tg:7 TABLE_SECRET=probe TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test CROSSADE_DB_FILE=":memory:" PORT=2597 npx tsx src/index.ts
//   node scripts/tableAdmin.mjs [base] [secret] [shot.png]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2597";
const secret = process.argv[3] ?? "probe";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "test";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const ask = (p, i = {}) => fetch(base + p, { ...i, headers: { "x-table-secret": secret, "content-type": "application/json" } });
function initData(id, name) {
  const f = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: name, username: name.toLowerCase() }) };
  const sum = Object.keys(f).sort().map((k) => `${k}=${f[k]}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  return new URLSearchParams({ ...f, hash: createHmac("sha256", key).update(sum).digest("hex") }).toString();
}

await ask("/table/rooms", { method: "POST", body: JSON.stringify({ by: "tg:7", home: { kind: "inline", message: "m" }, kind: "krest", room }) });
const browser = await chromium.launch();
const open = async (id, name) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message));
  await p.addInitScript((d) => {
    const a = {};
    Object.defineProperty(a, "WebApp", { value: { initData: d, initDataUnsafe: {}, ready() {}, expand() {} } });
    Object.defineProperty(window, "Telegram", { value: a });
  }, initData(id, name));
  await p.goto(`${base}/table/?room=${room}&name=${name}`);
  await p.waitForSelector("[data-section]");
  await p.waitForSelector(".crossade-loading", { state: "detached" });
  await p.waitForTimeout(500);
  return p;
};
const Ye = await open(7, "Ye");
const Bo = await open(8, "Bo");
const state = (p) => p.evaluate(() => JSON.parse(JSON.stringify(window.__tableState())));

// ПАРТИЯ ИЗ ДВУХ ХОДОВ: по карте каждому, оба кладут в круг — руки пусты, партия кончилась.
const seats = (await state(Ye)).chairs.filter((c) => c.owner === "tg:7" || c.owner === "tg:8").map((c) => c.id);
check("раздача принята", (await (await ask(`/table/rooms/${room}/run`, { method: "POST", body: JSON.stringify({ by: "tg:7", command: { t: "deal", rule: "each", n: 1, seats, force: true } }) })).json()).ok === true);
await Ye.waitForTimeout(2500);
for (let i = 0; i < 2; i += 1) {
  const s = await state(Ye);
  const turn = s.play?.turn;
  const page = turn === "tg:7" ? Ye : Bo;
  const card = s.chairs.find((c) => c.owner === turn)?.hand[0]?.id;
  await page.evaluate((id) => {
    window.__tableSend({ t: "grab", id });
    window.__tableSend({ t: "drop", id, to: { in: "deck", pile: "ring" } });
  }, card);
  await page.waitForTimeout(800);
}
await Ye.waitForTimeout(2500); // журнал уходит в базу пачкой раз в две секунды


/** Страница хозяина, открытая «из Telegram» — с подписью этого человека. */
const admin = async (id) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log("admin ERROR", e.message));
  await p.route("https://telegram.org/**", (r) => r.abort());
  await p.addInitScript((d) => {
    window.Telegram = { WebApp: { initData: d, initDataUnsafe: {}, ready() {}, expand() {} } };
  }, initData(id, "Кто-то"));
  await p.goto(`${base}/table/admin`);
  await p.click('[data-tab="rooms"]');
  await p.waitForTimeout(1500);
  return p;
};
const stranger = await admin(99);
check("не хозяину — отказ", /только хозяевам/.test(await stranger.textContent("#итог")), await stranger.textContent("#итог"));

const A = await admin(7);
const card = A.locator(".стол", { hasText: "Ye" }).first();
check("хозяин видит стол, за которым играли", (await card.count()) === 1, await A.textContent("#список"));
const text = await card.textContent();
check("в нём — кто бывал и сколько партий", /Бывали:.*Ye.*Bo/.test(text) && /партий сыграно:\s*1/.test(text), text);
await card.locator("summary").click();
const watch = card.locator("a.главная").first();
check("у партии — «Смотреть» глазами крупье и глазами каждого игрока", (await watch.count()) === 1 && (await card.locator(".глаза a").count()) === 3, await card.locator(".глаза a").allTextContents());
await A.screenshot({ path: process.argv[4] ?? "admin.png" });
const href = await watch.getAttribute("href");
const R = await browser.newPage({ viewport: { width: 1000, height: 800 } });
const errors = [];
R.on("pageerror", (e) => errors.push(e.message));
await R.goto(href);
await R.waitForTimeout(2500);
const eyes = await R.evaluate(() => [...document.querySelectorAll("#eyes option")].find((o) => o.selected)?.textContent ?? null);
check("«Смотреть» открывает запись этой партии глазами крупье", errors.length === 0 && eyes?.includes("крупье") === true, [errors, eyes]);

await browser.close();
for (const one of checks) console.log(one.ok ? "✓" : "✗", one.name, one.ok ? "" : JSON.stringify(one.got));
console.log(`${checks.filter((one) => one.ok).length}/${checks.length}`);
if (checks.some((one) => !one.ok)) process.exitCode = 1;
