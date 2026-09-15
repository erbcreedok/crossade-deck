// НАЖАТОЕ — СРАЗУ, ДАЖЕ НА МЕДЛЕННОЙ СЕТИ. Всё, что страница шлёт серверу, задерживается на `LAG` мс. Поза,
// флаг и порядок руки должны смениться на экране до ответа сервера, а сам ответ — лечь на нарисованное без
// второго перелёта. Отказ сервера откатывает догадку.
//   TABLE_SECRET=dev TABLE_GUESTS=1 PORT=2599 npx tsx src/index.ts   (в соседнем окне)
//   node scripts/tableLag.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const secret = process.argv[3] ?? "dev";
const LAG = 500;
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);

const browser = await chromium.launch();
const open = async (name, lag) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message));
  await p.addInitScript((lag) => {
    window.__lag = 0;
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      if (!window.__lag) return send.call(this, data);
      setTimeout(() => send.call(this, data), window.__lag);
    };
    // Перелёты по времени: сколько карт вылетело и когда.
    window.__flights = [];
    addEventListener("DOMContentLoaded", () => new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => n.dataset?.flight && window.__flights.push(performance.now())))).observe(document.body, { childList: true, subtree: true }));
  }, lag);
  await p.goto(`${base}/table/?room=${room}&name=${name}`);
  await p.waitForSelector("[data-section]");
  await p.waitForTimeout(400);
  return p;
};
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const spots = async (p) => JSON.parse(await p.getAttribute("canvas", "data-spots"));
const wait = (p, ms) => p.waitForTimeout(ms);
const hand = (p) => p.evaluate(() => [...document.querySelectorAll("[data-card]")]
  .filter((el) => el.getBoundingClientRect().top > 560)
  .map((el) => ({ id: el.dataset.card, x: Math.round(el.getBoundingClientRect().left) }))
  .sort((a, b) => a.x - b.x));
/** Нажать и через `after` мс снять: что на экране и сколько перелётов с нажатия. */
const press = async (p, sel, after = 60) => {
  const t0 = await p.evaluate((sel) => {
    const t = performance.now();
    document.querySelector(sel).click();
    return t;
  }, sel);
  await wait(p, after);
  return t0;
};
const flightsSince = (p, from, to = Infinity) => p.evaluate(([from, to]) => window.__flights.filter((t) => t >= from && t < to).length, [from, to]);

const A = await open("A");
const B = await open("B");
const m = (await spots(A)).middle;
for (let i = 0; i < 5; i += 1) {
  await A.mouse.move(m.x, m.y);
  await A.mouse.down();
  await A.mouse.move(195, 700, { steps: 8 });
  await A.mouse.up();
  await wait(A, 500);
}
await A.evaluate((lag) => (window.__lag = lag), LAG);

// ── 1. Поза: сжать — стопкой через 60 мс, после ответа сервера ничего не летит второй раз ────────────
await A.click('[data-section="pose"]');
await wait(A, 400);
let t0 = await press(A, '[data-bar="shrink"]');
let cs = await hand(A);
check("сжать: через 60 мс рука уже стопкой", cs.length === 5 && new Set(cs.map((c) => c.x)).size === 1, cs);
check("кнопка горит сразу", (await A.getAttribute('[data-bar="shrink"]', "aria-pressed")) === "true", null);
await wait(A, LAG + 700);
const tSettled = await A.evaluate(() => performance.now());
check("ответ сервера: рука так и стопкой", new Set((await hand(A)).map((c) => c.x)).size === 1, await hand(A));
check("ответ сервера не запустил второй перелёт", (await flightsSince(A, t0 + 300, tSettled)) === 0, await flightsSince(A, t0 + 300, tSettled));
t0 = await press(A, '[data-bar="shrink"]');
check("разжать — сразу", new Set((await hand(A)).map((c) => c.x)).size === 5, await hand(A));
await wait(A, LAG + 700);
await A.click('[data-section="pose"]');
await wait(A, 400);

// ── 2. Порядок: по номиналу и шафл — карты летят сразу; ответ сервера не гоняет их второй раз ───────
await A.click('[data-section="order"]');
await wait(A, 400);
for (const how of ["rank", "shuffle", "reverse"]) {
  const before = (await hand(A)).map((c) => c.id).join();
  t0 = await press(A, `[data-bar="${how}"]`, 80);
  const early = await flightsSince(A, t0);
  await wait(A, 400);
  const guessed = (await hand(A)).map((c) => c.id).join();
  await wait(A, LAG + 600);
  const late = await flightsSince(A, t0 + 380);
  const final = (await hand(A)).map((c) => c.id).join();
  check(`${how}: карты полетели до ответа сервера`, early > 0, early);
  check(`${how}: после ответа порядок тот же, второго перелёта нет`, guessed === final && late === 0 && (how === "rank" || guessed !== before), { before, guessed, final, late });
}

// ── 3. Флаг: лок горит сразу ─────────────────────────────────────────────────────────────────────
await A.click('[data-section="order"]');
await wait(A, 400);
await A.click('[data-section="chair"]');
await wait(A, 400);
await press(A, '[data-bar="lock"]');
check("лок: горит через 60 мс", (await A.getAttribute('[data-bar="lock"]', "aria-pressed")) === "true", null);
await wait(A, LAG + 600);
check("лок: горит и после ответа", (await A.getAttribute('[data-bar="lock"]', "aria-pressed")) === "true", null);

// ── 4. Сервер и клиент считают порядок одинаково: B видит у A тот же порядок, что A нарисовал ──────────
await A.click('[data-section="chair"]');
await wait(A, 400);
await A.click('[data-section="order"]');
await wait(A, 400);
await press(A, '[data-bar="suit"]', LAG + 900);
const aIds = (await hand(A)).map((c) => c.id);
const bSeat = (await spots(B)).seats.find((x) => x.who === "A");
await B.mouse.click(bSeat.x, bSeat.y);
await wait(B, 500);
const bIds = await B.evaluate((key) => [...document.querySelectorAll(`[data-card][data-owner="${key}"]`)].map((el) => ({ id: el.dataset.card, x: el.getBoundingClientRect().left })).sort((p, q) => q.x - p.x).map((c) => c.id), bSeat.key);
check("по масти: у B (с сервера) тот же порядок, что у A нарисован", bIds.join() === aIds.join(), { aIds, bIds });

// ── 5. Отказ откатывает: сервер отказывает шафлу, в котором не те карты ─────────────────────────────
await A.evaluate(() => {
  const send = WebSocket.prototype.send;
  window.__spoil = true;
  WebSocket.prototype.send = function (data) {
    // Порядок шафла портится на лету: сервер его отвергнет, а экран уже показал свою догадку.
    if (window.__spoil && (data instanceof ArrayBuffer || ArrayBuffer.isView(data))) {
      data = data instanceof ArrayBuffer ? new Uint8Array(data.slice(0)) : new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
      const text = new TextDecoder().decode(data);
      if (text.includes("shuffle")) {
        const i = text.indexOf("ids");
        if (i >= 0) {
          const bytes = data;
          const j = bytes.findIndex((b, k) => k > i + 6 && b >= 97 && b <= 122);
          if (j >= 0) bytes[j] = bytes[j] === 122 ? 121 : bytes[j] + 1;
          return send.call(this, bytes);
        }
      }
    }
    return send.call(this, data);
  };
});
const settledIds = (await hand(A)).map((c) => c.id).join();
await press(A, '[data-bar="shuffle"]', 80);
const guessedIds = (await hand(A)).map((c) => c.id).join();
await wait(A, LAG + 900);
const backIds = (await hand(A)).map((c) => c.id).join();
check("отказ: догадка была видна, потом рука вернулась к порядку стола", guessedIds !== settledIds && backIds === settledIds, { settledIds, guessedIds, backIds });

await browser.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
}
console.log(`tableLag ${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
