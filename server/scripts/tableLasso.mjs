// ЛАССО — два браузера. Секция лассо в баре: инструмент, вид грэба и сторона сборки; тап по карте выделяет, выделение —
// лок в цвете выделившего (чужую не взять и не выделить), в окне стопки выделенное видно и считается на индикаторе,
// выход из лассо снимает выделение.
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableLasso.mjs [base] [secret]
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
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message));
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
const tap = async (p, at) => {
  await p.mouse.click(at.x, at.y);
  await wait(p, 350);
};
/** Протащить с места на место. */
const carry = async (p, from, to) => {
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  await p.mouse.move(from.x, from.y - 40, { steps: 4 });
  await p.mouse.move(to.x, to.y, { steps: 10 });
  await wait(p, 150);
  await p.mouse.up();
  await wait(p, 600);
};
/** Точка, где сверху лежит именно этот элемент карты. */
const cardAt = (p, sel) => p.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const b = el.getBoundingClientRect();
  for (let y = b.top + b.height * 0.3; y < b.bottom - 2; y += 3) {
    for (let x = b.left + 2; x < b.right - 2; x += 2) {
      if (document.elementFromPoint(x, y)?.closest("[data-card]") === el) return { x, y };
    }
  }
  return null;
}, sel);
const bar = (p, what) => p.locator(`[data-bar="${what}"]`);

const A = await open("A");
const B = await open("B");

// ── Расклад: две карты на сукне и одна в руке у A ─────────────────────────────────────────────
let sa = await spots(A);
const k = sa.k;
await carry(A, sa.deckTop, { x: sa.middle.x - 1.6 * k, y: sa.middle.y + 0.2 * k });
sa = await spots(A);
await carry(A, sa.deckTop, { x: sa.middle.x + 1.6 * k, y: sa.middle.y + 0.2 * k });
sa = await spots(A);
await carry(A, sa.deckTop, { x: 195, y: 740 });
sa = await spots(A);
const [f1, f2] = sa.felt;
check("расклад: две карты на сукне, одна в руке", sa.felt.length === 2 && (await A.locator("#over [data-card]").count()) === 1, sa.felt);

// ── 1. Секция лассо: курсор горит, лассо, грэб и сторона ───────────────────────────────────────
await A.click('[data-section="lasso"]');
await wait(A, 400);
check("в секции лассо — курсор, лассо, вид грэба, сторона", (await bar(A, "cursor").getAttribute("aria-pressed")) === "true"
  && (await bar(A, "lasso").getAttribute("aria-pressed")) === "false"
  && (await bar(A, "grab").getAttribute("data-mode")) === "collect" && (await bar(A, "side").getAttribute("data-mode")) === "keep", null);

// ── 2. Тап по карте на сукне — выделена у всех; тултипа нет ──────────────────────────────────────
await tap(A, f1);
await wait(B, 300);
let sb = await spots(B);
const aKey = (await spots(A)).picks[f1.id];
check("тап выделил карту на сукне — B видит её выделенной A", aKey !== undefined && sb.picks[f1.id] === aKey, sb.picks);
check("в лассо тап не открывает тултип карты", (await A.locator('[data-g="card-tip"]').count()) === 0, null);

// ── 3. Выделение — лок: B не берёт и не выделяет карту A ─────────────────────────────────────────
await carry(B, sb.felt.find((f) => f.id === f1.id), { x: 195, y: 740 });
sb = await spots(B);
check("B не взял выделенную A карту: она на сукне, рука B пуста", sb.felt.some((f) => f.id === f1.id) && (await B.locator("#over [data-card]").count()) === 0, sb.felt.map((f) => f.id));
await B.click('[data-section="lasso"]');
await wait(B, 400);
await tap(B, sb.felt.find((f) => f.id === f1.id));
check("B в лассо тапнул выделенную A карту — выделение осталось за A", (await spots(A)).picks[f1.id] === aKey, (await spots(A)).picks);
await tap(B, sb.felt.find((f) => f.id === f2.id));
await wait(A, 300);
const bKey = (await spots(A)).picks[f2.id];
check("B выделил свободную карту — у A она выделена B", bKey !== undefined && bKey !== aKey, (await spots(A)).picks);

// ── 4. Своя рука и окно колоды ─────────────────────────────────────────────────────────────────
const handSel = "#over [data-card]";
const handId = await A.locator(handSel).first().getAttribute("data-card");
await tap(A, await cardAt(A, `[data-card="${handId}"]`));
check("тап по карте в своей руке — выделена", (await A.locator(`[data-card="${handId}"]`).getAttribute("data-picked")) === "me", null);
await wait(B, 300);
check("B видит выделение карты в руке A", (await spots(B)).picks[handId] === aKey, null);
const grip = await A.locator('[data-g="deck-grip"]').boundingBox();
await tap(A, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 });
const deckIds = (await spots(A)).deckIds;
const inDeck = deckIds[4];
await tap(A, await cardAt(A, `[data-card="${inDeck}"][data-owner="deck"]`));
check("тап по карте в окне колоды — выделена", (await A.locator(`[data-card="${inDeck}"][data-owner="deck"]`).getAttribute("data-picked")) === "me", null);
await wait(B, 300);
const badge = B.locator('[data-g="deck-grip"] [data-g="pile-picks"]');
check("у B на индикаторе колоды — одна выделенная карта в цвете A", (await badge.count()) === 1 && (await badge.getAttribute("data-n")) === "1", await badge.count());
await tap(A, await cardAt(A, `[data-card="${inDeck}"][data-owner="deck"]`));
check("второй тап по выделенной — снято", (await A.locator(`[data-card="${inDeck}"][data-owner="deck"]`).getAttribute("data-picked")) === null, null);

// ── 5. Тоглы: вид грэба и сторона по кругу, инструмент ──────────────────────────────────────────
await bar(A, "grab").click();
check("вид грэба: стянуть → как лежат", (await bar(A, "grab").getAttribute("data-mode")) === "keep", null);
const sides = [];
for (let i = 0; i < 3; i += 1) {
  await bar(A, "side").click();
  sides.push(await bar(A, "side").getAttribute("data-mode"));
}
check("сторона по кругу: рубашкой → лицом → как лежали", sides.join() === "down,up,keep", sides);
await bar(A, "lasso").click();
check("инструмент лассо включён, курсор погас", (await bar(A, "lasso").getAttribute("aria-pressed")) === "true" && (await bar(A, "cursor").getAttribute("aria-pressed")) === "false", null);

// ── 5б. Инструмент лассо: петля выделяет карты сукна внутри, стопку — нет; карту не берёт ─────────────
sa = await spots(A);
await tap(A, sa.felt.find((f) => f.id === f1.id));
await bar(A, "lasso").click();
sa = await spots(A);
check("перед петлёй f1 не выделена", sa.picks[f1.id] === undefined, sa.picks);
const loop = [
  { x: sa.middle.x - 2.6 * k, y: sa.middle.y - 1.4 * k }, { x: sa.middle.x + 2.6 * k, y: sa.middle.y - 1.4 * k },
  { x: sa.middle.x + 2.6 * k, y: sa.middle.y + 1.6 * k }, { x: sa.middle.x - 2.6 * k, y: sa.middle.y + 1.6 * k },
];
const loopStart = { x: sa.middle.x - 2.6 * k, y: sa.middle.y };
await A.mouse.move(loopStart.x, loopStart.y);
await A.mouse.down();
for (const pt of [...loop, loop[0]]) await A.mouse.move(pt.x, pt.y, { steps: 6 });
const drawn = await A.locator('[data-g="lasso"]').count();
const viewBefore = await A.getAttribute("canvas", "data-view");
await A.mouse.up();
await wait(B, 500);
sb = await spots(B);
check("пока тянут — петля на экране", drawn === 1, drawn);
check("петля не двигает камеру", (await A.getAttribute("canvas", "data-view")) === viewBefore, null);
check("петля выделила f1 у всех; f2 осталась за B; карты колоды — нет", sb.picks[f1.id] === aKey && sb.picks[f2.id] === bKey && !sb.deckIds.some((id) => sb.picks[id]), sb.picks);
check("после отпускания петли нет", (await A.locator('[data-g="lasso"]').count()) === 0, null);
sa = await spots(A);
const fAt = sa.felt.find((f) => f.id === f1.id);
await carry(A, fAt, { x: fAt.x + 80, y: fAt.y + 60 });
sa = await spots(A);
check("инструмент лассо карту не берёт: f1 на месте", Math.abs(sa.felt.find((f) => f.id === f1.id).x - fAt.x) < 2, [fAt, sa.felt]);
await tap(A, sa.felt.find((f) => f.id === f1.id));
check("тап в инструменте лассо снимает выделение", (await spots(A)).picks[f1.id] === undefined, (await spots(A)).picks);
await bar(A, "cursor").click();

// ── 7. Выход из лассо снимает выделение у всех; вне лассо тап — снова тултип ──────────────────────
await A.click('[data-section="lasso"]');
await wait(B, 500);
sb = await spots(B);
check("A вышел из лассо — его выделение снято у B, выделение B осталось", !Object.values(sb.picks).includes(aKey) && sb.picks[f2.id] === bKey, sb.picks);
sa = await spots(A);
await tap(A, sa.felt.find((f) => f.id === f1.id));
check("вне лассо тап по карте — тултип карты", (await A.locator('[data-g="card-tip"]').count()) === 1, null);

const k8 = (await spots(A)).k;
// Тултип карты от тапа в разделе 7 лежит у колоды — закрыть касанием пустого места.
await tap(A, { x: 30, y: 110 });
if (await A.locator("[data-deck-shut]").count()) await A.locator("[data-deck-shut]").dispatchEvent("pointerdown");
await wait(A, 200);
// ── 8. Масса: стянуть к пальцу — на сукно стопкой, в руку подряд; как лежат — сдвиг с углами ────────────
const lassoMode = async (on) => {
  if ((await A.locator('[data-section="lasso"]').getAttribute("aria-pressed")) !== String(on)) await A.click('[data-section="lasso"]');
  await wait(A, 350);
};
const lay = async (dx, dy) => {
  await lassoMode(false);
  const now = await spots(A);
  const before = new Set(now.felt.map((f) => f.id));
  await carry(A, now.deckTop, { x: now.middle.x + dx * k8, y: now.middle.y + dy * k8 });
  const fresh = (await spots(A)).felt.find((f) => !before.has(f.id));
  if (!fresh) throw new Error(`не легла:  ${JSON.stringify({ top: now.deckTop, dx, dy, k8, felt: now.felt.length, after: (await spots(A)).felt.length, deck: (await spots(A)).deck, piles: (await spots(A)).piles.map((p) => p.count), tip: await A.locator('[data-g="card-tip"]').count() })}`);
  return fresh.id;
};
const feltOf = async (id) => (await spots(A)).felt.find((f) => f.id === id);
const minePicked = async () => Object.entries((await spots(A)).picks).filter(([, by]) => by === aKey).map(([id]) => id).sort();
const f3 = await lay(-2.4, 3.2);
await lassoMode(true);
if ((await bar(A, "grab").getAttribute("data-mode")) !== "collect") await bar(A, "grab").click();
await tap(A, await feltOf(f1.id));
await tap(A, await feltOf(f3));
await tap(A, await cardAt(A, `[data-card="${handId}"]`));
check("выделено три: две с сукна и одна из руки", (await minePicked()).join() === [f1.id, f3, handId].sort().join(), await minePicked());
sa = await spots(A);
const grabAt = await feltOf(f3);
const target = { x: sa.middle.x + 4.8 * k8, y: sa.middle.y - 2.4 * k8 };
await A.mouse.move(grabAt.x, grabAt.y);
await A.mouse.down();
await A.mouse.move(grabAt.x, grabAt.y - 40, { steps: 4 });
await A.mouse.move(target.x, target.y, { steps: 10 });
await wait(A, 150);
const massN = await A.locator('[data-g="mass-count"]').getAttribute("data-n").catch(() => null);
await A.mouse.up();
await wait(B, 800);
sb = await spots(B);
const newPile = sb.piles.find((p) => p.id !== "deck");
check("в пальце — масса из трёх", massN === "3", massN);
check("стянуто на сукно — новая стопка из трёх, карта хвата сверху", newPile?.count === 3 && newPile.ids.at(-1) === f3 && [f1.id, handId].every((id) => newPile.ids.includes(id)), sb.piles);
check("на сукне их больше нет, рука A пуста", !sb.felt.some((f) => [f1.id, f3].includes(f.id)) && (await A.locator("#over [data-card]").count()) === 0, sb.felt.map((f) => f.id));

// В руку: две с сукна подряд, карта хвата последней.
const f5 = await lay(-4.4, -0.4);
const f6 = await lay(2.4, 3.2);
await lassoMode(true);
check("после выхода из лассо выделения нет", (await minePicked()).length === 0, await minePicked());
await tap(A, await feltOf(f5));
await tap(A, await feltOf(f6));
check("выделены две новые", (await minePicked()).join() === [f5, f6].sort().join(), await minePicked());
{
  const from = await feltOf(f5);
  await A.mouse.move(from.x, from.y);
  await A.mouse.down();
  await A.mouse.move(from.x, from.y - 40, { steps: 4 });
  await A.mouse.move(195, 740, { steps: 10 });
  await wait(A, 150);
  await A.mouse.up();
}
await wait(A, 500);
const hand = await A.locator("#over [data-card]").evaluateAll((els) => els.map((el) => el.dataset.card));
check("в руку ушли обе, карта хвата последней", hand.length === 2 && hand.at(-1) === f5 && hand.includes(f6), { hand, felt: (await spots(A)).felt.map((f) => f.id), f5, f6 });

// Как лежат: две карты сукна едут на один сдвиг, каждая со своим углом; выделенные карты руки стоят.
const g0 = await lay(-3.6, 3.6);
const g1 = await lay(1.2, 4.0);
await lassoMode(true);
await bar(A, "grab").click();
check("вид грэба — как лежат", (await bar(A, "grab").getAttribute("data-mode")) === "keep", null);
await tap(A, await feltOf(g0));
await tap(A, await feltOf(g1));
await tap(A, await cardAt(A, `[data-card="${f6}"]`));
const was0 = await feltOf(g0);
const was1 = await feltOf(g1);
await A.mouse.move(was0.x, was0.y);
await A.mouse.down();
await A.mouse.move(was0.x, was0.y - 30, { steps: 4 });
await A.mouse.move(was0.x - 20, was0.y - 90, { steps: 10 });
await wait(A, 150);
const marks = await A.locator('[data-g="mass-mark"]').count();
await A.mouse.up();
await wait(B, 800);
const now0 = await feltOf(g0);
const now1 = await feltOf(g1);
check("пока несут — контур второй карты сукна", marks === 1, marks);
const d0 = { x: now0.x - was0.x, y: now0.y - was0.y };
const d1 = { x: now1.x - was1.x, y: now1.y - was1.y };
check("обе сдвинулись на один и тот же сдвиг", Math.hypot(d0.x, d0.y) > 40 && Math.hypot(d0.x - d1.x, d0.y - d1.y) < 4, { d0, d1 });
check("углы сохранились", now0.angle === was0.angle && now1.angle === was1.angle, [was0, now0, was1, now1]);
check("выделенная карта руки осталась в руке", (await A.locator(`#over [data-card="${f6}"]`).count()) === 1, null);

// ── 6. Курсор не держит камеру: протяжка по пустому сукну двигает стол ─────────────────────────
await lassoMode(true);
await bar(A, "cursor").click();
sa = await spots(A);
const empty = { x: sa.middle.x - 3.2 * k, y: sa.middle.y - 2.4 * k };
if (await A.locator("[data-deck-shut]").count()) await A.locator("[data-deck-shut]").dispatchEvent("pointerdown");
await wait(A, 200);
check("окно колоды закрыто перед камерой", (await A.locator('[data-g="deck-tip"]').count()) === 0, null);
// Стол на зуме 1 во весь кадр и вести его некуда — сперва приблизить щипком.
const cdp = await A.context().newCDPSession(A);
const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
await touch("touchStart", [[empty.x - 30, empty.y], [empty.x + 30, empty.y]]);
for (let i = 1; i <= 16; i += 1) await touch("touchMove", [[empty.x - 30 - i * 6, empty.y], [empty.x + 30 + i * 6, empty.y]]);
await touch("touchEnd", []);
await wait(A, 700);
const view0 = await A.getAttribute("canvas", "data-view");
await A.mouse.move(empty.x, empty.y);
await A.mouse.down();
for (let i = 1; i <= 10; i += 1) await A.mouse.move(empty.x + i * 8, empty.y + i * 5);
await A.mouse.up();
await wait(A, 300);
check("в курсоре камера едет по пустому сукну", (await A.getAttribute("canvas", "data-view")) !== view0, { view0, empty, after: await A.getAttribute("canvas", "data-view") });

await browser.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
}
console.log(`tableLasso ${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
