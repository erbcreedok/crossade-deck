// СТРАНИЦА «ЗВУКИ»: галерея всех скачанных звуков (плитка — звук, нажал — играет, ручек нет) и список звуков на каждое действие (любые звуки из галереи, у каждого свои начало, длительность, скорость, тон, громкость, динамика).
//   (нужны :9588 и :9590)   node design/zones/sounds-check.mjs [host]
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
await f.waitForFunction(() => window.__ready && window.__sound.tracks.every((n) => window.__sound.buffer(n)), null, { timeout: 60000 });
await p.waitForTimeout(300);
await f.evaluate(() => { window.__sound.voice = ((orig) => (spec) => { (window.__spec ??= []).push(spec); return orig(spec); })(window.__sound.voice); });
const spec = () => f.evaluate(() => window.__spec?.at(-1));
const clear = () => f.evaluate(() => { window.__spec = []; });

// 1. Галерея: все 9 звуков загружены при открытии, у каждого плитка с волной, никаких ручек.
const gal = await f.evaluate(() => ({ tiles: [...document.querySelectorAll("#gal .tile")].map((t) => t.dataset.track), ranges: document.querySelectorAll("#gal input").length, selects: document.querySelectorAll("#gal select").length, waves: [...document.querySelectorAll("#gal canvas")].every((c) => c.getContext("2d").getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0)) }));
check("галерея: 9 плиток-звуков, у каждой волна", gal.tiles.length === 9 && gal.waves, gal);
check("в галерее нет ни ползунков, ни выбора — только слушать", gal.ranges === 0 && gal.selects === 0, gal);
await clear();
await f.evaluate(() => document.querySelector('#gal .tile[data-track="gather-2"]').click());
await p.waitForTimeout(300);
const one = await spec();
check("один клик по плитке — играет именно этот звук целиком (с начала файла)", one && one.track === "gather-2" && one.raw === true, one);
check("при воспроизведении плитка подсвечена и по ней бежит бегунок", await f.evaluate(() => { const t = document.querySelector('#gal .tile[data-track="gather-2"]'); return t.classList.contains("playing") && t.querySelector(".tph").style.display === "block"; }));

// 2. Звуки действий: у каждого действия список; добавить звук из любых; свои настройки у каждого; ▶ играет ровно его.
const ev = (kind) => `.ev[data-kind="${kind}"]`;
const sounds = (kind) => f.evaluate((k) => document.querySelectorAll(`.ev[data-kind="${k}"] .snd`).length, kind);
check("у действия «Положил» один звук по умолчанию", (await sounds("lay")) === 1);
for (const t of ["turn-1", "merge-1", "shuffle-1"]) {
  const had = await sounds("lay");
  await f.evaluate(([k, tr]) => { const a = document.querySelector(`.ev[data-kind="${k}"] select.add`); a.value = tr; a.dispatchEvent(new Event("change")); }, ["lay", t]);
  await f.waitForFunction((n) => document.querySelectorAll('.ev[data-kind="lay"] .snd').length === n, had + 1, { timeout: 8000 });
}
check("к действию добавлены ещё три звука из разных мест (всего 4)", (await sounds("lay")) === 4);
// У третьего свои настройки: начало 0,3 с, длится 0,2 с, скорость 1,5, тон +3, громкость 0,5.
await f.evaluate(() => {
  const box = document.querySelectorAll('.ev[data-kind="lay"] .snd')[2];
  const set = (label, val) => { const r = [...box.querySelectorAll(".sl")].find((l) => l.querySelector("span").textContent === label).querySelector("input"); r.value = val; r.dispatchEvent(new Event("input")); };
  set("начало", 300); set("длится", 200); set("скорость", 1.5); set("тон", 3); set("громкость", 0.5);
});
await clear();
await f.evaluate(() => document.querySelectorAll('.ev[data-kind="lay"] .snd')[2].querySelectorAll("button")[0].click());
await p.waitForTimeout(300);
const third = await spec();
check("▶ у третьего звука играет только его с его настройками: начало 0,3 с, длится 0,2 с, ×1,5, +3 пт, громкость 0,5", third && third.track === "merge-1" && Math.abs(third.from - 0.3) < 0.011 && third.cutMs === 200 && Math.abs(third.rate - 1.5) < 0.01 && third.pitch === 3 && Math.abs(third.gain - 0.8 * 0.5) < 0.05 && (third.layers ?? []).length === 0, third);
check("настройки сохранены у этого звука, у других остались свои", await f.evaluate(() => { const l = window.__feel.preset.lay; const all = [l, ...(l.extra ?? [])]; return all.length === 4 && all[2].track === "merge-1" && all[2].len === 200 && all[0].len !== 200 && all[1].len !== 200; }));
// Динамика: у звука свой ползунок; при слабом действии громкость падает по ней.
await f.evaluate(() => { const box = document.querySelectorAll('.ev[data-kind="lay"] .snd')[0]; const r = [...box.querySelectorAll(".sl")].find((l) => l.querySelector("span").textContent === "динамика").querySelector("input"); r.value = 0; r.dispatchEvent(new Event("input")); });
await clear();
await f.evaluate(() => { window.__feel.preset.lay.extra = []; delete window.__feel.preset.lay.extra; window.__feel.play({ kind: "lay", energy: 0.1 }); });
const dyn0 = await spec();
check("динамика 0: слабое действие играет в полную громкость звука (не тише)", dyn0 && Math.abs(dyn0.gain - 0.8) < 0.05, dyn0);
// × убирает звук; без звуков — «звуков нет».
await f.evaluate(() => window.__feel.reset("lay"));
await f.evaluate(() => document.getElementById("reset").click());
await p.waitForTimeout(200);
check("«Сбросить всё» возвращает заводские звуки (у «Положил» один)", (await sounds("lay")) === 1);
await f.evaluate(() => document.querySelectorAll('.ev[data-kind="lay"] .snd')[0].querySelectorAll("button")[1].click());
await p.waitForTimeout(200);
check("× убирает последний звук: «звуков нет»", (await sounds("lay")) === 0 && await f.evaluate(() => /звуков нет/.test(document.querySelector('.ev[data-kind="lay"]').textContent)));
await f.evaluate(() => document.getElementById("reset").click());
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const k of checks) console.log(k.ok ? "ok  " : "FAIL", k.name, k.ok ? "" : JSON.stringify(k.got));
process.exit(checks.every((k) => k.ok) ? 0 : 1);
