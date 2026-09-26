// РОГАТКА — бросок карты из руки в ЦЕНТР КАМЕРЫ. Палец вышел под карту — карта пружинит на месте, видна точка
// попадания и растущая полупрозрачная стрелка, идёт вибрация; подержал — зарядилась: контур и толчок «готово»,
// и только теперь отпускание бросает (у ВСЕХ, с ударом). Раньше отпустил, вернул палец на карту — отмена; цель
// мимо сукна — отказ с вибрацией ошибки. Контур виден — карта улетит.
//   TABLE_SECRET=probe TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test CROSSADE_DB_FILE=":memory:" PORT=2597 npx tsx src/index.ts
//   node scripts/tableSling.mjs [base] [secret] [shot.png]
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
const run = async (command) => (await ask(`/table/rooms/${room}/run`, { method: "POST", body: JSON.stringify({ by: "tg:7", command }) })).json();
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
    // Телефон в Telegram — иначе вибрация молчит, и прогону нечего сверить.
    const haptic = { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} };
    Object.defineProperty(a, "WebApp", { value: { initData: d, initDataUnsafe: {}, ready() {}, expand() {}, platform: "ios", version: "8.0", isVersionAtLeast: () => true, HapticFeedback: haptic, onEvent() {} } });
    Object.defineProperty(window, "Telegram", { value: a });
  }, initData(id, name));
  await p.goto(`${base}/table/?room=${room}&name=${name}`);
  await p.waitForSelector("[data-section]");
  await p.waitForSelector(".crossade-loading", { state: "detached" });
  await p.waitForTimeout(500);
  return p;
};
const A = await open(7, "Ye");
const B = await open(8, "Bo");
const state = (p) => p.evaluate(() => JSON.parse(JSON.stringify(window.__tableState())));
const seats = (await state(A)).chairs.filter((c) => c.owner === "tg:7" || c.owner === "tg:8").map((c) => c.id);
check("двое за столом", seats.length === 2, seats);
check("раздача принята", (await run({ t: "deal", rule: "each", n: 3, seats, force: true })).ok === true);
await A.waitForTimeout(3500);

const slams = (p) => p.evaluate(() => (window.__tableSounds ?? []).filter((one) => one.kind === "slam").length);
const sling = (p) => p.evaluate(() => {
  const el = document.querySelector("[data-sling]");
  return el ? { charge: Number(el.dataset.charge), armed: el.dataset.armed === "true", valid: el.dataset.valid === "true", land: el.dataset.land } : null;
});
const outline = (p) => p.evaluate(() => document.querySelector("[data-felt-mark], [data-g=ring-slot]") !== null);
const buzzes = (p) => p.evaluate(() => [...(window.__tableHaptics ?? [])]);
const mineChair = (await state(A)).chairs.find((c) => c.owner === "tg:7").id;
const myHand = async () => (await state(A)).chairs.find((c) => c.owner === "tg:7").hand.map((c) => c.id);
/** Карта моей руки на экране: середина и нижний край. */
const card = async () => {
  const box = await A.locator(`[data-card][data-owner="${mineChair}"]`).first().boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, bottom: box.y + box.height };
};
const carryTop = () => A.evaluate(() => document.querySelector("[data-g=carry]")?.getBoundingClientRect().top ?? null);
const before = await myHand();

// ── 1. Палец в пределах карты — натяга нет ─────────────────────────────────────────────────────────
let c = await card();
await A.mouse.move(c.x, c.y);
await A.mouse.down();
await A.mouse.move(c.x, c.bottom - 6, { steps: 4 });
check("палец ещё на карте — натяга нет", (await sling(A)) === null, await sling(A));

// ── 2. Вышел под карту — точка, стрелка вполсилы, без контура; карта стоит; вибрация пошла ─────────────
const top0 = await carryTop();
await A.mouse.move(c.x, c.bottom + 60, { steps: 6 });
await A.waitForTimeout(120);
let sl = await sling(A);
check("под картой — точка попадания и стрелка, заряд ещё идёт", sl !== null && !sl.armed && sl.charge > 0 && sl.charge < 1, sl);
check("…контура места ещё нет", !(await outline(A)));
const top1 = await carryTop();
check("карта за пальцем не поехала — только пружинит", top0 !== null && top1 !== null && top1 - top0 <= 15, { top0, top1 });
check("натяг вибрирует", (await buzzes(A)).includes("light"), await buzzes(A));

// ── 3. Отпустил, не дождавшись — отмена ───────────────────────────────────────────────────────────
await A.mouse.up();
await A.waitForTimeout(900);
check("отпустил раньше заряда — карта в руке, удара нет", (await myHand()).length === before.length && (await slams(A)) === 0, [before.length, (await myHand()).length]);
check("…и вибрация отмены", (await buzzes(A)).includes("warning"), await buzzes(A));

// ── 4. Подержал — зарядилась: контур, толчок «готово», бросок в центр камеры ────────────────────────
c = await card();
const thrown = await A.locator(`[data-card][data-owner="${mineChair}"]`).first().getAttribute("data-card");
await A.mouse.move(c.x, c.y);
await A.mouse.down();
await A.mouse.move(c.x, c.bottom + 60, { steps: 6 });
await A.waitForTimeout(1500);
sl = await sling(A);
check("подержал — заряжена", sl?.armed === true && sl.valid === true, sl);
check("…контур места появился", await outline(A));
check("…и толчок «готово»", (await buzzes(A)).includes("success"), await buzzes(A));
const land = sl.land.split(",").map(Number);
check("цель — центр камеры, а не куда тянул палец", Math.abs(land[0] - 195) < 40, sl.land);
await A.mouse.up();
await A.waitForTimeout(1300);
const onB = [...(await state(B)).felt, ...(await state(B)).piles.flatMap((p) => p.cards)].some((one) => one.id === thrown);
check("бросок: у соседа карта на столе", onB, thrown);
check("удар у обоих", (await slams(A)) === 1 && (await slams(B)) === 1, [await slams(A), await slams(B)]);

// ── 5. Зарядил и вернул палец на карту — натяга нет, не улетает ──────────────────────────────────────
c = await card();
const handNow = (await myHand()).length;
await A.mouse.move(c.x, c.y);
await A.mouse.down();
await A.mouse.move(c.x, c.bottom + 60, { steps: 6 });
await A.waitForTimeout(1500);
check("снова заряжена", (await sling(A))?.armed === true);
await A.mouse.move(c.x, c.y, { steps: 6 });
check("палец снова на карте — натяга нет", (await sling(A)) === null);
await A.mouse.up();
await A.waitForTimeout(900);
check("…и карта не улетела", (await myHand()).length === handNow && (await slams(A)) === 1, [(await myHand()).length, handNow]);

// ── 6. Центр камеры мимо сукна — точка красная; заряженный бросок отказывает ──────────────────────────
await A.mouse.move(195, 250);
for (let i = 0; i < 12; i += 1) { await A.mouse.wheel(0, -400); await A.waitForTimeout(40); }
await A.waitForTimeout(500);
c = await card();
await A.mouse.move(c.x, c.y);
await A.mouse.down();
await A.mouse.move(c.x, c.bottom + 60, { steps: 6 });
await A.waitForTimeout(1500);
sl = await sling(A);
check("цель мимо сукна — точка красная, заряд всё равно идёт", sl?.valid === false && sl.armed === true, sl);
check("…и контура места нет", !(await outline(A)));
await A.mouse.up();
await A.waitForTimeout(900);
check("отпустил — отказ: карта в руке, удара нет", (await myHand()).length === handNow && (await slams(A)) === 1, [(await myHand()).length, handNow]);
check("…вибрация ошибки", (await buzzes(A)).includes("error"), await buzzes(A));

await browser.close();
for (const one of checks) console.log(one.ok ? "✓" : "✗", one.name, one.ok ? "" : JSON.stringify(one.got));
console.log(`${checks.filter((one) => one.ok).length}/${checks.length}`);
if (checks.some((one) => !one.ok)) process.exitCode = 1;
