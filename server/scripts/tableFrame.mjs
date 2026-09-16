// ШИРОКИЙ ЭКРАН: потолок единицы HUD, рука в контейнере по центру, начальный зум от читаемости карты.
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
/** Карта на сукне чуть мельче карты в руке: «чуть» — это между этими двумя. */
const RATIO = { min: 0.7, max: 0.95 };

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
    const xs = hand.flatMap((c) => [c.left, c.right]);
    return {
      button: btn ? Math.round(btn.width) : null,
      card: hand.length ? Math.round(hand[0].w) : null,
      span: xs.length ? Math.round(Math.max(...xs) - Math.min(...xs)) : null,
      mid: xs.length ? Math.round((Math.max(...xs) + Math.min(...xs)) / 2) : null,
    };
  });
  const spots = JSON.parse(await p.getAttribute("canvas", "data-spots"));
  const felt = spots.k;
  const ratio = m.card ? felt / m.card : null;

  check(`${f.name}: кнопка HUD не больше потолка`, m.button !== null && m.button <= Math.ceil(HUD_UNIT_MAX * BUTTON_OF_UNIT) + 1, m);
  check(`${f.name}: рука не шире своего контейнера`, m.span !== null && m.span <= Math.min(f.w, HAND_MAX_PX) + 2, m);
  check(`${f.name}: рука стоит посередине кадра`, m.mid !== null && Math.abs(m.mid - f.w / 2) <= 3, m);
  check(`${f.name}: столу осталась хотя бы половина кадра по высоте`, spots.frame.h >= f.h * 0.5, { frame: Math.round(spots.frame.h), of: f.h });
  check(`${f.name}: карта на сукне мельче карты в руке, но не вдвое`, ratio !== null && ratio >= RATIO.min && ratio <= RATIO.max, { ratio: ratio && +ratio.toFixed(2), felt: Math.round(felt), ...m });
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
