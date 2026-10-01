// ГИРО — стенд с поддельным датчиком: первое слово датчика не дёргает взгляд (ноль — там, где смотрел), дальше поворот телефона
// крутит голову на столько же градусов (влево у телефона — это против часовой), наклон телефона вниз — взгляд вниз, выключили — датчик не слушается.
//   node gyro-check.mjs [base]     (стенд: `npm run dev`, порт 9590)
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
// Датчик говорит без умолку: держим одно положение 0.8 с (фильтр сглаживает, ему нужно время дойти).
const turn = (a, b, g = 0) => p.evaluate(([a, b, g]) => new Promise((r) => { const t0 = performance.now(); const id = setInterval(() => { dispatchEvent(Object.assign(new Event("deviceorientation"), { alpha: a, beta: b, gamma: g })); if (performance.now() - t0 > 800) { clearInterval(id); r(); } }, 16); }), [a, b, g]);
const cam = () => p.evaluate(() => { const c = window.__t3d.cam(); return { mode: c.mode, yaw: c.yaw, pitch: c.pitch }; });
const dyaw = (a, b) => ((a - b + 540) % 360) - 180;
await p.goto(`${base}/?stand`);
await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
await p.waitForTimeout(600);
const home = await cam();
await p.click("[data-gyro]");
await p.waitForTimeout(300);
await turn(100, 90);
const first = await cam();
check("первое слово датчика не дёргает взгляд", Math.abs(dyaw(first.yaw, home.yaw)) < 1, { home, first });
await turn(140, 90);
const left = await cam();
check("телефон повернули на 40° влево — голова повернулась влево на 40°", Math.abs(dyaw(left.yaw, first.yaw) + 40) < 2, { first, left });
await turn(140, 60);
const down = await cam();
check("телефон наклонили вниз на 30° — взгляд вниз на 30°", Math.abs(down.pitch + 30) < 2, down);
// ДРОЖЬ: телефон лежит в руке и «дышит» ±0.4° — взгляд не должен трястись сильнее 0.25°.
await p.evaluate(() => { window.__noise = setInterval(() => { const n = () => (Math.random() - 0.5) * 0.8; dispatchEvent(Object.assign(new Event("deviceorientation"), { alpha: 140 + n(), beta: 60 + n(), gamma: n() })); }, 16); });
await p.waitForTimeout(600);
const range = await p.evaluate(() => new Promise((r) => { const ys = [], ps = []; const t0 = performance.now(); const f = () => { const c = window.__t3d.cam(); ys.push(c.yaw); ps.push(c.pitch); performance.now() - t0 < 1200 ? requestAnimationFrame(f) : r({ yaw: Math.max(...ys) - Math.min(...ys), pitch: Math.max(...ps) - Math.min(...ps) }); }; f(); }));
check("телефон «дышит» долями градуса — взгляд не трясётся (≤ 0.25°)", range.yaw <= 0.25 && range.pitch <= 0.25, range);
// КНОПКА ПОД ГИРО: нажатие держится 150 мс, пока камера едет, — шестерёнка открывает настройки.
await p.evaluate(() => { clearInterval(window.__noise); let k = 0; window.__noise = setInterval(() => { k += 1; dispatchEvent(Object.assign(new Event("deviceorientation"), { alpha: 140 + k * 0.4, beta: 60, gamma: 0 })); }, 16); });
const gear = () => p.evaluate(() => { const e = [...document.querySelectorAll("[data-settings]")].find((x) => x.getBoundingClientRect().width > 0 && !x.closest(".screen.off")); const r = e?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, open: e.getAttribute("aria-expanded") === "true" } : null; });
const g = await gear();
await p.mouse.move(g.x, g.y); await p.mouse.down(); await p.waitForTimeout(150); await p.mouse.up();
await p.waitForTimeout(300);
check("пока камера едет под гиро, нажатие на шестерёнку открывает настройки", (await gear()).open, null);
await p.evaluate(() => clearInterval(window.__noise));
await p.evaluate(() => document.querySelector("[data-settings-close]")?.click());
await p.waitForTimeout(200);
await turn(140, 60);
const down2 = await cam();
await p.locator("[data-gyro]").first().click();
await p.waitForTimeout(200);
await turn(300, 90);
const off = await cam();
check("выключили — датчик взгляд не двигает", Math.abs(dyaw(off.yaw, down2.yaw)) < 0.5 && Math.abs(off.pitch - down2.pitch) < 0.5, { down2, off });
// В TELEGRAM ДАТЧИКА ДВА (свой и браузерный) с разным нулём курса: стол слушает один, иначе курс прыгает между нулями.
const q = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
q.on("pageerror", (e) => errors.push(e.message));
await q.addInitScript(() => {
  const o = { alpha: 0, beta: 0, gamma: 0, start() {}, stop() {} };
  window.Telegram = { WebApp: { DeviceOrientation: o, onEvent(name, fn) { window.__tgfn = fn; }, offEvent() {}, ready() {}, expand() {}, initData: "", initDataUnsafe: {} } };
});
await q.goto(`${base}/?stand`);
await q.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
await q.waitForTimeout(600);
const qhome = await q.evaluate(() => window.__t3d.cam().yaw);
await q.locator("[data-gyro]").first().click();
await q.evaluate(() => {
  const rad = Math.PI / 180;
  // Два источника в разное время (7 и 11 мс): кадр видит то один, то другой.
  window.__both = [
    setInterval(() => dispatchEvent(Object.assign(new Event("deviceorientation"), { alpha: 140, beta: 80, gamma: 0 })), 7),
    setInterval(() => { const o = window.Telegram.WebApp.DeviceOrientation; o.alpha = 230 * rad; o.beta = 80 * rad; o.gamma = 0; window.__tgfn?.(); }, 11),
  ];
});
await q.waitForTimeout(1200);
const both = await q.evaluate(() => new Promise((r) => { const ys = []; const t0 = performance.now(); const f = () => { ys.push(window.__t3d.cam().yaw); performance.now() - t0 < 1200 ? requestAnimationFrame(f) : r({ range: Math.max(...ys) - Math.min(...ys), mean: ys.reduce((a, b) => a + b, 0) / ys.length }); }; f(); }));
check("два датчика с разным нулём — слушаем один: взгляд не дрожит и не уезжает к среднему между нулями", both.range <= 0.25 && Math.abs(dyaw(both.mean, qhome)) < 1, { ...both, qhome });
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
