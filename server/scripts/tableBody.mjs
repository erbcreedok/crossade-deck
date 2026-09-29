// ТЕЛА ЗА СТОЛОМ — сосед видит моё тело аватаром: палка, плечи, руки-хваты, голова-кружок. Камера — это голова:
// зум — её высота; отъехал сидя — встал; нагнулся — ненадолго; повернул камеру на другую сторону — туда ушла
// голова, тело осталось на стуле. Карта в руке висит на доле высоты головы.
//   TABLE_SECRET=probe TABLE_GUESTS=1 TABLE_OWN_ALL=1 PORT=2611 npx tsx src/index.ts   (в соседнем окне; `table-probe`)
//   node scripts/tableBody.mjs [base] [secret] [shots-dir]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2611";
const secret = process.argv[3] ?? "probe";
const shots = process.argv[4];
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);

const browser = await chromium.launch();
const open = async (name, touch = true) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: touch });
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message));
  await p.goto(`${base}/table/?room=${room}&name=${name}`);
  await p.waitForSelector("[data-section]");
  await p.waitForTimeout(500);
  return p;
};
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const until = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
};
const bodyOf = (p, name) => p.evaluate((name) => {
  const el = [...document.querySelectorAll('[data-g="body"]')].find((b) => b.dataset.name === name);
  if (!el) return null;
  const box = (g) => { const r = el.querySelector(`[data-g="${g}"]`)?.getBoundingClientRect(); return r && { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; };
  return {
    model: el.dataset.model, stance: el.dataset.stance, stretch: +el.dataset.stretch, away: el.dataset.away === "1", headH: +el.dataset.headH,
    right: !!el.querySelector('[data-g="right-hand"]'), left: box("left-hand"), empty: !!el.querySelector('[data-g="empty-seat"]'), tether: !!el.querySelector('[data-g="tether"]'),
  };
}, name);
const spotOf = async (p, name) => (JSON.parse(await p.getAttribute("canvas", "data-spots")).seats ?? []).find((one) => one.who === name);
const zoomOf = async (p) => +(await p.getAttribute("canvas", "data-view")).split(",")[2];
const wheel = async (p, dy, n) => {
  await p.mouse.move(195, 400);
  await p.keyboard.down("Control");
  for (let i = 0; i < n; i++) { await p.mouse.wheel(0, dy); await p.waitForTimeout(30); }
  await p.keyboard.up("Control");
  await p.waitForTimeout(300);
};

const A = await open("Аня", false);
const B = await open("Боря", false);

// Б видит тело Ани у её стула.
await A.mouse.move(195, 300);
let seen = await until(() => bodyOf(B, "Аня"));
check("Б видит тело Ани", !!seen, seen);
check("Аня сидит", seen?.stance === "sit", seen);
check("вид — кукла: король или дама, и левая рука-хват", ["king", "queen"].includes(seen?.model) && !!seen.left, seen);
// СТОЛ ПЕРЕКРЫВАЕТ ТЕЛА ЗА НИМ: туловище — под обрезкой по силуэту стола (камера сверху — все за столом); голова,
// руки и имя — видны всегда.
const under = await B.evaluate(() => {
  const el = [...document.querySelectorAll('[data-g="body"]')].find((x) => x.dataset.name === "Аня");
  const clipped = (g) => { const n = el?.querySelector(`[data-g="${g}"]`); const w = n?.closest('[data-g="behind-table"]'); return n ? !!w && /path\(evenodd/.test(w.style.clipPath) : null; };
  return { body: clipped("doll-body"), head: clipped("doll-head"), left: clipped("left-hand"), name: clipped("name") };
});
check("стол перекрывает тело за ним: туловище обрезано по столу; голова, рука и имя — всегда видны", under.body && under.head === false && under.left === false && under.name === false, under);
const loaded = await B.evaluate(() => [...document.querySelectorAll('[data-g="body"] img')].every((i) => i.complete && i.naturalWidth > 0));
check("руки-хваты загрузились", loaded, loaded);
check("камеру не трогала — голова не ушла, пустого стула нет", seen && !seen.away && !seen.empty, seen);
if (shots) await B.screenshot({ path: `${shots}/body-1-sit.png` });

// Мышь Ани над столом — у Б её правая рука.
await A.mouse.move(200, 380);
await A.mouse.move(210, 390);
seen = await until(async () => (await bodyOf(B, "Аня"))?.right && (await bodyOf(B, "Аня")));
check("мышь над столом — правая рука видна", seen?.right === true, seen);

// КАРТЫ В ЛЕВОЙ РУКЕ: Аня берёт три карты с колоды.
for (let i = 0; i < 3; i++) {
  const top = JSON.parse(await A.getAttribute("canvas", "data-spots")).deckTop;
  await A.mouse.move(top.x, top.y);
  await A.mouse.down();
  await A.mouse.move(195, 790, { steps: 8 });
  await A.mouse.up();
  await A.waitForTimeout(500);
}

// РАЗМЕР ПО МЕСТУ: Боря отъезжает камерой — рука Ани у него мельчает вместе со столом, а не держит размер экрана.
const across = async () => { const a = await spotOf(B, "Аня"), b = await spotOf(B, "Боря"); return Math.hypot(a.x - b.x, a.y - b.y); };
const nearHand = (await bodyOf(B, "Аня")).left.w, nearTable = await across();
await wheel(B, 120, 6);
const farHand = (await bodyOf(B, "Аня")).left.w, farTable = await across();
check("Боря отъехал — стол правда меньше", farTable < nearTable * 0.9, { nearTable, farTable });
check("…и рука Ани мельчает как стол (±15%)", Math.abs(farHand / nearHand / (farTable / nearTable) - 1) < 0.15, { hand: (farHand / nearHand).toFixed(3), table: (farTable / nearTable).toFixed(3) });

// КАМЕРА — ГОЛОВА: сидя отъехала дальше позы стоя — встала.
const sitHead = (await bodyOf(B, "Аня")).headH;
await wheel(A, 120, 8);
seen = await until(async () => { const b = await bodyOf(B, "Аня"); return b?.stance === "stand" && b; });
check("сидя отъехала дальше — встала сама", seen?.stance === "stand", seen);
check("у Ани кнопка позы горит", (await A.getAttribute("[data-stance-toggle]", "aria-pressed")) === "true", null);
check("встала — голова выше (сидя 6, стоя 9)", seen && seen.headH > sitHead + 2, { sitHead, standHead: seen?.headH });
if (shots) await B.screenshot({ path: `${shots}/body-2-stand.png` });
const standZoom = await zoomOf(A);

// Кнопкой — села.
await A.locator("[data-stance-toggle]").click();
seen = await until(async () => { const b = await bodyOf(B, "Аня"); return b?.stance === "sit" && b; });
check("кнопкой — села, и не встала от своего же отъезда камеры", seen?.stance === "sit", seen);
await A.waitForTimeout(600);
const sitZoom = await zoomOf(A);
check("сидя камера ближе, чем стоя", sitZoom > standZoom, { sitZoom, standZoom });

// НАГНУЛАСЬ: приближает колесом — голова ниже и вперёд, шея терпит недолго, потом камера сама отъезжает.
const restHead = await spotOf(B, "Аня");
await wheel(A, -120, 12);
const worn = await A.evaluate(() => +(document.querySelector('[data-g="neck-worn"]')?.dataset.worn ?? 0));
check("нагнулась — шея терпит (полоска)", worn > 0, { worn });
seen = await until(async () => { const b = await bodyOf(B, "Аня"); return b && b.stretch > 0.3 && b; });
check("Б видит: нагнулась", seen?.stretch > 0.3, seen);
check("…голова опустилась к столу", seen && seen.headH < sitHead - 1, { sitHead, now: seen?.headH });
const leaned = await spotOf(B, "Аня");
check("…и ушла вперёд над столом, к столу", leaned && Math.hypot(leaned.x - restHead.x, leaned.y - restHead.y) > 15 && leaned.y > restHead.y, { restHead, leaned });
if (shots) await B.screenshot({ path: `${shots}/body-3-lean.png` });
const back = await until(async () => { const z = await zoomOf(A); return z <= sitZoom * 1.05 && z; }, 9000);
check("время вышло — камера сама отъехала к позе", back !== null, { back, sitZoom, now: await zoomOf(A) });

// КАРТА В РУКЕ: Аня несёт карту с колоды — у Б она висит над сукном, с тенью; у самой Ани — тоже.
await A.waitForTimeout(1200);
const from = JSON.parse(await A.getAttribute("canvas", "data-spots")).deckTop;
await A.mouse.move(from.x, from.y);
await A.mouse.down();
await A.mouse.move(195, 430, { steps: 10 });
const ownLift = await until(() => A.evaluate(() => +(document.querySelector('[data-g="carry"]')?.dataset.lift ?? 0)));
check("своя карта в руке — с тенью по высоте головы", ownLift > 0, { ownLift });
// Настоящего размера: как её место на сукне (контур под ней), чуть крупнее — она ближе к глазу, поднята.
const sizes = await A.evaluate(() => {
  const carry = document.querySelector('[data-g="carry"]');
  const mark = document.querySelector("[data-felt-mark] polygon");
  if (!carry || !mark) return null;
  const pts = mark.getAttribute("points").split(" ").map((one) => one.split(",").map(Number));
  return { card: +carry.dataset.w, spot: Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) };
});
check("своя карта в руке — размером со своё место на сукне (1…1.3 его ширины)", sizes && sizes.card >= sizes.spot * 0.97 && sizes.card <= sizes.spot * 1.3, sizes);
if (shots) await A.screenshot({ path: `${shots}/body-4-held.png` });
const theirLift = await until(() => B.evaluate(() => +(document.querySelector('[data-g="carried"]')?.dataset.lift ?? 0)));
check("у Б её карта висит над сукном (тень по высоте её головы)", theirLift > 0, { theirLift });
if (shots) await B.screenshot({ path: `${shots}/body-4-carry.png` });
await A.mouse.up();
await A.waitForTimeout(500);

// ПОДГЛЯДЕТЬ: Аня снимает «скрыть». Спереди её карты смотрят лицом на неё — Боря видит рубашки.
await A.click('[data-section="chair"]');
await A.waitForTimeout(300);
await A.click('[data-bar="hide"]');
await A.waitForTimeout(900);
const facesOf = async () => (await spotOf(B, "Аня"))?.body?.faces;
check("не скрыта, Боря смотрит ей в лицо — её карты у него рубашкой", (await facesOf()) === 0, await spotOf(B, "Аня"));

// ГОЛОВА ИДЁТ ЗА КАМЕРОЙ: Аня крутит стол на 180° (Ctrl + мышь) — у Б её голова с картами ушла на его сторону,
// тело на стуле, пустой круг у стула и ниточка к голове.
// Поворот мышью — 0.3° на пиксель (`TURN_PER_PX`): две протяжки по 300 px — ровно 180°.
const rotOf = async (p) => +(await p.getAttribute("canvas", "data-view")).split(",")[3];
const rot0 = await rotOf(A);
await A.keyboard.down("Control");
for (let i = 0; i < 2; i++) {
  await A.mouse.move(40, 300);
  await A.mouse.down();
  await A.mouse.move(340, 300, { steps: 12 });
  await A.mouse.up();
}
await A.keyboard.up("Control");
const turnedBy = Math.abs(((((await rotOf(A)) - rot0) % 360) + 540) % 360 - 180);
check("Аня повернула стол на 180°", Math.abs(turnedBy - 180) < 3, { rot0, now: await rotOf(A) });
seen = await until(async () => { const b = await bodyOf(B, "Аня"); return b?.away && b; });
check("повернула камеру на другую сторону — голова ушла", seen?.away === true, seen);
check("…у стула пустой круг, к голове ниточка", seen?.empty && seen?.tether, seen);
const went = await spotOf(B, "Аня");
check("…голова теперь на стороне Бори (низ его экрана)", went && went.y > 422, went);
if (shots) await B.screenshot({ path: `${shots}/body-5-away.png` });
// Её голова теперь у Бори и смотрит от него в стол — он ей за спиной и видит её карты лицом.
const peek = await until(async () => { const n = await facesOf(); return n > 0 && n; });
check("из-за спины (стул не скрыт) — её карты у Бори лицом", peek >= 3, { faces: await facesOf(), spot: await spotOf(B, "Аня"), hide: await A.evaluate(() => window.__tableState?.().chairs.map((c) => [c.owner, c.hide, c.hand.length])) });

// ФИГУРЫ ВЫКЛЮЧЕНЫ (настройки → «Фигуры за столом», для слабых телефонов): стол как до фигур — тел нет, кружки на стульях.
await B.evaluate(() => localStorage.setItem("crossade.table.figures", "off"));
await B.reload();
await B.waitForSelector("[data-section]");
await B.waitForTimeout(1500);
const bare = await B.evaluate(() => ({ bodies: document.querySelectorAll('[data-g="body"]').length, toggle: !!document.querySelector("[data-settings]") }));
check("фигуры выключены — за столом ни одного тела, стол как раньше", bare.bodies === 0 && bare.toggle, bare);
await B.evaluate(() => localStorage.removeItem("crossade.table.figures"));

const bad = checks.filter((c) => !c.ok);
for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
console.log(`tableBody ${checks.length - bad.length}/${checks.length}`);
await browser.close();
process.exit(bad.length ? 1 : 0);
