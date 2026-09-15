// СТОПКУ — В РУКУ И В СТОПКУ. Два браузера. Стопка за индикатор: над своей рукой горит её зона и ложится в руку,
// на стул — в руку стула; в стопку одной стороной — вся её стороной, в стопку вперемешку — как лежала; колода,
// переложенная в стопку целиком, теряет вечность и исчезает, как и любая опустевшая стопка.
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tablePileDrop.mjs [base] [secret]
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
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message, e.stack));
  p.on("console", (m) => m.type() === "error" && console.log(name, "CONSOLE", m.text()));
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
const carry = async (p, from, to, during) => {
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  await p.mouse.move(from.x, from.y - 40, { steps: 4 });
  await p.mouse.move(to.x, to.y, { steps: 12 });
  await wait(p, 150);
  const seen = during ? await during() : null;
  await p.mouse.up();
  await wait(p, 700);
  return seen;
};
const A = await open("A");
const B = await open("B");
const k = (await spots(A)).k;
const pileOf = async (p, id) => (await spots(p)).piles.find((x) => x.id === id);
const gripOf = async (id) => {
  const b = await A.locator(`[data-g="deck-grip"][data-pile="${id}"]`).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

/** Две карты колоды — на сукно (`upFirst` — первую перевернуть), и собрать лассо в стопку. Вернёт id стопки. */
const makePile = async (dx, upFirst = false) => {
  const laid = [];
  for (const [i, off] of [[0, -0.7], [1, 0.7]]) {
    const now = await spots(A);
    const before = new Set(now.felt.map((f) => f.id));
    await carry(A, now.deckTop, { x: now.middle.x + (dx + off) * k, y: now.middle.y + 2.4 * k });
    const one = (await spots(A)).felt.find((f) => !before.has(f.id));
    laid.push(one);
    if (i === 0 && upFirst) {
      await A.mouse.click(one.x, one.y);
      await wait(A, 80);
      await A.mouse.click(one.x, one.y);
      await wait(A, 700);
    }
  }
  const before = new Set((await spots(A)).piles.map((x) => x.id));
  await A.click('[data-section="lasso"]');
  await wait(A, 400);
  for (const one of laid) await tap(A, (await spots(A)).felt.find((f) => f.id === one.id));
  while ((await A.locator('[data-bar="side"]').getAttribute("data-mode")) !== "keep") await A.locator('[data-bar="side"]').click();
  await A.locator('[data-lasso-act="gather"]').dispatchEvent("pointerdown");
  await wait(A, 600);
  await A.click('[data-section="lasso"]');
  await wait(A, 400);
  const made = (await spots(A)).piles.find((x) => !before.has(x.id));
  return { id: made.id, ids: laid.map((f) => f.id) };
};

// ── 1. Стопку — в свою руку: зона руки горит, карты в руке, стопки нет у всех ──────────────────────
const p1 = await makePile(-2);
check("стопка из двух собрана", (await pileOf(B, p1.id))?.count === 2, await spots(B));
const lit = await carry(A, await gripOf(p1.id), { x: 195, y: 790 }, () => A.locator('[data-g="zone"]').evaluate((e) => e.style.borderColor).catch(() => null));
check("над рукой — зона руки горит", lit === "rgb(242, 193, 78)", lit);
const hand = await A.locator("#over [data-card]").evaluateAll((els) => els.map((el) => el.dataset.card));
check("стопка легла в руку целиком", p1.ids.every((id) => hand.includes(id)) && hand.length === 2, hand);
await wait(B, 300);
check("у B стопки больше нет", !(await pileOf(B, p1.id)), (await spots(B)).piles);

// ── 2. Стопку вперемешку — в колоду (вся рубашкой): легли рубашкой, сверху ─────────────────────────
const p2 = await makePile(2, true);
check("вторая стопка вперемешку: одна лицом", (await pileOf(A, p2.id)).up.length === 1, await pileOf(A, p2.id));
const deckAt = (await spots(A)).deckTop;
const deckLit = await carry(A, await gripOf(p2.id), { x: deckAt.x, y: deckAt.y + 10 }, async () => {
  return A.locator('[data-g="deck-zone"][data-here="true"]').count();
});
check("над колодой — её зона горит", deckLit === 1, deckLit);
await wait(B, 300);
let sb = await spots(B);
check("колода одной стороной — легли её стороной (рубашкой), сверху", sb.deckIds.slice(-2).join() === p2.ids.join() && !p2.ids.some((id) => sb.deckUp.includes(id)) && !(await pileOf(B, p2.id)), { tail: sb.deckIds.slice(-2), up: sb.deckUp });

// ── 3. Колоду — в стопку вперемешку: карты как лежали; колода исчезла ───────────────────────────────
const p3 = await makePile(-2, true);
const deckN = (await spots(A)).deck;
const p3At = (await pileOf(A, p3.id)).top;
await carry(A, await gripOf("deck"), { x: p3At.x, y: p3At.y + 10 });
await wait(B, 400);
sb = await spots(B);
const big = await pileOf(B, p3.id);
check("колода легла в стопку вперемешку: все её карты сверху, рубашкой, как лежали", big?.count === deckN + 2 && big.up.length === 1 && big.ids.slice(0, 2).join() === p3.ids.join(), { big, deckN });
check("колода вмержена — вечность потеряна, колоды на столе нет", sb.deck === 0 && sb.spot === null && sb.piles.length === 1, { deck: sb.deck, spot: sb.spot });

// ── 4. Стопку — на стул B: в руку стула B ───────────────────────────────────────────────────────────
const bSeat = (await spots(A)).seats.find((x) => x.who === "B");
const bigN = (await pileOf(A, p3.id)).count;
await carry(A, await gripOf(p3.id), { x: bSeat.x, y: bSeat.y + 30 });
await wait(B, 800);
const bHand = await B.locator("#over [data-card]").count();
check("стопка на стуле B — вся в руке B", bHand === bigN && !(await pileOf(B, p3.id)), { bHand, bigN });

await browser.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
}
console.log(`tablePileDrop ${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
