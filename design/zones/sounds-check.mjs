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
check("галерея: плитка на каждую запись из папки (не меньше 17: набор Kenney и свои), у каждой волна", gal.tiles.length >= 17 && gal.waves && ["drop-4", "hand-3", "turn-3", "merge-2"].every((t) => gal.tiles.includes(t)), gal);
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
check("в списке выбора звука действия те же звуки, что в галерее (и подсказка «добавить»), никаких групп", await f.evaluate(() => { const o = [...document.querySelectorAll('.ev[data-kind="lay"] select.add option')].map((x) => x.textContent); return o.length === document.querySelectorAll("#gal .tile").length + 1 && !o.some((t) => /групп/.test(t)); }));
check("у действия «Положил» один звук по умолчанию", (await sounds("lay")) === 1);
for (const t of ["turn-1", "merge-1", "shuffle-1"]) {
  const had = await sounds("lay");
  await f.evaluate(([k, tr]) => { const a = document.querySelector(`.ev[data-kind="${k}"] select.add`); a.value = tr; a.dispatchEvent(new Event("change")); }, ["lay", t]);
  await f.waitForFunction((n) => document.querySelectorAll('.ev[data-kind="lay"] .snd').length === n, had + 1, { timeout: 8000 });
}
check("к действию добавлены ещё три звука из разных мест (всего 4)", (await sounds("lay")) === 4);
// У третьего свои настройки: начало 0,3 с, конец 0,5 с, скорость 1,5, тон +3, громкость 0,5.
await f.evaluate(() => {
  const box = document.querySelectorAll('.ev[data-kind="lay"] .snd')[2];
  const set = (label, val) => { const r = [...box.querySelectorAll(".sl")].find((l) => l.querySelector("span").textContent === label).querySelector("input"); r.value = val; r.dispatchEvent(new Event("input")); };
  set("начало", 300); set("конец", 500); set("скорость", 1.5); set("тон", 3); set("громкость", 0.5);
});
await clear();
await f.evaluate(() => document.querySelectorAll('.ev[data-kind="lay"] .snd')[2].querySelectorAll("button")[0].click());
await p.waitForTimeout(300);
const third = await spec();
check("▶ у третьего звука играет только его с его настройками: начало 0,3 с, конец 0,5 с, ×1,5, +3 пт, громкость 0,5", third && third.track === "merge-1" && Math.abs(third.from - 0.3) < 0.011 && Math.abs(third.cutMs - 200 / (1.5 * 2 ** (3 / 12))) < 2 && Math.abs(third.rate - 1.5) < 0.01 && third.pitch === 3 && Math.abs(third.gain - 0.8 * 0.5) < 0.05 && (third.layers ?? []).length === 0, third);
check("настройки сохранены у этого звука, у других остались свои", await f.evaluate(() => { const l = window.__feel.preset.lay; const all = [l, ...(l.extra ?? [])]; return all.length === 4 && all[2].track === "merge-1" && all[2].end === 500 && all[0].end !== 500 && all[1].end !== 500; }));
// Картинка звука в секции 2: волна, золотая черта старта и оранжевая — конца; двигаются за ползунками сразу; бегунок бежит при воспроизведении.
{
  const m = () => f.evaluate(() => { const b = document.querySelectorAll('.ev[data-kind="lay"] .snd')[2], g = (c) => parseFloat(b.querySelector(c).style.left); return { start: g(".sm"), end: g(".em"), d1: parseFloat(b.querySelector(".d1").style.width), d2: parseFloat(b.querySelector(".d2").style.width), wave: b.querySelector("canvas").getContext("2d").getImageData(0, 0, b.querySelector("canvas").width, b.querySelector("canvas").height).data.some((v, i) => i % 4 === 3 && v > 0), lg: b.querySelector(".lg").textContent, lg2: b.querySelector(".lg2").textContent }; });
  const set = (label, val) => f.evaluate(([l, v]) => { const box = document.querySelectorAll('.ev[data-kind="lay"] .snd')[2]; const r = [...box.querySelectorAll(".sl")].find((x) => x.querySelector("span").textContent === l).querySelector("input"); r.value = v; r.dispatchEvent(new Event("input")); }, [label, val]);
  const a = await m();
  check("у звука в секции 2 есть картинка: волна, черта старта, черта конца, подписи «старт» и «конец»", a.wave && a.end > a.start && /старт/.test(a.lg) && /конец/.test(a.lg2), a);
  await set("начало", 100); await set("конец", 700); const b0 = await m();
  await set("начало", 400); const b1 = await m();
  check("ползунок «начало» двигает черту старта на волне сразу и притемняет левее", b1.start > b0.start + 10 && Math.abs(b1.d1 - b1.start) < 0.5, { b0, b1 });
  await set("конец", 450); const c1 = await m();
  await set("конец", 600); const c2 = await m();
  check("ползунок «конец» двигает оранжевую черту сразу: дальше — правее; правее конца притемнено", c2.end > c1.end + 5 && Math.abs(c2.d2 - (100 - c2.end)) < 0.5, { c1, c2 });
  await set("скорость", 2); await set("тон", 7); const c3 = await m();
  check("скорость и тон конец НЕ двигают: черта конца остаётся на месте", Math.abs(c3.end - c2.end) < 0.3, { c2, c3 });
  await set("начало", 100); await set("конец", 500); await set("скорость", 1.5); await set("тон", 3);
  await f.evaluate(() => document.querySelectorAll('.ev[data-kind="lay"] .snd')[2].querySelectorAll("button")[0].click());
  await p.waitForTimeout(40);
  const ph1 = await f.evaluate(() => { const e = document.querySelectorAll('.ev[data-kind="lay"] .snd')[2].querySelector(".ph"); return { shown: e.style.display, left: parseFloat(e.style.left) }; });
  await p.waitForTimeout(60);
  const ph2 = await f.evaluate(() => { const e = document.querySelectorAll('.ev[data-kind="lay"] .snd')[2].querySelector(".ph"); return { shown: e.style.display, left: parseFloat(e.style.left) }; });
  check("при ▶ белый бегунок бежит по волне от старта к концу", ph1.shown === "block" && ph2.left > ph1.left, { ph1, ph2 });
  // Действие: играет ОДИН звук из списка, каждый раз другой — по кругу в случайном порядке, подряд один и тот же не повторяется; одновременно ничего не играет.
  await clear();
  await f.evaluate(() => { for (let i = 0; i < 12; i++) window.__feel.play({ kind: "lay", energy: 1 }); });
  const seq = await f.evaluate(() => window.__spec.filter((s) => s.track).map((s) => s.track));
  check("за 12 действий — ровно 12 звуков (по одному на действие, не вместе)", seq.length === 12, seq);
  check("по кругу: дальше каждая четвёрка подряд содержит все четыре звука", [4, 8].every((i) => new Set(seq.slice(i, i + 4)).size === 4), seq);
  check("один и тот же подряд не повторяется", seq.every((t, i) => i === 0 || t !== seq[i - 1]), seq);
}
// Динамика: у звука свой ползунок; при слабом действии громкость падает по ней.
await f.evaluate(() => { const box = document.querySelectorAll('.ev[data-kind="lay"] .snd')[0]; const r = [...box.querySelectorAll(".sl")].find((l) => l.querySelector("span").textContent === "от силы").querySelector("input"); r.value = 0; r.dispatchEvent(new Event("input")); });
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
// «В игру»: настройки действия записываются в файл заводских (его читает и стенд, и игра); файл возвращаем как был.
{
  const { readFileSync, writeFileSync } = await import("fs");
  const file = new URL("../../server/table-client/feelPreset.json", import.meta.url), was = readFileSync(file, "utf8");
  try {
    await f.evaluate(() => { const sel = document.querySelector('.ev[data-kind="grab"] .snd select'); sel.value = "gather-3"; sel.dispatchEvent(new Event("change")); });
    await f.waitForFunction(() => window.__feel.preset.grab.track === "gather-3", null, { timeout: 5000 });
    await f.evaluate(() => [...document.querySelectorAll('.ev[data-kind="grab"] > .row button')].find((b) => b.textContent === "В игру").click());
    await p.waitForTimeout(800);
    const saved = JSON.parse(readFileSync(file, "utf8"));
    check("«В игру» у «Взял карту» записало действие в файл заводских (и только его)", saved.grab?.track === "gather-3" && Object.keys(saved).length === Object.keys(JSON.parse(was)).length + (JSON.parse(was).grab ? 0 : 1), { saved: Object.keys(saved), grab: saved.grab });
    check("на странице написано, что записано", await f.evaluate(() => /Записано в игру: Взял карту/.test(document.getElementById("saved").textContent)));
  } finally { writeFileSync(file, was); }
}
// «Сохранить как новый звук»: вырезается отрезок со скоростью и тоном в отдельный маленький файл; в действии звук заменяется на него (скорость 1, тон 0, начало и конец — как у файла).
{
  const { readFileSync, writeFileSync, existsSync, statSync, rmSync } = await import("fs");
  const custom = new URL("../../server/table-client/soundsCustom.json", import.meta.url), file = new URL("../../server/table-client/sounds/zz-test-bake.m4a", import.meta.url), was = readFileSync(custom, "utf8");
  p.on("dialog", (d) => d.accept("zz-test-bake"));
  try {
    await f.evaluate(() => document.getElementById("reset").click());
    await p.waitForTimeout(200);
    await f.evaluate(() => { const sel = document.querySelector('.ev[data-kind="flip"] .snd select'); sel.value = "gather-1"; sel.dispatchEvent(new Event("change")); });
    await f.waitForFunction(() => window.__feel.preset.flip.track === "gather-1", null, { timeout: 5000 });
    await f.evaluate(() => { const box = document.querySelector('.ev[data-kind="flip"] .snd'); const set = (l, v) => { const r = [...box.querySelectorAll(".sl")].find((x) => x.querySelector("span").textContent === l).querySelector("input"); r.value = v; r.dispatchEvent(new Event("input")); }; set("начало", 100); set("конец", 500); set("скорость", 2); set("тон", 0); window.__feel.preset.flip.tie = true; });
    await f.evaluate(() => [...document.querySelectorAll('.ev[data-kind="flip"] .snd button')].find((b) => /новый звук/.test(b.textContent)).click());
    await f.waitForFunction(() => window.__feel.preset.flip.track === "zz-test-bake", null, { timeout: 20000 });
    await p.waitForTimeout(500);
    const info = await f.evaluate(() => { const fl = window.__feel.preset.flip, b = window.__sound.buffer("zz-test-bake"); return { track: fl.track, rate: fl.rate, pitch: fl.pitch ?? 0, from: fl.from ?? null, end: fl.end ?? 0, dur: b?.audio.duration ?? 0, tile: !!document.querySelector('#gal .tile[data-track="zz-test-bake"]'), tracks: window.__sound.tracks.includes("zz-test-bake"), msg: document.getElementById("saved").textContent }; });
    check("новый звук собран: действие играет файл zz-test-bake со скоростью 1, тоном 0, без начала/конца", info.track === "zz-test-bake" && info.rate === 1 && info.pitch === 0 && info.from === null && !info.end, info);
    check("отрезок 0,1–0,5 с на скорости ×2 стал файлом ≈ 0,2 с (а не 0,77 с), он в галерее и в списке", Math.abs(info.dur - 0.2) < 0.06 && info.tile && info.tracks, info);
    const bytes = existsSync(file) ? statSync(file).size : 0;
    check("файл записан в папку звуков и меньше исходного (gather-1 — 7,4 КБ)", bytes > 500 && bytes < 7424, bytes);
    check("в списке своих звуков он записан", JSON.parse(readFileSync(custom, "utf8")).names.includes("zz-test-bake"));
    check("на странице написан размер и что файл нужно закоммитить", /КБ/.test(info.msg) && /закоммитить/.test(info.msg), info.msg);
  } finally { rmSync(file, { force: true }); writeFileSync(custom, was); await f.evaluate(() => document.getElementById("reset").click()); }
}
// ИГРА: что уже в игре и что на стенде; точечно «В игру» / «Вернуть как в игре» / «Убрать из игры» / «Сравнить»; файл заводских возвращаем как был.
{
  const { readFileSync, writeFileSync } = await import("fs");
  const file = new URL("../../server/table-client/feelPreset.json", import.meta.url), was = readFileSync(file, "utf8");
  try {
    writeFileSync(file, "{}\n");
    await p.reload(); await p.waitForTimeout(3000);
    const g = p.frames().find((x) => x.url().includes("sounds-page"));
    await g.waitForFunction(() => window.__ready && window.__sound.tracks.every((n) => window.__sound.buffer(n)), null, { timeout: 60000 });
    await g.evaluate(() => { window.__feel.reset(); window.__feel.save(); window.__renderEvents(); });
    const badge = (k) => g.evaluate((kk) => document.querySelector(`.ev[data-kind="${kk}"] .badge`)?.textContent, k);
    const btn = (k, t) => g.evaluate(([kk, tt]) => { const b = [...document.querySelectorAll(`.ev[data-kind="${kk}"] > .row button`)].find((x) => x.textContent === tt); return b ? b.disabled : null; }, [k, t]);
    const click = (k, t) => g.evaluate(([kk, tt]) => [...document.querySelectorAll(`.ev[data-kind="${kk}"] > .row button`)].find((x) => x.textContent === tt).click(), [k, t]);
    const summary = () => g.evaluate(() => document.getElementById("summary").textContent);
    check("в игре пока ничего: у «Положил» «в игре прежний звук» и сказано какой", (await badge("lay")) === "в игре прежний звук" && await g.evaluate(() => /прежний звук игры — стук карты о стол/.test(document.querySelector('.ev[data-kind="lay"] .state').textContent)));
    check("сводка: в игре 0 из 8", /В игре новые звуки: 0 из 8/.test(await summary()), await summary());
    check("«Убрать из игры», «Вернуть как в игре», «В игру» (совпадает) — «Убрать» и «Вернуть» недоступны, пока нечего", (await btn("lay", "Убрать из игры")) === true && (await btn("lay", "Вернуть как в игре")) === true && (await btn("lay", "В игру")) === false);
    await g.evaluate(() => { window.__old = []; const o = window.__sound.play; window.__sound.play = (...a) => { window.__old.push(a[0]); return o.apply(window.__sound, a); }; });
    await click("lay", "▶ в игре");
    check("«▶ в игре» у не переведённого действия играет прежний звук игры (повод drop)", await g.evaluate(() => window.__old.at(-1) === "drop"));
    await click("lay", "В игру"); await p.waitForTimeout(900);
    check("«В игру» записало только «Положил» в файл", Object.keys(JSON.parse(readFileSync(file, "utf8"))).join() === "lay", readFileSync(file, "utf8"));
    check("«Положил»: «в игре этот же», сводка 1 из 8, у «Взял» всё ещё прежний", (await badge("lay")) === "в игре этот же" && /1 из 8/.test(await summary()) && (await badge("grab")) === "в игре прежний звук");
    check("«В игру» у совпадающего недоступна, «Убрать из игры» доступна", (await btn("lay", "В игру")) === true && (await btn("lay", "Убрать из игры")) === false);
    // «тик/бум» тоже правка: после записи в игру переключатель оживляет статус и «В игру»
    await g.evaluate(() => [...document.querySelectorAll('.ev[data-kind="lay"] .row button')].find((x) => /тик\/бум/.test(x.textContent)).click());
    check("переключил «тик/бум» у записанного в игру: «изменён, в игре прежний», кнопка «В игру» доступна", (await badge("lay")) === "изменён, в игре прежний" && (await btn("lay", "В игру")) === false, { b: await badge("lay") });
    await g.evaluate(() => [...document.querySelectorAll('.ev[data-kind="lay"] .row button')].find((x) => /тик\/бум/.test(x.textContent)).click());
    check("вернул «тик/бум» как было — снова «в игре этот же»", (await badge("lay")) === "в игре этот же");
    // правка ползунком ПОСЛЕ записи (без перерисовки страницы): статус и кнопка «В игру» оживают сразу, и новое записывается поверх
    await g.evaluate(() => { const r = [...document.querySelectorAll('.ev[data-kind="lay"] .snd .sl')].find((x) => /скорость/.test(x.textContent)).querySelector("input"); r.value = "1.5"; r.dispatchEvent(new Event("input")); });
    check("поменял скорость ползунком у записанного в игру: «изменён, в игре прежний», кнопка «В игру» доступна", (await badge("lay")) === "изменён, в игре прежний" && (await btn("lay", "В игру")) === false && (await btn("lay", "Вернуть как в игре")) === false, { b: await badge("lay") });
    await click("lay", "В игру"); await p.waitForTimeout(900);
    check("«В игру» записало новое поверх старого: в файле скорость 1.5, статус «в игре этот же»", JSON.parse(readFileSync(file, "utf8")).lay?.rate === 1.5 && (await badge("lay")) === "в игре этот же");
    await g.evaluate(() => { const r = [...document.querySelectorAll('.ev[data-kind="lay"] .snd .sl')].find((x) => /скорость/.test(x.textContent)).querySelector("input"); r.value = "1"; r.dispatchEvent(new Event("input")); });
    await click("lay", "В игру"); await p.waitForTimeout(900);
    await g.evaluate(() => { window.__feel.preset.lay.rate = 1.7; window.__renderEvents(); });
    check("правка на стенде после записи: «изменён, в игре прежний»", (await badge("lay")) === "изменён, в игре прежний");
    await g.evaluate(() => { window.__spec = []; const o = window.__sound.voice; window.__sound.voice = (sp) => { window.__spec.push(sp); return o.call(window.__sound, sp); }; });
    await click("lay", "Сравнить"); await p.waitForTimeout(1500);
    const sp = await g.evaluate(() => window.__spec.map((x) => +x.rate.toFixed(1)));
    check("«Сравнить»: сначала звук игры (скорость как записана, около 1), потом со стенда (около 1.7)", sp.length === 2 && sp[0] < 1.3 && sp[1] > 1.4, sp);
    await click("lay", "Вернуть как в игре");
    check("«Вернуть как в игре»: правка отброшена, снова «в игре этот же»", (await badge("lay")) === "в игре этот же" && await g.evaluate(() => window.__feel.preset.lay.rate < 1.3));
    await click("lay", "Убрать из игры"); await p.waitForTimeout(900);
    check("«Убрать из игры»: действия нет в файле, снова прежний звук, сводка 0 из 8", !("lay" in JSON.parse(readFileSync(file, "utf8"))) && (await badge("lay")) === "в игре прежний звук" && /0 из 8/.test(await summary()));
  } finally { writeFileSync(file, was); }
}
// «Добавить звук из файла»: файл сжимается в m4a, ложится в папку звуков, вписывается в список своих и появляется в галерее.
{
  const { readFileSync, writeFileSync, existsSync, rmSync } = await import("fs");
  const custom = new URL("../../server/table-client/soundsCustom.json", import.meta.url), out = new URL("../../server/table-client/sounds/zz-test-upload.m4a", import.meta.url), was = readFileSync(custom, "utf8");
  const g = p.frames().find((x) => x.url().includes("sounds-page"));
  // 0,2 с синуса 440 Гц, 16 бит, 22050 Гц, моно
  const n = 4410, buf = Buffer.alloc(44 + n * 2); buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(22050, 24); buf.writeUInt32LE(44100, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(i / 22050 * 440 * 2 * Math.PI) * 12000), 44 + i * 2);
  p.removeAllListeners("dialog"); p.once("dialog", (d) => d.accept("zz-test-upload"));
  try {
    await g.setInputFiles("#filepick", { name: "my beep.wav", mimeType: "audio/wav", buffer: buf });
    await g.waitForFunction(() => !!document.querySelector('#gal .tile[data-track="zz-test-upload"]'), null, { timeout: 20000 });
    check("загруженный файл: он в галерее и среди дорожек, файл m4a лежит в папке звуков", await g.evaluate(() => window.__sound.tracks.includes("zz-test-upload")) && existsSync(out));
    check("вписан в список своих звуков, на странице сказано про коммит", JSON.parse(readFileSync(custom, "utf8")).names.includes("zz-test-upload") && await g.evaluate(() => /закоммитить/.test(document.getElementById("saved").textContent)));
  } finally { rmSync(out, { force: true }); writeFileSync(custom, was); }
}
// СВОРАЧИВАНИЕ: главные секции (1, 2) и каждое действие; помнится после перезагрузки.
{
  const g = p.frames().find((x) => x.url().includes("sounds-page"));
  const vis = (q) => g.evaluate((qq) => { const e = document.querySelector(qq); return !!e && e.offsetParent !== null && e.getBoundingClientRect().height > 0; }, q);
  await g.evaluate(() => localStorage.removeItem("crossade.sounds.fold"));
  await p.reload(); await p.waitForTimeout(3000);
  const h = p.frames().find((x) => x.url().includes("sounds-page"));
  await h.waitForFunction(() => window.__ready && window.__sound.tracks.every((n) => window.__sound.buffer(n)), null, { timeout: 60000 });
  const v = (q) => h.evaluate((qq) => { const e = document.querySelector(qq); return !!e && e.offsetParent !== null; }, q);
  check("по умолчанию всё развёрнуто", await v("#gal") && await v('.ev[data-kind="lay"] .state') && await v('.ev[data-kind="lay"] .snd'));
  await h.evaluate(() => document.querySelector('.ev[data-kind="lay"] .nm').click());
  check("действие свёрнуто: его звуки и статус скрыты, заголовок с кнопками виден, остальные действия на месте", !(await v('.ev[data-kind="lay"] .state')) && !(await v('.ev[data-kind="lay"] .snd')) && await v('.ev[data-kind="lay"] > .row:first-child button') && await v('.ev[data-kind="grab"] .snd'));
  await p.reload(); await p.waitForTimeout(3000);
  const h2 = p.frames().find((x) => x.url().includes("sounds-page"));
  await h2.waitForFunction(() => window.__ready && window.__sound.tracks.every((n) => window.__sound.buffer(n)), null, { timeout: 60000 });
  check("после перезагрузки действие остаётся свёрнутым", await h2.evaluate(() => { const e = document.querySelector('.ev[data-kind="lay"] .snd'); return !e || e.offsetParent === null; }));
  await h2.evaluate(() => document.querySelector('.ev[data-kind="lay"] .nm').click());
  check("повторное нажатие разворачивает", await h2.evaluate(() => document.querySelector('.ev[data-kind="lay"] .snd').offsetParent !== null));
  await h2.evaluate(() => document.querySelector('[data-fold="plate2"] .head').click());
  check("секция 2 свёрнута: действий не видно, заголовок виден; секция 1 на месте", await h2.evaluate(() => document.querySelector("#events").offsetParent === null && document.querySelector('[data-fold="plate2"] .head').offsetParent !== null && document.querySelector("#gal").offsetParent !== null));
  // волна после разворота чёткая: холст по пикселям равен своему размеру на экране (а не 10 пикселей растянутых)
  // секция 2 была свёрнута при загрузке страницы (холсты без ширины): после разворота волны должны быть перерисованы
  await p.reload(); await p.waitForTimeout(3000);
  const h3 = p.frames().find((x) => x.url().includes("sounds-page"));
  await h3.waitForFunction(() => window.__ready && window.__sound.tracks.every((n) => window.__sound.buffer(n)), null, { timeout: 60000 });
  await h3.evaluate(() => document.querySelector('[data-fold="plate2"] .head').click());
  await p.waitForTimeout(400);
  const sharp = await h3.evaluate(() => { const c = document.querySelector('.ev[data-kind="grab"] .wb canvas'); return { px: c.width, css: c.clientWidth }; });
  check("волна после разворота чёткая (пикселей не меньше, чем ширина на экране)", sharp.css > 100 && sharp.px >= sharp.css, sharp);
  await h3.evaluate(() => document.querySelector('[data-fold="plate1"] .head').click());
  check("секция 1 свёрнута: галерея скрыта", await h3.evaluate(() => document.querySelector("#gal").offsetParent === null));
  await h3.evaluate(() => localStorage.removeItem("crossade.sounds.fold"));
}
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const k of checks) console.log(k.ok ? "ok  " : "FAIL", k.name, k.ok ? "" : JSON.stringify(k.got));
process.exit(checks.every((k) => k.ok) ? 0 : 1);
