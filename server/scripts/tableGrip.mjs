// ИНДИКАТОР КОЛОДЫ — два браузера. Тап — тултип колоды картами; двойной тап — колода перевёрнута у всех;
// тяга — колода едет по сукну и встаёт у всех, над рукой горит её зона (сама стопка в руку — `tablePileDrop`), камера и карты не трогаются; кнопки
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
const tipCards = (p) => p.evaluate(() => [...document.querySelectorAll('[data-owner="deck"] [role=img]')].map((el) => el.getAttribute("aria-label")));

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

// ── 9. Над рукой зона руки горит; увели обратно на сукно — встала на сукно ─────────────────────
g = await gripBox(A);
await A.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
await A.mouse.down();
await A.mouse.move(195, 800, { steps: 12 });
const zoneLit = await A.locator('[data-g="zone"]').evaluate((e) => e.style.borderColor).catch(() => null);
check("колода над рукой — зона руки горит золотом", zoneLit === "rgb(242, 193, 78)", zoneLit);
await A.mouse.move(250, 420, { steps: 12 });
await A.mouse.up();
await wait(B, 500);
const handA = await A.locator("#over [data-card]").count();
const sa = await spots(A);
check("увели с руки на сукно: колода цела, в руке пусто, стоит на сукне", sa.deck === 36 && handA === 0 && Math.hypot(sa.spot.x, sa.spot.y) <= 8 - 0.86 + 1e-6, sa.spot);
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

// ── 14г. Колода в воздухе: поднята, ровно к экрану, контур места; ложится поверх карт и повёрнутой, как у дропнувшего ──
{
  // Карта на сукне там, куда поставим колоду.
  const t0 = (await spots(A)).deckTop;
  await dragCard(A, t0, { x: 250, y: 330 });
  const under = (await spots(A)).felt.at(-1);
  // Камеру A — боком: Ctrl + тяга по пустому сукну.
  await A.keyboard.down("Control");
  await A.mouse.move(60, 150);
  await A.mouse.down();
  await A.mouse.move(160, 150, { steps: 8 });
  await A.mouse.up();
  await A.keyboard.up("Control");
  await wait(A, 500);
  const rotation = Number((await A.getAttribute("canvas", "data-view")).split(",")[3]);
  check("камера A повёрнута", Math.abs(rotation) > 10, rotation);
  const cardNow = (await spots(A)).felt.find((f) => f.id === under.id);
  const g = await gripBox(A);
  const gx = g.x + g.width / 2, gy = g.y + g.height / 2;
  const deckNow = (await spots(A)).deckTop;
  await A.mouse.move(gx, gy);
  await A.mouse.down();
  // Палец так, чтобы место колоды пришлось на карту.
  const tx = cardNow.x + (gx - deckNow.x), ty = cardNow.y + (gy - deckNow.y);
  await A.mouse.move(tx, ty, { steps: 12 });
  await wait(A, 150);
  const air = await A.evaluate(() => {
    const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height, t: getComputedStyle(e).transform }; };
    return { carry: box('[data-g="deck-carry"]'), mark: box('[data-g="deck-mark"]'), marks: document.querySelectorAll('[data-g="deck-mark"]').length, sp: JSON.parse(document.querySelector("canvas").dataset.spots) };
  });
  const k = air.sp.k;
  check("в воздухе: колода поднята над местом, куда ляжет", air.carry && air.mark && air.carry.y < air.mark.y - k * 0.2, air);
  check("в воздухе: колода ровно к экрану при повёрнутой камере", air.carry && Math.abs(air.carry.w - k) < 2 && Math.abs(air.carry.h - k * 1.4) < 2 && air.carry.t === "none", air.carry);
  check("контур места один, ровно к камере", air.marks === 1 && /matrix\(1, 0, 0, [0-9.]+, 0, 0\)|none/.test(air.mark.t), air.mark);
  check("на сукне колоды нет, пока несут", air.sp.deckAir === true, null);
  await A.mouse.up();
  await wait(B, 600);
  const bs = await spots(B);
  const norm = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
  check("колода легла повёрнутой к камере A", Math.abs(norm(bs.spot.angle + rotation)) < 1.5, { angle: bs.spot.angle, rotation });
  check("карта, лежавшая там, — под колодой у всех", bs.spot.below.includes(under.id), bs.spot.below);
  // Тап/хват в этом месте берёт верхнюю колоды, а не карту под ней.
  const before = (await spots(A)).deck;
  const top = (await spots(A)).deckTop;
  await A.mouse.move(top.x, top.y);
  await A.mouse.down();
  await A.mouse.move(120, 300, { steps: 8 });
  await A.mouse.up();
  await wait(B, 600);
  const after = await spots(B);
  check("хват по колоде над картой берёт верхнюю колоды", after.deck === before - 1 && after.spot.below.includes(under.id), { before, deck: after.deck });
  // Камеру — обратно к стулу.
  await A.locator("[data-home]").dispatchEvent("pointerdown").catch(() => {});
  await wait(A, 800);
}

// ── 14б. Пин: приколоть — любой; приколотую не двигает никто; открепить — только админ (A) ──────────
{
  const openTip = async (p) => { if (!(await p.locator('[data-g="deck-tip"]').count())) { await tap(p); await wait(p, 450); } };
  const dragGrip = async (p) => {
    const b = await p.locator('[data-g="deck-grip"]').boundingBox();
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await p.mouse.down();
    await p.mouse.move(b.x + b.width / 2 - 70, b.y - 90, { steps: 10 });
    await wait(p, 100);
    const during = (await spots(p)).deckTop;
    await p.mouse.up();
    await wait(p, 500);
    return during;
  };
  await openTip(B);
  await B.locator("[data-deck-pin]").dispatchEvent("pointerdown");
  await wait(A, 500);
  check("B приколол — у A индикатор с булавкой", (await A.getAttribute('[data-g="deck-grip"]', "data-pin")) === "true" && (await A.locator('[data-g="deck-pinned"]').count()) === 1, null);
  const was = (await spots(A)).spot;
  const topA = (await spots(A)).deckTop;
  const duringA = await dragGrip(A);
  const duringB = await dragGrip(B);
  await wait(B, 300);
  check("приколотая не едет за пальцем и не встаёт на новое место — ни у A, ни у B", Math.hypot(duringA.x - topA.x, duringA.y - topA.y) < 3 && JSON.stringify((await spots(B)).spot) === JSON.stringify(was), { was, now: (await spots(B)).spot, duringA, topA, duringB });
  await openTip(B);
  check("B не админ: пин у него значком, открепить нечем", (await B.locator("[data-deck-pin-status]").count()) === 1 && (await B.locator("[data-deck-pin]").count()) === 0, null);
  await B.locator("[data-deck-pin-status]").dispatchEvent("pointerdown");
  await wait(A, 400);
  check("тап B по значку ничего не снял", (await A.getAttribute('[data-g="deck-grip"]', "data-pin")) === "true", null);
  await openTip(A);
  check("A тоже не админ (гостевая комната без админа) — и у него значок", (await A.locator("[data-deck-pin-status]").count()) === 1, null);
  await A.locator("[data-deck-shut]").dispatchEvent("pointerdown");
  await B.locator("[data-deck-shut]").dispatchEvent("pointerdown").catch(() => {});
}

// ── 14в. Админ открепляет — на стенде, где админ я ─────────────────────────────────────────────
{
  const S = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await S.goto(`${base}/table/?stand`);
  await S.waitForSelector("[data-section]");
  await wait(S, 600);
  const g0 = await S.locator('[data-g="deck-grip"]').boundingBox();
  await S.mouse.click(g0.x + g0.width / 2, g0.y + g0.height / 2);
  await wait(S, 450);
  await S.locator("[data-deck-pin]").dispatchEvent("pointerdown");
  await wait(S, 300);
  const pinnedAt = (await spots(S)).spot;
  await S.locator("[data-deck-shut]").dispatchEvent("pointerdown");
  const drag = async () => {
    const b = await S.locator('[data-g="deck-grip"]').boundingBox();
    await S.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await S.mouse.down();
    await S.mouse.move(b.x + b.width / 2 - 70, b.y - 90, { steps: 10 });
    await S.mouse.up();
    await wait(S, 400);
  };
  await drag();
  check("стенд: приколотую не сдвинул и админ", JSON.stringify((await spots(S)).spot) === JSON.stringify(pinnedAt), (await spots(S)).spot);
  const g1 = await S.locator('[data-g="deck-grip"]').boundingBox();
  await S.mouse.click(g1.x + g1.width / 2, g1.y + g1.height / 2);
  await wait(S, 450);
  check("стенд: у админа пин — кнопка, горит", (await S.locator("[data-deck-pin]").getAttribute("aria-pressed")) === "true", null);
  await S.locator("[data-deck-pin]").dispatchEvent("pointerdown");
  await wait(S, 300);
  await S.locator("[data-deck-shut]").dispatchEvent("pointerdown");
  await drag();
  const moved = (await spots(S)).spot;
  check("стенд: админ открепил — колода снова едет", moved.pin === false && (moved.x !== pinnedAt.x || moved.y !== pinnedAt.y), moved);
  await S.close();
}

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
