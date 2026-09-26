// AR-СТОЛ: стол держит наклон телефона, а палец попадает туда же, куда легла кисть.
//
// Стенд с ботами в роде `sandbox-ar` (`?stand&desk=sandbox-ar`), датчик — подделанными событиями
// `deviceorientation`. Всё читается из `canvas.dataset.spots` — там экран говорит, где у него середина
// стола и стулья, — а не глазами.
//   TABLE_SECRET=probe TABLE_GUESTS=1 PORT=2611 npx tsx src/index.ts   (в соседнем окне; preview «table-probe»)
//   node scripts/tableAr.mjs [base] [скриншот.png]
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2611";
const shot = process.argv[3] ?? null;
const W = 390, H = 844;

const browser = await chromium.launch();
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const p = await (await browser.newContext({ viewport: { width: W, height: H }, hasTouch: false })).newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));

const spots = () => p.evaluate(() => JSON.parse(document.querySelector("canvas").dataset.spots || "{}"));
const orient = (alpha, beta, gamma = 0) => p.evaluate(([a, b, g]) => dispatchEvent(new DeviceOrientationEvent("deviceorientation", { alpha: a, beta: b, gamma: g })), [alpha, beta, gamma]);
const settle = () => p.waitForTimeout(250);

// 0. обычный стенд — без AR: пол не появляется, род не протекает
await p.goto(`${base}/table/?stand`);
await p.waitForFunction(() => !!document.querySelector("canvas")?.dataset.spots);
check("обычная песочница — без AR", (await p.locator("[data-ar-floor]").count()) === 0);

// 1. AR-песочница: датчик заговорил — стол встал в середину взгляда
await p.goto(`${base}/table/?stand&desk=sandbox-ar`);
await p.waitForFunction(() => !!document.querySelector("canvas")?.dataset.spots);
check("AR-песочница — пол под столом", (await p.locator("[data-ar-floor]").count()) === 1);
await orient(0, 50);
await settle();
let s = await spots();
check("стол встал туда, куда смотрит телефон", Math.abs(s.middle.x - W / 2) <= 2 && Math.abs(s.middle.y - H / 2) <= 2, s.middle);
check("свой стул — ближний к себе (ниже середины)", (() => { const mine = s.seats?.find((x) => x.who === "Ye"); return mine && mine.y > s.middle.y; })(), s.seats?.map((x) => `${x.who}:${Math.round(x.x)},${Math.round(x.y)}`).join(" "));
check("перспектива: стол сжат, как положенный", s.squash < 0.9, s.squash);
if (shot) await p.screenshot({ path: shot });

// 2. повернул телефон влево — стол остался в мире и уехал вправо
await orient(15, 50);
await settle();
const turned = await spots();
check("повернул телефон влево на 15° — стол уехал вправо", turned.middle.x > s.middle.x + 60, `${s.middle.x} → ${turned.middle.x}`);

// 3. тап по своему аватару — стол переставляется туда, куда теперь смотришь
const mine = turned.seats.find((x) => x.who === "Ye");
await p.mouse.click(mine.x, mine.y);
await settle();
s = await spots();
check("тап по своему аватару — стол снова в середине взгляда", Math.abs(s.middle.x - W / 2) <= 2 && Math.abs(s.middle.y - H / 2) <= 2, s.middle);

// 4. палец через AR-линзу: тап по чужому стулу открывает его окно
const other = s.seats.find((x) => x.who && x.who !== "Ye");
await p.mouse.click(other.x, other.y);
await p.waitForTimeout(300);
const tip = await p.locator("[data-tip]").count();
check(`тап по стулу «${other.who}» открыл его окно`, tip > 0, tip);
await p.mouse.click(other.x, other.y); // закрыть
await p.waitForTimeout(200);

// 5. зум пальцевой камеры растит стол и в AR
const k0 = s.k;
await p.mouse.move(W / 2, H / 2 - 150);
// щипок на трекпаде — колёсико с Ctrl (простое колёсико у кита двигает стол, а не растит)
await p.keyboard.down("Control");
for (let i = 0; i < 4; i += 1) { await p.mouse.wheel(0, -120); await p.waitForTimeout(60); }
await p.keyboard.up("Control");
await settle();
const k1 = (await spots()).k;
check("щипок растит стол", k1 > k0 * 1.1, `${k0.toFixed(1)} → ${k1.toFixed(1)}`);

check("без ошибок на странице", errors.length === 0, errors.slice(0, 2).join(" | "));
await browser.close();
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.got !== undefined ? ` — ${typeof c.got === "object" ? JSON.stringify(c.got) : c.got}` : ""}`);
const bad = checks.filter((c) => !c.ok).length;
console.log(bad ? `\nУПАЛО: ${bad}` : "\nвсё зелёное");
process.exit(bad ? 1 : 0);
