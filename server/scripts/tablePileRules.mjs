// КОГДА СТОПКА — СТОПКА. Стенд, где админ я. Невечная стопка из одной карты рушится — карта на сукне на её месте;
// вечная стоит и пустой, пустым контуром, и принимает карты; лок мержа (только админ) не пускает стопку ни в
// стопку, ни в руку, и другую стопку в неё; снят — вечная стопка, переложенная целиком, исчезает.
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tablePileRules.mjs [base]
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const browser = await chromium.launch();
const A = await browser.newPage({ viewport: { width: 390, height: 844 } });
A.on("pageerror", (e) => console.log("ERROR", e.message));
await A.goto(`${base}/table/?stand`);
await A.waitForSelector("[data-section]");
await A.waitForTimeout(700);

const checks = [];
for (const ev of ["unhandledRejection", "uncaughtException"]) process.on(ev, (e) => {
  for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
  console.log("CRASH", e.message);
  process.exit(1);
});
const check = (name, ok, got) => checks.push({ name, ok, got });
const wait = (ms = 300) => A.waitForTimeout(ms);
const spots = async () => JSON.parse(await A.getAttribute("canvas", "data-spots"));
const pileOf = async (id) => (await spots()).piles.find((x) => x.id === id);
const gripOf = async (id) => {
  const b = await A.locator(`[data-g="deck-grip"][data-pile="${id}"]`).boundingBox();
  return b && { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const tap = async (at) => {
  await A.mouse.click(at.x, at.y);
  await wait(350);
};
const carry = async (from, to, during) => {
  await A.mouse.move(from.x, from.y);
  await A.mouse.down();
  await A.mouse.move(from.x, from.y - 40, { steps: 4 });
  await A.mouse.move(to.x, to.y, { steps: 12 });
  await wait(150);
  const seen = during ? await during() : null;
  await A.mouse.up();
  await wait(600);
  return seen;
};
const k = (await spots()).k;
const mid = (await spots()).middle;
const at = (dx, dy) => ({ x: mid.x + dx * k, y: mid.y + dy * k });
const lay = async (dx, dy) => {
  const now = await spots();
  const before = new Set(now.felt.map((f) => f.id));
  await carry(now.deckTop, at(dx, dy));
  return (await spots()).felt.find((f) => !before.has(f.id)).id;
};
/** Две карты на сукно и собрать лассо. */
const makePile = async (dx) => {
  const ids = [await lay(dx - 0.7, -2), await lay(dx + 0.7, -2)];
  const before = new Set((await spots()).piles.map((x) => x.id));
  await A.click('[data-section="lasso"]');
  await wait(400);
  for (const id of ids) await tap((await spots()).felt.find((f) => f.id === id));
  await A.locator('[data-lasso-act="gather"]').dispatchEvent("pointerdown");
  await wait(500);
  await A.click('[data-section="lasso"]');
  await wait(400);
  return { id: (await spots()).piles.find((x) => !before.has(x.id)).id, ids };
};
const openTip = async (id) => {
  if ((await A.locator(`[data-g="deck-tip"][data-pile="${id}"]`).count()) === 0) await tap(await gripOf(id));
};
const closeTip = async () => {
  if (await A.locator("[data-deck-shut]").count()) await A.locator("[data-deck-shut]").dispatchEvent("pointerdown");
  await wait(200);
};

// ── 1. Невечная стопка из одной карты рушится ────────────────────────────────────────────────────────
const p1 = await makePile(-2);
const spot1 = (await pileOf(p1.id)).spot;
await carry((await pileOf(p1.id)).top, at(2.5, 2));
let s = await spots();
const rest = s.felt.find((f) => f.id === p1.ids[0]);
check("сняли верхнюю — стопки нет, нижняя карта лежит на сукне на её месте", !(await pileOf(p1.id)) && rest && Math.abs(rest.angle - spot1.angle) < 1e-6, { piles: s.piles.map((x) => x.id), rest, spot1 });

// ── 2. Вечная стопка стоит и пустой — пустым контуром, и принимает карты ─────────────────────────────
const p2 = await makePile(2);
await openTip(p2.id);
const tip = await A.locator('[data-g="deck-tip"]').boundingBox();
const chips = await A.locator('[data-g="deck-tip"] button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
check("в окне стопки все кнопки, и лок мержа, — внутри окна", (await A.locator("[data-deck-seal]").count()) === 1 && Math.max(...chips) <= tip.x + tip.width - 4, { chips, right: tip.x + tip.width });
await A.locator("[data-deck-forever]").dispatchEvent("pointerdown");
await wait(300);
await closeTip();
for (let i = 0; i < 2; i += 1) await carry((await pileOf(p2.id)).top, at(-2.5 + i, 2.6));
const empty = await pileOf(p2.id);
check("вечная опустевшая стопка стоит, индикатор — 0", empty?.count === 0 && (await A.locator(`[data-g="deck-grip"][data-pile="${p2.id}"]`).getAttribute("data-count")) === "0", empty);
const card = (await spots()).felt.at(-1);
const gripNow = await gripOf(p2.id);
await carry(card, { x: gripNow.x, y: gripNow.y - 0.7 * k });
check("в пустую вечную стопку карта ложится", (await pileOf(p2.id))?.count === 1, await pileOf(p2.id));

// ── 3. Лок мержа: только стопкой; одиночная карта — можно ─────────────────────────────────────────
await carry((await spots()).felt.at(-1), { x: (await gripOf(p2.id)).x, y: (await gripOf(p2.id)).y - 0.7 * k });
await openTip(p2.id);
await A.locator("[data-deck-seal]").dispatchEvent("pointerdown");
await wait(300);
check("лок мержа включён", (await pileOf(p2.id)).spot.seal === true, (await pileOf(p2.id)).spot);
await closeTip();
const deckN = (await spots()).deck;
const deckTop = (await spots()).deckTop;
const aimOut = await carry(await gripOf(p2.id), { x: deckTop.x, y: deckTop.y + 12 }, () => A.locator('[data-g="deck-carry"]').getAttribute("data-aim"));
check("стопка под локом мержа над колодой — цель «назад»", aimOut === "back", aimOut);
check("и не вмержилась", (await spots()).deck === deckN && (await pileOf(p2.id))?.count === 2, { deck: (await spots()).deck, p2: await pileOf(p2.id) });
const aimHand = await carry(await gripOf(p2.id), { x: 195, y: 790 }, () => A.locator('[data-g="deck-carry"]').getAttribute("data-aim"));
check("и в руку — «назад»", aimHand === "back" && (await pileOf(p2.id))?.count === 2, aimHand);
const p2Grip = await gripOf(p2.id);
const aimIn = await carry(await gripOf("deck"), { x: p2Grip.x, y: p2Grip.y - 0.7 * k + 12 }, () => A.locator('[data-g="deck-carry"]').getAttribute("data-aim"));
check("колода над стопкой под локом мержа — «назад»", aimIn === "back" && (await spots()).deck === deckN, aimIn);

// ── 4. Лок снят — вечная стопка, вмерженная целиком, исчезает ─────────────────────────────────────────
await openTip(p2.id);
await A.locator("[data-deck-seal]").dispatchEvent("pointerdown");
await wait(300);
await closeTip();
const top4 = (await spots()).deckTop;
await carry(await gripOf(p2.id), { x: top4.x, y: top4.y + 12 });
s = await spots();
check("вечная стопка вмержена в колоду — её нет, в колоде +2", !(await pileOf(p2.id)) && s.deck === deckN + 2, { deck: s.deck, piles: s.piles.map((x) => x.id) });

await browser.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
}
console.log(`tablePileRules ${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
