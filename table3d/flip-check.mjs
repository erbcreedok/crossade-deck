// ПЕРЕВОРОТ КАРТЫ: F при несомой карте, правая кнопка → «Перевернуть», второй палец вбок (мёртвая зона, щелчок, откат), обрыв первым пальцем; двойной тап больше не переворачивает.
//   node flip-check.mjs [base]
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch();
const errors = [];
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`${base}/?stand&cam=top`);
await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
await p.waitForTimeout(1500);
// Карта на сукне рубашкой вверх (`up: false`): с неё начинаем, «перевёрнута» — значит `up: true`.
// Каждая карта — в своё место: лежащую карту, над которой подержали палец дольше задержки, подхватило бы слияние.
const SPOTS = [[-1.2, 0.4], [1.2, 0.4], [-1.2, -1.6], [1.2, -1.6], [-1.2, 2.2], [1.2, 2.2]];
let putN = 0;
const put = async () => {
  const spot = SPOTS[putN++ % SPOTS.length];
  const id = await p.evaluate((sp) => { const s = window.__t3d.state(); const c = s.chairs.find((x) => x.owner === "me").hand.at(0); window.__t3d.dropFeltAt(c.id, sp[0], sp[1]); return c.id; }, spot);
  await p.waitForTimeout(800);
  // Из руки карта ложится той стороной, какой была (лицом ко мне): начинаем всегда с рубашки вверх.
  if (await p.evaluate((i) => window.__t3d.state().felt.find((c) => c.id === i).up, id)) { await p.evaluate((i) => window.__t3d.turnCard(i), id); await p.waitForTimeout(500); }
  return id;
};
const feltUp = (id) => p.evaluate((i) => window.__t3d.state().felt.find((c) => c.id === i)?.up, id);
const at = (id) => p.evaluate((i) => window.__t3d.screenOf(i), id);
const info = () => p.evaluate(() => window.__t3d.flipInfo());
// касания: id-пальцы
const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
const SPAN = 220, DEAD = 12, px = (deg) => DEAD + (deg / 180) * SPAN;
let id = await put();
let c = await at(id);
// 1. Двойной тап по карте не переворачивает.
const before = await feltUp(id);
await touch("touchStart", [[c.x, c.y, 1]]); await touch("touchEnd", []); await p.waitForTimeout(80);
await touch("touchStart", [[c.x, c.y, 1]]); await touch("touchEnd", []); await p.waitForTimeout(600);
check("двойной тап не переворачивает", (await feltUp(id)) === before, { before, after: await feltUp(id) });
// 2. Второй палец до порога: карта крутится, отпустил — откат, переворота нет.
c = await at(id);
await touch("touchStart", [[c.x, c.y, 1]]); await touch("touchMove", [[c.x + 10, c.y + 8, 1]]); await touch("touchMove", [[c.x + 12, c.y + 10, 1]]); await p.waitForTimeout(200);
const f0 = [c.x + 12, c.y + 10, 1];
await touch("touchStart", [f0, [200, 600, 2]]);
await touch("touchMove", [f0, [200 + px(50), 600, 2]]); await p.waitForTimeout(150);
const i50 = await info();
check("второй палец: карта крутится за пальцем (угол ≈ 50°)", i50.second && Math.abs(i50.deg - 50) < 2, i50);
await touch("touchEnd", [[200 + px(50), 600, 2]]); await p.waitForTimeout(250);
const iBack = await info();
check("второй палец поднят до щелчка: угол сброшен, сторона прежняя", iBack.deg === 0 && iBack.up === false, iBack);
await touch("touchEnd", []); await p.waitForTimeout(700);
check("после дропа сторона не сменилась", (await feltUp(id)) === false, await feltUp(id));
// 3. Щелчок: довёл до порога — сторона сменилась и осталась, даже если палец вернули.
c = await at(id);
await touch("touchStart", [[c.x, c.y, 1]]); await touch("touchMove", [[c.x + 10, c.y + 8, 1]]); await touch("touchMove", [[c.x + 12, c.y + 10, 1]]); await p.waitForTimeout(200);
const g0 = [c.x + 12, c.y + 10, 1];
await touch("touchStart", [g0, [200, 600, 2]]);
await touch("touchMove", [g0, [200 + px(110), 600, 2]]); await p.waitForTimeout(150);
await touch("touchMove", [g0, [200, 600, 2]]); await p.waitForTimeout(150);
const iClick = await info();
check("щелчок: сторона сменилась и осталась после возврата пальца", iClick.up === true && iClick.deg === 0, iClick);
await touch("touchEnd", [[200, 600, 2]]); await touch("touchEnd", [g0]); await p.waitForTimeout(800);
check("после дропа карта перевёрнута", (await feltUp(id)) === true, await feltUp(id));
// 4. Первый палец отпустил, не щёлкнуло: обрыв, карта ляжет как была.
id = await put(); c = await at(id);
await touch("touchStart", [[c.x, c.y, 1]]); await touch("touchMove", [[c.x + 10, c.y + 8, 1]]); await touch("touchMove", [[c.x + 12, c.y + 10, 1]]); await p.waitForTimeout(200);
const h0 = [c.x + 12, c.y + 10, 1];
await touch("touchStart", [h0, [200, 600, 2]]);
await touch("touchMove", [h0, [200 + px(60), 600, 2]]); await p.waitForTimeout(150);
await touch("touchEnd", [[200 + px(60), 600, 2]]); await p.waitForTimeout(600);
check("первый палец отпустил до щелчка: переворота нет", (await feltUp(id)) === false, await feltUp(id));
await touch("touchEnd", []);
// 5. Первый палец отпустил после щелчка: переворот остался.
id = await put(); c = await at(id);
await touch("touchStart", [[c.x, c.y, 1]]); await touch("touchMove", [[c.x + 10, c.y + 8, 1]]); await touch("touchMove", [[c.x + 12, c.y + 10, 1]]); await p.waitForTimeout(200);
const k0 = [c.x + 12, c.y + 10, 1];
await touch("touchStart", [k0, [200, 600, 2]]);
await touch("touchMove", [k0, [200 - px(120), 600, 2]]); await p.waitForTimeout(150);
await touch("touchEnd", [[200 - px(120), 600, 2]]); await p.waitForTimeout(600);
check("первый палец отпустил после щелчка (влево): переворот остался", (await feltUp(id)) === true, await feltUp(id));
await touch("touchEnd", []);
// 6. Компьютер: F при несомой карте.
id = await put(); c = await at(id);
await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c.x + 20, c.y + 10, { steps: 4 }); await p.waitForTimeout(200);
await p.keyboard.press("KeyF"); await p.waitForTimeout(300);
const iF = await info();
await p.mouse.up(); await p.waitForTimeout(700);
check("F: сторона сменилась в руке и после дропа", iF.up === true && (await feltUp(id)) === true, { iF, up: await feltUp(id) });
// 7. Компьютер: правая кнопка → «Перевернуть».
id = await put(); c = await at(id);
await p.mouse.click(c.x, c.y, { button: "right" }); await p.waitForTimeout(300);
const item = p.getByText("Перевернуть");
check("правая кнопка: появилось меню", (await item.count()) === 1);
await item.click(); await p.waitForTimeout(600);
check("«Перевернуть» переворачивает карту", (await feltUp(id)) === true, await feltUp(id));
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const k of checks) console.log(k.ok ? "ok  " : "FAIL", k.name, k.ok ? "" : JSON.stringify(k.got));
process.exit(checks.every((k) => k.ok) ? 0 : 1);
