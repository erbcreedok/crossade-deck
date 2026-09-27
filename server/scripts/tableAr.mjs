// AR-СТОЛ: стол держит наклон телефона, а палец попадает туда же, куда легла кисть.
//
// AR — личный вид игрока: стенд с ботами (`?stand`), AR включается долгим нажатием на компас, при старте
// всегда выключен; датчик — подделанными событиями `deviceorientation`. Всё читается из `canvas.dataset.spots` — там экран говорит, где у него середина
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
check("компас в AR — «Выровнять», сверху кнопка выхода", (await p.locator("[data-home][data-ar]").count()) === 1 && (await p.locator('[data-ar-do="exit"]').count()) === 1);
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
await tap('[data-section="chair"]');
check("под потоком датчика кнопка нижнего бара открывает свою секцию", (await p.locator('[data-bar="lock"]').count()) > 0);
await tap("[data-settings]");
check("под потоком датчика шестерёнка открывает настройки", (await p.locator('[data-settings][aria-expanded="true"]').count()) === 1);
await p.evaluate(() => clearInterval(window.__shake));

{
// окно настроек, открытое шагом выше, модальное — закрыть
if (await p.locator("[data-settings-close]").count()) { await p.locator("[data-settings-close]").click(); await settle(); }
// 5в. ДЖОЙСТИК — НА КОМПАСЕ: повёл палец от компаса — ходьба. Вперёд — к столу (стол крупнее); сильнее тянешь —
// быстрее; дальше от стула — тяжелее, и сверху подсказка, сколько ещё можно; тап по компасу — «Выровнять».
// Пустое сукно — хват: взятая точка идёт за пальцем.
await orient(0, 50);
await settle();
const recenter = async () => { await p.locator("[data-home]").click(); await settle(); };
await recenter(); // от выровненного: у своего стула, исходный размер
const home = await spots();
const fromCompass = async () => {
  const c = await compass();
  // Джойстик начинается, когда палец ушёл от компаса дальше 24 px: ближе — это ещё удержание (прогулка с камерой).
  await p.mouse.move(c.x, c.y); await p.mouse.down();
  await p.mouse.move(c.x, c.y - 30); await p.waitForTimeout(60);
  if ((await p.locator("[data-ar-stick]").count()) === 1) return c;
  await p.mouse.up(); await p.waitForTimeout(100);
  return null;
};
const walkFor = async (pull, ms) => {
  const at = await fromCompass();
  if (!at) return null;
  await p.mouse.move(at.x, at.y - pull, { steps: 4 });
  await p.waitForTimeout(ms);
  await p.mouse.up();
  await settle();
  return (await spots()).k;
};
const kSoft = await walkFor(30, 600);
check("повёл палец от компаса — джойстик, середина в компасе", kSoft !== null && kSoft > home.k, kSoft);
check("…и AR не выключился удержанием", await floor());
const kSoftGain = kSoft - home.k;
await recenter();
const kHard = await walkFor(70, 600);
check("потянул сильнее — прошёл дальше за то же время", kHard - home.k > kSoftGain * 2, `${(home.k).toFixed(1)} → слабо ${kSoft?.toFixed(1)}, сильно ${kHard?.toFixed(1)}`);
// далеко: тянем сильно и долго — подсказка появляется и доходит до нуля, стол встаёт
await recenter();
const at = (await fromCompass()) ?? (await compass());
await p.mouse.move(at.x, at.y - 100, { steps: 4 });
await p.waitForTimeout(700);
const early = await p.locator("[data-ar-hint]").evaluate((e) => ({ on: getComputedStyle(e).opacity === "1", text: e.textContent }));
await p.waitForTimeout(9000);
const late = await p.locator("[data-ar-hint]").evaluate((e) => e.textContent);
const k1 = (await spots()).k;
await p.waitForTimeout(1000);
const k2 = (await spots()).k;
await p.mouse.up(); await settle();
check("ушёл за полметра — сверху «дальше можно ещё …»", early.on && /дальше можно ещё \d/.test(early.text), early.text);
check("у предела — «ещё 0.0 м», и стол больше не приближается", /ещё 0\.0 м/.test(late) && Math.abs(k2 - k1) < 0.01, `${late}; k ${k1.toFixed(2)} → ${k2.toFixed(2)}`);
check("отпустил — подсказка гаснет", await p.locator("[data-ar-hint]").evaluate((e) => getComputedStyle(e).opacity === "0"));
// хват: пустое место за столом — взял и повёл вниз; стол едет за пальцем, джойстика нет
await recenter();
const g0 = await spots();
await p.mouse.move(W / 2, 200); await p.mouse.down();
await p.mouse.move(W / 2, 260, { steps: 6 }); await p.waitForTimeout(80);
const noStick = (await p.locator("[data-ar-stick]").count()) === 0;
await p.mouse.up(); await settle();
const g1 = await spots();
check("сукно: взял и повёл вниз — стол поехал за пальцем, джойстика нет", noStick && g1.middle.y - g0.middle.y > 20 && Math.abs(g1.middle.x - g0.middle.x) < 5, { noStick, y: `${g0.middle.y.toFixed(0)} → ${g1.middle.y.toFixed(0)}` });
await recenter();
const back = await spots();
check("тап по компасу — «Выровнять»: стол снова перед тобой в исходном размере", Math.abs(back.middle.x - W / 2) <= 2 && Math.abs(back.middle.y - H / 2) <= 2 && Math.abs(back.k - home.k) < 0.5, { middle: back.middle, k: back.k.toFixed(1) });
}

// 6. стол ВСЕГДА открывается обычным — даже если из игры вышли в AR; выход из AR — кнопкой сверху, а
// удержание компаса в AR — прогулка с камерой (`tableArAnchor.mjs`), не выход
await p.reload();
await ready();
check("после перезагрузки — обычный стол, хоть и уходил в AR", !(await floor()));
const c1 = await compass();
await p.mouse.move(c1.x, c1.y); await p.mouse.down(); await p.waitForTimeout(750); await p.mouse.up();
await settle();
check("удержал компас — снова AR", await floor());
await p.mouse.move(c1.x, c1.y); await p.mouse.down(); await p.waitForTimeout(1200); await p.mouse.up();
await settle();
check("удержание компаса в AR — не выход: AR остался", await floor());
await p.locator('[data-ar-do="exit"]').click();
await settle();
check("кнопка выхода сверху — обычный стол", !(await floor()));

check("без ошибок на странице", errors.length === 0, errors.slice(0, 2).join(" | "));
await browser.close();
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.got !== undefined ? ` — ${typeof c.got === "object" ? JSON.stringify(c.got) : c.got}` : ""}`);
const bad = checks.filter((c) => !c.ok).length;
console.log(bad ? `\nУПАЛО: ${bad}` : "\nвсё зелёное");
process.exit(bad ? 1 : 0);
