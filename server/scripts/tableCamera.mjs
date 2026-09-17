// КАМЕРА СТОЛА: поле вокруг стола, компас-кольцо с диском наклона, тап по своему аватару.
//
// Всё читается из `canvas.dataset.view` — `target.x,target.y,zoom,rotation,pitch`, — потому что это
// единственное место, где камера говорит о себе наружу; глазами наклон не меряется.
//   TABLE_SECRET=dev TABLE_GUESTS=1 PORT=2599 npx tsx src/index.ts   (в соседнем окне)
//   node scripts/tableCamera.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const secret = process.argv[3] ?? "dev";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);

/** Стол и его кромка в единицах — те же числа, что в `felt.ts`; поле вокруг равно радиусу. */
const R = 8;
const RIM = 0.09 + 0.33 + 0.18;
const MARGIN = R;
/** На сколько кладёт стол одно нажатие — `LEAN_STEP` в `camera.ts`. */
const STEP = 45;
/** Потолок наклона руками — `MAX_LEAN` там же. */
const CEILING = 60;
/** Градусов наклона на пиксель пальца — `LEAN_PER_PX` в `camera.ts`. */
const LEAN_PER_PX = 0.2;

const browser = await chromium.launch();
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
p.on("pageerror", (e) => console.log("ERROR", e.message));
await p.goto(`${base}/table/?room=${room}&name=A`);
await p.waitForSelector("[data-section]");
await p.waitForTimeout(600);

const wait = (ms = 500) => p.waitForTimeout(ms);
/** Куда смотрит камера прямо сейчас. */
const view = async () => {
  const [x, y, zoom, rotation, pitch] = (await p.getAttribute("canvas", "data-view")).split(",").map(Number);
  return { x, y, zoom, rotation, pitch };
};
const spots = async () => JSON.parse(await p.getAttribute("canvas", "data-spots"));
/** Как выглядит компас: повёрнутое кольцо и диск наклона. */
const ring = () => p.evaluate(() => {
  const btn = document.querySelector("[data-home]");
  if (!btn) return null;
  const disc = btn.querySelector("[data-lean]");
  const svg = btn.querySelector("svg");
  // Горит — золото (#f8d885) в градиенте диска; лежит плоско — панель стола.
  return { turn: getComputedStyle(svg).transform, lit: /248, 216, 133/.test(getComputedStyle(disc).backgroundImage) };
});
const tapRing = async () => {
  const r = await p.locator("[data-home]").evaluate((e) => e.getBoundingClientRect().toJSON());
  await p.mouse.move(r.x + r.width / 2, r.y + 6);
  await p.mouse.down();
  await p.mouse.up();
  await wait(700);
};
const tapDisc = async () => {
  await p.locator("[data-lean]").click();
  await wait(700);
};
/** Ctrl с левой кнопкой — поворот и наклон от точки захвата (`orbit` в `camera.ts`). */
const orbit = async (dx, dy) => {
  await p.keyboard.down("Control");
  await p.mouse.move(195, 300);
  await p.mouse.down();
  await p.mouse.move(195 + dx, 300 + dy, { steps: 12 });
  await p.mouse.up();
  await p.keyboard.up("Control");
  await wait(300);
};
const drag = async (x, y, x2, y2) => {
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.mouse.move(x2, y2, { steps: 12 });
  await p.mouse.up();
  await wait(700);
};

// ── 1. Компас висит ВСЕГДА, а не только когда камера ушла ────────────────────────────────────────
let v = await view();
let c = await ring();
check("камера в норме, а компас на месте", Math.abs(v.rotation) < 1 && v.pitch < 0.5 && c !== null, [v, c]);
check("стол плоский — диск не горит", c && !c.lit, c);

// ── 2. Диск наклоняет на 45°, а не на максимум ───────────────────────────────────────────────────
await tapDisc();
v = await view();
c = await ring();
check(`тап по диску кладёт стол ровно на ${STEP}°`, Math.abs(v.pitch - STEP) < 1, v);
check("наклонённый стол — диск горит", c && c.lit, c);

// ── 3. Тот же диск поднимает обратно ─────────────────────────────────────────────────────────────
await tapDisc();
v = await view();
c = await ring();
check("второй тап по диску возвращает стол в ноль", v.pitch < 0.5, v);
check("плоский стол — диск снова не горит", c && !c.lit, c);

// ── 3б. КОМПАС ТЯНЕТСЯ: кольцо крутит стол, диск его кладёт — одним пальцем и без Ctrl ───────────
await tapRing();
let was = await view();
// По кольцу от верхней точки вправо на четверть круга: палец идёт по дуге, а не по прямой.
const dragRing = async (quarter) => {
  const r = await p.locator("[data-home]").evaluate((e) => e.getBoundingClientRect().toJSON());
  const mid = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  const rad = r.width / 2 - 4;
  await p.mouse.move(mid.x, mid.y - rad);
  await p.mouse.down();
  for (let i = 1; i <= 12; i += 1) {
    const a = -Math.PI / 2 + (quarter * Math.PI) / 2 * (i / 12);
    await p.mouse.move(mid.x + Math.cos(a) * rad, mid.y + Math.sin(a) * rad);
  }
  await p.mouse.up();
  await wait(300);
};
await dragRing(1);
v = await view();
check("кольцо потянули по дуге — стол повернулся вслед за пальцем", Math.abs(v.rotation - was.rotation) > 45, [was, v]);
check("а зум при этом не трогали", Math.abs(v.zoom - was.zoom) < 0.01, [was, v]);
check("и наклон тоже", Math.abs(v.pitch - was.pitch) < 1, [was, v]);

await tapRing();
was = await view();
const discBox = await p.locator("[data-lean]").evaluate((e) => e.getBoundingClientRect().toJSON());
await p.mouse.move(discBox.x + discBox.width / 2, discBox.y + discBox.height / 2);
await p.mouse.down();
await p.mouse.move(discBox.x + discBox.width / 2, discBox.y + discBox.height / 2 - 80, { steps: 12 });
await p.mouse.up();
await wait(700);
v = await view();
// 80 пикселей вверх — ровно 80 × LEAN_PER_PX градусов, а не кнопочные 45: палец ведёт наклон сам.
check(`диск потянули на 80px вверх — стол лёг на ${80 * LEAN_PER_PX}°`, Math.abs(v.pitch - 80 * LEAN_PER_PX) < 2, v);
check("поворот при этом на месте", Math.abs(v.rotation - was.rotation) < 1, [was, v]);
await tapRing();

// ── 4. Кольцо крутится вместе с камерой ──────────────────────────────────────────────────────────
const still = (await ring()).turn;
await orbit(120, 0);
v = await view();
const spun = (await ring()).turn;
check("камера повернулась рукой", Math.abs(v.rotation) > 10, v);
check("кольцо повернулось вместе с ней", spun !== still, [still, spun]);

// ── 5. Тап по кольцу возвращает и поворот, и наклон ──────────────────────────────────────────────
await orbit(0, -120);
v = await view();
check("рука кладёт стол вместе с поворотом", v.pitch > 5, v);
await tapRing();
v = await view();
check("тап по кольцу вернул камеру к своему стулу: и поворот, и наклон", Math.abs(v.rotation) < 1.5 && v.pitch < 0.5, v);

// ── 6. Свой аватар: в норме — наклоняет ──────────────────────────────────────────────────────────
const seat = (await spots()).seats.find((s) => s.who === "A");
await p.mouse.click(seat.x, seat.y);
await wait(700);
v = await view();
check(`тап по своему аватару при нормальной камере кладёт стол на ${STEP}°`, Math.abs(v.pitch - STEP) < 1, v);
check("окно своего стула при этом не открылось", (await p.evaluate(() => document.querySelectorAll("[data-shut]").length)) === 0, null);

// ── 7. Свой аватар: камера ушла — нормализует ────────────────────────────────────────────────────
// Поворот НЕБОЛЬШОЙ: при зуме по умолчанию стол крупный, и сильный поворот уводит собственный
// аватар за край кадра — тогда тапать становится нечего, и проверка мерила бы промах, а не закон.
await orbit(60, 0);
v = await view();
check("камера ушла от стула", Math.abs(v.rotation) > 10, v);
const seat2 = (await spots()).seats.find((s) => s.who === "A");
check("свой аватар остался в кадре", seat2.x > 0 && seat2.x < 390 && seat2.y > 0 && seat2.y < 844, seat2);
await p.mouse.click(seat2.x, seat2.y);
await wait(700);
v = await view();
check("тап по своему аватару при ушедшей камере нормализует её", Math.abs(v.rotation) < 1.5 && v.pitch < 0.5, v);

// ── 8. Потолок наклона руками — 60°, а не 45° ────────────────────────────────────────────────────
await orbit(0, -400);
await orbit(0, -400);
v = await view();
check(`руками стол кладётся дальше кнопки, но не дальше ${CEILING}°`, v.pitch > STEP + 5 && v.pitch <= CEILING + 0.5, v);
await tapRing();

// ── 9. Поле вокруг стола: стол уводится за кромку и не уходит за поле ────────────────────────────
const s = await spots();
const half = s.frame.h / 2 / s.k;
await drag(195, 200, 195, 660);
await drag(195, 200, 195, 660);
v = await view();
const reach = R + RIM + MARGIN - half;
check("стол уводится вниз за кромку — поле вокруг есть", Math.abs(v.y) > 0.5, [v, { reach, half }]);
check("и не уходит дальше поля", Math.abs(v.y) <= reach + 0.2, [v, { reach }]);

await browser.close();
let bad = 0;
for (const c2 of checks) {
  if (!c2.ok) bad += 1;
  console.log(c2.ok ? "  ok" : "FAIL", c2.name, c2.ok ? "" : JSON.stringify(c2.got));
}
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
