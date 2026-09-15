// БЫСТРАЯ РУКА НА МЕДЛЕННОЙ СЕТИ. Всё, что A шлёт серверу, задерживается на `LAG` мс. Карты с колоды тянутся подряд,
// не дожидаясь ответа, — каждая следующая с колоды, а не та же; переворот, сборка в стопку и мерж стопки видны сразу,
// а ответ сервера ложится на нарисованное.
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableFast.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const secret = process.argv[3] ?? "dev";
const LAG = 700;
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);

const browser = await chromium.launch();
const open = async (name) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message));
  await p.addInitScript(() => {
    window.__lag = 0;
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      if (!window.__lag) return send.call(this, data);
      setTimeout(() => send.call(this, data), window.__lag);
    };
  });
  await p.goto(`${base}/table/?room=${room}&name=${name}`);
  await p.waitForSelector("[data-section]");
  await p.waitForSelector(".crossade-loading", { state: "detached" });
  await p.waitForTimeout(500);
  return p;
};
const checks = [];
for (const ev of ["unhandledRejection", "uncaughtException"]) process.on(ev, (e) => {
  for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
  console.log("CRASH", e.message);
  process.exit(1);
});
const check = (name, ok, got) => checks.push({ name, ok, got });
const wait = (p, ms = 300) => p.waitForTimeout(ms);
const spots = async (p) => JSON.parse(await p.getAttribute("canvas", "data-spots"));
const quick = async (p, from, to) => {
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  await p.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 3 });
  await p.mouse.move(to.x, to.y, { steps: 3 });
  await p.mouse.up();
};

const A = await open("A");
const B = await open("B");
let sa = await spots(A);
const { k, middle: mid } = sa;
const at = (dx, dy) => ({ x: mid.x + dx * k, y: mid.y + dy * k });
await A.evaluate((lag) => (window.__lag = lag), LAG);

// ── 1. Три карты с колоды подряд, быстрее ответа сервера ──────────────────────────────────────────────
const deck0 = sa.deck;
for (const dx of [-2.4, 0, 2.4]) {
  await quick(A, (await spots(A)).deckTop, at(dx, 2.2));
  await wait(A, 60);
}
sa = await spots(A);
const ids = sa.felt.map((f) => f.id);
check("до ответа сервера у A на сукне три разные карты, в колоде на три меньше", ids.length === 3 && new Set(ids).size === 3 && sa.deck === deck0 - 3, { ids, deck: sa.deck });
await wait(B, LAG + 900);
let sb = await spots(B);
check("после ответа у B — те же три карты, колода на три меньше", sb.felt.map((f) => f.id).sort().join() === ids.sort().join() && sb.deck === deck0 - 3, { b: sb.felt.map((f) => f.id), ids, deck: sb.deck });
sa = await spots(A);
check("у A ничего не вернулось на колоду", sa.felt.length === 3 && sa.deck === deck0 - 3, sa.felt.map((f) => f.id));

// ── 2. Двойной тап — переворот начинается сразу ─────────────────────────────────────────────────────
const f0 = sa.felt[0];
await A.mouse.click(f0.x, f0.y);
await wait(A, 60);
await A.mouse.click(f0.x, f0.y);
await wait(A, 80);
sa = await spots(A);
check("до ответа сервера карта уже переворачивается", sa.turning.includes(f0.id) && sa.felt.find((f) => f.id === f0.id).up === true, { turning: sa.turning, felt: sa.felt });
await wait(A, LAG + 900);
sa = await spots(A);
check("после ответа — лицом у A, с лицом, и переворот закончен", sa.felt.find((f) => f.id === f0.id).face !== null && !sa.turning.includes(f0.id), sa.felt);
check("и у B лицом", (await spots(B)).felt.find((f) => f.id === f0.id).up === true, null);

// ── 3. Сборка в стопку лассо — стопка сразу ─────────────────────────────────────────────────────────
await A.click('[data-section="lasso"]');
await wait(A, 300);
sa = await spots(A);
for (const f of sa.felt.slice(1)) {
  await A.mouse.click(f.x, f.y);
  await wait(A, 120);
}
await A.locator('[data-lasso-act="gather"]').dispatchEvent("pointerdown");
await wait(A, 80);
sa = await spots(A);
const guessed = sa.piles.find((p) => p.id !== "deck");
check("до ответа сервера у A стопка из двух, на сукне одна", guessed?.count === 2 && sa.felt.length === 1, { piles: sa.piles.map((p) => [p.id, p.count]), felt: sa.felt.length });
await wait(A, LAG + 1200);
sa = await spots(A);
sb = await spots(B);
const real = sb.piles.find((p) => p.id !== "deck");
check("после ответа стопка та же у A и B", real?.count === 2 && sa.piles.find((p) => p.id === real.id)?.count === 2 && sa.piles.length === 2, { a: sa.piles.map((p) => [p.id, p.count]), b: sb.piles.map((p) => [p.id, p.count]) });
await A.click('[data-section="lasso"]');
await wait(A, 1000);

// ── 4. Мерж стопки в колоду — сразу ─────────────────────────────────────────────────────────────────
const grip = await A.locator(`[data-g="deck-grip"][data-pile="${real.id}"]`).boundingBox();
const top = (await spots(A)).deckTop;
const deck4 = (await spots(A)).deck;
await A.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
await A.mouse.down();
await A.mouse.move(grip.x + grip.width / 2, grip.y - 30, { steps: 4 });
await A.mouse.move(top.x, top.y + 12, { steps: 10 });
await wait(A, 100);
await A.mouse.up();
await wait(A, 80);
sa = await spots(A);
check("до ответа сервера стопка уже в колоде у A", sa.deck === deck4 + 2 && !sa.piles.some((p) => p.id === real.id), { deck: sa.deck, piles: sa.piles.map((p) => p.id) });
await wait(A, LAG + 1000);
sa = await spots(A);
sb = await spots(B);
check("после ответа — так же у A и B", sa.deck === deck4 + 2 && sb.deck === deck4 + 2 && sb.piles.length === 1, { a: sa.deck, b: sb.deck });

await browser.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
}
console.log(`tableFast ${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
