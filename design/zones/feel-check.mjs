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
const early = await f.evaluate(() => ({ loaded: window.__sound.health.loaded, state: window.__sound.health.state }));
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
await p.mouse.up(); await p.waitForTimeout(120);
check("положил — «lay» с вибрацией, и звук уже в момент отпускания (не после падения)", (await kinds()).includes("lay") && (await f.evaluate(() => window.__buzz.length)) > 0, { k: await kinds(), buzz: await f.evaluate(() => window.__buzz) });
check("«Положил» играет дорожку hand-1 с началом 113 мс на 0,96× (вместо drop-1)", await f.evaluate(() => { const l = window.__feel.preset.lay; return l.track === "hand-1" && l.from === 113 && Math.abs(l.rate - 0.96) < 1e-6 && (window.__tableSounds ?? []).some((e) => e.file === "hand-1"); }), await f.evaluate(() => ({ lay: window.__feel.preset.lay, log: (window.__tableSounds ?? []).map((e) => e.file) })));
check("«Взял карту» по умолчанию: звук drop-1, отрезок 0,09–0,15 с, «от силы» 100%", await f.evaluate(() => { const g = window.__feel.preset.grab; return g.track === "drop-1" && g.from === 90 && g.end === 150 && g.dyn === 1; }), await f.evaluate(() => window.__feel.preset.grab));
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
// Запрет «нельзя бить об стол»: у запретившего правая кнопка при левой карту не бросает и камера не вздрагивает; без запрета — удар.
{
  await recenter();
  await click('[data-rule="slam"] [data-k="blue"]'); await p.waitForTimeout(500);
  await clear();
  const sc0 = await f.evaluate(() => ({ top: window.__top.test.shakeInfo().count, first: window.__first.test.shakeInfo().count }));
  c = await grabAt(); await p.mouse.down({ button: "right" }); await p.waitForTimeout(500);
  const still = await f.evaluate(() => window.__top.test.draggingId());
  const sc1 = await f.evaluate(() => ({ top: window.__top.test.shakeInfo().count, first: window.__first.test.shakeInfo().count }));
  await p.mouse.up({ button: "right" }); await p.mouse.up(); await p.waitForTimeout(300);
  check("нельзя бить об стол: карта осталась в руке, камера не вздрогнула ни у кого", still !== null && sc1.top === sc0.top && sc1.first === sc0.first, { still, sc0, sc1 });
  await click('[data-rule="slam"] [data-k="blue"]'); await p.waitForTimeout(400);
}
// 6. 🔊 у сцены глушит её: ни событий, ни вибрации.
await f.evaluate(() => document.querySelector("#who-top .mute").click()); await p.waitForTimeout(150);
await clear(); await f.evaluate(() => (window.__buzz.length = 0));
c = await grabAt(); await p.mouse.up(); await p.waitForTimeout(900);
check("🔊 выключен у сцены — тишина и без вибрации", (await kinds()).length === 0 && (await f.evaluate(() => window.__buzz.length)) === 0, { k: await kinds(), buzz: await f.evaluate(() => window.__buzz) });
await f.evaluate(() => document.querySelector("#who-top .mute").click());
// 6б. Записи декодируются сразу при загрузке страницы, до первого касания (первый звук не ждёт загрузки и не опаздывает).
check("записи звуков загружены заранее, до первого касания (не меньше 7 из 9 уже декодированы)", early.loaded >= 7, early);
const onsets = await f.evaluate(() => window.__sound.health.onsets);
check("тишина в начале записей срезана: у каждой записи посчитано начало звука (не дольше 120 мс)", Object.keys(onsets).length >= 7 && Object.values(onsets).every((v) => v >= 0 && v <= 0.12), onsets);
console.log("начало звука в записях, с:", JSON.stringify(onsets));
// 7. Звук доехал до браузера: записи загружены (в логе голоса есть «drop»).
const played = await f.evaluate(() => ({ health: window.__sound.health, last: (window.__tableSounds ?? []).length }));
check("звуковая машина запущена, файлы доехали: звуков сыграно много, молчаливых мало", played.health.state === "running" && played.health.played >= 10 && played.health.silent <= 2, played);
// Чужие действия слышны и видны: первая сцена (звук включён) слышит, как карту двигают во второй (тише, «mine: false»); удар встряхивает обе камеры.
{
  await f.evaluate(() => { window.__top.home(); window.__first.home(); });
  await clear();
  const fid = await f.evaluate(() => window.__me.state.felt[0].id);
  const a = await f.evaluate((i) => window.__first.test.screenOf(i), fid);
  const c0 = await f.evaluate(() => ({ top: window.__top.test.shakeInfo().count, first: window.__first.test.shakeInfo().count }));
  await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(a.x + 20, a.y - 20, { steps: 4 }); await p.waitForTimeout(500);
  const heardGrab = await f.evaluate(() => window.__feel.log.filter((e) => e.mine === false).map((e) => e.kind));
  check("двигаю карту во второй сцене — первая слышит «grab» чужого (тише)", heardGrab.includes("grab"), heardGrab);
  await p.mouse.down({ button: "right" }); await p.waitForTimeout(1200); await p.mouse.up({ button: "right" }); await p.mouse.up(); await p.waitForTimeout(400);
  const c1 = await f.evaluate(() => ({ top: window.__top.test.shakeInfo().count, first: window.__first.test.shakeInfo().count }));
  const log = await f.evaluate(() => window.__feel.log.filter((e) => e.mine === false).map((e) => ({ k: e.kind, g: e.gain })));
  check("удар во второй сцене — у первой тоже вздрогнула камера (слабее), и звук «slam» чужого", c1.top > c0.top && log.some((e) => e.k === "slam"), { c0, c1, log });
  check("у сцены, где ударили, камера тоже вздрогнула", c1.first > c0.first, { c0, c1 });
}
// Выбранная на странице звуков дорожка играет на сценах: движению назначили точную дорожку — звучит именно она.
{
  const file = await f.evaluate(() => { window.__feel.preset.lay.track = "turn-1"; window.__feel.preset.lay.file = "turn"; window.__feel.play({ kind: "lay", energy: 1 }); return (window.__tableSounds ?? []).at(-1)?.file; });
  check("движению назначена точная дорожка — играет она", file === "turn-1", file);
  await f.evaluate(() => { window.__feel.reset("lay"); });
}
check("на панели написано, что звуки загружены (все)", await f.evaluate(() => /все \d+ загружены/.test(document.getElementById("feel-load")?.textContent ?? "")), await f.evaluate(() => document.getElementById("feel-load")?.textContent));
// По умолчанию звук и вибрация — только у первой сцены.
{
  const marks = await f.evaluate(() => ({ top: document.querySelector("#who-top .mute").textContent, first: document.querySelector("#who-first .mute").textContent }));
  check("по умолчанию звук включён только у первой сцены", marks.top === "🔊" && marks.first === "🔇", marks);
}
await browser.close();
// iPhone в Safari: navigator.vibrate нет — вибрация идёт тиком переключателя `<input switch>`.
{
  const b2 = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx2 = await b2.newContext({ viewport: { width: 430, height: 1000 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" });
  await ctx2.addInitScript(() => { Object.defineProperty(navigator, "vibrate", { value: undefined, configurable: true }); });
  const q = await ctx2.newPage();
  await q.goto(`http://${host}:9588/card.html`); await q.waitForTimeout(3000);
  const g = q.frames().find((x) => x.url().includes("card-scenes"));
  await g.waitForFunction(() => window.__ready && window.__feel, null, { timeout: 60000 });
  const mode = await g.evaluate(() => window.__feel.vibeMode);
  await g.evaluate(() => window.__feel.play({ kind: "lay", energy: 1 }));
  const sw = await g.evaluate(() => { const i = document.querySelector("input[switch]"); return i ? { exists: true, checked: i.checked } : { exists: false }; });
  await g.evaluate(() => window.__feel.play({ kind: "lay", energy: 1 }));
  const sw2 = await g.evaluate(() => document.querySelector("input[switch]")?.checked);
  check("iPhone без navigator.vibrate: режим «ios-switch», тик переключателя щёлкает (состояние меняется)", mode === "ios-switch" && sw.exists && sw.checked !== sw2, { mode, sw, sw2 });
  await b2.close();
}
check("без ошибок страницы", errors.length === 0, errors);
for (const k of checks) console.log(k.ok ? "ok  " : "FAIL", k.name, k.ok ? "" : JSON.stringify(k.got));
process.exit(checks.every((k) => k.ok) ? 0 : 1);
