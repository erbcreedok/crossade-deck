// ПЕРЕВОРОТ ДВОЙНЫМ ТАПОМ — два браузера. Колода (верхняя), сукно, своя рука, чужая рука в окне стула.
// Место и порядок не меняются, играется переворот, сторона живёт дальше; в руке худ и стул показывают
// противоположные стороны; скрытый стул — рубашки; след — «двигал я», «откуда» — от последнего переноса.
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableTurn.mjs [base] [secret]
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
const spots = async (p) => JSON.parse(await p.getAttribute("canvas", "data-spots"));
const wait = (p, ms = 500) => p.waitForTimeout(ms);
const doubleTap = async (p, x, y) => {
  await p.mouse.click(x, y);
  await p.waitForTimeout(90);
  await p.mouse.click(x, y);
};
/** Сколько кадров подряд стол сообщал о перевороте этой карты — снимается каждые 30 мс. */
const watchTurning = (p, id, ms = 500) => p.evaluate(([id, ms]) => new Promise((done) => {
  let n = 0;
  const t = setInterval(() => (JSON.parse(document.querySelector("canvas").dataset.spots).turning.includes(id) && (n += 1)), 30);
  setTimeout(() => (clearInterval(t), done(n)), ms);
}), [id, ms]);
const drag = async (p, x, y, x2, y2) => {
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.mouse.move(x2, y2, { steps: 10 });
  await p.mouse.up();
  await wait(p, 700);
};
const cards = (p, owner) => p.evaluate((o) => [...document.querySelectorAll(`[data-card][data-owner="${o}"]`)].map((el) => {
  const r = el.getBoundingClientRect();
  const labels = [...el.querySelectorAll("[aria-label]")].map((s) => s.getAttribute("aria-label"));
  return { id: el.dataset.card, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), z: el.style.zIndex, label: labels.at(-1) };
}), owner);

const A = await open("A");
const B = await open("B");
const aSeat = (await spots(A)).seats.find((s) => s.who === "A").key;

// ── 1. Колода: верхняя лицом вверх, у обоих; переворот играется ───────────────────────────────────
let top = await spots(A);
const turningA = watchTurning(A, null);
await doubleTap(A, top.deckTop.x, top.deckTop.y);
await wait(A, 700);
check("колода: верхняя открыта у A", (await spots(A)).deckFace !== null, (await spots(A)).deckFace);
check("колода: и у B", (await spots(B)).deckFace !== null, (await spots(B)).deckFace);
await turningA;

// ── 2. С колоды на сукно — как лежала, лицом; B переворачивает на сукне: место и угол те же ─────────
await drag(A, top.deckTop.x, top.deckTop.y, 150, 330);
let felt = (await spots(B)).felt;
check("открытая с колоды легла лицом вверх", felt.length === 1 && felt[0].up && felt[0].face, felt);
const before = felt[0];
const seen = watchTurning(B, before.id, 450);
await doubleTap(B, before.x, before.y);
const frames = await seen;
await wait(B, 500);
felt = (await spots(B)).felt;
check("сукно: B перевернул — рубашкой вверх", felt[0].up === false && felt[0].face === null, felt);
check("сукно: место и угол не сдвинулись", felt[0].x === before.x && felt[0].y === before.y && felt[0].angle === before.angle, [before, felt[0]]);
check("сукно: переворот игрался несколько кадров", frames >= 3, frames);
check("сукно: у A тоже рубашкой", (await spots(A)).felt[0].up === false, (await spots(A)).felt);

// ── 3. Своя рука: три карты, перевернуть одну — рубашкой к себе, место и слой те же, анимация ─────────
for (let i = 0; i < 3; i += 1) {
  const s = await spots(A);
  await drag(A, s.deckTop.x, s.deckTop.y, 195, 720);
}
let mine = await cards(A, aSeat);
const target = mine[1];
await doubleTap(A, target.x, target.y);
await wait(A, 60);
const midTurn = await A.evaluate((id) => [...document.querySelectorAll(`[data-card="${id}"] [data-g=turn]`)].map((el) => el.getAnimations().length), target.id);
check("рука: переворот — две стороны в анимации", midTurn.length === 2 && midTurn.every((n) => n > 0), midTurn);
await wait(A, 600);
mine = await cards(A, aSeat);
const turned = mine.find((c) => c.id === target.id);
check("рука: перевёрнутая — рубашкой ко мне, остальные лицом", turned.label === "рубашка" && mine.filter((c) => c.id !== target.id).every((c) => c.label !== "рубашка"), mine);
check("рука: место и слой карты те же", Math.abs(turned.x - target.x) < 2 && Math.abs(turned.y - target.y) < 2 && turned.z === target.z, [target, turned]);

// ── 4. Скрыт: у B всё рубашкой, на стуле открытых нет. Снял «скрыть»: в худе 2 лица и рубашка, на стуле — одна открытая ──
const aSpot = (await spots(B)).seats.find((s) => s.who === "A");
await B.mouse.click(aSpot.x, aSpot.y);
await wait(B);
let tip = await cards(B, aSeat);
check("скрыт: у B в окне стула A все рубашкой", tip.length === 3 && tip.every((c) => c.label === "рубашка"), tip);
check("скрыт: на стуле открытых нет", (await spots(B)).seats.find((s) => s.key === aSeat).open.length === 0, null);
await A.click('[data-section="chair"]');
await wait(A);
await A.click('[data-bar="hide"]');
await wait(B, 900);
tip = await cards(B, aSeat);
check("не скрыт: в окне стула у B — 2 лица и 1 рубашка (перевёрнутая)", tip.filter((c) => c.label === "рубашка").map((c) => c.id).join() === target.id && tip.length === 3, tip);
check("не скрыт: на стуле наоборот — открыта одна, перевёрнутая", (await spots(B)).seats.find((s) => s.key === aSeat).open.join() === target.id, (await spots(B)).seats.find((s) => s.key === aSeat));

// ── 5. Чужая рука в окне стула: B переворачивает карту A; след — «двигал B», «откуда» не перетёрт ──────────────
const other = tip.find((c) => c.id !== target.id);
await doubleTap(B, other.x, other.y);
await wait(B, 900);
check("B перевернул карту в руке A — у A она рубашкой к нему", (await cards(A, aSeat)).find((c) => c.id === other.id).label === "рубашка", await cards(A, aSeat));
const otherAtA = (await cards(A, aSeat)).find((c) => c.id === other.id);
await wait(A, 400);
await A.mouse.click(otherAtA.x, otherAtA.y);
await wait(A, 300);
const tipText = await A.evaluate(() => document.querySelector('[data-g="card-tip"]')?.textContent ?? null);
check("тап у A: «двигал B», «откуда» — по последнему переносу (из колоды)", /двигал B/.test(tipText ?? "") && /из колоды/.test(tipText ?? ""), tipText);
await A.mouse.click(30, 150);

// ── 6. Где тап не проходит — и двойной: лок стула A, B не переворачивает ───────────────────────────────
await A.click('[data-bar="lock"]');
await wait(B, 900);
tip = await cards(B, aSeat);
const locked = tip.find((c) => c.id !== target.id && c.id !== other.id);
const labelBefore = (await cards(A, aSeat)).find((c) => c.id === locked.id).label;
await doubleTap(B, locked.x, locked.y);
await wait(B, 900);
check("лок: B не перевернул карту A", (await cards(A, aSeat)).find((c) => c.id === locked.id).label === labelBefore, labelBefore);

// ── 7. Из руки на стол: перевёрнутая ложится рубашкой, неперевёрнутая — лицом; в руку — снова лицом к себе ──
await A.click('[data-bar="lock"]');
await wait(A, 600);
mine = await cards(A, aSeat);
const back = mine.find((c) => c.id === target.id);
await drag(A, back.x, back.y, 250, 300);
felt = (await spots(A)).felt.find((f) => f.id === target.id);
check("перевёрнутая из руки легла на стол рубашкой", felt && felt.up === false, felt);
await drag(A, felt.x, felt.y, 195, 720);
check("со стола в руку — снова лицом к себе", (await cards(A, aSeat)).find((c) => c.id === target.id)?.label !== "рубашка", await cards(A, aSeat));

await browser.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
}
console.log(`tableTurn ${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
