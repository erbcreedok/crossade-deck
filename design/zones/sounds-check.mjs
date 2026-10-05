// СТРАНИЦА «ЗВУКИ ДВИЖЕНИЙ»: список дорожек с волной и воспроизведением на любой скорости; выбор дорожки на движение сохраняется в пресете.   (нужны :9588 и :9590)   node design/zones/sounds-check.mjs [host]
import { createRequire } from "module";
const require = createRequire(new URL("../../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const host = process.argv[2] ?? "localhost";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const p = await (await browser.newContext({ viewport: { width: 430, height: 900 } })).newPage();
const errors = [], checks = [];
p.on("pageerror", (e) => errors.push(e.message));
const check = (name, ok, got) => checks.push({ name, ok, got });
await p.goto(`http://${host}:9588/sounds.html`);
await p.waitForTimeout(3000);
const f = p.frames().find((x) => x.url().includes("sounds-page"));
await f.waitForFunction(() => window.__ready, null, { timeout: 60000 });
await p.waitForTimeout(500);
const tracks = await f.evaluate(() => [...document.querySelectorAll(".track")].map((t) => t.dataset.track));
check("в списке все 9 дорожек стола", tracks.length === 9 && tracks.includes("drop-1") && tracks.includes("gather-3"), tracks);
// Страница открылась сразу, дорожки не загружены; ▶ загружает именно эту дорожку (с полоской загрузки) и затем играет её на выбранной скорости.
const before = await f.evaluate(() => ({ loaded: window.__sound.health.loaded, drop: !!window.__sound.buffer("drop-1") }));
check("до нажатия дорожки не загружены (страница открылась сразу)", before.loaded === 0 && !before.drop, before);
await f.evaluate(() => { const s = document.querySelector('.track[data-track="drop-1"] input[type=range]'); s.value = 0.5; s.dispatchEvent(new Event("input")); });
await f.evaluate(() => { window.__sound.voice = ((orig) => (spec) => { (window.__spec ??= []).push(spec); return orig(spec); })(window.__sound.voice); });
const during = await f.evaluate(() => { document.querySelector('.track[data-track="drop-1"] button').click(); const t = document.querySelector('.track[data-track="drop-1"]'); return { loading: t.classList.contains("loading"), btn: t.querySelector("button").textContent }; });
check("после нажатия ▶ показана загрузка (полоска и «…»)", during.loading && during.btn === "…", during);
await f.waitForFunction(() => !!window.__sound.buffer("drop-1") && window.__spec?.length, null, { timeout: 15000 });
const spec = await f.evaluate(() => window.__spec?.at(-1));
check("после загрузки играет именно эту дорожку на выбранной скорости", spec && spec.track === "drop-1" && Math.abs(spec.rate - 0.5) < 0.01, spec);
const ph1 = await f.evaluate(() => { const e = document.querySelector('.track[data-track="drop-1"] .ph'); return { shown: e.style.display, left: parseFloat(e.style.left) }; });
await p.waitForTimeout(250);
const ph2 = await f.evaluate(() => { const e = document.querySelector('.track[data-track="drop-1"] .ph'); return { shown: e.style.display, left: parseFloat(e.style.left) }; });
check("бегунок бежит по волне вместе со звуком (виден и сдвигается вправо)", ph1.shown === "block" && ph2.left > ph1.left, { ph1, ph2 });
await p.waitForTimeout(1600);
check("после конца звука бегунок исчезает", (await f.evaluate(() => document.querySelector('.track[data-track="drop-1"] .ph').style.display)) === "none");
const after = await f.evaluate(() => ({ loaded: window.__sound.health.loaded, other: !!window.__sound.buffer("gather-2"), meta: document.querySelector('.track[data-track="drop-1"] .meta').textContent }));
check("загрузилась только нажатая дорожка, и написано, за сколько", after.loaded === 1 && !after.other && /загружено за \d+ мс/.test(after.meta), after);
// Выбор дорожки на движение сохраняется в пресете и в хранилище.
await f.evaluate(() => { const sel = document.querySelector('.ev[data-kind="slam"] select'); sel.value = "track:gather-2"; sel.dispatchEvent(new Event("change")); });
await f.waitForFunction(() => !!window.__sound.buffer("gather-2"), null, { timeout: 15000 });
const saved = await f.evaluate(() => ({ preset: window.__feel.preset.slam.track, store: JSON.parse(localStorage.getItem("crossade.feel.v2")).preset.slam.track }));
check("выбрал дорожку на «Удар об стол» — она в пресете и сохранена", saved.preset === "gather-2" && saved.store === "gather-2", saved);
// «Загрузить все»: после неё загружены все 9 дорожек и у каждой нарисована волна.
await f.evaluate(() => document.getElementById("all").click());
await f.waitForFunction(() => window.__sound.tracks.every((n) => window.__sound.buffer(n)), null, { timeout: 30000 });
check("«Загрузить все» грузит все 9 дорожек и рисует волны", await f.evaluate(() => [...document.querySelectorAll("canvas.wave")].every((c) => c.width > 10 && c.getContext("2d").getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0))));
console.log("загрузка дорожек, мс:", JSON.stringify(await f.evaluate(() => window.__sound.health.loadMs)));
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const k of checks) console.log(k.ok ? "ok  " : "FAIL", k.name, k.ok ? "" : JSON.stringify(k.got));
process.exit(checks.every((k) => k.ok) ? 0 : 1);
