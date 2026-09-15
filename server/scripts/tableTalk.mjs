// ДИАЛОГ — два браузера. Клавиатура вместо руки; буквы у стула появляются у другого вживую; пробел, пауза,
// лимит и закрытие заканчивают слово, законченное исчезает целиком; до трёх слов, новое выше, нижнее ушло —
// остальные падают; касание вне клавиатуры только закрывает её.
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableTalk.mjs [base] [secret]
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
/** Слова у стула глазами страницы: снизу вверх, с текстом, законченностью и сдвигом вверх. */
const words = (p) => p.evaluate(() => [...document.querySelectorAll("[data-words] [data-word]:not([data-gone])")].map((el) => ({
  text: el.dataset.text, done: el.dataset.done === "true", n: Number(el.dataset.word),
  lift: Math.round(-new DOMMatrix(getComputedStyle(el).transform).m42),
  svg: el.querySelectorAll("svg text").length,
  at: (({ left, top }) => ({ x: Math.round(left), y: Math.round(top) }))(el.parentElement.getBoundingClientRect()),
})).sort((a, b) => a.n - b.n));
const press = async (p, ...keys) => {
  for (const k of keys) {
    const sel = k === " " ? '[data-key-act="space"]' : k === "⌫" ? '[data-key-act="erase"]' : `[data-key="${k}"]`;
    await p.locator(sel).dispatchEvent("pointerdown");
    await p.waitForTimeout(40);
  }
};

const A = await open("A");
const B = await open("B");
// У A карта в руке — чтобы проверить, что рука уходит.
{
  const s = await spots(A);
  await A.mouse.move(s.deckTop.x, s.deckTop.y);
  await A.mouse.down();
  await A.mouse.move(195, 720, { steps: 8 });
  await A.mouse.up();
  await wait(A, 700);
}

// ── 1. Кнопка диалога: клавиатура въезжает, рука и бар уходят ──────────────────────────────────────
await A.click('[data-section="say"]');
await wait(A, 350);
const opened = await A.evaluate(() => ({
  board: !document.querySelector("[data-keyboard]").hidden,
  hand: document.querySelectorAll("#over [data-card]").length,
  bar: document.querySelectorAll('[data-g="bar"]').length,
  rows: [...document.querySelectorAll("[data-keyboard] > div")].map((r) => r.children.length),
  first: [...document.querySelectorAll("[data-keyboard] [data-key]")].slice(0, 11).map((k) => k.dataset.key).join(""),
}));
check("клавиатура открыта, руки и бара нет", opened.board && opened.hand === 0 && opened.bar === 0, opened);
check("латиница: 1234567890 и QWERTY, внизу ? ! пробел ⌫", opened.first === "1234567890Q" && opened.rows.at(-1) === 4, opened);

// ── 2. Печать: у B буквы вживую, SVG, заглавные; у стула A — перед ним ─────────────────────────────
await press(A, "Q", "W");
await wait(B, 250);
let wb = await words(B);
check("B видит незаконченное слово вживую", wb.length === 1 && wb[0].text === "QW" && !wb[0].done, wb);
check("буквы — SVG, по одной на букву", wb[0]?.svg === 2, wb);
const aSeat = (await spots(B)).seats.find((s) => s.who === "A");
const middle = (await spots(B)).middle;
const near = wb[0] && Math.hypot(wb[0].at.x - aSeat.x, wb[0].at.y - aSeat.y) < Math.hypot(wb[0].at.x - middle.x, wb[0].at.y - middle.y) * 1.2 + 80;
check("слово у стула A, между стулом и серединой", near, { word: wb[0]?.at, seat: aSeat, middle });
// Лицо A не закрыто словами: ни одна буква не заходит в его диск.
const covers = await B.evaluate(([x, y, r]) => [...document.querySelectorAll("[data-words] svg")].some((el) => {
  const b = el.getBoundingClientRect();
  return b.left < x + r && b.right > x - r && b.top < y + r && b.bottom > y - r;
}), [aSeat.x, aSeat.y, aSeat.r]);
check("слова не закрывают лицо A у B (A напротив)", !covers, aSeat);
check("у A своё слово тоже у его стула", (await words(A))[0]?.text === "QW", await words(A));

// ── 3. Стиратель, пробел: закончено — висит, потом исчезает целиком ────────────────────────────────
await press(A, "E", "⌫");
await wait(B, 200);
check("стиратель убрал букву у B", (await words(B))[0]?.text === "QW", await words(B));
await press(A, " ");
await wait(B, 200);
wb = await words(B);
check("пробел закончил слово сразу", wb[0]?.done === true && wb[0].text === "QW", wb);
await wait(B, 1000);
check("законченное ещё висит", (await words(B)).length === 1, await words(B));

// ── 4. Новое слово — выше; старое исчезло — новое падает вниз ──────────────────────────────────────
await press(A, "Z");
await wait(B, 200);
wb = await words(B);
check("пока старое висит, новое — выше", wb.length === 2 && wb[1].text === "Z" && wb[1].lift > wb[0].lift + 10, wb);
await wait(B, 1400);
wb = await words(B);
check("старое исчезло целиком, новое упало на его место", wb.length === 1 && wb[0].text === "Z" && wb[0].lift < 3, wb);

// ── 5. Пауза заканчивает слово ─────────────────────────────────────────────────────────────────────
await wait(B, 1200);
check("замолчал — слово закончено", (await words(B))[0]?.done === true, await words(B));
await wait(B, 2200);
check("и исчезло", (await words(B)).length === 0, await words(B));

// ── 6. Лимит букв, секции: кириллица с казахскими, эмодзи; не больше трёх слов ──────────────────────
await A.locator('[data-kb-tab="cyrillic"]').dispatchEvent("pointerdown");
await press(A, "Ә", "Ң", " ");
await A.locator('[data-kb-tab="emoji"]').dispatchEvent("pointerdown");
await press(A, "😀", "?", "!", " ");
await A.locator('[data-kb-tab="latin"]').dispatchEvent("pointerdown");
await press(A, ..."ABCDEFGHIJKLMNOP");
await press(A, "Y");
await wait(B, 250);
wb = await words(B);
check("кириллица с казахскими и эмодзи с ? ! дошли", wb.some((w) => w.text === "ӘҢ") || wb.some((w) => w.text === "😀?!"), wb);
check("16 букв — слово закончено само, следующая буква — новое слово", wb.some((w) => w.text === "ABCDEFGHIJKLMNOP" && w.done) && wb.at(-1)?.text === "Y", wb);
check("у стула не больше трёх слов", wb.length === 3 && wb[0].text === "😀?!", wb);

// ── 7. Касание вне клавиатуры: закрывает её и ничего больше; незаконченное — закончено ────────────
const before = await spots(A);
const viewBefore = await A.getAttribute("canvas", "data-view");
await A.mouse.move(before.deckTop.x, before.deckTop.y);
await A.mouse.down();
await A.mouse.move(before.deckTop.x + 80, before.deckTop.y + 60, { steps: 6 });
await A.mouse.up();
await wait(A, 400);
const after = await spots(A);
check("тап по колоде закрыл клавиатуру", await A.evaluate(() => document.querySelector("[data-keyboard]").hidden), null);
check("карта не взята, камера не сдвинулась, тултипа нет", after.deck === before.deck && after.felt.length === 0 && (await A.getAttribute("canvas", "data-view")) === viewBefore && (await A.locator('[data-g="card-tip"]').count()) === 0, { before: before.deck, after: after.deck });
check("рука и бар вернулись", (await A.locator("#over [data-card]").count()) === 1 && (await A.locator('[data-g="bar"]').count()) === 1, null);
await wait(B, 200);
check("закрытие закончило слово", (await words(B)).at(-1)?.done === true, await words(B));

await A.click('[data-section="say"]');
await wait(A, 350);
const bSpot = (await spots(A)).seats.find((s) => s.who === "B");
await A.mouse.click(bSpot.x, bSpot.y);
await wait(A, 400);
check("тап по стулу закрыл клавиатуру и не открыл окно стула", (await A.locator('[data-g="tip"]').count()) === 0 && (await A.evaluate(() => document.querySelector("[data-keyboard]").hidden)), null);

await browser.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
}
console.log(`tableTalk ${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
