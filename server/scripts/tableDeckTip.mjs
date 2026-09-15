// ТУЛТИП КОЛОДЫ — карты в нём как в окне руки: переставить, вытянуть из середины, перевернуть, вставить на
// место с контуром. Лок (порядок) и закрытая приёмка (количество) — на стенде, где админ я.
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableDeckTip.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const secret = process.argv[3] ?? "dev";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);

const browser = await chromium.launch();
const open = async (url) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log("ERROR", e.message));
  await p.goto(url);
  await p.waitForSelector("[data-section]");
  await p.waitForTimeout(700);
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
const openTip = async (p) => {
  if (await p.locator('[data-g="deck-tip"]').count()) return;
  const b = await p.locator('[data-g="deck-grip"]').boundingBox();
  await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await wait(p, 450);
};
/** Точка, где сверху лежит именно эта карта колоды в окне: в веере соседки перекрывают друг друга. */
const cardAt = (p, id) => p.evaluate((id) => {
  const el = document.querySelector(`[data-card="${id}"][data-owner="deck"]`);
  if (!el) return null;
  const b = el.getBoundingClientRect();
  for (let y = b.top + b.height * 0.5; y < b.bottom - 2; y += 3) {
    for (let x = b.left + 1; x < b.right - 1; x += 1) {
      if (document.elementFromPoint(x, y)?.closest("[data-card]") === el) return { x, y };
    }
  }
  return null;
}, id);
const tipBox = (p) => p.locator('[data-g="deck-tip"]').boundingBox();
/** Протащить: взять, увести, привести, отпустить; `during` — посмотреть, пока держим над целью. */
const carry = async (p, from, to, during) => {
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  await p.mouse.move(from.x, from.y - 60, { steps: 5 });
  await p.mouse.move(to.x, to.y, { steps: 10 });
  await wait(p, 200);
  const seen = during ? await during() : null;
  await p.mouse.up();
  await wait(p, 600);
  return seen;
};
/** Сколько карт летит разом в ближайшие `ms` — максимум по кадрам. `inTip` — только над окном колоды. */
const flights = (p, ms = 250) => p.evaluate((ms) => new Promise((done) => {
  const tip = document.querySelector('[data-g="deck-tip"]')?.getBoundingClientRect();
  let most = 0;
  const t0 = performance.now();
  const tick = () => {
    const n = [...document.querySelectorAll("[data-flight]")].filter((el) => {
      const b = el.getBoundingClientRect();
      return tip && b.top < tip.bottom + 40 && b.bottom > tip.top - 40;
    }).length;
    most = Math.max(most, n);
    if (performance.now() - t0 < ms) requestAnimationFrame(tick);
    else done(most);
  };
  tick();
}), ms);
const tipMarks = (p) => p.evaluate(() => {
  const tip = document.querySelector('[data-g="deck-tip"]').getBoundingClientRect();
  return [...document.querySelectorAll('[data-g="mark"]')].filter((m) => { const b = m.getBoundingClientRect(); return b.top >= tip.top - 30 && b.bottom <= tip.bottom + 30; }).map((m) => m.style.borderColor || m.style.border);
});

// ════ СЕТЬ: A и B, без лока ════
const A = await open(`${base}/table/?room=${room}&name=A`);
const B = await open(`${base}/table/?room=${room}&name=B`);
await openTip(A);
await openTip(B);
let ids = (await spots(A)).deckIds;

// ── 1. Переставить: четвёртую снизу — в самый низ, с контуром места ────────────────────────────
const mover = ids[3];
const tip = await tipBox(A);
let hover = await carry(A, await cardAt(A, mover), { x: tip.x + 16, y: tip.y + tip.height - 40 }, async () => ({ marks: await tipMarks(A), bMarks: await tipMarks(B) }));
check("пока несут над окном — в окне контур места", hover.marks.length === 1, hover);
check("у B в окне колоды — контур в цвете A", hover.bMarks.length === 1, hover);
let bIds = (await spots(B)).deckIds;
check("карта встала вниз колоды у всех", bIds[0] === mover && bIds.length === 36 && (await spots(A)).deckIds.join() === bIds.join(), bIds.slice(0, 5));

// ── 2. Вытянуть из середины на сукно — рубашкой, как лежала ───────────────────────────────────
const middle = bIds[18];
await carry(A, await cardAt(A, middle), { x: 300, y: 540 });
let sb = await spots(B);
check("из середины — на сукно, рубашкой", sb.deck === 35 && sb.felt.length === 1 && sb.felt[0].id === middle && sb.felt[0].up === false, sb.felt);

// ── 3. Перевернуть карту в середине двойным тапом ─────────────────────────────────────────────
const turn = sb.deckIds[10];
let c = await cardAt(A, turn);
await A.mouse.click(c.x, c.y);
await wait(A, 90);
await A.mouse.click(c.x, c.y);
await wait(B, 700);
sb = await spots(B);
check("двойной тап в окне: карта в середине перевёрнута у всех", sb.deckUp.includes(turn) && sb.deckIds[10] === turn, sb.deckUp);
check("и в окне у B она лицом", (await B.locator(`[data-card="${turn}"][data-owner="deck"] [role=img]`).getAttribute("aria-label")) !== "рубашка", null);

// ── 4. Карту с сукна — в окно, на место под пальцем ───────────────────────────────────────────
const felt = (await spots(A)).felt[0];
const slot = await cardAt(A, sb.deckIds[20]);
await carry(A, felt, { x: slot.x - 2, y: slot.y });
sb = await spots(B);
const at = sb.deckIds.indexOf(middle);
check("с сукна — в окно, на место под пальцем (не наверх)", sb.deck === 36 && at > 5 && at < 34, { at });

// ── 5. Анимация: сортировка, перемешивание и перестановка — карты в окне летят на новые места ────────
const nowIds = (await spots(A)).deckIds;
let [fa, fb] = await Promise.all([flights(A), flights(B), A.locator('[data-deck-do="sort"]').dispatchEvent("pointerdown")]);
check("сортировка: в окне у A карты летят", fa > 10, fa);
check("и у B", fb > 10, fb);
await wait(A, 500);
[fa, fb] = await Promise.all([flights(A, 300), flights(B, 300), A.locator('[data-deck-do="shuffle"]').dispatchEvent("pointerdown")]);
check("перемешивание: в окне у A карты разлетаются по новым местам", fa > 20, fa);
check("и у B", fb > 20, fb);
await wait(A, 1500);
const ids5 = (await spots(A)).deckIds;
const low = await cardAt(A, ids5[5]);
const tb5 = await tipBox(A);
const watchB = flights(B, 1600);
await A.mouse.move(low.x, low.y);
await A.mouse.down();
await A.mouse.move(low.x, low.y - 60, { steps: 4 });
await A.mouse.move(tb5.x + tb5.width - 20, tb5.y + tb5.height - 40, { steps: 8 });
await wait(A, 150);
await A.mouse.up();
const fr = await watchB;
await wait(B, 300);
check("перестановка: у B соседи сдвигаются перелётом, пока карту несут и когда кладут", fr > 3, fr);
check("и карта встала на новое место", (await spots(B)).deckIds.indexOf(ids5[5]) > 25, (await spots(B)).deckIds.indexOf(ids5[5]));
void nowIds;

await A.close();
await B.close();

// ════ СТЕНД: админ я ════
const S = await open(`${base}/table/?stand`);
await openTip(S);
let st = await spots(S);
const topId = st.deckIds.at(-1);
const N = st.deck;

// ── 5. Лок: только верхняя; из окна обратно в колоду — нельзя; с сукна — наверх ────────────────
await S.locator("[data-deck-lock]").dispatchEvent("pointerdown");
await wait(S, 300);
check("лок стоит, кнопки перемешать/сорт/перевернуть — значками", (await S.getAttribute('[data-g="deck-tip"]', "data-lock")) === "true" && (await S.locator("[data-deck-do]").count()) === 0 && (await S.locator("[data-deck-do-status]").count()) === 3, null);
const midPe = await S.locator(`[data-card="${st.deckIds[5]}"][data-owner="deck"]`).evaluate((e) => getComputedStyle(e).pointerEvents);
const topPe = await S.locator(`[data-card="${topId}"][data-owner="deck"]`).evaluate((e) => getComputedStyle(e).pointerEvents);
check("под локом в окне тянется только верхняя", midPe === "none" && topPe !== "none", { midPe, topPe });
let tb = await tipBox(S);
await carry(S, await cardAt(S, topId), { x: tb.x + 16, y: tb.y + tb.height - 40 });
st = await spots(S);
check("верхнюю — обратно в низ колоды под локом нельзя: порядок тот же", st.deckIds.at(-1) === topId && st.deck === N && st.felt.length === 0, st.deckIds.slice(-3));
await carry(S, await cardAt(S, topId), { x: 300, y: 345 });
const out = (await spots(S)).felt.at(-1);
tb = await tipBox(S);
hover = await carry(S, out, { x: tb.x + 16, y: tb.y + tb.height - 40 }, async () => S.evaluate(() => {
  const marks = [...document.querySelectorAll('[data-g="mark"]')].map((m) => m.getBoundingClientRect().left);
  const cards = [...document.querySelectorAll('[data-owner="deck"]')].map((m) => m.getBoundingClientRect().left);
  return { mark: marks[0], rightmost: Math.max(...cards) };
}));
st = await spots(S);
check("под локом контур — в конце колоды, хоть палец у начала", hover.mark !== undefined && hover.mark >= hover.rightmost - 1, hover);
check("под локом с сукна в окно — карта встала наверх", st.deckIds.at(-1) === out.id && st.deck === N, st.deckIds.slice(-2));
await S.locator("[data-deck-lock]").dispatchEvent("pointerdown");
await wait(S, 300);

// ── 6. Приёмка закрыта: ни взять (и верхнюю), ни положить ─────────────────────────────────────
await S.locator("[data-deck-accept]").dispatchEvent("pointerdown");
await wait(S, 300);
st = await spots(S);
const allPe = await S.locator('[data-owner="deck"]').evaluateAll((els) => els.every((e) => getComputedStyle(e).pointerEvents === "none"));
check("приёмка закрыта: в окне не тянется ни одна", allPe, null);
await S.locator('[data-deck-shut]').dispatchEvent("pointerdown");
await wait(S, 200);
await carry(S, st.deckTop, { x: 300, y: 345 });
st = await spots(S);
check("приёмка закрыта: верхнюю с колоды на столе не взять", st.deck === N && st.felt.length === 0, { deck: st.deck, felt: st.felt.length });
// Карту из руки — на колоду: вернулась в руку.
const handBefore = await S.locator('#over [data-card][data-owner]:not([data-owner="deck"])').count();
const handCard = await S.locator('#over [data-card]:not([data-owner="deck"])').first().boundingBox();
const zoneTop = st.deckTop;
await carry(S, { x: handCard.x + handCard.width / 2, y: handCard.y + handCard.height / 2 }, { x: zoneTop.x, y: zoneTop.y + 0.32 * 1.4 * st.k });
st = await spots(S);
check("приёмка закрыта: карта над колодой не легла в неё", st.deck === N && (await S.locator('#over [data-card][data-owner]:not([data-owner="deck"])').count()) === handBefore, { deck: st.deck });

await browser.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
}
console.log(`tableDeckTip ${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
