// ЗВУК И ВИБРАЦИЯ НА «КАРТА — БАЗА»: каждое движение карты озвучено и вибрирует; 🔊 у сцены глушит её.   (нужны :9588 и :9590)   node design/zones/feel-check.mjs [host]
import { createRequire } from "module";
const require = createRequire(new URL("../../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const host = process.argv[2] ?? "localhost";
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 430, height: 1000 } });
await ctx.addInitScript(() => { window.__buzz = []; Object.defineProperty(navigator, "vibrate", { value: (p) => { window.__buzz.push(p); return true; }, configurable: true }); });
const p = await ctx.newPage();
const errors = [], checks = [];
p.on("pageerror", (e) => errors.push(e.message));
const check = (name, ok, got) => checks.push({ name, ok, got });
await p.goto(`http://${host}:9588/card.html`);
await p.waitForTimeout(3000);
const f = p.frames().find((x) => x.url().includes("card-scenes"));
await f.waitForFunction(() => window.__ready && window.__feel, null, { timeout: 60000 });
await p.waitForTimeout(1500);
const id = await f.evaluate(() => window.__me.state.felt[0].id);
const kinds = () => f.evaluate(() => window.__feel.log.map((e) => e.kind));
const clear = () => f.evaluate(() => { window.__feel.log.length = 0; window.__buzz?.length; });
const at = () => f.evaluate((i) => window.__top.test.screenOf(i), id);
const click = (sel) => f.evaluate((q) => document.querySelector(q).click(), sel);
const settle = async () => { let a = await at(); for (let k = 0; k < 40; k++) { await p.waitForTimeout(100); const b = await at(); if (Math.hypot(a.x - b.x, a.y - b.y) < 0.3) return b; a = b; } return a; };
const recenter = async () => { await f.evaluate((i) => { window.__top.home(); window.__first.home(); window.__me.send({ t: "grab", id: i }); window.__me.send({ t: "drop", id: i, to: { in: "felt", x: 0, y: 0.8, up: true, angle: 0 } }); }, id); await p.waitForTimeout(400); };
const grabAt = async () => { const c = await settle(); await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c.x + 20, c.y - 30, { steps: 4 }); await p.waitForTimeout(250); return c; };

// 1. Взял → «grab»; положил на месте → «lay»; вибрация ушла.
await clear();
let c = await grabAt();
check("взял карту — «grab»", (await kinds()).includes("grab"), await kinds());
await p.mouse.up(); await p.waitForTimeout(900);
check("положил — «lay» с вибрацией", (await kinds()).includes("lay") && (await f.evaluate(() => window.__buzz.length)) > 0, { k: await kinds(), buzz: await f.evaluate(() => window.__buzz) });
// 2. Бросил на скорости → «throw».
await recenter(); await clear();
c = await settle(); await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c.x + 5, c.y - 5, { steps: 2 }); await p.waitForTimeout(150);
{
  // Порог «бросил» опущен до предела: на медленной картинке (программная отрисовка) настоящей скорости не набрать; проверяется, что событие «throw» уходит, когда порог взят.
  await f.evaluate(() => window.__top.test.setThrow({ still: 1, full: 2, window: 1500 }));
  await p.mouse.move(c.x + 5, c.y - 120, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(900);
  await f.evaluate(() => window.__top.test.setThrow({ still: 100, full: 600, window: 120 }));
}
check("бросил на скорости — «throw»", (await kinds()).includes("throw"), await f.evaluate(() => window.__feel.log));
// 3. Удар → «slam».
await clear();
c = await grabAt(); await p.mouse.down({ button: "right" }); await p.waitForTimeout(900); await p.mouse.up({ button: "right" }); await p.mouse.up(); await p.waitForTimeout(300);
check("удар (правая при левой) — «slam»", (await kinds()).includes("slam"), await kinds());
// 4. Переворот F → «flip»; поворот Ctrl → «spin».
await clear();
c = await grabAt(); await p.keyboard.press("f"); await p.waitForTimeout(150);
check("переворот F — «flip»", (await kinds()).includes("flip"), await kinds());
await p.keyboard.down("Control"); await p.mouse.move(c.x + 20 + 80, c.y - 30, { steps: 8 }); await p.keyboard.up("Control"); await p.waitForTimeout(150);
check("поворот Ctrl+мышь — тики «spin»", (await kinds()).filter((k) => k === "spin").length >= 2, await kinds());
await p.mouse.up(); await p.waitForTimeout(900);
// 5. «Нельзя» → «deny» (если показ включён); «вернулась на место» → «home».
await click('[data-rule="lift"] [data-k="blue"]'); await p.waitForTimeout(250);
await clear(); c = await settle(); await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c.x + 20, c.y - 20, { steps: 3 }); await p.mouse.up(); await p.waitForTimeout(250);
check("запрет с выключенным показом — тихо (без «deny»)", !(await kinds()).includes("deny"), await kinds());
await click('[data-rule="lift"] .tg'); await p.waitForTimeout(250);
await clear(); c = await settle(); await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(250);
check("запрет с включённым показом — «deny»", (await kinds()).includes("deny"), await kinds());
await click('[data-rule="lift"] [data-k="blue"]'); await click('[data-rule="lift"] .tg');
await recenter(); await click('[data-rule="move"] [data-k="blue"]'); await click('[data-rule="move"] .tg'); await p.waitForTimeout(600);
await clear(); c = await grabAt();  await p.mouse.move(c.x + 90, c.y + 60, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(1100);
check("нельзя перемещать, показ включён — «home»", (await kinds()).includes("home"), await f.evaluate(() => window.__feel.log));
await click('[data-rule="move"] [data-k="blue"]'); await click('[data-rule="move"] .tg');
// 6. 🔊 у сцены глушит её: ни событий, ни вибрации.
await f.evaluate(() => document.querySelector("#who-top .mute").click()); await p.waitForTimeout(150);
await clear(); await f.evaluate(() => (window.__buzz.length = 0));
c = await grabAt(); await p.mouse.up(); await p.waitForTimeout(900);
check("🔊 выключен у сцены — тишина и без вибрации", (await kinds()).length === 0 && (await f.evaluate(() => window.__buzz.length)) === 0, { k: await kinds(), buzz: await f.evaluate(() => window.__buzz) });
await f.evaluate(() => document.querySelector("#who-top .mute").click());
// 7. Звук доехал до браузера: записи загружены (в логе голоса есть «drop»).
const played = await f.evaluate(() => ({ health: window.__sound.health, last: (window.__tableSounds ?? []).length }));
check("звуковая машина запущена, файлы доехали: звуков сыграно много, молчаливых мало", played.health.state === "running" && played.health.played >= 10 && played.health.silent <= 2, played);
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const k of checks) console.log(k.ok ? "ok  " : "FAIL", k.name, k.ok ? "" : JSON.stringify(k.got));
process.exit(checks.every((k) => k.ok) ? 0 : 1);
