// РУКА И НИЗ ЭКРАНА: ручка позы на углу руки, меню порядка по тапу, бар без позы/порядка/чата, чат и
// компас под большими пальцами, карты над клавиатурой, бар над системным отступом айфона.
//   TABLE_SECRET=probe TABLE_GUESTS=1 PORT=2611 npx tsx src/index.ts   (preview «table-probe»)
//   node scripts/tableHand.mjs [base] [скриншот.png]
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2611";
const shot = process.argv[3] ?? null;
const W = 390, H = 844;
const browser = await chromium.launch();
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const p = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
const settle = () => p.waitForTimeout(350);

await p.goto(`${base}/table/?stand`);
await p.waitForFunction(() => !!document.querySelector("canvas")?.dataset.spots);
await p.waitForTimeout(700);

// Свои карты помечены id моего стула (`data-owner`) — его берём из того, что экран говорит о себе.
const hand = () => p.evaluate(() => {
  const me = JSON.parse(document.querySelector("canvas").dataset.spots).seats.find((x) => x.who === "Ye")?.key;
  return [...document.querySelectorAll(`[data-card][data-owner="${me}"]`)].map((e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, top: r.top, bottom: r.bottom }; });
});
const box = (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const spread = (cards) => Math.max(...cards.map((c) => c.x)) - Math.min(...cards.map((c) => c.x));
const drag = async (dx, dy) => {
  const h = await box("[data-pose-handle]");
  await p.mouse.move(h.x, h.y); await p.mouse.down();
  await p.mouse.move(h.x + dx, h.y + dy, { steps: 8 }); await p.mouse.up(); await settle();
};

// 0. ПЕРЕСТАНОВКА — ОДИН КОНТУР: куда встанет. На старом месте контура нет, пока карта целится в свою руку;
// понёс на стол — контур на старом месте есть (карта вернётся туда, если передумать).
{
  const me = await p.evaluate(() => JSON.parse(document.querySelector("canvas").dataset.spots).seats.find((x) => x.who === "Ye").key);
  const ids = () => p.evaluate((o) => [...document.querySelectorAll(`[data-card][data-owner="${o}"]`)].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).map((e) => e.dataset.card), me);
  // Контуры мест в руке — без контура места на сукне (у него свой `data-felt-mark`).
  const marks = () => p.evaluate(() => document.querySelectorAll('[data-g="mark"]:not([data-felt-mark])').length);
  const order0 = await ids();
  const first = await p.locator(`[data-card="${order0[0]}"]`).boundingBox();
  const last = await p.locator(`[data-card="${order0.at(-1)}"]`).boundingBox();
  await p.mouse.move(first.x + first.width / 2, first.y + first.height / 2); await p.mouse.down();
  await p.mouse.move(first.x + first.width / 2 + 20, first.y + first.height / 2 - 8, { steps: 5 }); await settle();
  check("взял карту и веду по руке — один контур", (await marks()) === 1, await marks());
  await p.mouse.move(Math.min(W - 8, last.x + last.width * 0.9), last.y + last.height / 2 - 8, { steps: 10 }); await settle();
  check("довёл до края руки — всё так же один", (await marks()) === 1, await marks());
  await p.mouse.up(); await p.waitForTimeout(700);
  const order1 = await ids();
  check("перестановка: карта встала в конец, остальные по порядку", order1.at(-1) === order0[0] && order1.slice(0, -1).join() === order0.slice(1).join(), { order0, order1 });
  const c2 = await p.locator(`[data-card="${order1[1]}"]`).boundingBox();
  await p.mouse.move(c2.x + c2.width / 2, c2.y + c2.height / 2); await p.mouse.down();
  await p.mouse.move(W / 2, 330, { steps: 10 }); await settle();
  check("понёс на стол — контур на старом месте есть", (await marks()) === 1 && (await p.locator("[data-felt-mark]").count()) === 1, await marks());
  await p.mouse.move(c2.x + c2.width / 2, c2.y + c2.height / 2, { steps: 10 }); await settle();
  check("вернул в руку — снова один контур, куда встанет", (await marks()) === 1, await marks());
  await p.mouse.up(); await p.waitForTimeout(700);
  check("отпустил на своём месте — порядок тот же", (await ids()).join() === order1.join(), await ids());
}

// 1. бар
const secs = await p.evaluate(() => [...document.querySelectorAll('[data-g="bar"] [data-section]')].map((e) => e.dataset.section));
check("в баре только «Стул» и «Выбор»", secs.join() === "chair,lasso", secs);

// 2. ручка позы
const c0 = await hand();
check("ручка на верхнем правом углу руки", await (async () => { const h = await box("[data-pose-handle]"); const right = Math.max(...c0.map((c) => c.x)); return h && h.x > right && h.y < Math.min(...c0.map((c) => c.top)) + 40; })());
await drag(-200, 0);
const narrow = await hand();
check("потянул влево — стопкой", spread(narrow) < 2, `${spread(c0).toFixed(0)} → ${spread(narrow).toFixed(0)}`);
await drag(200, 0);
check("вправо — снова широко", spread(await hand()) > spread(c0) * 0.8);
const topFan = Math.min(...(await hand()).map((c) => c.top));
await drag(0, 200);
const tucked = await hand();
check("вниз — рука спрятана", Math.min(...tucked.map((c) => c.top)) > topFan + 40, `${topFan.toFixed(0)} → ${Math.min(...tucked.map((c) => c.top)).toFixed(0)}`);
await drag(0, -400);
const row = await hand();
const ys = row.map((c) => c.top);
check("вверх до конца — выровнена в ряд", Math.max(...ys) - Math.min(...ys) < 2, ys.map((y) => y.toFixed(0)).join(","));
await drag(0, 90);
const fan = await hand();
const fys = fan.map((c) => c.top);
check("посередине — веер", Math.max(...fys) - Math.min(...fys) > 4, fys.map((y) => y.toFixed(0)).join(","));

// 2б. РУЧКА НЕ НАЕЗЖАЕТ НА КАРТЫ — ни в веере, ни в ряду; чат над ней, а не на ней.
{
  const overlap = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const cardsBoxes = () => p.evaluate(() => {
    const me = JSON.parse(document.querySelector("canvas").dataset.spots).seats.find((x) => x.who === "Ye").key;
    return [...document.querySelectorAll(`[data-card][data-owner="${me}"]`)].map((e) => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
  });
  const check2 = async (pose) => {
    const hb = await box("[data-pose-handle]");
    const hit = (await cardsBoxes()).some((c) => overlap(hb, c));
    check(`${pose}: ручка не наезжает ни на одну карту`, !hit, hb);
    check(`${pose}: чат не наезжает на ручку`, !overlap(await box('[data-g="thumb-chat"]'), hb));
    check(`${pose}: ручка не меньше 44 px`, hb.right - hb.left >= 44, hb.right - hb.left);
  };
  await check2("веер");
  await drag(0, -400);
  await check2("ряд");
  await drag(0, 90);
}

// 3. меню порядка
const hb = await box("[data-pose-handle]");
await p.mouse.click(hb.x, hb.y); await settle();
const items = await p.evaluate(() => [...document.querySelectorAll("[data-hand-do]")].map((e) => e.textContent));
check("тап по ручке — меню порядка", items.join("|") === "По масти|По номиналу|Перемешать|Перевернуть|Наоборот", items);
// Меню поверх всего: ни чат, ни компас не закрывают ни одного пункта.
const coveredItems = await p.evaluate(() => [...document.querySelectorAll("[data-hand-do]")].filter((e) => { const r = e.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width * 0.85, r.top + r.height / 2); return !at?.closest("[data-hand-do]"); }).map((e) => e.textContent));
check("меню ничем не закрыто", coveredItems.length === 0, coveredItems);
if (shot) await p.screenshot({ path: shot });
await p.locator('[data-hand-do="rank"]').click(); await settle();
check("пункт меню сработал и закрыл меню", (await p.locator("[data-hand-menu]").count()) === 0);
await p.mouse.click(hb.x, hb.y); await settle();
await p.mouse.click(W / 2, 300); await settle();
check("касание мимо закрывает меню", (await p.locator("[data-hand-menu]").count()) === 0);

// 4. большие пальцы
const chat = await box('[data-g="thumb-chat"]');
const home = await box("[data-home]");
const handTop = Math.min(...(await hand()).map((c) => c.top));
check("чат — справа над рукой", chat && chat.x > W / 2 && chat.bottom <= handTop + 4, chat);
check("компас — слева над рукой", home && home.x < W / 2 && home.bottom <= handTop + 4, home);

// 5. клавиатура не закрывает карты
await p.locator('[data-g="thumb-chat"] [data-section="say"]').click(); await settle();
const kb = await box("[data-keyboard]");
const up = await hand();
check("открыт чат — карты над клавиатурой", kb && up.length > 0 && Math.max(...up.map((c) => c.bottom)) <= kb.top, { kbTop: kb?.top, cardsBottom: Math.max(...up.map((c) => c.bottom)) });
await p.locator('[data-key-act="close"]').click(); await settle();

// 6. системный отступ снизу
const bar0 = await box('[data-g="bar"]');
check("без системного отступа бар у самого низа", Math.abs(bar0.bottom - H) < 1, bar0);
await p.evaluate(() => document.documentElement.style.setProperty("--tg-safe-area-inset-bottom", "34px"));
await p.evaluate(() => dispatchEvent(new Event("resize"))); await settle();
const btn0 = await box('[data-g="bar"] [data-section]');
await p.evaluate(() => document.documentElement.style.removeProperty("--tg-safe-area-inset-bottom"));
await p.evaluate(() => dispatchEvent(new Event("resize"))); await settle();
const btn1 = await box('[data-g="bar"] [data-section]');
check("отступ 34 px — кнопки бара выше ровно на 34", Math.abs(btn1.top - btn0.top - 34) < 1.5, `${btn0.top.toFixed(1)} vs ${btn1.top.toFixed(1)}`);

check("без ошибок на странице", errors.length === 0, errors.slice(0, 2).join(" | "));
await browser.close();
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.got !== undefined ? ` — ${typeof c.got === "object" ? JSON.stringify(c.got) : c.got}` : ""}`);
const bad = checks.filter((c) => !c.ok).length;
console.log(bad ? `\nУПАЛО: ${bad}` : "\nвсё зелёное");
process.exit(bad ? 1 : 0);
