// ТЕЛА ЗА СТОЛОМ — сосед видит моё тело: голову, позу, правую руку в деле; шея не даёт долго висеть над столом.
//   TABLE_SECRET=probe TABLE_GUESTS=1 PORT=2611 npx tsx src/index.ts   (в соседнем окне; `table-probe`)
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
  return el && { stance: el.dataset.stance, stretch: +el.dataset.stretch, right: !!el.querySelector('[data-g="right-hand"]') };
}, name);

const A = await open("Аня", false);
const B = await open("Боря");

// Б видит тело Ани у её стула.
await A.mouse.move(195, 300);
let seen = await until(() => bodyOf(B, "Аня"));
check("Б видит тело Ани", !!seen, seen);
check("Аня сидит", seen?.stance === "sit", seen);

if (shots) await B.screenshot({ path: `${shots}/body-1-sit.png` });

// Мышь Ани над столом — у Б её правая рука.
await A.mouse.move(200, 380);
await A.mouse.move(210, 390);
seen = await until(async () => (await bodyOf(B, "Аня"))?.right && (await bodyOf(B, "Аня")));
check("мышь над столом — правая рука видна", seen?.right === true, seen);

// КАРТЫ В ЛЕВОЙ РУКЕ: Аня берёт три карты с колоды — у Б они веером у её головы, а не у стула.
for (let i = 0; i < 3; i++) {
  const top = JSON.parse(await A.getAttribute("canvas", "data-spots")).deckTop;
  await A.mouse.move(top.x, top.y);
  await A.mouse.down();
  await A.mouse.move(195, 790, { steps: 8 });
  await A.mouse.up();
  await A.waitForTimeout(500);
}

// ГОЛОВА — ЭТО АВАТАР: у Б кружок Ани стоит там, где её голова, и едет, когда она ведёт камеру по столу.
const avatarOf = async (p, name) => (JSON.parse(await p.getAttribute("canvas", "data-spots")).seats ?? []).find((one) => one.who === name);
const was = await avatarOf(B, "Аня");
await A.mouse.move(195, 300);
await A.mouse.down();
await A.mouse.move(195, 520, { steps: 10 });
await A.mouse.up();
const moved = await until(async () => { const now = await avatarOf(B, "Аня"); return now && Math.hypot(now.x - was.x, now.y - was.y) > 15 && now; });
check("Аня повела камеру — её аватар поехал по столу у Б", !!moved, { was, moved });
if (shots) await B.screenshot({ path: `${shots}/body-1b-head-moved.png` });

// Аня встаёт кнопкой позы.
check("кнопка позы над компасом, бар не тронут", (await A.locator('[data-g="thumb-stance"] [data-stance-toggle]').count()) === 1, null);
await A.locator("[data-stance-toggle]").click();
seen = await until(async () => (await bodyOf(B, "Аня"))?.stance === "stand" && (await bodyOf(B, "Аня")));
check("Б видит: Аня стоит", seen?.stance === "stand", seen);
check("у Ани кнопка горит", (await A.getAttribute("[data-stance-toggle]", "aria-pressed")) === "true", null);
if (shots) await B.screenshot({ path: `${shots}/body-2-stand.png` });
const zoomOf = async (p) => +(await p.getAttribute("canvas", "data-view")).split(",")[2];
const standZoom = await zoomOf(A);

// Шея: Аня приближает колесом сильнее позы — полоска терпения растёт, потом камера сама отъезжает.
// Колесо у стола ведёт его; приближает — колесо с Ctrl (щипок тачпада).
await A.mouse.move(195, 400);
await A.keyboard.down("Control");
for (let i = 0; i < 12; i++) {
  await A.mouse.wheel(0, -120);
  await A.waitForTimeout(30);
}
await A.keyboard.up("Control");
await A.waitForTimeout(300);
const leaned = await zoomOf(A);
const worn = await A.evaluate(() => +(document.querySelector('[data-g="neck-worn"]')?.dataset.worn ?? 0));
check("приблизилась — шея терпит (полоска)", worn > 0, { worn, leaned, standZoom });
seen = await until(async () => { const b = await bodyOf(B, "Аня"); return b && b.stretch > 0.3 && b; });
check("Б видит натянутую шею", seen?.stretch > 0.3, seen);

if (shots) await B.screenshot({ path: `${shots}/body-3-stretch.png` });
const back = await until(async () => { const z = await zoomOf(A); return z <= standZoom * 1.05 && z; }, 9000);
check("время вышло — камера сама отъехала к позе", back !== null, { back, leaned, standZoom, now: await zoomOf(A) });
if (shots) await A.screenshot({ path: `${shots}/body-4-back.png` });

const bad = checks.filter((c) => !c.ok);
for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
console.log(`tableBody ${checks.length - bad.length}/${checks.length}`);
await browser.close();
process.exit(bad.length ? 1 : 0);
