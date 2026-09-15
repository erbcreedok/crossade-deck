// ИНДИКАТОР КОЛОДЫ — два браузера. Тап — тултип колоды картами; двойной тап — колода перевёрнута у всех;
// тяга — колода едет по сукну и встаёт у всех, в руку не ложится, камера и карты не трогаются; кнопки
// тултипа — перемешать, отсортировать, перевернуть; вечность — значком.
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableGrip.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const secret = process.argv[3] ?? "dev";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);

const browser = await chromium.launch();
const open = async (name) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message));
  await p.goto(`${base}/table/?room=${room}&name=${name}`);
  await p.waitForSelector("[data-section]");
  await p.waitForSelector(".crossade-loading", { state: "detached" });
  await p.waitForTimeout(400);
  return p;
};
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const wait = (p, ms = 300) => p.waitForTimeout(ms);
const spots = async (p) => JSON.parse(await p.getAttribute("canvas", "data-spots"));
const gripBox = async (p) => p.locator('[data-g="deck-grip"]').boundingBox();
const tap = async (p) => {
  const b = await gripBox(p);
  await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
};
const tipCards = (p) => p.evaluate(() => [...document.querySelectorAll("[data-deck-card] [role=img]")].map((el) => el.getAttribute("aria-label")));

const A = await open("A");
const B = await open("B");

// ── 1. Индикатор под колодой ─────────────────────────────────────────────────────────────────────
let s = await spots(A);
let g = await gripBox(A);
check("индикатор есть: 36 карт, вечная", (await A.getAttribute('[data-g="deck-grip"]', "data-count")) === "36" && (await A.getAttribute('[data-g="deck-grip"]', "data-forever")) === "true", g);
check("индикатор под колодой, по её середине", g && g.y > s.deckTop.y && Math.abs(g.x + g.width / 2 - s.deckTop.x) < 20, { g, top: s.deckTop });

// ── 2. Тап — тултип колоды картами, как лежат: рубашкой ─────────────────────────────────────────
await tap(A);
await wait(A, 450);
let cards = await tipCards(A);
check("тап открыл тултип колоды: 36 карт рубашкой", (await A.locator('[data-g="deck-tip"]').count()) === 1 && cards.length === 36 && cards.every((c) => c === "рубашка"), cards.slice(0, 3));
check("тап не взял карту и не открыл тултип карты", (await spots(A)).deck === 36 && (await A.locator('[data-g="card-tip"]').count()) === 0, null);
await A.locator("[data-deck-shut]").dispatchEvent("pointerdown");
await wait(A, 100);
check("«Закрыть» закрыл тултип", (await A.locator('[data-g="deck-tip"]').count()) === 0, null);

// ── 3. Двойной тап — колода перевёрнута у всех ─────────────────────────────────────────────────
await tap(A);
await wait(A, 80);
await tap(A);
await wait(B, 600);
const sb = await spots(B);
check("двойной тап: у B верхняя колоды лицом вверх", sb.deckFace !== null && sb.deck === 36, sb.deckFace);
cards = await tipCards(A);
check("и в тултипе у A колода лицами (тултип открыл первый тап)", cards.length === 36 && cards.every((c) => c !== "рубашка"), cards.slice(0, 3));

// ── 4. Отсортировать: по масти, внутри — по номиналу ───────────────────────────────────────────
await A.locator('[data-deck-do="sort"]').dispatchEvent("pointerdown");
await wait(A, 500);
cards = await tipCards(A);
const SIGN = "♠♥♦♣";
const RANK = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const keyOf = (label) => SIGN.indexOf(label.slice(-1)) * 100 + RANK.indexOf(label.slice(0, -1));
check("отсортировано по масти, внутри по номиналу", cards.length === 36 && cards.every((c, i) => i === 0 || keyOf(cards[i - 1]) <= keyOf(c)), cards.slice(0, 10));

// ── 5. Перевернуть кнопкой — снова рубашкой у всех ─────────────────────────────────────────────
await A.locator('[data-deck-do="flip"]').dispatchEvent("pointerdown");
await wait(B, 600);
check("кнопка «перевернуть»: у B верх снова рубашкой", (await spots(B)).deckFace === null, null);

// ── 6. Перемешать — у B играется перемешивание ─────────────────────────────────────────────────
await A.locator('[data-deck-do="shuffle"]').dispatchEvent("pointerdown");
await wait(B, 250);
check("кнопка «перемешать»: у B колода расходится", (await B.locator("[data-shuffle]").count()) > 0, null);
await wait(A, 1300);

// ── 7. Вечность значком — у B снята ────────────────────────────────────────────────────────────
await A.locator("[data-deck-forever]").dispatchEvent("pointerdown");
await wait(B, 400);
check("вечность снята у всех", (await B.getAttribute('[data-g="deck-grip"]', "data-forever")) === "false" && (await A.locator("[data-deck-forever]").getAttribute("aria-pressed")) === "false", null);
await A.locator("[data-deck-shut]").dispatchEvent("pointerdown");

// ── 8. Тяга: колода едет за пальцем, висит над ним, встаёт у всех; камера и карты не тронуты ────
s = await spots(A);
const view = await A.getAttribute("canvas", "data-view");
g = await gripBox(A);
const gx = g.x + g.width / 2, gy = g.y + g.height / 2;
await A.mouse.move(gx, gy);
await A.mouse.down();
await A.mouse.move(gx + 60, gy - 110, { steps: 10 });
await wait(A, 80);
const mid = await spots(A);
check("пока тянут: колода едет за пальцем и висит над ним", Math.abs(mid.deckTop.x - (s.deckTop.x + 60)) < 6 && mid.deckTop.y < gy - 110, { top: mid.deckTop, finger: { x: gx + 60, y: gy - 110 } });
await A.mouse.up();
await wait(B, 500);
const aSpot = (await spots(A)).spot, bSpot = (await spots(B)).spot;
check("отпустили — колода встала у всех на новом месте", aSpot.x !== 0 && Math.abs(aSpot.x - bSpot.x) < 1e-6 && Math.abs(aSpot.y - bSpot.y) < 1e-6, { aSpot, bSpot });
const after = await spots(A);
check("камера не сдвинулась, карта не взята", (await A.getAttribute("canvas", "data-view")) === view && after.deck === 36 && after.felt.length === 0, null);

// ── 9. В руку колоду не положить: отпущенная над рукой встаёт на сукно ────────────────────────
g = await gripBox(A);
await A.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
await A.mouse.down();
await A.mouse.move(195, 800, { steps: 12 });
await A.mouse.up();
await wait(B, 500);
const handA = await A.locator("#over [data-card]").count();
const sa = await spots(A);
check("над рукой: колода цела, в руке пусто, стоит на сукне", sa.deck === 36 && handA === 0 && Math.hypot(sa.spot.x, sa.spot.y) <= 8 - 0.86 + 1e-6, sa.spot);
check("индикатор ушёл вместе с колодой", Math.abs((await gripBox(A)).x + (await gripBox(A)).width / 2 - sa.deckTop.x) < 20, { grip: await gripBox(A), top: sa.deckTop });

// ── 10. Верхняя карта с колоды на новом месте по-прежнему берётся ─────────────────────────────
await A.mouse.move(sa.deckTop.x, sa.deckTop.y);
await A.mouse.down();
await A.mouse.move(195, 300, { steps: 8 });
await A.mouse.up();
await wait(B, 500);
check("карта с колоды на новом месте берётся", (await spots(B)).deck === 35 && (await spots(B)).felt.length === 1, null);

// ── 11. Приёмка в стопку: пунктир под колодой, пока несут; над ней — горит; у B — в цвете A ─────────
const dragCard = async (p, from, to, during) => {
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  await p.mouse.move(from.x + 40, from.y + 70, { steps: 6 });
  await wait(p, 120);
  if (during) await during("away");
  await p.mouse.move(to.x, to.y, { steps: 10 });
  await wait(p, 200);
  if (during) await during("over");
  await p.mouse.up();
  await wait(p, 600);
};
let felt = (await spots(A)).felt[0];
const topOf = async (p) => { const sp = await spots(p); return { ...sp.deckTop, k: sp.k }; };
let top = await topOf(A);
const zone = async (p) => p.evaluate(() => { const z = document.querySelector('[data-g="deck-zone"]'); return z && z.dataset.here; });
let seenAway, seenOver, seenB;
// Карта висит выше пальца: чтобы её середина встала на колоду, палец — ниже колоды.
const onDeck = (t) => ({ x: t.x, y: t.y + 0.32 * 1.4 * t.k });
await dragCard(A, felt, onDeck(top), async (phase) => {
  if (phase === "away") seenAway = await zone(A);
  else { seenOver = await zone(A); await wait(B, 250); seenB = await zone(B); }
});
check("пока несут карту — под колодой пунктир приёмки", seenAway === "false", seenAway);
check("карта над колодой — зона горит", seenOver === "true", seenOver);
check("у B чужая карта над колодой — зона горит тоже", seenB === "true", seenB);
let sb2 = await spots(B);
check("отпустил над колодой — карта в колоде, на сукне пусто", sb2.deck === 36 && sb2.felt.length === 0, { deck: sb2.deck, felt: sb2.felt.length });
check("после дропа зоны нет", (await zone(A)) === null, null);

// ── 12. Сторона: стопка вся рубашкой — карта, которую несли лицом, ложится рубашкой ─────────────
const toFelt = async (at) => {
  const t = (await spots(A)).deckTop;
  await dragCard(A, t, at);
  return (await spots(A)).felt.at(-1);
};
felt = await toFelt({ x: 110, y: 330 });
await A.mouse.click(felt.x, felt.y);
await wait(A, 90);
await A.mouse.click(felt.x, felt.y);
await wait(A, 600);
felt = (await spots(A)).felt[0];
check("карта на сукне перевёрнута лицом", felt.up === true, felt);
top = await topOf(A);
await dragCard(A, felt, onDeck(top));
sb2 = await spots(B);
check("вся стопка рубашкой — легла рубашкой", sb2.deck === 36 && sb2.deckFace === null, sb2.deckFace);

// ── 13. Стопка вся лицом — карта, которую несли рубашкой, ложится лицом ─────────────────────────
await tap(A);
await wait(A, 80);
await tap(A);
await wait(A, 700);
await A.locator("[data-deck-shut]").dispatchEvent("pointerdown").catch(() => {});
felt = await toFelt({ x: 110, y: 330 });
await A.mouse.click(felt.x, felt.y);
await wait(A, 90);
await A.mouse.click(felt.x, felt.y);
await wait(A, 600);
felt = (await spots(A)).felt[0];
check("карта с лицевой стопки на сукне перевёрнута рубашкой", felt.up === false, felt);
top = await topOf(A);
await dragCard(A, felt, onDeck(top));
sb2 = await spots(B);
check("вся стопка лицом — легла лицом", sb2.deck === 36 && sb2.deckFace !== null, sb2.deckFace);

// ── 14. Одиночная карта карту не принимает ──────────────────────────────────────────────────────
const one = await toFelt({ x: 100, y: 300 });
const two = await toFelt({ x: 290, y: 300 });
let over2 = null;
await dragCard(A, two, { x: one.x, y: one.y + 0.32 * 1.4 * (await spots(A)).k }, async (phase) => phase === "over" && (over2 = await zone(A)));
sb2 = await spots(B);
check("над одиночной картой зона не горит, карта легла на сукно", over2 === "false" && sb2.felt.length === 2 && sb2.deck === 34, { over2, felt: sb2.felt.length, deck: sb2.deck });

// ── 15. Пипс не крупнее колоды на мелком зуме, и своего размера на крупном ──────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const C = await ctx.newPage();
  await C.goto(`${base}/table/?room=${room}&name=C`);
  await C.waitForSelector("[data-section]");
  await C.waitForSelector(".crossade-loading", { state: "detached" });
  await wait(C, 400);
  const cdp = await ctx.newCDPSession(C);
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const pinch = async (from, to) => {
    await touch("touchStart", from);
    for (let i = 1; i <= 16; i += 1) await touch("touchMove", from.map(([x, y], k) => [x + ((to[k][0] - x) * i) / 16, y + ((to[k][1] - y) * i) / 16]));
    await touch("touchEnd", []);
    await wait(C, 800);
  };
  const ratio = async () => {
    const k = (await spots(C)).k;
    const b = await C.locator('[data-g="deck-grip"]').boundingBox();
    return { k: +k.toFixed(1), h: +b.height.toFixed(1), half: +(k * 1.4 * 0.5).toFixed(1) };
  };
  // Сукно у кромки экрана — чтобы щипок не попал на карты и стулья.
  await pinch([[60, 150], [330, 150]], [[180, 150], [210, 150]]);
  const far = await ratio();
  check("мелкий зум: пипс не выше половины карты", far.h <= far.half + 1, far);
  await pinch([[180, 150], [210, 150]], [[20, 150], [370, 150]]);
  await pinch([[180, 150], [210, 150]], [[20, 150], [370, 150]]);
  const close = await ratio();
  check("крупный зум: пипс своего размера, не растёт с картой", close.half > 25 && Math.abs(close.h - 24) < 1.5, close);
  await ctx.close();
}

await browser.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
}
console.log(`tableGrip ${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
