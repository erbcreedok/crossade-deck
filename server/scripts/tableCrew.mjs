// НАБОР КРУПЬЕ: кнопки в его окне, сбор колоды в руку и выкладка стопкой на стол.
//
// Набор — деталь конструктора, отдельная от игры: комната крестового может взять крупье от другой
// игры. Поэтому здесь меряется не «крестовый умеет», а «комната показала то, что в её наборе».
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableCrew.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const secret = process.argv[3] ?? "dev";
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

/** Комната нужного рода и набора. */
async function open(kind, crew) {
  const body = randomBytes(8).toString("base64url");
  const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);
  await fetch(`${base}/table/rooms`, {
    method: "POST",
    headers: { "x-table-secret": secret, "content-type": "application/json" },
    body: JSON.stringify({ by: "tg:1", home: { kind: "inline", message: "m" }, kind, ...(crew ? { crew } : {}), room }),
  });
  return room;
}

/** Дверь Telegram: комнату открывает tg:1, и этой же дверью входит админ. */
const initData = (() => {
  const user = JSON.stringify({ id: 1, first_name: "Админ" });
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), query_id: "AA", user };
  const line = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update("test").digest();
  return new URLSearchParams({ ...fields, hash: createHmac("sha256", key).update(line).digest("hex") }).toString();
})();

const browser = await chromium.launch();
/** Страница, вошедшая админом комнаты. */
async function asAdmin() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("https://telegram.org/**", (r) => r.abort());
  await page.addInitScript((data) => {
    window.Telegram = {
      WebApp: {
        initData: data, initDataUnsafe: {}, platform: "ios", version: "8.0",
        ready() {}, expand() {}, disableVerticalSwipes() {}, isVersionAtLeast: () => true,
        onEvent() {}, SettingsButton: { show() {}, onClick() {} },
        HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
      },
    };
  }, initData);
  return page;
}
const seat = async (p) => {
  await p.waitForSelector("[data-section]");
  await p.waitForTimeout(900);
};
const spots = async (p) => JSON.parse(await p.getAttribute("canvas", "data-spots"));
/** Открыть окно крупье: тап по его аватару на столе. */
const openCroupier = async (p) => {
  const who = (await spots(p)).seats.find((s) => s.croupier);
  await p.mouse.click(who.x, who.y);
  await p.waitForTimeout(500);
  return who;
};
const crewButtons = (p) => p.evaluate(() => [...document.querySelectorAll("[data-crew]")].map((e) => ({ act: e.dataset.crew, name: e.textContent.trim() })));

// ── Крестовый: свой набор ────────────────────────────────────────────────────────────────────────
const p = await asAdmin();
p.on("pageerror", (e) => console.log("ERROR", e.message));
await p.goto(`${base}/table/?room=${await open("krest")}`);
await seat(p);
await openCroupier(p);
const acts = await crewButtons(p);
check("у крупье крестового две кнопки", acts.length === 2, acts);
check("и это «Собрать колоду» и «Выложить карты на стол»", acts.map((a) => a.act).join(",") === "collect,layout", acts);

// Собрать: все карты должны оказаться в руке крупье.
const before = await spots(p);
// Кнопки слушают pointerdown; карты руки могут лежать поверх, и обычный click до них не доходит.
await p.locator('[data-crew="collect"]').dispatchEvent("pointerdown");
await p.waitForTimeout(5000);
const after = await spots(p);
const croupierHand = after.seats.find((s) => s.croupier)?.hand ?? 0;
check("собрал ВСЮ колоду себе в руку", croupierHand === 36, { croupierHand, deck: after.deck });
check("на столе не осталось ни карты", after.deck === 0 && after.felt.length === 0, after);
check("колода со стола ушла, а была", before.deck === 36, before.deck);

// Выложить: рука уходит одной закрытой стопкой на сукно.
// Окно крупье уже открыто — второй тап по его месту попал бы в само окно, а не по аватару.
await p.locator('[data-crew="layout"]').dispatchEvent("pointerdown");
await p.waitForTimeout(1200);
const laid = await spots(p);
check("выложил всю руку на стол", (laid.seats.find((s) => s.croupier)?.hand ?? 0) === 0, laid.seats);
const laidPile = (laid.piles ?? []).find((x) => x.id !== "ring" && x.id !== "deck");
check("и это одна стопка из всех карт, рубашкой вверх", laidPile?.count === 36 && laidPile.up.length === 0, laid.piles);

// ── Песочница: набор пустой, кнопок нет ──────────────────────────────────────────────────────────
const q = await browser.newPage({ viewport: { width: 390, height: 844 } });
await q.goto(`${base}/table/?room=${await open("sandbox")}&name=B`);
await seat(q);
await openCroupier(q);
check("у крупье песочницы дел нет — и кнопок нет", (await crewButtons(q)).length === 0, await crewButtons(q));

// ── Набор — деталь конструктора: крестовый с крупье песочницы ────────────────────────────────────
const r = await browser.newPage({ viewport: { width: 390, height: 844 } });
await r.goto(`${base}/table/?room=${await open("krest", "sandbox")}&name=C`);
await seat(r);
await openCroupier(r);
check("КРЕСТОВЫЙ С КРУПЬЕ ПЕСОЧНИЦЫ — законная комната, и кнопок в ней нет", (await crewButtons(r)).length === 0, await crewButtons(r));

await browser.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(c.ok ? "  ok" : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
}
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
