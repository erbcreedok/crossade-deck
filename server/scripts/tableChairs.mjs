// СТУЛЬЯ — касаниями: покинутый стул с картами, «Сесть», флаги кнопками и значками, лок, вечный.
//   node scripts/tableChairs.mjs [base] [secret]     сервер с TABLE_GUESTS=1 уже поднят
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2590";
const secret = process.argv[3] ?? "dev";
const browser = await chromium.launch();
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

async function open(url) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("ERROR", e.message));
  await page.goto(url);
  await page.waitForSelector("[data-section]");
  await page.waitForTimeout(300);
  const scene = async () => JSON.parse(await page.getAttribute("canvas", "data-spots"));
  const tap = async (x, y) => {
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(250);
  };
  const tapEl = async (sel) => {
    const b = await page.locator(sel).first().boundingBox();
    await tap(b.x + b.width / 2, b.y + b.height / 2);
  };
  return { page, ctx, scene, tap, tapEl, hand: () => page.locator('[data-card][data-owner]').evaluateAll((els, seat) => els.length, null) };
}

// ── СТЕНД: я админ, Алия сидит, стул Тимура покинут с тремя картами ───────────────────────────────
{
  const s = await open(`${base}/table/?stand`);
  const sc = await s.scene();
  const empty = sc.seats.find((x) => x.who === undefined);
  const alia = sc.seats.find((x) => x.who === "Алия");
  const mineSeat = sc.seats.find((x) => x.who === "Ye");
  check("покинутый стул нарисован", Boolean(empty), sc.seats);

  await s.tap(empty.x, empty.y);
  const tip = s.page.locator(`[data-tip="${empty.key}"]`);
  check("тап по пустому стулу открывает его окно", (await tip.count()) === 1, null);
  check("в окне — «Пустой стул» и кнопка «Сесть»", (await tip.innerText()).includes("Пустой стул") && (await s.page.locator(`[data-sit="${empty.key}"]`).count()) === 1, await tip.innerText());
  check("в окне пустого стула — оставшиеся карты", (await s.page.locator(`[data-owner="${empty.key}"]`).count()) === 3, null);
  check("флаги пустого стула — кнопками", (await s.page.locator(`[data-flag][data-chair="${empty.key}"]`).count()) === 4, null);

  await s.tapEl(`[data-flag="forever"][data-chair="${empty.key}"]`);
  check("вечный включается на пустом стуле", (await s.page.getAttribute(`[data-flag="forever"][data-chair="${empty.key}"]`, "aria-pressed")) === "true", null);

  // РАСПОРЯДИТЕЛЬ СНИМАЕТ ЧУЖОЙ ЗАМОК, НО НЕ ОБХОДИТ ЕГО (`access.mayFlagChair`, право `hand.flags`):
  // флаги занятого чужого стула у него кнопками — иначе запертый стул ушедшего разгрести нечем, —
  // а карты из запертой руки он, пока замок стоит, не берёт. Алия заперла руку на стенде.
  await s.tapEl(`[data-shut="${empty.key}"]`);
  await s.tap(alia.x, alia.y);
  const flagButtons = await s.page.locator(`[data-flag][data-chair="${alia.key}"]`).count();
  check("распорядитель: флаги чужого занятого стула — кнопками", flagButtons === 4, flagButtons);
  check("распорядитель: «Поменять местами» в окне чужого стула", (await s.page.locator(`[data-swap="${alia.key}"]`).count()) === 1, null);
  const shut = await s.page.locator(`[data-owner="${alia.key}"]`).first().evaluate((e) => getComputedStyle(e).pointerEvents);
  check("рука Алии заперта — её карты не берутся", shut === "none", shut);

  // Сесть на пустой: его три карты — мои, мой стул с семью картами — покинут и вечный.
  const before = await s.page.locator(`[data-owner="${mineSeat.key}"]`).count();
  await s.tapEl(`[data-shut="${alia.key}"]`);
  await s.tap(empty.x, empty.y);
  await s.tapEl(`[data-sit="${empty.key}"]`);
  await s.page.waitForTimeout(300);
  check("сел — внизу рука пустого стула", (await s.page.locator(`[data-owner="${empty.key}"]`).count()) === 3, before);
  const sc2 = await s.scene();
  const old = sc2.seats.find((x) => x.key === mineSeat.key);
  check("старый стул с картами остался покинутым", old && old.who === undefined, sc2.seats);
  await s.tap(old.x, old.y);
  check("старый стул стал вечным", (await s.page.getAttribute(`[data-flag="forever"][data-chair="${mineSeat.key}"]`, "aria-pressed")) === "true", null);

  // Нижний HUD: «вечный» моего стула — кнопкой; уже включён (включил на пустом), тап — выключает.
  await s.tapEl('[data-section="chair"]');
  await s.page.waitForTimeout(400);
  const lit = async () => s.page.locator('[data-bar="forever"]').evaluate((e) => e.style.background.includes("gradient") && e.innerHTML.includes('stroke="#0b0704"'));
  check("вечный в нижнем HUD горит", await lit(), null);
  await s.tapEl('[data-bar="forever"]');
  check("вечный в нижнем HUD выключается", !(await lit()), null);
  await s.page.screenshot({ path: process.env.SHOT ?? "chairs.png" });
  await s.ctx.close();
}

// ── СЕТЬ: не админ видит флаги чужого стула значками; ушедший оставляет стул с картами ─────────────
{
  const body = randomBytes(8).toString("base64url");
  const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);
  const a = await open(`${base}/table/?room=${room}&name=A`);
  const b = await open(`${base}/table/?room=${room}&name=B`);
  await a.page.waitForTimeout(400);

  // B берёт карту с колоды в руку.
  const bs = await b.scene();
  await b.page.touchscreen.tap(1, 1);
  const deck = bs.deckTop;
  await b.page.mouse.move(deck.x, deck.y);
  await b.page.mouse.down();
  await b.page.mouse.move(195, 720, { steps: 8 });
  await b.page.mouse.up();
  await b.page.waitForTimeout(500);

  const as = await a.scene();
  const bSeat = as.seats.find((x) => x.who === "B");
  await a.tap(bSeat.x, bSeat.y);
  check("не админ: флаги чужого стула — значками, не кнопками", (await a.page.locator(`[data-tip="${bSeat.key}"] [data-status]`).count()) === 4 && (await a.page.locator(`[data-tip="${bSeat.key}"] [data-flag]`).count()) === 0, null);
  check("скрыть по умолчанию — чужая карта рубашкой", (await a.page.locator(`[data-owner="${bSeat.key}"] span span`).count()) === 1, null);

  await b.ctx.close();
  await a.page.waitForTimeout(800);
  const as2 = await a.scene();
  const left = as2.seats.find((x) => x.key === bSeat.key);
  check("B ушёл с картой — стул остался покинутым", left && left.who === undefined, as2.seats);
  check("у покинутого стула флаги — кнопками", (await a.page.locator(`[data-tip="${bSeat.key}"] [data-flag]`).count()) === 4, null);
  await a.tapEl(`[data-sit="${bSeat.key}"]`);
  await a.page.waitForTimeout(500);
  check("A сел на стул B и держит его карту", (await a.page.locator(`[data-owner="${bSeat.key}"]`).count()) === 1, null);
  await a.ctx.close();
}

await browser.close();
for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
if (checks.some((c) => !c.ok)) process.exitCode = 1;
