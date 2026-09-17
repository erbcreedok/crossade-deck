// ШИРОКИЙ ЭКРАН: потолок единицы HUD, рука И ПОЛОСА в одном контейнере по центру, начальный зум — весь стол в кадре.
//
// Три кадра: айфон в портрете, айфон в ландшафте, десктоп во весь экран. На каждом меряются ЧИСЛА —
// глазами масштаб не проверяется, а «кнопки абсурдно большие» — это именно число.
//
// ВАЖНО ПРО МЕРКУ: ширина карты берётся `offsetWidth`, а не из `getBoundingClientRect`. Карты веера
// повёрнуты, и прямоугольник вокруг повёрнутой карты шире её самой на треть — по нему соотношение
// «карта на сукне к карте в руке» читается неверно, и сторож молча меряет не то.
//   TABLE_SECRET=dev TABLE_GUESTS=1 PORT=2599 npx tsx src/index.ts   (в соседнем окне)
//   node scripts/tableFrame.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const secret = process.argv[3] ?? "dev";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);

/** Потолок единицы HUD и максимальная ширина руки — те же числа, что в `screen.ts`. */
const HUD_UNIT_MAX = Math.round(390 * 0.25 * 1.15);
const HAND_MAX_PX = 585;
/** Кнопка бара — `BAR.size` от единицы. */
const BUTTON_OF_UNIT = 0.6;
/** Сколько высоты кадра отдано клавиатуре и ниже какой клавиши она не ужимается — `talk.ts`. */
const BOARD_SHARE = 0.62;
const MIN_KEY = 24;
/** Стол с кромкой — те же числа, что в `felt.ts`. */
const R = 8;
const RIM = 0.09 + 0.33 + 0.18;

const browser = await chromium.launch();
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

const FRAMES = [
  { name: "айфон-портрет", w: 390, h: 844 },
  { name: "айфон-ландшафт", w: 844, h: 390 },
  { name: "десктоп во весь экран", w: 1920, h: 1080 },
];

for (const f of FRAMES) {
  const p = await browser.newPage({ viewport: { width: f.w, height: f.h } });
  p.on("pageerror", (e) => console.log(f.name, "ERROR", e.message));
  await p.goto(`${base}/table/?room=${room}&name=A`);
  await p.waitForSelector("[data-section]");
  await p.waitForTimeout(900);

  // Шесть карт в руку — столько же, по скольким считается начальный зум.
  const start = JSON.parse(await p.getAttribute("canvas", "data-spots"));
  for (let i = 0; i < 6; i += 1) {
    await p.mouse.move(start.middle.x, start.middle.y);
    await p.mouse.down();
    await p.mouse.move(f.w / 2, f.h - 60, { steps: 8 });
    await p.mouse.up();
    await p.waitForTimeout(350);
  }

  const m = await p.evaluate(() => {
    const cards = [...document.querySelectorAll("[data-card]")].map((e) => {
      const r = e.getBoundingClientRect();
      return { left: r.left, right: r.right, bottom: r.bottom, w: e.offsetWidth || r.width };
    });
    const hand = cards.filter((c) => c.bottom > innerHeight * 0.6);
    const btn = document.querySelector("button[data-section]")?.getBoundingClientRect();
    const barNode = document.querySelector('[data-g="bar"]');
    const barEl = barNode?.getBoundingClientRect();
    const round = barNode ? parseFloat(getComputedStyle(barNode).borderTopLeftRadius) || 0 : 0;
    const fade = document.querySelectorAll('[data-g="fade"]').length;
    const btns = [...document.querySelectorAll("button[data-section]")].map((e) => e.getBoundingClientRect());
    const xs = hand.flatMap((c) => [c.left, c.right]);
    return {
      button: btn ? Math.round(btn.width) : null,
      card: hand.length ? Math.round(hand[0].w) : null,
      span: xs.length ? Math.round(Math.max(...xs) - Math.min(...xs)) : null,
      mid: xs.length ? Math.round((Math.max(...xs) + Math.min(...xs)) / 2) : null,
      round, fade,
      bar: barEl ? { w: Math.round(barEl.width), left: Math.round(barEl.left), right: Math.round(barEl.right), mid: Math.round(barEl.left + barEl.width / 2) } : null,
      row: btns.length ? { left: Math.round(Math.min(...btns.map((b) => b.left))), right: Math.round(Math.max(...btns.map((b) => b.right))) } : null,
    };
  });
  const spots = JSON.parse(await p.getAttribute("canvas", "data-spots"));
  const felt = spots.k;

  check(`${f.name}: кнопка HUD не больше потолка`, m.button !== null && m.button <= Math.ceil(HUD_UNIT_MAX * BUTTON_OF_UNIT) + 1, m);
  check(`${f.name}: рука не шире своего контейнера`, m.span !== null && m.span <= Math.min(f.w, HAND_MAX_PX) + 2, m);
  check(`${f.name}: рука стоит посередине кадра`, m.mid !== null && Math.abs(m.mid - f.w / 2) <= 3, m);
  check(`${f.name}: столу осталась хотя бы половина кадра по высоте`, spots.frame.h >= f.h * 0.5, { frame: Math.round(spots.frame.h), of: f.h });
  // ВХОД — ВЕСЬ СТОЛ В КАДРЕ, а не «карта покрупнее»: видно свой стул и стул напротив.
  const across = 2 * (R + RIM) * felt;
  const fits = Math.min(spots.frame.w, spots.frame.h);
  check(`${f.name}: при входе весь стол в кадре`, across <= fits + 2, { across: Math.round(across), fits: Math.round(fits) });
  check(`${f.name}: и кадр занят столом, а не полями вокруг`, across >= fits * 0.92, { across: Math.round(across), fits: Math.round(fits) });
  check(`${f.name}: полоса не шире контейнера руки и стоит по центру`, m.bar !== null && m.bar.w <= Math.min(f.w, HAND_MAX_PX) + 2 && Math.abs(m.bar.mid - f.w / 2) <= 3, m.bar);
  // Полоса уже кадра — это поднос: свой скруглённый край вместо тени поперёк сукна.
  const narrow = m.bar && m.bar.w < f.w - 1;
  check(`${f.name}: ${narrow ? "поднос со скруглённым верхом и без тени поперёк стола" : "полоса во всю ширину, с тенью над ней"}`,
    narrow ? m.round > 2 && m.fade === 0 : m.round <= 2 && m.fade === 1, { round: m.round, fade: m.fade, bar: m.bar });
  check(`${f.name}: кнопки бара стоят в той же полосе`, m.row !== null && m.row.left >= m.bar.left - 1 && m.row.right <= m.bar.right + 1, { row: m.row, bar: m.bar });
  // КЛАВИАТУРА — В ТОМ ЖЕ КОНТЕЙНЕРЕ И НЕ ВО ВЕСЬ ЭКРАН: в ландшафте телефона она не влезала по
  // высоте и закрывала стол целиком.
  await p.locator('[data-section="say"]').click();
  await p.waitForTimeout(700);
  const kb = await p.evaluate(() => {
    const el = document.querySelector("[data-keyboard]");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const key = document.querySelector("[data-key]")?.getBoundingClientRect();
    return {
      h: Math.round(r.height), w: Math.round(r.width), mid: Math.round(r.left + r.width / 2),
      share: +(r.height / innerHeight).toFixed(2),
      round: Math.round(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0),
      key: key ? Math.round(key.height) : null,
    };
  });
  check(`${f.name}: клавиатура стоит в контейнере HUD`, kb && kb.w <= Math.min(f.w, HAND_MAX_PX) + 2 && Math.abs(kb.mid - f.w / 2) <= 3, kb);
  check(`${f.name}: клавиатура не выше ${Math.round(BOARD_SHARE * 100)}% кадра`, kb && kb.share <= BOARD_SHARE + 0.01, kb);
  check(`${f.name}: клавиша не мельче ${MIN_KEY}px`, kb && kb.key !== null && kb.key >= MIN_KEY, kb);
  check(`${f.name}: у клавиатуры тот же край, что у полосы`, kb && (kb.w < f.w - 1 ? kb.round > 2 : kb.round <= 2), kb);
  await p.close();
}

await browser.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(c.ok ? "  ok" : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
}
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
