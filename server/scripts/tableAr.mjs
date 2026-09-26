// AR-СТОЛ: стол держит наклон телефона, а палец попадает туда же, куда легла кисть.
//
// AR — личный вид игрока: стенд с ботами (`?stand`), AR включается долгим нажатием на компас и помнится
// на устройстве; датчик — подделанными событиями `deviceorientation`. Всё читается из `canvas.dataset.spots` — там экран говорит, где у него середина
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

const ready = () => p.waitForFunction(() => !!document.querySelector("canvas")?.dataset.spots);
const floor = async () => (await p.locator("[data-ar-floor]").count()) === 1;
const compass = async () => { const b = await p.locator("[data-home]").boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

// 0. по умолчанию — обычный стол пальцами
await p.goto(`${base}/table/?stand`);
await ready();
check("по умолчанию AR выключен", !(await floor()));

// 1. удержал палец на компасе — AR; компас стал выходом
const c0 = await compass();
await p.mouse.move(c0.x, c0.y);
await p.mouse.down();
await p.waitForTimeout(750);
await p.mouse.up();
await settle();
check("удержал компас — AR включился", await floor());
check("компас в AR — это выход", (await p.locator("[data-home][data-ar]").count()) === 1);
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

await orient(0, 50);
await settle();
s = await spots();

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

// 5б. КНОПКИ ПОД ПОТОКОМ ДАТЧИКА. На телефоне наклон идёт десятки раз в секунду, и каждый сдвигает стол
// на экране — а слой поверх стола пересобирался целиком, и кнопка исчезала между касанием и отпусканием.
// Поток здесь настоящий: 60 событий в секунду с дрожью руки, пока жмутся кнопки верхнего и нижнего HUD.
await p.evaluate(() => {
  let t = 0;
  window.__shake = setInterval(() => { t += 1; dispatchEvent(new DeviceOrientationEvent("deviceorientation", { alpha: Math.sin(t / 7) * 3, beta: 50 + Math.cos(t / 5) * 2, gamma: 0 })); }, 16);
});
await p.waitForTimeout(300);
const tap = async (sel) => { const b = await p.locator(sel).first().boundingBox(); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await p.waitForTimeout(120); await p.mouse.up(); await p.waitForTimeout(250); };
// Сначала бар: окно настроек, открытое шестерёнкой, модальное — оно легло бы поверх бара.
await tap('[data-section="pose"]');
check("под потоком датчика кнопка нижнего бара открывает свою секцию", (await p.locator('[data-bar="fan"]').count()) > 0);
await tap("[data-settings]");
check("под потоком датчика шестерёнка открывает настройки", (await p.locator('[data-settings][aria-expanded="true"]').count()) === 1);
await p.evaluate(() => clearInterval(window.__shake));

// 6. выбор живёт на устройстве: перезагрузка — снова AR; тап по компасу — обычный стол, и тоже помнится
await p.reload();
await ready();
check("после перезагрузки AR помнится", await floor());
const c1 = await compass();
await p.mouse.click(c1.x, c1.y);
await settle();
check("тап по компасу в AR — обычный стол", !(await floor()));
await p.reload();
await ready();
check("…и выключенный тоже помнится", !(await floor()));

check("без ошибок на странице", errors.length === 0, errors.slice(0, 2).join(" | "));
await browser.close();
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.got !== undefined ? ` — ${typeof c.got === "object" ? JSON.stringify(c.got) : c.got}` : ""}`);
const bad = checks.filter((c) => !c.ok).length;
console.log(bad ? `\nУПАЛО: ${bad}` : "\nвсё зелёное");
process.exit(bad ? 1 : 0);
