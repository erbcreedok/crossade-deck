// ТУЛТИП КАРТЫ НА СТОЛЕ — тап открывает, всё, кроме камеры, закрывает; след с сервера видит и опоздавший.
//   TABLE_SECRET=dev TABLE_GUESTS=1 PORT=2599 npx tsx src/index.ts   (в соседнем окне)
//   node scripts/tableCardTip.mjs [base] [secret]
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
  await p.waitForSelector("[data-bar]");
  await p.waitForTimeout(400);
  return p;
};
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const spots = async (p) => JSON.parse(await p.getAttribute("canvas", "data-spots"));
const tip = async (p) => p.evaluate(() => {
  const el = document.querySelector('[data-g="card-tip"]');
  return el && { id: el.dataset.card, text: el.textContent, w: el.getBoundingClientRect().width, side: el.dataset.side };
});
const tap = async (p, x, y) => {
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.mouse.up();
  await p.waitForTimeout(300);
};
const drag = async (p, x, y, x2, y2) => {
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.mouse.move(x2, y2, { steps: 10 });
  await p.mouse.up();
  await p.waitForTimeout(600);
};

const A = await open("A");
const m = (await spots(A)).middle;

// Закрытая карта: с колоды на юг.
await drag(A, m.x, m.y, m.x, m.y + 110);
const down = (await spots(A)).felt[0];
await tap(A, down.x, down.y);
let t = await tip(A);
check("тап по карте открыл её тултип", t && t.id === down.id, t);
check("закрытая — без названия, из колоды, двигал A", t && /Рубашкой вверх/.test(t.text) && /из колоды/.test(t.text) && /двигал A/.test(t.text), t);
check("тап не сдвинул карту", JSON.stringify((await spots(A)).felt[0]) === JSON.stringify(down), [(await spots(A)).felt[0], down]);

await tap(A, 40, 200);
check("тап по пустому сукну закрыл", !(await tip(A)), null);

await tap(A, down.x, down.y);
const w1 = (await tip(A))?.w;
await drag(A, 60, 150, 120, 190);
check("пан камеры тултип не закрыл", !!(await tip(A)), null);
// Щипок двумя пальцами по пустому сукну — зум, это камера.
const cdp = await A.context().newCDPSession(A);
const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
await touch("touchStart", [[60, 330], [120, 330]]);
for (let i = 1; i <= 12; i += 1) await touch("touchMove", [[60 - i * 3, 330], [120 + i * 3, 330]]);
await touch("touchEnd", []);
await A.waitForTimeout(500);
const w2 = (await tip(A))?.w;
check("зум: тултип вырос вместе с картой", w2 > w1 * 1.1, [w1, w2]);
const tb = await A.evaluate(() => { const r = document.querySelector('[data-g="card-tip"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await tap(A, tb.x, tb.y);
check("тап по тултипу закрыл", !(await tip(A)), null);
await A.locator("[data-home]").count().then((n) => n && A.locator("[data-home]").dispatchEvent("pointerdown"));
await A.waitForTimeout(300);

// Зажатие — не тап.
const down2 = (await spots(A)).felt[0];
await A.mouse.move(down2.x, down2.y);
await A.mouse.down();
await A.waitForTimeout(600);
await A.mouse.up();
await A.waitForTimeout(400);
check("зажатие тултип не открыло", !(await tip(A)), null);

// Колода — тултип верхней.
const m2 = (await spots(A)).middle;
const top = (await spots(A)).deckTop;
await tap(A, top.x, top.y);
t = await tip(A);
check("тап по колоде — тултип верхней карты", t && /в колоде|Рубашкой/.test(t.text), t);

// Кнопка HUD срабатывает и закрывает тултип.
const fanBefore = await A.locator('[data-bar="fan"]').getAttribute("style");
await A.locator('[data-bar="fan"]').click();
await A.waitForTimeout(300);
check("кнопка HUD сработала", (await A.locator('[data-bar="fan"]').getAttribute("style")) !== fanBefore, null);
check("и тултип закрылся", !(await tip(A)), null);
await A.locator('[data-bar="fan"]').click();

// Открытая карта: колода → рука → стол на север.
await drag(A, m2.x, m2.y, 195, 790);
const hand = await A.evaluate(() => { const r = document.querySelector("[data-card]").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await drag(A, hand.x, hand.y, m2.x + 60, m2.y - 150);
const upCard = (await spots(A)).felt.at(-1);
// Лежащая частично на нижней — тап по видной части нижней.
await drag(A, m2.x, m2.y, upCard.x + 25, upCard.y + 35);
const cover = (await spots(A)).felt.at(-1);
const k = (await spots(A)).k;
const lower = { x: upCard.x - 0.3 * k, y: upCard.y - 0.5 * k };
await tap(A, lower.x, lower.y);
t = await tip(A);
check("тап по видной части нижней карты — её тултип", t && t.id === upCard.id, [t, upCard, cover]);
check("открытая — с названием, из руки A", t && !/Рубашкой/.test(t.text) && /из руки A/.test(t.text), t);
await tap(A, lower.x, lower.y);
check("тап по той же карте тултип закрыл", !(await tip(A)), null);

// Опоздавший.
const B = await open("B");
await B.waitForTimeout(400);
const bUp = (await spots(B)).felt.find((f) => f.id === upCard.id);
const bVis = (await spots(B)).felt; // верхняя сверху, нижнюю ищем по краю, свободному от накрывшей
const cv = bVis.find((f) => f.id === cover.id);
const dl = Math.hypot(bUp.x - cv.x, bUp.y - cv.y);
const kb = (await spots(B)).k;
await tap(B, bUp.x + ((bUp.x - cv.x) / dl) * 0.4 * kb, bUp.y + ((bUp.y - cv.y) / dl) * 0.4 * kb);
t = await tip(B);
check("опоздавший видит след: из руки A, двигал A", t && t.id === upCard.id && /из руки A/.test(t.text) && /двигал A/.test(t.text), [t, bUp, cv]);
const bDown = (await spots(B)).felt.find((f) => f.id === down.id);
await tap(B, bDown.x, bDown.y);
t = await tip(B);
check("у B закрытая тоже без названия", t && t.id === down.id && /Рубашкой вверх/.test(t.text), t);
check("тап B не сдвинул и не переписал след", t && /двигал A/.test(t.text), t);

// Карта в руке: у A внизу — с названием; у B в окне стула A — рубашкой (рука скрыта).
const mA = (await spots(A)).middle;
const tA = (await spots(A)).deckTop;
await drag(A, tA.x, tA.y, 195, 790);
const cardEl = async (p, sel) => p.evaluate((sel) => { const el = document.querySelector(sel); const r = el.getBoundingClientRect(); return { id: el.dataset.card, x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const mineSeat = (await spots(A)).seats.find((x) => x.who === "A").key;
const hc = await cardEl(A, `[data-card][data-owner="${mineSeat}"]`);
const handBefore = await A.locator(`[data-card][data-owner="${mineSeat}"]`).count();
await tap(A, hc.x, hc.y);
t = await tip(A);
check("тап по карте в своей руке — тултип над ней", t && t.id === hc.id && t.side === "up", t);
check("своя — с названием, из колоды, двигал A", t && !/Рубашкой/.test(t.text) && /из колоды/.test(t.text) && /двигал A/.test(t.text), t);
check("тап по руке карту не переложил", (await A.locator(`[data-card][data-owner="${mineSeat}"]`).count()) === handBefore && (await cardEl(A, `[data-card][data-owner="${mineSeat}"]`)).id === hc.id, null);
check("и не открыл тултип карты на столе", t && t.id === hc.id, t);
await tap(A, 40, 200);
check("тап по сукну закрыл тултип руки", !(await tip(A)), null);
await B.waitForTimeout(300);
const seatA = (await spots(B)).seats.find((x) => x.who === "A");
await tap(B, seatA.x, seatA.y);
await B.waitForSelector(`[data-card][data-owner="${seatA.key}"]`);
const wc = await cardEl(B, `[data-card][data-owner="${seatA.key}"]`);
await tap(B, wc.x, wc.y);
t = await tip(B);
check("тап по карте в окне чужого стула — её тултип", t && t.id === wc.id && t.side === "up", t);
check("чужая скрытая — без названия, но двигал A", t && /Рубашкой вверх/.test(t.text) && /двигал A/.test(t.text), t);
check("окно стула осталось открытым", (await B.locator(`[data-tip="${seatA.key}"]`).count()) === 1, null);

const bad = checks.filter((c) => !c.ok);
for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
console.log(`tableCardTip ${checks.length - bad.length}/${checks.length}`);
await browser.close();
process.exit(bad.length ? 1 : 0);
