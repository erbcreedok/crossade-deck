// СТРАНИЦА «СТОПКА — БАЗА»: на столе одна стопка из восьми карт, две сцены (сверху и от первого лица), четыре игрока-цвета, пинг и дрожание, камера включена всегда.
//   (нужны стенд :9588 и dev-сервер игры :9590)   node design/zones/pile-check.mjs [host]
import { createRequire } from "module";
const require = createRequire(new URL("../../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const host = process.argv[2] ?? "localhost";
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await browser.newContext({ viewport: { width: 430, height: 1000 } })).newPage();
const errors = [], checks = [];
p.on("pageerror", (e) => errors.push(e.message));
const check = (name, ok, got) => checks.push({ name, ok, got });
await p.goto(`http://${host}:9588/pile.html`);
await p.waitForTimeout(3000);
const f = p.frames().find((x) => x.url().includes("pile-scenes"));
await f.waitForFunction(() => window.__ready, null, { timeout: 60000 });
await p.waitForTimeout(2000);
const pile = () => f.evaluate(() => { const s = window.__me.state; return { piles: s.piles.map((x) => x.cards.length), felt: s.felt.length, up: s.felt.filter((c) => c.up).length }; });
const topId = () => f.evaluate(() => window.__me.state.piles[0].cards.at(-1).id);
const st = await pile();
// Долгое удержание поднимает стопку; на медленной машине кадры идут по полсекунды, поэтому для обычных проверок время держим большим, а в проверке удержания ставим своё.
// Часы долгого удержания стоят (0): машина медленная, и обычные проверки с неподвижным пальцем успели бы поднять стопку сами; в проверках удержания время двигаем вручную.
await f.evaluate(() => { window.__top.test.holdClock(0); window.__first.test.holdClock(0); });
check("колода из 52 карт: в стопке 50, на сукне две — одна лицом вверх, другая рубашкой вверх", st.piles.length === 1 && st.piles[0] === 50 && st.felt === 2 && st.up === 1, st);
check("за столом сидят только два наблюдателя-камеры; у четырёх цветов нет ни стула, ни места", await f.evaluate(() => { const s = window.__me.state, colours = ["blue", "red", "green", "yellow"]; return s.chairs.length === 2 && s.chairs.every((c) => c.owner?.startsWith("eye-")) && colours.every((k) => { const pl = s.people.find((x) => x.key === k); return !!pl && !pl.seat; }); }));
check("обе сцены нарисованы (два холста), у каждой кнопка «на весь экран»", await f.evaluate(() => document.querySelectorAll(".stage canvas").length === 2 && !!window.__full?.top && !!window.__full?.first));
check("у четырёх игроков по кнопке-цвету у каждой сцены", await f.evaluate(() => document.querySelectorAll("#who-top [data-k]").length === 4 && document.querySelectorAll("#who-first [data-k]").length === 4));
// камера включена без тумблера: колесо приближает
const depth = async () => f.evaluate(() => window.__top.test.depthOf(window.__me.state.piles[0].cards.at(-1).id));
const box = await f.evaluate(() => { const r = document.getElementById("f-top").getBoundingClientRect(); return { x: r.x, y: r.y }; });
const d0 = await depth();
await p.mouse.move(box.x + 190, box.y + 150); for (let i = 0; i < 3; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(150); } await p.waitForTimeout(400);
check("камера включена без тумблера: колесо приближает", (await depth()) < d0 - 1, { d0, d1: await depth() });
// карту стопки можно взять в любой сцене
for (const [which, scene] of [["top", "__top"], ["first", "__first"]]) {
  // дождаться, пока карты улягутся: верхняя карта стопки стоит на месте (прошлый перенос ещё мог её двигать)
  let id = await topId(), prev = null;
  for (let k = 0; k < 30; k++) { const cur = await f.evaluate(([sc, i]) => window[sc].test.screenOf(i), [scene, id]); if (prev && Math.hypot(cur.x - prev.x, cur.y - prev.y) < 0.3) break; prev = cur; id = await topId(); await p.waitForTimeout(150); }
  const at = await f.evaluate(([s, i]) => window[s].test.screenOf(i), [scene, id]);
  await p.mouse.move(at.x, at.y); await p.mouse.down(); await p.mouse.move(at.x + 12, at.y + 8, { steps: 4 }); await p.waitForTimeout(300);
  const drag = await f.evaluate((s) => window[s].test.draggingId(), scene);
  await p.mouse.up(); await p.waitForTimeout(600);
  check(`верхнюю карту стопки можно взять в сцене «${which}»`, !!drag, drag);
}
// цвет свечения у соседней сцены — цвет несущего
{
  const ink = (k) => f.evaluate((kk) => window.__me.state.people.find((x) => x.key === kk).ink.replace("#", "").toLowerCase(), k);
  for (const key of ["red", "green", "yellow", "blue"]) {
    await f.evaluate((k) => document.querySelector(`#who-top [data-k="${k}"]`).click(), key);
    // карты улеглись: верхняя карта стопки стоит на месте
    let id = await topId(), prev = null;
    for (let k = 0; k < 30; k++) { const cur = await f.evaluate((i) => window.__top.test.screenOf(i), id); if (prev && Math.hypot(cur.x - prev.x, cur.y - prev.y) < 0.3) break; prev = cur; id = await topId(); await p.waitForTimeout(150); }
    const at = await f.evaluate((i) => window.__top.test.screenOf(i), id);
    await p.mouse.move(at.x, at.y); await p.mouse.down(); await p.mouse.move(at.x + 14, at.y - 9, { steps: 4 });
    for (let i = 0; i < 8; i++) { await p.mouse.move(at.x + 14 + (i % 2) * 6, at.y - 9, { steps: 2 }); await p.waitForTimeout(60); }
    const h = await f.evaluate((i) => window.__first.test.haloInfo(i), id);
    await p.mouse.up(); await p.waitForTimeout(600);
    check(`несёт ${key} сверху: в сцене от первого лица карта светится ${key}`, h && h.on && h.color === (await ink(key)), { h, want: await ink(key) });
  }
}
// пинг и дрожание
{
  const set = (id, v) => f.evaluate(([i, vv]) => { const e = document.getElementById(i); e.value = String(vv); e.dispatchEvent(new Event("input")); return document.getElementById(i.replace("lag-", "lagv-").replace("jit-", "jitv-")).textContent; }, [id, v]);
  const t1 = await set("lag-top", 500), t2 = await set("jit-top", 100);
  check("ползунки пинга и дрожания двигают задержку сцены и показывают значение", (await f.evaluate(() => window.__lag.lat.top === 500 && window.__lag.jit.top === 100)) && t1 === "500 мс" && t2 === "100 мс", { t1, t2 });
  await set("lag-top", 0); await set("jit-top", 0);
}
// ПРАВИЛА И НАСТРОЙКИ СТОПКИ (панели страницы): запреты для выбранных игроков с показом отказа; предел карт; сторона укладки; действия кнопками.
{
  const panels = await f.evaluate(() => ({ rules: document.querySelectorAll("#rules-body .rrow").length, chips: document.querySelectorAll('#rules-body .rrow[data-rule="take"] [data-k]').length, sides: document.querySelectorAll("#knobs-body [data-side]").length, limit: !!document.getElementById("limit"), acts: [...document.querySelectorAll("#acts-body [data-act]")].map((b) => b.dataset.act) }));
  check("панели: девять правил (в том числе «за язычок» и «скрыть язычок») с цветными флажками, предел карт, три стороны укладки, четыре действия кнопками", panels.rules === 9 && panels.chips === 4 && panels.sides === 3 && panels.limit && panels.acts.join() === "shuffle,sort,flip,move", panels);
  const state = () => f.evaluate(() => { const s = window.__me.state, pl = s.piles[0]; return { n: pl.cards.length, top: pl.cards.at(-1)?.id, order: pl.cards.map((c) => c.id).join(), felt: s.felt.map((c) => c.id), rules: s.pileRules?.[pl.id] ?? null, topUp: pl.cards.at(-1)?.up === true }; });
  const clickIn = (sel) => f.evaluate((q) => document.querySelector(q).click(), sel);
  const setCtl = (key) => clickIn(`#who-top [data-k="${key}"]`);
  const drag = async (from, to, steps = 10) => { await p.mouse.move(from.x, from.y); await p.mouse.down(); await p.mouse.move(from.x + 10, from.y - 6, { steps: 3 }); await p.mouse.move(to.x, to.y, { steps }); await p.waitForTimeout(250); await p.mouse.up(); await p.waitForTimeout(900); };
  const screen = (id) => f.evaluate((i) => window.__top.test.screenOf(i), id);
  // зелёный: нельзя снять верхнюю карту; показ включён — стопка кивает
  await setCtl("green");
  await clickIn('#rules-body .rrow[data-rule="take"] [data-k="green"]'); await clickIn('#rules-body [data-show="take"]'); await p.waitForTimeout(300);
  let st = await state();
  check("флажок и показ в панели ставят правило стопки (take для зелёного, показ включён)", st.rules?.take.join() === "green" && st.rules?.notice.take === true, st.rules);
  { const at = await screen(st.top), pileId = await f.evaluate(() => window.__me.state.piles[0].id); await p.mouse.move(at.x, at.y); await p.mouse.down();
    const shaking = await f.evaluate((i) => window.__top.test.pileShaking(i), pileId);
    await p.mouse.move(at.x + 14, at.y - 9, { steps: 4 }); await p.waitForTimeout(200);
    const dragging = await f.evaluate(() => window.__top.test.draggingId());
    await p.mouse.up(); await p.waitForTimeout(500);
    const after = await state();
    check("take: зелёный верхнюю карту не берёт, стопка кивает, число карт то же", !dragging && shaking && after.n === st.n, { dragging, shaking, n0: st.n, n1: after.n }); }
  await clickIn('#rules-body .rrow[data-rule="take"] [data-k="green"]'); await clickIn('#rules-body [data-show="take"]'); await p.waitForTimeout(300);
  // put: зелёному нельзя положить; карта с сукна, брошенная на стопку, остаётся на сукне
  await clickIn('#rules-body .rrow[data-rule="put"] [data-k="green"]'); await p.waitForTimeout(300);
  st = await state();
  { const cardId = st.felt[0], from = await screen(cardId), to = await screen(st.top);
    await drag(from, to);
    const after = await state();
    check("put: зелёный карту в стопку не кладёт — она остаётся на сукне, в стопке столько же", after.n === st.n && after.felt.includes(cardId), { n0: st.n, n1: after.n }); }
  await clickIn('#rules-body .rrow[data-rule="put"] [data-k="green"]'); await p.waitForTimeout(300);
  // предел карт: не больше, чем сейчас — класть нельзя; на единицу больше — можно
  st = await state();
  await f.evaluate((n) => { const e = document.getElementById("limit"); e.value = String(n); e.dispatchEvent(new Event("change")); }, st.n);
  await p.waitForTimeout(300);
  { const cardId = st.felt[0], from = await screen(cardId), to = await screen(st.top);
    await drag(from, to);
    const after = await state();
    check("предел: в полную стопку карту не положить", after.n === st.n && after.felt.includes(cardId), { limit: st.n, n1: after.n });
    await f.evaluate((n) => { const e = document.getElementById("limit"); e.value = String(n + 1); e.dispatchEvent(new Event("change")); }, st.n);
    await p.waitForTimeout(300);
    const from2 = await screen(cardId), to2 = await screen((await state()).top);
    await drag(from2, to2);
    const after2 = await state();
    check("предел на единицу больше — карта ложится", after2.n === st.n + 1, { n: after2.n }); }
  await f.evaluate(() => { const e = document.getElementById("limit"); e.value = "0"; e.dispatchEvent(new Event("change")); }); await p.waitForTimeout(300);
  // сторона укладки: всегда лицом вверх
  await clickIn('#knobs-body [data-side="up"]'); await p.waitForTimeout(300);
  st = await state();
  { const cardId = st.felt[0], from = await screen(cardId), to = await screen(st.top);
    await drag(from, to);
    const after = await state();
    check("сторона «лицом вверх»: положенная карта лежит лицом вверх", after.n === st.n + 1 && after.topUp === true, { n: after.n, up: after.topUp }); }
  await clickIn('#knobs-body [data-side="keep"]'); await p.waitForTimeout(300);
  // ЯЗЫЧОК: виден с обеих сторон — тот, что ближе к камере (ниже стопки на экране), в любой из двух сцен
  {
    const tabBelow = (which) => f.evaluate((w) => { const sc = window[w], pl = window.__me.state.piles[0], top = sc.test.screenOf(pl.cards.at(-1).id), tab = sc.test.tabs().find((t) => t.pile === pl.id); return tab ? { tab: tab.y, pile: top.y, count: sc.test.tabs().length } : null; }, which);
    const a = await tabBelow("__top"), b = await tabBelow("__first");
    check("язычок виден в обеих сценах и лежит ниже стопки на экране (ближе к камере), в том числе от первого лица", !!a && !!b && a.tab > a.pile && b.tab > b.pile, { top: a, first: b });
  }
  // ЯЗЫЧОК ТЯНЕТСЯ: за него берут всю стопку и переносят (на стенде тот же жест, что в игре)
  {
    const before = await f.evaluate(() => { const pl = window.__me.state.piles[0]; return { x: pl.x, y: pl.y, n: pl.cards.length }; });
    const tab = await f.evaluate(() => window.__top.test.tabs()[0]);
    await p.mouse.move(tab.x, tab.y); await p.mouse.down(); await p.mouse.move(tab.x + 12, tab.y, { steps: 3 }); await p.mouse.move(tab.x + 70, tab.y - 20, { steps: 8 }); await p.waitForTimeout(300);
    await p.mouse.up(); await p.waitForTimeout(800);
    const after = await f.evaluate(() => { const pl = window.__me.state.piles[0]; return { x: pl.x, y: pl.y, n: pl.cards.length }; });
    check("язычок: потянул за него и отпустил на сукне — вся стопка переехала (карт столько же)", Math.hypot(after.x - before.x, after.y - before.y) > 0.3 && after.n === before.n, { before, after });
    // вернуть на место
    await f.evaluate(() => window.__me.send({ t: "deckMove", pile: window.__me.state.piles[0].id, x: 0, y: 0.8, angle: -8 }));
    await p.waitForTimeout(500);
  }
  // язычок скрыт тому, кому так задано; у остальных на месте
  await setCtl("green");
  await clickIn('#rules-body .rrow[data-rule="tab"] [data-k="green"]'); await p.waitForTimeout(400);
  {
    const shown = (w) => f.evaluate((ww) => window[ww].test.tabs().length, w);
    check("tab: у зелёного (верхняя сцена) язычка нет, у синего (нижняя сцена) он на месте", (await shown("__top")) === 0 && (await shown("__first")) === 1, { top: await shown("__top"), first: await shown("__first") });
  }
  await clickIn('#rules-body .rrow[data-rule="tab"] [data-k="green"]'); await p.waitForTimeout(400);
  check("tab: правило снято — язычок вернулся", (await f.evaluate(() => window.__top.test.tabs().length)) === 1);
  // за язычок: grip — стопку тянуть нельзя, сервер отказывает захват
  await clickIn('#rules-body .rrow[data-rule="grip"] [data-k="green"]'); await p.waitForTimeout(300);
  check("grip: зелёному нельзя брать стопку за язычок (отказ сервера), синему можно", await f.evaluate(() => { const pl = window.__me.state.piles[0].id; const refused = []; window.__alia.onRefused?.((i, why) => refused.push(why)); return true; }) && (await f.evaluate(() => { const pl = window.__me.state.piles[0].id; return window.__me.state.pileRules?.[pl]?.grip.join() === "green"; })));
  await clickIn('#rules-body .rrow[data-rule="grip"] [data-k="green"]'); await p.waitForTimeout(300);
  await setCtl("blue");
  // ДОЛГОЕ УДЕРЖАНИЕ: карту (в том числе взятую из этой же стопки) или стопку держат над стопкой — мигает подсветка, через holdMs стопка поднимается под палец.
  // Часы удержания стоят и двигаются вручную: на медленной машине настоящие секунды набегают сами, пока палец ещё едет.
  {
    const clock = (ms) => f.evaluate((v) => { window.__top.test.holdClock(v); }, ms);
    const info = () => f.evaluate(() => window.__top.test.holdInfo());
    const pilesOf = () => f.evaluate(() => window.__me.state.piles.map((q) => ({ id: q.id, n: q.cards.length, x: q.x, y: q.y, top: q.cards.at(-1).id, locked: window.__me.state.locks?.[q.id] ?? null })));
    const waitFor = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await p.waitForTimeout(100); } return null; };
    const home = async () => { await f.evaluate(() => window.__me.send({ t: "deckMove", pile: "deck", x: 0, y: 0.8, angle: -8 })); await p.waitForTimeout(500); };
    await setCtl("blue");
    // камеры в исходное: после проверки зума вторая стопка оказалась бы за краем кадра
    await f.evaluate(() => { window.__top.home(); window.__first.home(); });
    await p.waitForTimeout(1500);
    // А. взял верхнюю карту стопки и держу над ней неподвижно
    await clock(0);
    const st0 = (await pilesOf())[0];
    const at = await screen(st0.top);
    await p.mouse.move(at.x, at.y); await p.mouse.down(); await p.mouse.move(at.x + 12, at.y - 6, { steps: 3 }); await p.mouse.move(at.x + 14, at.y - 8);
    await clock(150); await p.waitForTimeout(400);
    const early = await info();
    await clock(600);
    const first = await waitFor(async () => { const i = await info(); return i.blinking ? i : null; });
    await clock(1000);
    const second = await waitFor(async () => { const i = await info(); return first && i.progress > first.progress ? i : null; });
    check("удержание: до 0,25 с подсветки нет; дальше мигает, и чем дольше, тем больше прогресс", !early.blinking && !!first && first.pile === st0.id && !!second, { early, first, second });
    await clock(5000);
    const lifted = await waitFor(async () => { const q = (await pilesOf())[0]; return q.locked !== null ? q : null; });
    check("удержание: время вышло — стопка поднялась под палец (замок на стопке, карты на месте)", !!lifted && lifted.n === st0.n, { st0, lifted });
    await clock(0);
    await p.mouse.move(at.x + 80, at.y - 30, { steps: 8 }); await p.waitForTimeout(300);
    await p.mouse.up(); await p.waitForTimeout(900);
    const dropped = (await pilesOf())[0];
    check("удержание: двинул палец — вся стопка поехала с ним и легла на новом месте", Math.hypot(dropped.x - st0.x, dropped.y - st0.y) > 0.3 && dropped.n === st0.n && dropped.locked === null, { st0, dropped });
    await home();
    // Б. одиночная карта над ДРУГОЙ стопкой: стопка-цель поднимается под палец, карта ложится на неё сверху
    await f.evaluate(() => {
      for (const x of [-2.2, -2.6]) { const id = window.__me.state.piles[0].cards.at(-1).id; window.__me.send({ t: "grab", id }); window.__me.send({ t: "drop", id, to: { in: "felt", x, y: 2.6, up: true, angle: 0 } }); }
      window.__me.send({ t: "gather", ids: [...window.__me.state.felt.map((c) => c.id)], side: "keep", to: { x: -2.4, y: 0.8, angle: 0 } });
    });
    await p.waitForTimeout(900);
    const two = await pilesOf();
    check("две стопки: основная и новая, собранная из выложенных карт", two.length === 2 && two.some((q) => q.id !== "deck" && q.n >= 2), two);
    const main = two.find((q) => q.id === "deck"), small = two.find((q) => q.id !== "deck");
    {
      const from = await screen(main.top), to = await screen(small.top);
      await clock(0);
      await p.mouse.move(from.x, from.y); await p.mouse.down(); await p.mouse.move(from.x - 10, from.y - 6, { steps: 3 }); await p.mouse.move(to.x, to.y, { steps: 10 });
      await clock(400);
      const blink = await waitFor(async () => { const i = await info(); return i.blinking && i.pile === small.id ? i : null; });
      await clock(5000);
      const lifted2 = await waitFor(async () => (await pilesOf()).find((q) => q.id === small.id && q.locked !== null));
      const after = await pilesOf();
      check("удержание над другой стопкой: подсветка мигает под ней; потом карта легла на неё сверху, а она поднялась под палец (в ней на одну больше, в основной на одну меньше)", !!blink && !!lifted2 && after.find((q) => q.id === small.id)?.n === small.n + 1 && after.find((q) => q.id === main.id)?.n === main.n - 1, { blink, lifted2, after });
      await clock(0);
      await p.mouse.up(); await p.waitForTimeout(900);
    }
    // В. стопку несут за язычок над другой стопкой: через holdMs они сливаются
    {
      const now = await pilesOf();
      const big = now.find((q) => q.id === "deck"), tiny = now.find((q) => q.id !== "deck");
      const tab = await f.evaluate((id) => window.__top.test.tabs().find((t) => t.pile === id), tiny.id);
      const target = await screen(big.top);
      await clock(0);
      await p.mouse.move(tab.x, tab.y); await p.mouse.down(); await p.mouse.move(tab.x + 12, tab.y, { steps: 3 }); await p.mouse.move(target.x, target.y, { steps: 10 });
      await clock(400);
      await waitFor(async () => { const i = await info(); return i.blinking ? i : null; });
      await clock(5000);
      const merged = await waitFor(async () => { const q = await pilesOf(); return q.length === 1 ? q[0] : null; });
      check("удержание стопки над другой стопкой: они слились в одну и она поднята под палец", !!merged && merged.n === big.n + tiny.n && merged.locked !== null, { merged, big, tiny });
      await clock(0);
      await p.mouse.up(); await p.waitForTimeout(900);
    }
    await home();
  }
  // действия кнопками: перемешать
  await setCtl("blue");
  st = await state();
  await clickIn('#rules-body .rrow[data-rule="shuffle"] [data-k="blue"]'); await clickIn('#rules-body [data-show="shuffle"]'); await p.waitForTimeout(300);
  const pileId2 = await f.evaluate(() => window.__me.state.piles[0].id);
  await clickIn('#acts-body [data-act="shuffle"]');
  const nod = await f.evaluate((i) => window.__top.test.pileShaking(i), pileId2); await p.waitForTimeout(300);
  const barred = await state();
  check("shuffle: синему нельзя — порядок карт тот же, стопка кивает", barred.order === st.order && nod, { same: barred.order === st.order, nod });
  await clickIn('#rules-body .rrow[data-rule="shuffle"] [data-k="blue"]'); await clickIn('#rules-body [data-show="shuffle"]'); await p.waitForTimeout(300);
  await clickIn('#acts-body [data-act="shuffle"]'); await p.waitForTimeout(500);
  const free = await state();
  check("shuffle: правило снято — карты перемешались", free.order !== st.order && free.n === st.n);
  // сдвинуть: заперто для синего
  await clickIn('#rules-body .rrow[data-rule="move"] [data-k="blue"]'); await p.waitForTimeout(300);
  const x0 = await f.evaluate(() => window.__me.state.piles[0].x);
  await clickIn('#acts-body [data-act="move"]'); await p.waitForTimeout(300);
  check("move: синему сдвинуть стопку нельзя — стоит на месте", (await f.evaluate(() => window.__me.state.piles[0].x)) === x0);
  await clickIn('#rules-body .rrow[data-rule="move"] [data-k="blue"]'); await p.waitForTimeout(300);
  await clickIn('#acts-body [data-act="move"]'); await p.waitForTimeout(400);
  check("move: правило снято — стопка сдвинулась", (await f.evaluate(() => window.__me.state.piles[0].x)) > x0);
}
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
