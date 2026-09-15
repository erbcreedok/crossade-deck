// ДИАЛОГ — два браузера. Клавиатура вместо руки; строка у стула появляется у другого вживую; Enter, пауза 3 с,
// полная строка и закрытие заканчивают её; до трёх строк, новая снизу, старая улетает вверх; счётчик символов;
// тап по игроку или карте — отметка в строке; «не читать» — личное.
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
/** Строки у стула глазами страницы: по номеру, с текстом, законченностью и подъёмом над низом. */
const words = (p) => p.evaluate(() => [...document.querySelectorAll("[data-words] [data-line]:not([data-gone])")].map((el) => ({
  text: el.dataset.text, done: el.dataset.done === "true", n: Number(el.dataset.line), by: el.parentElement.dataset.words,
  lift: Number(el.dataset.lift),
  inks: [...new Set([...el.querySelectorAll("[data-mark]")].filter((g) => g.dataset.mark).map((g) => g.dataset.ink))],
  svg: el.querySelectorAll("svg text").length,
  at: (({ left, top }) => ({ x: Math.round(left), y: Math.round(top) }))(el.parentElement.getBoundingClientRect()),
})).sort((a, b) => a.n - b.n));
const press = async (p, ...keys) => {
  for (const k of keys) {
    // Эмодзи живут в полосе, которая листается: там нажатие — настоящим касанием, на отпускании.
    if (/\p{Extended_Pictographic}/u.test(k)) {
      await p.locator(`[data-emoji-grid] [data-key="${k}"]`).click();
      await p.waitForTimeout(40);
      continue;
    }
    const sel = k === " " ? '[data-key-act="space"]' : k === "⌫" ? '[data-key-act="erase"]' : k === "↵" ? '[data-key-act="enter"]' : `[data-key="${k}"]`;
    await p.locator(sel).dispatchEvent("pointerdown");
    await p.waitForTimeout(40);
  }
};

const A = await open("A");
const B = await open("B");
const left = (p) => p.getAttribute("[data-left]", "data-left").then(Number);
// У A карта в руке — чтобы проверить, что рука уходит с экрана и видна полоской над клавишами.
{
  const s = await spots(A);
  await A.mouse.move(s.deckTop.x, s.deckTop.y);
  await A.mouse.down();
  await A.mouse.move(195, 720, { steps: 8 });
  await A.mouse.up();
  await wait(A, 700);
}

// ── 1. Кнопка диалога: клавиатура въезжает, рука и бар уходят; своя рука — полоской ────────────────
await A.click('[data-section="say"]');
await wait(A, 350);
const opened = await A.evaluate(() => ({
  board: !document.querySelector("[data-keyboard]").hidden,
  hand: document.querySelectorAll("#over [data-card]").length,
  bar: document.querySelectorAll('[data-g="bar"]').length,
  strip: document.querySelectorAll("[data-talk-hand] [data-mention-card]").length,
  first: [...document.querySelectorAll("[data-keyboard] [data-key]")].slice(0, 11).map((k) => k.dataset.key).join(""),
  enter: !!document.querySelector('[data-key-act="enter"]'),
}));
check("клавиатура открыта, руки и бара нет, своя карта — полоской над клавишами", opened.board && opened.hand === 0 && opened.bar === 0 && opened.strip === 1, opened);
check("латиница: 1234567890 и QWERTY; есть Enter", opened.first === "1234567890Q" && opened.enter, opened);
check("счётчик: в пустой строке 24", (await left(A)) === 24, await left(A));
await A.locator('[data-kb-tab="emoji"]').dispatchEvent("pointerdown");
await wait(A, 200);
check("любимые эмодзи сначала пусты — 9 пустых клеток", (await A.locator("[data-favourite-empty]").count()) === 9, await A.locator("[data-favourite-empty]").count());
await A.locator('[data-kb-tab="latin"]').dispatchEvent("pointerdown");

// ── 2. Печать: у B строка вживую, у стула A; пробел — внутри строки ─────────────────────────────────
await press(A, "Q", "W", " ", "E");
await wait(B, 250);
let wb = await words(B);
check("B видит незаконченную строку с пробелом вживую", wb.length === 1 && wb[0].text === "QW E" && !wb[0].done, wb);
check("буквы — SVG, по одной на букву", wb[0]?.svg === 3, wb);
check("счётчик уменьшился до 20", (await left(A)) === 20, await left(A));
const aSeat = (await spots(B)).seats.find((s) => s.who === "A");
const middle = (await spots(B)).middle;
const near = wb[0] && Math.hypot(wb[0].at.x - aSeat.x, wb[0].at.y - aSeat.y) < Math.hypot(wb[0].at.x - middle.x, wb[0].at.y - middle.y) * 1.2 + 80;
check("строка у стула A, между стулом и серединой", near, { word: wb[0]?.at, seat: aSeat, middle });
const covers = await B.evaluate(([x, y, r]) => [...document.querySelectorAll("[data-words] svg")].some((el) => {
  const b = el.getBoundingClientRect();
  return b.left < x + r && b.right > x - r && b.top < y + r && b.bottom > y - r;
}), [aSeat.x, aSeat.y, aSeat.r]);
check("строки не закрывают лицо A у B (A напротив)", !covers, aSeat);
check("у A своя строка тоже у его стула", (await words(A))[0]?.text === "QW E", await words(A));

// ── 3. Стиратель, Enter: закончена — висит; новая — снизу, старая поднялась ─────────────────────────
await press(A, "⌫", "⌫");
await wait(B, 200);
check("стиратель убрал букву и пробел у B", (await words(B))[0]?.text === "QW", await words(B));
await press(A, "↵");
await wait(B, 200);
wb = await words(B);
check("Enter закончил строку сразу", wb[0]?.done === true && wb[0].text === "QW", wb);
check("после Enter счётчик снова 24", (await left(A)) === 24, await left(A));
await press(A, "Z");
await wait(B, 300);
wb = await words(B);
check("новая строка встала снизу, старая поднялась над ней", wb.length === 2 && wb[1].text === "Z" && wb[1].lift === 0 && wb[0].lift > 10, wb);

// ── 4. Пауза 3 с заканчивает строку, законченная живёт 5 с и улетает вверх ─────────────────────────
await wait(B, 1600);
check("1.5 с тишины — строка ещё пишется", (await words(B)).at(-1)?.done === false, await words(B));
await wait(B, 1800);
check("3 с тишины — строка закончена", (await words(B)).at(-1)?.done === true, await words(B));
const flying = await B.evaluate(() => new Promise((done) => {
  const seen = new Set();
  const obs = new MutationObserver(() => document.querySelectorAll("[data-line][data-gone]").forEach((el) => seen.add(el.dataset.text)));
  obs.observe(document.body, { subtree: true, attributes: true, childList: true });
  setTimeout(() => { obs.disconnect(); done([...seen]); }, 4000);
}));
check("старая строка улетела (ушла с анимацией)", flying.includes("QW"), flying);
await wait(B, 3000);
check("и новая исчезла через 5 с после конца", (await words(B)).length === 0, await words(B));

// ── 5. Полная строка обрывает слово; секции; не больше трёх строк ─────────────────────────────────
await A.locator('[data-kb-tab="cyrillic"]').dispatchEvent("pointerdown");
await press(A, "Ә", "Ң", "↵");
await A.locator('[data-kb-tab="emoji"]').dispatchEvent("pointerdown");
await press(A, "😀", "?", "!", "↵");
await A.locator('[data-kb-tab="latin"]').dispatchEvent("pointerdown");
await press(A, ..."ABCDEFGHIJKLMNOPQRSTUVWX");
await press(A, "Y");
await wait(B, 300);
wb = await words(B);
check("24 символа — строка закончена сама, следующая буква — новая строка", wb.some((w) => w.text === "ABCDEFGHIJKLMNOPQRSTUVWX" && w.done) && wb.at(-1)?.text === "Y", wb);
check("у стула не больше трёх строк, самая старая ушла", wb.length === 3 && wb[0].text === "😀?!", wb);
await press(A, "↵");

// ── 6. Отметки: игрок B и карта со стола и из своей руки — в их цвете ─────────────────────────────
// Карта на сукне у B, лицом вверх.
{
  const s = await spots(B);
  await B.mouse.move(s.deckTop.x, s.deckTop.y);
  await B.mouse.down();
  await B.mouse.move(s.middle.x + 60, s.middle.y + 90, { steps: 8 });
  await B.mouse.up();
  await wait(B, 700);
  const f = (await spots(B)).felt[0];
  await B.mouse.click(f.x, f.y);
  await wait(B, 60);
  await B.mouse.click(f.x, f.y);
  await wait(B, 900);
}
await press(A, "Y", "O");
const bSpot = (await spots(A)).seats.find((s) => s.who === "B");
await A.mouse.click(bSpot.x, bSpot.y);
await wait(A, 200);
const felt = (await spots(A)).felt[0];
await A.mouse.click(felt.x, felt.y);
await wait(A, 200);
await A.locator("[data-mention-card]").first().dispatchEvent("pointerdown");
await wait(B, 400);
const bKey = (await words(B)).at(-1)?.text.match(/\[who:([^\]]+)\]/)?.[1];
wb = await words(B);
const last = wb.at(-1);
check("тап по стулу B и по карте на столе не закрыл клавиатуру", !(await A.evaluate(() => document.querySelector("[data-keyboard]").hidden)), null);
check("в строке: текст, отметка B, карта со стола, карта из руки", last && /^YO \[who:[^\]]+\] \[card:[^\]]+\] \[card:[^\]]+\]$/.test(last.text.trimEnd()), last);
const bInk = await B.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--x") || null);
check("отметки нарисованы своими цветами (игрок, масть, рубашка) — не цветом текста", last && last.inks.length >= 2, last);
const handCard = last?.text.match(/\[card:([^\]]+)\]$/)?.[1] ?? last?.text.trimEnd().match(/\[card:([^\]]+)\]$/)?.[1];
const handGlyphs = await B.evaluate((id) => [...document.querySelectorAll(`[data-mark="card:${id}"]`)].map((g) => g.dataset.ch).join(""), handCard);
check("чужую карту в руке A B видит рубашкой, а не лицом", handGlyphs === "🂠", handGlyphs);
const aGlyphs = await A.evaluate((id) => [...document.querySelectorAll(`[data-mark="card:${id}"]`)].map((g) => g.dataset.ch).join(""), handCard);
check("A свою карту видит лицом", aGlyphs && aGlyphs !== "🂠", aGlyphs);
await press(A, "↵");

// ── 6а. Эмодзи: все, полоса листается вправо, любимые — сначала пустые, потом девять самых частых ───
await A.locator('[data-kb-tab="emoji"]').dispatchEvent("pointerdown");
await wait(A, 300);
const emo = await A.evaluate(() => {
  const s = document.querySelector("[data-emoji-strip]");
  return { n: document.querySelectorAll("[data-emoji-grid] [data-key]").length, wide: s.scrollWidth > s.clientWidth * 10, empty: document.querySelectorAll("[data-favourite-empty]").length, box: (({ left, top, width, height }) => ({ left, top, width, height }))(s.getBoundingClientRect()) };
});
check("эмодзи — все (больше 1500), полоса во много экранов шириной", emo.n > 1500 && emo.wide, emo);
const typedBefore = (await words(A)).at(-1)?.text;
await A.mouse.move(emo.box.left + emo.box.width - 30, emo.box.top + 60);
await A.mouse.down();
await A.mouse.move(emo.box.left + 60, emo.box.top + 70, { steps: 10 });
await A.mouse.up();
await wait(A, 600);
const rolled = await A.evaluate(() => document.querySelector("[data-emoji-strip]").scrollLeft);
check("провёл пальцем влево — полоса уехала вправо", rolled > 200, rolled);
check("листание ничего не напечатало", (await words(A)).at(-1)?.text === typedBefore, await words(A));
await press(A, "↵");
for (const [ch, times] of [["🔥", 4], ["😀", 2], ["👍", 1]]) for (let i = 0; i < times; i += 1) await press(A, ch);
await press(A, "↵");
await wait(A, 200);
const favs = await A.evaluate(() => [...document.querySelectorAll("[data-favourite]")].map((b) => b.dataset.key));
check("любимые — по частоте: 🔥 😀 👍, остальные клетки пустые", favs.join("") === "🔥😀👍" && (await A.locator("[data-favourite-empty]").count()) === 6, favs);
await A.locator("[data-favourite]").first().click();
await wait(B, 300);
check("тап по любимому печатает его", (await words(B)).at(-1)?.text === "🔥", await words(B));
await press(A, "↵");

// ── 6б. Стикеры: пустой набор — подсказка про бота; свой стикер — строкой у стула, у B картинкой ────
await A.locator('[data-kb-tab="stickers"]').dispatchEvent("pointerdown");
await wait(A, 400);
check("пустой набор — подсказка про /sticker", (await A.locator("[data-keyboard]").innerText()).includes("/sticker"), null);
const aKey = (await words(A)).at(-1)?.by;
{
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(new URL("../data/crossade.db", import.meta.url).pathname);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  for (let i = 0; i < 20; i += 1) db.prepare("INSERT INTO stickers (id, owner, type, bytes, created_at) VALUES (?, ?, ?, ?, ?)").run(`e2e${Date.now()}${String(i).padStart(2, "0")}`, aKey, "image/png", png, Date.now() + i);
  db.close();
}
await A.locator('[data-kb-tab="latin"]').dispatchEvent("pointerdown");
await A.locator('[data-kb-tab="stickers"]').dispatchEvent("pointerdown");
await wait(A, 500);
check("свой набор пришёл во вкладку — все 20", (await A.locator("[data-sticker]").count()) === 20, await A.locator("[data-sticker]").count());
const st = await A.evaluate(() => {
  const s = document.querySelector("[data-sticker-strip]");
  const last = [...document.querySelectorAll("[data-sticker]")].at(-1).getBoundingClientRect();
  return { wide: s.scrollWidth > s.clientWidth, lastRight: last.right, W: innerWidth, box: (({ left, top, width }) => ({ left, top, width }))(s.getBoundingClientRect()) };
});
check("стикеры не влезают — полоса шире экрана, последний справа за краем", st.wide && st.lastRight > st.W, st);
await A.mouse.move(st.box.left + st.box.width - 30, st.box.top + 40);
await A.mouse.down();
await A.mouse.move(st.box.left + 30, st.box.top + 40, { steps: 10 });
await A.mouse.up();
await wait(A, 500);
check("стикеры листаются вправо", (await A.evaluate(() => document.querySelector("[data-sticker-strip]").scrollLeft)) > 100, null);
await wait(A, 2200);
// Полёт у B: где стикер через 100, 700 и 1500 мс после выстрела — едет вверх, быстро, потом медленнее.
const flight = B.evaluate(() => new Promise((done) => {
  const seen = [];
  const t0 = performance.now();
  const look = () => {
    const el = document.querySelector("[data-g=shots] [data-shot]");
    if (el) {
      const b = el.getBoundingClientRect();
      seen.push({ t: Math.round(performance.now() - t0), y: Math.round(b.top + b.height / 2), x: Math.round(b.left + b.width / 2), o: +getComputedStyle(el).opacity, w: el.offsetWidth });
    } else if (seen.length) return done(seen);
    if (performance.now() - t0 > 3500) return done(seen);
    requestAnimationFrame(look);
  };
  look();
}));
await A.locator("[data-sticker]").last().click();
const path = await flight;
const at = (ms) => path.reduce((best, p) => (Math.abs(p.t - ms) < Math.abs(best.t - ms) ? p : best), path[0]);
const p0 = path[0], p1 = at(path[0].t + 400), p2 = at(path[0].t + 1200), pEnd = path.at(-1);
check("у B стикер A вылетел выстрелом (не строкой)", path.length > 10 && (await words(B)).every((w) => !w.text.includes("sticker")), { n: path.length });
const aDisc = (await spots(B)).seats.find((s) => s.who === "A");
const kB = (await spots(B)).k;
check("вылетает из аватара A", Math.hypot(p0.x - aDisc.x, p0.y - aDisc.y) < kB * 0.3, { p0, aDisc });
check("летит вверх недалеко — около одной карты (A напротив: к середине — вниз)", pEnd.y < p0.y - kB * 0.6 && pEnd.y > p0.y - kB * 1.6, { p0, pEnd, k: kB });
check("размер стикера — в масштабе стола (1.3 карты)", Math.abs(p0.w / kB - 1.3) < 0.1, { w: p0.w, k: kB });
const opaque = path.filter((p) => p.t - p0.t < 1300).every((p) => p.o > 0.95);
check("до 70% полёта не тает", opaque, path.filter((p) => p.o <= 0.95)[0]);
check("быстро в начале, медленно потом", p0.y - p1.y > (p1.y - p2.y) * 1.3, { p0, p1, p2 });
check("испаряется и исчезает за ~2 с", pEnd.t - p0.t < 2300 && pEnd.o < 0.3, pEnd);
// Спам: шесть подряд — в полёте три, у B долетело три, кнопки погасли и вернулись.
await wait(A, 300);
const bCount = B.evaluate(() => new Promise((done) => {
  const ids = new Set();
  const obs = new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.dataset?.shot && ids.add(n))));
  obs.observe(document.querySelector("[data-g=shots]"), { childList: true });
  setTimeout(() => { obs.disconnect(); done(ids.size); }, 1500);
}));
for (let i = 0; i < 6; i += 1) {
  await A.locator("[data-sticker]").nth(i).click();
  await wait(A, 40);
}
const aFly = await A.locator("[data-g=shots] [data-shot]").count();
const cooling = await A.locator('[data-sticker][data-cooling="true"]').count();
check("спам шестью — у A в полёте три", aFly === 3, aFly);
check("у B долетело только три", (await bCount) === 3, await bCount);
check("пока слоты заняты — кнопки стикеров погашены", cooling === 20, cooling);
const turns = await B.evaluate(() => [...document.querySelectorAll("[data-g=shots] [data-shot]")].map((e) => e.dataset.turn));
check("каждый выстрел — чуть другой угол", new Set(turns).size === turns.length && turns.length > 1, turns);
await wait(A, 2200);
check("слоты освободились — кнопки снова горят", (await A.locator('[data-sticker][data-cooling="true"]').count()) === 0, null);
await A.locator('[data-kb-tab="latin"]').dispatchEvent("pointerdown");

// ── 7. Тап мимо: закрывает клавиатуру и ничего больше ────────────────────────────────────────────
const before = await spots(A);
const viewBefore = await A.getAttribute("canvas", "data-view");
await A.mouse.click(30, 330);
await wait(A, 400);
const after = await spots(A);
check("тап по пустому сукну закрыл клавиатуру", await A.evaluate(() => document.querySelector("[data-keyboard]").hidden), null);
check("ничего не взято, камера не сдвинулась", after.deck === before.deck && after.felt.length === before.felt.length && (await A.getAttribute("canvas", "data-view")) === viewBefore, null);
check("рука и бар вернулись", (await A.locator("#over [data-card]").count()) === 1 && (await A.locator('[data-g="bar"]').count()) === 1, null);

// ── 8. Не читать A: у B строк A нет, у A — есть; снова читать ─────────────────────────────────────
const aAt = (await spots(B)).seats.find((s) => s.who === "A");
await B.mouse.click(aAt.x, aAt.y);
await wait(B, 400);
await B.locator("[data-mute]").dispatchEvent("pointerdown");
await wait(B, 200);
check("кнопка «не читать» нажата", (await B.getAttribute("[data-mute]", "aria-pressed")) === "true", null);
check("у B строки A пропали сразу", (await words(B)).filter((w) => w.by !== undefined).length === 0, await words(B));
await A.click('[data-section="say"]');
await wait(A, 300);
await press(A, "M", "U", "T", "E");
await wait(B, 400);
check("A пишет — у B ничего", (await words(B)).length === 0, await words(B));
check("у A своя строка есть", (await words(A)).some((w) => w.text === "MUTE"), await words(A));
await B.reload();
await B.waitForSelector("[data-section]");
await wait(B, 800);
await press(A, "↵", "X");
await wait(B, 400);
check("после перезагрузки B всё ещё не читает A", (await words(B)).length === 0, await words(B));

await browser.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
}
console.log(`tableTalk ${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
