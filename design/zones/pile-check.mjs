// СТРАНИЦА «СТОПКА — БАЗА»: на столе одна стопка из восьми карт, две сцены (сверху и от первого лица), четыре игрока-цвета, пинг и дрожание, камера включена всегда.
//   (нужны стенд :9588 и dev-сервер игры :9590)   node design/zones/pile-check.mjs [host]
import { createRequire } from "module";
const require = createRequire(new URL("../../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const host = process.argv[2] ?? "localhost";
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await browser.newContext({ viewport: { width: 430, height: 1000 } })).newPage();
const errors = [], checks = [];
p.on("pageerror", (e) => errors.push(e.message + " @ " + (e.stack || "").split("\n").slice(1, 3).map((l) => l.trim().slice(0, 140)).join(" | ")));
const check = (name, ok, got) => checks.push({ name, ok, got });
await p.goto(`http://${host}:9588/pile.html`);
await p.waitForTimeout(3000);
const f = p.frames().find((x) => x.url().includes("pile-scenes"));
await f.waitForFunction(() => window.__ready, null, { timeout: 60000 });
await p.waitForTimeout(2000);
const pile = () => f.evaluate(() => { const s = window.__me.state; return { piles: s.piles.map((x) => x.cards.length), felt: s.felt.length, up: s.felt.filter((c) => c.up).length }; });
const topId = () => f.evaluate(() => window.__me.state.piles[0].cards.at(-1).id);
const st = await pile();
// Часы слияния: свои для проверок правил (посадка на цель — после задержки); каждый шаг прибавляет 400 мс — больше задержки (250), меньше мигания (450).
let clk = 0;
// Отпущенная над стопкой раньше задержки карта падает рядом (слияния нет): лишние карты с сукна (кроме двух исходных) собираем обратно в стопку.
const orig = new Set(await f.evaluate(() => window.__me.state.felt.map((c) => c.id)));
const tidy = async () => { await f.evaluate((keep) => { const ids = window.__me.state.felt.map((c) => c.id).filter((i) => !keep.includes(i)); if (ids.length) window.__me.send({ t: "gather", ids, side: "keep", to: { pile: window.__me.state.piles[0].id } }); }, [...orig]); await p.waitForTimeout(900); };
const holdTo = (ms) => f.evaluate((v) => { window.__top.test.holdClock(v); window.__first.test.holdClock(v); }, ms);
const seat = () => holdTo((clk += 400));
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
await tidy();
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
await tidy();
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
  check("панели: девять правил (в том числе «за язычок» и «скрыть язычок») с цветными флажками, предел карт, три стороны укладки, три действия кнопками", panels.rules === 9 && panels.chips === 4 && panels.sides === 3 && panels.limit && panels.acts.join() === "shuffle,sort,move", panels);
  const state = () => f.evaluate(() => { const s = window.__me.state, pl = s.piles[0]; return { n: pl.cards.length, top: pl.cards.at(-1)?.id, order: pl.cards.map((c) => c.id).join(), felt: s.felt.map((c) => c.id), feltUp: s.felt.map((c) => c.up), rules: s.pileRules?.[pl.id] ?? null, topUp: pl.cards.at(-1)?.up === true }; });
  const clickIn = (sel) => f.evaluate((q) => document.querySelector(q).click(), sel);
  const setCtl = (key) => clickIn(`#who-top [data-k="${key}"]`);
  // `seated`: подержать над целью дольше задержки (иначе вещь падает на сукно — слияния при падении нет)
  const drag = async (from, to, steps = 10, seated = false) => { await p.mouse.move(from.x, from.y); await p.mouse.down(); await p.mouse.move(from.x + 10, from.y - 6, { steps: 3 }); await p.mouse.move(to.x, to.y, { steps }); await p.waitForTimeout(250); if (seated) { await seat(); await p.waitForTimeout(350); } await p.mouse.up(); await p.waitForTimeout(900); };
  const screen = (id) => f.evaluate((i) => window.__top.test.screenOf(i), id);
  // позиция на экране ВЕРХНЕЙ сцены, когда она перестала меняться (карты после переноса ещё возвращаются на место)
  const stableTop = async (id) => { let prev = null; for (let k = 0; k < 40; k++) { const cur = await screen(id); if (prev && Math.hypot(cur.x - prev.x, cur.y - prev.y) < 0.3) return cur; prev = cur; await p.waitForTimeout(150); } return prev; };
  // перенос стопки к краю кадра двигает камеру (как у карты): перед следующей проверкой камеры возвращаем в исходное
  const homeCams = async () => { await f.evaluate(() => { window.__top.home(); window.__first.home(); }); await p.waitForTimeout(1600); };
  // позиция на экране ПЕРВОЙ сцены, когда она перестала меняться
  const stable = async (id) => { let prev = null; for (let k = 0; k < 40; k++) { const cur = await f.evaluate((i) => window.__first.test.screenOf(i), id); if (prev && Math.hypot(cur.x - prev.x, cur.y - prev.y) < 0.3) return cur; prev = cur; await p.waitForTimeout(150); } return prev; };
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
    await drag(from, to, 10, true);
    const after = await state();
    check("put: зелёный карту в стопку не кладёт — она остаётся на сукне, в стопке столько же", after.n === st.n && after.felt.includes(cardId), { n0: st.n, n1: after.n }); }
  await clickIn('#rules-body .rrow[data-rule="put"] [data-k="green"]'); await p.waitForTimeout(300);
  // предел карт: не больше, чем сейчас — класть нельзя; на единицу больше — можно
  st = await state();
  await f.evaluate((n) => { const e = document.getElementById("limit"); e.value = String(n); e.dispatchEvent(new Event("change")); }, st.n);
  await p.waitForTimeout(300);
  // карта той же стороны, что стопка, — сторона не мешает проверкам предела
  const sameSide = (s) => s.felt[s.feltUp.findIndex((u) => u === s.topUp)] ?? s.felt[0];
  { const cardId = sameSide(st), from = await screen(cardId), to = await screen(st.top);
    await drag(from, to, 10, true);
    const after = await state();
    check("предел: в полную стопку карту не положить", after.n === st.n && after.felt.includes(cardId), { limit: st.n, n1: after.n });
    await f.evaluate((n) => { const e = document.getElementById("limit"); e.value = String(n + 1); e.dispatchEvent(new Event("change")); }, st.n);
    await p.waitForTimeout(300);
    const from2 = await screen(cardId), to2 = await screen((await state()).top);
    await drag(from2, to2, 10, true);
    const after2 = await state();
    check("предел на единицу больше — карта ложится", after2.n === st.n + 1, { n: after2.n }); }
  await f.evaluate(() => { const e = document.getElementById("limit"); e.value = "0"; e.dispatchEvent(new Event("change")); }); await p.waitForTimeout(300);
  // сторона укладки: всегда лицом вверх
  await clickIn('#knobs-body [data-side="up"]'); await p.waitForTimeout(300);
  st = await state();
  { const cardId = st.felt[0], from = await screen(cardId), to = await screen(st.top);
    await drag(from, to, 10, true);
    const after = await state();
    check("сторона «лицом вверх»: положенная карта лежит лицом вверх", after.n === st.n + 1 && after.topUp === true, { n: after.n, up: after.topUp }); }
  await clickIn('#knobs-body [data-side="keep"]'); await p.waitForTimeout(300);
  // верх стопки теперь лежит лицом вверх (так укладывает заданная сторона): снимаем эту карту на сукно, переворачиваем и собираем обратно — стопка снова вся рубашкой, как требует инвариант
  await f.evaluate(() => { const id = window.__me.state.piles[0].cards.at(-1).id; window.__me.send({ t: "grab", id }); window.__me.send({ t: "drop", id, to: { in: "felt", x: 3, y: 1, up: true, angle: 0 } }); });
  await p.waitForTimeout(800);
  await f.evaluate(() => { const c = window.__me.state.felt.at(-1); if (c.up) window.__me.send({ t: "turn", id: c.id }); });
  await p.waitForTimeout(500);
  await f.evaluate(() => { const c = window.__me.state.felt.at(-1); window.__me.send({ t: "gather", ids: [c.id], side: "keep", to: { pile: window.__me.state.piles[0].id } }); });
  await p.waitForTimeout(800);
  // ЯЗЫЧОК: виден с обеих сторон — тот, что ближе к камере (ниже стопки на экране), в любой из двух сцен
  {
    const tabBelow = (which) => f.evaluate((w) => { const sc = window[w], pl = window.__me.state.piles[0], top = sc.test.screenOf(pl.cards.at(-1).id), tab = sc.test.tabs().find((t) => t.pile === pl.id); return tab ? { tab: tab.y, pile: top.y, count: sc.test.tabs().length } : null; }, which);
    const a = await tabBelow("__top"), b = await tabBelow("__first");
    check("язычок виден в обеих сценах и лежит ниже стопки на экране (ближе к камере), в том числе от первого лица", !!a && !!b && a.tab > a.pile && b.tab > b.pile, { top: a, first: b });
  }
  // СТОПКУ ВИДНО НА ДРУГОМ ЭКРАНЕ ВО ВРЕМЯ ПЕРЕНОСА, а не только после отпускания
  {
    const topId2 = await f.evaluate(() => window.__me.state.piles[0].cards.at(-1).id);
    const tab = await f.evaluate(() => window.__top.test.tabs()[0]);
    const before = await f.evaluate((i) => window.__first.test.screenOf(i), topId2);
    await p.mouse.move(tab.x, tab.y); await p.mouse.down(); await p.mouse.move(tab.x + 12, tab.y, { steps: 3 }); await p.mouse.move(tab.x + 75, tab.y - 25, { steps: 8 });
    let during = null, stacks = 0;
    for (let k = 0; k < 40; k++) { await p.waitForTimeout(150); stacks = await f.evaluate(() => window.__proxy.first.stacks.length); during = await f.evaluate((i) => window.__first.test.screenOf(i), topId2); if (stacks === 1 && Math.hypot(during.x - before.x, during.y - before.y) > 15) break; }
    check("перенос стопки виден на другом экране, пока её несут (стопка в воздухе у соседа и сдвинулась на его экране)", stacks === 1 && Math.hypot(during.x - before.x, during.y - before.y) > 15, { stacks, before, during });
    await p.mouse.up(); await p.waitForTimeout(900);
    await f.evaluate(() => window.__me.send({ t: "deckMove", pile: window.__me.state.piles[0].id, x: 0, y: 0.8, angle: -8 })); await p.waitForTimeout(600);
  }
  // ЧИСЛО НА ЯЗЫЧКЕ: вытащил верхнюю карту — пока её несут, во ВСЕХ сценах на единицу меньше
  {
    await homeCams();
    const info = await f.evaluate(() => { const pl = window.__me.state.piles[0]; return { id: pl.id, n: pl.cards.length, top: pl.cards.at(-1).id }; });
    const at = await stableTop(info.top);
    await p.mouse.move(at.x, at.y); await p.mouse.down(); await p.mouse.move(at.x + 14, at.y - 8, { steps: 4 });
    let counts = null;
    for (let k = 0; k < 40; k++) { await p.waitForTimeout(150); counts = await f.evaluate((id) => ({ top: window.__top.test.tabs().find((t) => t.pile === id)?.count, first: window.__first.test.tabs().find((t) => t.pile === id)?.count }), info.id); if (counts.top === info.n - 1 && counts.first === info.n - 1) break; }
    check("число на язычке: карту вытащили — в обеих сценах на единицу меньше, пока её несут", counts.top === info.n - 1 && counts.first === info.n - 1, { n: info.n, counts });
    await p.mouse.up(); await p.waitForTimeout(700);
    await f.evaluate(([id, pile]) => { window.__me.send({ t: "grab", id }); window.__me.send({ t: "drop", id, to: { in: "deck", pile } }); }, [info.top, info.id]);
    await p.waitForTimeout(900);
  }
  // СТОПКА В РУКЕ ВЫГЛЯДИТ КАК НЕСОМАЯ КАРТА: от первого лица наклонена к глазу (а не лежит плашмя), а у соседа светится только нижняя карта
  {
    const ids = await f.evaluate(() => window.__me.state.piles[0].cards.map((c) => c.id));
    const tab = await f.evaluate(() => window.__first.test.tabs()[0]);
    await p.mouse.move(tab.x, tab.y); await p.mouse.down(); await p.mouse.move(tab.x + 12, tab.y, { steps: 3 }); await p.mouse.move(tab.x + 60, tab.y - 20, { steps: 8 });
    let tilt = null, glow = null;
    for (let k = 0; k < 40; k++) {
      await p.waitForTimeout(150);
      tilt = await f.evaluate((id) => window.__first.test.cardTilt(id), ids.at(-1));
      glow = await f.evaluate(([bottom, top]) => ({ bottom: window.__top.test.haloInfo(bottom)?.on, top: window.__top.test.haloInfo(top)?.on }), [ids[0], ids.at(-1)]);
      if (tilt && tilt.fromUp > 8 && glow.bottom) break;
    }
    check("стопка в руке от первого лица наклонена к глазу, как несомая карта (а не лежит плашмя)", !!tilt && tilt.fromUp > 8, tilt);
    check("у соседа светится только нижняя карта несомой стопки", glow.bottom === true && glow.top === false, glow);
    await p.mouse.up(); await p.waitForTimeout(900);
    await f.evaluate(() => window.__me.send({ t: "deckMove", pile: window.__me.state.piles[0].id, x: 0, y: 0.8, angle: -8 })); await p.waitForTimeout(600);
  }
  // СТОПКА В РУКЕ ДЕРЖИТСЯ ТОЧНО КАК КАРТА: в одной и той же точке экрана несомая карта и несомая стопка (от первого лица) стоят на той же высоте, тем же размером и повёрнуты одинаково
  {
    await homeCams();
    const pose = (id) => f.evaluate((i) => window.__first.test.cardPose(i), id);
    const quatAngle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])));
    const lone = await f.evaluate(() => { const id = window.__me.state.piles[0].cards.at(-1).id; window.__me.send({ t: "grab", id }); window.__me.send({ t: "drop", id, to: { in: "felt", x: 1.7, y: 0.8, up: true, angle: 0 } }); return id; });
    await p.waitForTimeout(1200);
    const mainTop = await f.evaluate(() => window.__me.state.piles[0].cards.at(-1).id);
    const home0 = await stable(mainTop);
    const spot = { x: home0.x + 110, y: home0.y - 25 }; // не над стопкой: над стопкой карта садится на неё (и это не «под пальцем»)
    // 1. одна карта в точке
    const lonePos = await stable(lone);
    await p.mouse.move(lonePos.x, lonePos.y); await p.mouse.down(); await p.mouse.move(lonePos.x + 8, lonePos.y - 8, { steps: 3 }); await p.mouse.move(spot.x, spot.y, { steps: 8 });
    await p.waitForTimeout(900);
    const cardPose1 = await pose(lone);
    await p.mouse.up(); await p.waitForTimeout(900);
    // 2. стопка за язычок в той же точке
    const tab = await f.evaluate(() => window.__first.test.tabs()[0]);
    await p.mouse.move(tab.x, tab.y); await p.mouse.down(); await p.mouse.move(tab.x + 12, tab.y, { steps: 3 }); await p.mouse.move(spot.x, spot.y, { steps: 8 });
    await p.waitForTimeout(1200);
    const pilePose = await pose(mainTop);
    await p.mouse.up(); await p.waitForTimeout(900);
    const turn = quatAngle(cardPose1.quat, pilePose.quat), dy = Math.abs(cardPose1.pos[1] - pilePose.pos[1]);
    check("стопка в руке от первого лица в той же точке повёрнута, как несомая карта (поворот почти один, размер тот же, высота та же)", turn < 0.12 && Math.abs(cardPose1.scale - pilePose.scale) < 0.01 && dy < 0.15, { turn: +turn.toFixed(3), scale: [cardPose1.scale, pilePose.scale], dy: +dy.toFixed(3) });
    await f.evaluate((id) => { window.__me.send({ t: "grab", id }); window.__me.send({ t: "drop", id, to: { in: "deck", pile: "deck" } }); }, lone);
    await p.waitForTimeout(900);
    await f.evaluate(() => window.__me.send({ t: "deckMove", pile: window.__me.state.piles[0].id, x: 0, y: 0.8, angle: -8 })); await p.waitForTimeout(600);
  }
  // ЯЗЫЧОК ТЯНЕТСЯ: за него берут всю стопку и переносят (на стенде тот же жест, что в игре)
  {
    await homeCams();
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
  await tidy();
  // ДОЛГОЕ УДЕРЖАНИЕ: карту (в том числе взятую из этой же стопки) или стопку держат над стопкой — мигает подсветка, через holdMs стопка поднимается под палец.
  // Часы удержания стоят и двигаются вручную: на медленной машине настоящие секунды набегают сами, пока палец ещё едет.
  {
    const clock = (ms) => f.evaluate((v) => { window.__top.test.holdClock(v); }, ms);
    const info = () => f.evaluate(() => window.__top.test.holdInfo());
    const pilesOf = () => f.evaluate(() => window.__me.state.piles.map((q) => ({ id: q.id, n: q.cards.length, x: q.x, y: q.y, top: q.cards.at(-1).id, locked: window.__me.state.locks?.[q.id] ?? null })));
    // позиция на экране, когда она перестала меняться (камера ещё могла ехать, карты — лететь)
    const stable = async (id) => { let prev = null; for (let k = 0; k < 40; k++) { const cur = await screen(id); if (prev && Math.hypot(cur.x - prev.x, cur.y - prev.y) < 0.3) return cur; prev = cur; await p.waitForTimeout(150); } return prev; };
    const waitFor = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await p.waitForTimeout(100); } return null; };
    const home = async () => { await f.evaluate(() => window.__me.send({ t: "deckMove", pile: "deck", x: 0, y: 0.8, angle: -8 })); await p.waitForTimeout(500); };
    await setCtl("blue");
    // камеры в исходное: после проверки зума вторая стопка оказалась бы за краем кадра
    await f.evaluate(() => { window.__top.home(); window.__first.home(); });
    await p.waitForTimeout(1500);
    // А. взял верхнюю карту стопки и держу над ней неподвижно
    await clock(0);
    const st0 = (await pilesOf())[0];
    const at = await stable(st0.top);
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
      const from = await stable(main.top), to = await stable(small.top);
      // пинг у верхней сцены 700 мс: ответ стола про карту приходит позже, и стопка не должна подняться раньше, чем карта в неё легла
      await f.evaluate(() => { const e = document.getElementById("lag-top"); e.value = "700"; e.dispatchEvent(new Event("input")); });
      await clock(0);
      await p.mouse.move(from.x, from.y); await p.mouse.down(); await p.mouse.move(from.x - 10, from.y - 6, { steps: 3 }); await p.mouse.move(to.x, to.y, { steps: 10 });
      await clock(700);
      const blink = await waitFor(async () => { const i = await info(); return i.blinking && i.pile === small.id ? i : null; });
      await clock(5000);
      // в первый миг, когда стопка несётся под пальцем, карта, что держали, уже лежит в ней (а не догоняет по столу)
      const early = await waitFor(async () => { const c = await f.evaluate(() => window.__top.test.pileCarrying()); if (!c) return null; return { carrying: c, hasKing: await f.evaluate(([pid, king]) => window.__me.state.piles.find((q) => q.id === pid)?.cards.some((x) => x.id === king) ?? false, [c, main.top]) }; }, 12000);
      check("удержание над стопкой при пинге 700 мс: стопка поднялась только когда карта уже лежала в ней", !!early && early.hasKing === true, early);
      const lifted2 = await waitFor(async () => (await pilesOf()).find((q) => q.id === small.id && q.locked !== null), 12000);
      const after = await pilesOf();
      check("удержание над другой стопкой: подсветка мигает под ней; потом карта легла на неё сверху, а она поднялась под палец (в ней на одну больше, в основной на одну меньше)", !!blink && !!lifted2 && after.find((q) => q.id === small.id)?.n === small.n + 1 && after.find((q) => q.id === main.id)?.n === main.n - 1, { blink, lifted2, after });
      // карта, что держали, поднялась вместе со стопкой, а не догоняет её по столу: обе рядом на экране
      let dist = 1e9;
      for (let k = 0; k < 30 && dist >= 30; k++) { await p.waitForTimeout(150); dist = await f.evaluate(([x, y]) => { const A = window.__top.test.screenOf(x), B = window.__top.test.screenOf(y); return Math.hypot(A.x - B.x, A.y - B.y); }, [main.top, small.top]); }
      check("удержание над стопкой: удерживаемая карта поднялась вместе со стопкой (не отстаёт и не лежит отдельно)", dist < 30, { dist });
      await clock(0);
      await p.mouse.up(); await p.waitForTimeout(1200);
      await f.evaluate(() => { const e = document.getElementById("lag-top"); e.value = "0"; e.dispatchEvent(new Event("input")); });
    }
    // В. стопку несут за язычок над другой стопкой: через holdMs они сливаются
    {
      const now = await pilesOf();
      const big = now.find((q) => q.id === "deck"), tiny = now.find((q) => q.id !== "deck");
      const tab = await f.evaluate((id) => window.__top.test.tabs().find((t) => t.pile === id), tiny.id);
      const target = await stable(big.top);
      await clock(0);
      await p.mouse.move(tab.x, tab.y); await p.mouse.down(); await p.mouse.move(tab.x + 12, tab.y, { steps: 3 }); await p.mouse.move(target.x, target.y, { steps: 10 });
      await clock(700);
      await waitFor(async () => { const i = await info(); return i.blinking ? i : null; });
      await clock(5000);
      const merged = await waitFor(async () => { const q = await pilesOf(); return q.length === 1 && q[0].locked !== null ? q[0] : null; });
      check("удержание стопки над другой стопкой: они слились в одну и она поднята под палец", !!merged && merged.n === big.n + tiny.n && merged.locked !== null, { merged, big, tiny });
      await clock(0);
      await p.mouse.up(); await p.waitForTimeout(900);
    }
    await home();
    // Г. куча карт на сукне (не стопка): держишь над ней карту — верхняя поднимается через holdMs, остальные по очереди; кто успел подняться, идёт за пальцем
    {
      await f.evaluate(() => {
        const spots = [[-2.7, 0.8], [-2.5, 0.95], [-2.65, 1.05], [-2.45, 0.8]];
        for (const [x, y] of spots) { const id = window.__me.state.piles[0].cards.at(-1).id; window.__me.send({ t: "grab", id }); window.__me.send({ t: "drop", id, to: { in: "felt", x, y, up: true, angle: 0 } }); }
      });
      await p.waitForTimeout(1200);
      const heap = await f.evaluate(() => window.__me.state.felt.map((c) => ({ id: c.id, x: c.x, y: c.y })));
      const topLoose = heap.at(-1), mainTop = (await pilesOf())[0];
      check("куча: на сукне четыре карты лежат кучкой, не стопкой", heap.length === 4 && (await pilesOf()).length === 1, heap);
      const from = await stable(mainTop.top), to = await stable(topLoose.id);
      await clock(0);
      await p.mouse.move(from.x, from.y); await p.mouse.down(); await p.mouse.move(from.x - 10, from.y - 6, { steps: 3 }); await p.mouse.move(to.x, to.y, { steps: 10 });
      await clock(700);
      const blink = await waitFor(async () => { const i = await info(); return i.blinking && String(i.pile).startsWith("heap:") ? i : null; });
      check("куча: над кучей мигает подсветка", !!blink, blink);
      await clock(5000);
      const countOf = async () => { const q = await f.evaluate(() => window.__me.state.piles.filter((x) => x.id !== "deck").map((x) => ({ id: x.id, n: x.cards.length, locked: window.__me.state.locks?.[x.id] ?? null }))); return q[0] ?? null; };
      const born = await waitFor(async () => { const q = await countOf(); return q && q.n >= 2 && q.locked !== null ? q : null; });
      check("куча: время вышло — несомая карта и верхняя слепились в стопку, и она под пальцем", !!born && born.n === 2 && born.locked !== null, born);
      await clock(5000 + 140);
      const third = await waitFor(async () => { const q = await countOf(); return q && q.n >= 3 ? q : null; });
      const looseBefore = await f.evaluate(() => window.__me.state.felt.map((c) => ({ id: c.id, x: c.x, y: c.y })));
      check("куча: через шаг присоединилась следующая карта, остальные ещё лежат на сукне", !!third && third.n === 3 && looseBefore.length === 2, { third, loose: looseBefore.length });
      await clock(5000 + 140);
      await p.mouse.move(to.x + 60, to.y + 20, { steps: 6 }); await p.waitForTimeout(300);
      const looseAfter = await f.evaluate(() => window.__me.state.felt.map((c) => ({ id: c.id, x: c.x, y: c.y })));
      check("куча: палец поехал — те, что не успели подняться, остались на месте", looseAfter.length === 2 && looseAfter.every((c) => looseBefore.some((b) => b.id === c.id && Math.hypot(b.x - c.x, b.y - c.y) < 0.01)), { looseBefore, looseAfter });
      await clock(5000 + 140 * 3);
      const all = await waitFor(async () => { const q = await countOf(); return q && q.n === 5 ? q : null; });
      check("куча: дождались — поднялись все, в стопке пять карт, на сукне пусто", !!all && (await f.evaluate(() => window.__me.state.felt.length)) === 0, all);
      await clock(0);
      await p.mouse.up(); await p.waitForTimeout(900);
      // собрать всё обратно в основную стопку, как было
      await f.evaluate(() => { const other = window.__me.state.piles.find((x) => x.id !== "deck"); if (other) window.__me.send({ t: "pileDrop", pile: other.id, to: { in: "deck", pile: "deck" } }); });
      await p.waitForTimeout(800);
      await home();
    }
    // Д. ТАЙМЛАЙН СЛИЯНИЯ: свободна до 0,25 с; потом ложится на цель и горит ровно; с 0,45 с мигает; сдвиг пальца отменяет; отпустил до задержки — падает на сукно; ручки времени и режим сторон.
    {
      const sendAdmin = (intent) => f.evaluate((i) => window.__me.send(i), intent);
      const feltOf = () => f.evaluate(() => window.__me.state.felt.map((c) => ({ id: c.id, up: c.up })));
      const deckN = async () => (await pilesOf())[0].n;
      // карту с верха стопки — на сукно: лицом вверх (`up`) или рубашкой
      const lay = async (up) => {
        await f.evaluate(([u, k]) => { const id = window.__me.state.piles[0].cards.at(-1).id; window.__me.send({ t: "grab", id }); window.__me.send({ t: "drop", id, to: { in: "felt", x: -2.6 + k * 0.5, y: 2.4, up: false, angle: 0 } }); }, [up, (await feltOf()).length]);
        await p.waitForTimeout(700);
        const id = (await feltOf()).at(-1).id;
        if (up) { await sendAdmin({ t: "turn", id }); await p.waitForTimeout(500); }
        return id;
      };
      // взять карту с сукна и подвести к верху стопки; часы стоят на 0
      const bring = async (id) => {
        // камеры в исходное: прошлый перенос у края кадра мог их сдвинуть, а положения на экране меряются после этого
        await f.evaluate(() => { window.__top.home(); window.__first.home(); }); await p.waitForTimeout(300);
        // карта — в чистое место слева (прошлое падение могло лечь под язычок стопки), потом камеры в исходное
        await f.evaluate((i) => { window.__me.send({ t: "grab", id: i }); window.__me.send({ t: "drop", id: i, to: { in: "felt", x: -1.6, y: 2.4, up: false, angle: 0 } }); }, id); await p.waitForTimeout(1400);
        await clock(0);
        const a = await stable(id), pt = await stable((await pilesOf())[0].top);
        await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(a.x + 12, a.y - 6, { steps: 3 }); await p.mouse.move(pt.x, pt.y, { steps: 10 });
        await p.waitForTimeout(300);
        return pt;
      };
      const letGo = async () => { await p.mouse.up(); await p.waitForTimeout(1000); await clock(0); };
      // ручки — через панель страницы, как у владельца
      const setKnob = (id, v) => f.evaluate(([i, vv]) => { const e = document.getElementById(i); e.value = String(vv); e.dispatchEvent(new Event("change")); }, [id, v]);
      const clickMode = (knob, mode) => f.evaluate(([k, m]) => document.querySelector(`#knobs-body [data-knob="${k}"] [data-mode="${m}"]`).click(), [knob, mode]);
      const onFelt = async (id) => (await feltOf()).some((c) => c.id === id);
      await home();
      const same = await lay(false);
      // 1. таймлайн: 150 мс — свободна; 300 — легла и горит ровно; 700 — мигает
      const n00 = await deckN();
      const pt = await bring(same);
      await clock(150); await p.waitForTimeout(350);
      const i1 = await info();
      await clock(300); await p.waitForTimeout(350);
      const i2 = await info();
      await clock(700); await p.waitForTimeout(350);
      const i3 = await info();
      check("таймлайн: до 0,25 с вещь свободна (не легла, света нет); с 0,25 с легла и горит ровно; с 0,45 с мигает", !i1.seated && !i1.steady && !i1.blinking && i2.seated && i2.steady && !i2.blinking && i3.seated && i3.blinking, { i1, i2, i3 });
      // 1б. другой экран видит тот же свет под целью (по потоку «несу»): сдвинули палец на пару пикселей — поток обновился, часы там идут сами
      let og = null;
      for (let k = 0; k < 40 && !og; k++) { await p.mouse.move(pt.x + (k % 2) * 2, pt.y + 1); await p.waitForTimeout(100); const g = await f.evaluate(() => window.__first.test.othersGlow()); if (g.visible >= 1) og = g; }
      check("другой экран видит то же свечение под целью, пока её держат", !!og, og);
      // 2. сдвиг пальца до подъёма отменяет всё: свет погас, вещь снова свободна
      await p.mouse.move(pt.x + 40, pt.y + 6, { steps: 4 }); await p.waitForTimeout(350);
      const i4 = await info();
      check("сдвиг пальца до подъёма отменяет слияние: свет погас, вещь свободна", !i4.seated && !i4.steady && !i4.blinking, i4);
      const gone = await waitFor(async () => { const g = await f.evaluate(() => window.__first.test.othersGlow()); return g.merges === 0 ? g : null; }, 4000);
      check("и у другого экрана свет погас: слияние отменено", !!gone, gone);
      await letGo();
      check("после отмены карта не слилась: стопка та же, карта лежит на сукне", (await onFelt(same)) && (await deckN()) === n00, { n: await deckN(), n00 });
      // 3. отпустил до задержки — слияния при падении нет
      const n0 = await deckN();
      await bring(same);
      await clock(100); await p.waitForTimeout(350);
      await letGo();
      check("отпустил до 0,25 с: слияния при падении нет — карта на сукне, в стопке столько же", (await onFelt(same)) && (await deckN()) === n0, { n: await deckN(), n0 });
      // 4. отпустил после посадки — отпускание сливает
      await bring(same);
      await clock(300); await p.waitForTimeout(350);
      await letGo();
      check("отпустил после посадки (0,25 с и позже): карта слилась со стопкой", !(await onFelt(same)) && (await deckN()) === n0 + 1, { n: await deckN(), n0 });
      // 4б. взятую из стопки карту вернули в неё же сразу — это возврат на место, задержка не нужна
      {
        await f.evaluate(() => { window.__top.home(); window.__first.home(); }); await p.waitForTimeout(1200);
        await clock(0);
        const q = (await pilesOf())[0], at2 = await stable(q.top);
        await p.mouse.move(at2.x, at2.y); await p.mouse.down(); await p.mouse.move(at2.x + 40, at2.y - 30, { steps: 4 }); await p.mouse.move(at2.x, at2.y, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(900);
        const q2 = (await pilesOf())[0];
        check("взятую из стопки карту вернули в неё же сразу: она на месте, без задержки (возврат, а не слияние)", q2.n === q.n && q2.top === q.top, { q, q2 });
      }
      // 5. ручка «задержка»: 600 мс — на 300 ещё свободна, на 700 уже легла
      await setKnob("delayms", 600); await p.waitForTimeout(400);
      const slow = await lay(false);
      await bring(slow);
      await clock(300); await p.waitForTimeout(350);
      const s1 = await info();
      await clock(700); await p.waitForTimeout(350);
      const s2 = await info();
      check("ручка «задержка» 600 мс: на 300 мс карта ещё свободна, на 700 мс легла", !s1.seated && s2.seated, { s1, s2 });
      await letGo();
      await setKnob("delayms", 250); await p.waitForTimeout(400);
      // 6. стороны: лицом вверх над рубашкой — строго не ложится; в режиме «переворачивать» ложится, горит ровно (поднимать нельзя), отпускание сливает и переворачивает
      const face = await lay(true);
      await bring(face);
      await clock(300); await p.waitForTimeout(350);
      const m1 = await info();
      check("стороны строго: открытая карта над закрытой стопкой не ложится и не горит", !m1.seated && !m1.steady, m1);
      await letGo();
      await clickMode("tableDropSides", "flip"); await p.waitForTimeout(400);
      const nb = await deckN();
      await bring(face);
      await clock(300); await p.waitForTimeout(350);
      const m2 = await info();
      await clock(700); await p.waitForTimeout(350);
      const m3 = await info();
      check("режим «принять и перевернуть»: открытая карта легла и горит ровно (не мигает — поднимать нельзя)", m2.seated && m2.steady && m3.steady && !m3.blinking, { m2, m3 });
      await letGo();
      const topSide = await f.evaluate(() => window.__me.state.piles[0].cards.at(-1)?.up === true);
      check("отпускание в режиме «перевернуть»: карта в стопке и лежит рубашкой, как вся стопка", (await deckN()) === nb + 1 && topSide === false, { n: await deckN(), nb, topSide });
      await clickMode("tableDropSides", "refuse"); await p.waitForTimeout(400);
      await home();
    }
    // Е. СТОПКА КАК КАРТА: переворот и поворот теми же жестами (F в руке, меню и правая кнопка на столе); двойной тап по язычку не переворачивает.
    {
      const ev = (fn, a) => f.evaluate(fn, a);
      const pileNow = () => ev(() => { const q = window.__me.state.piles[0]; return { n: q.cards.length, order: q.cards.map((c) => c.id).join(), up: q.cards.at(-1)?.up === true, angle: q.angle ?? 0, x: q.x, y: q.y, top: q.cards.at(-1).id }; });
      const camsHome = async () => { await f.evaluate(() => { window.__top.home(); window.__first.home(); }); await p.waitForTimeout(1500); };
      await home(); await camsHome();
      // 1. двойной тап по язычку не переворачивает
      const s0 = await pileNow();
      const tab = await ev(() => window.__top.test.tabs()[0]);
      await p.mouse.click(tab.x, tab.y); await p.waitForTimeout(80); await p.mouse.click(tab.x, tab.y); await p.waitForTimeout(700);
      const s1 = await pileNow();
      check("двойной тап по язычку больше не переворачивает стопку (порядок и сторона те же)", s1.order === s0.order && s1.up === s0.up, { s0: s0.up, s1: s1.up });
      await camsHome();
      // 2. в руке: F переворачивает несомую стопку; отпустили — на столе она перевёрнута (порядок наоборот, сторона другая)
      const sF = await pileNow();
      const tab2 = await ev(() => window.__top.test.tabs()[0]);
      await p.mouse.move(tab2.x, tab2.y); await p.mouse.down(); await p.mouse.move(tab2.x + 12, tab2.y, { steps: 3 }); await p.mouse.move(tab2.x + 75, tab2.y - 25, { steps: 8 }); await p.waitForTimeout(500);
      await p.keyboard.press("f"); await p.waitForTimeout(600);
      await p.mouse.up(); await p.waitForTimeout(1200);
      const s2 = await pileNow();
      check("в руке: F переворачивает несомую стопку — после отпускания она лежит лицом вверх, порядок наоборот", s2.up !== sF.up && s2.order === sF.order.split(",").reverse().join(","), { up: [sF.up, s2.up] });
      await home(); await camsHome();
      // 3. меню (правая кнопка без движения): «Перевернуть» и «Повернуть на 90°»
      const topAt = await stableTop((await pileNow()).top);
      await p.mouse.click(topAt.x, topAt.y, { button: "right" }); await p.waitForTimeout(400);
      const menu = await ev(() => [...document.querySelectorAll("body > div button")].map((b) => b.textContent));
      check("правая кнопка по стопке на столе открывает меню: «Перевернуть» и «Повернуть на 30/60/90°»", menu.includes("Перевернуть") && menu.includes("Повернуть на 90°") && menu.includes("Повернуть на 30°"), menu);
      const before = await pileNow();
      await ev(() => [...document.querySelectorAll("body > div button")].find((b) => b.textContent === "Перевернуть")?.click());
      await p.waitForTimeout(800);
      const after = await pileNow();
      check("меню: «Перевернуть» — стопка перевёрнута целиком", after.up !== before.up && after.order === before.order.split(",").reverse().join(","), { before: before.up, after: after.up });
      await p.mouse.click(topAt.x, topAt.y, { button: "right" }); await p.waitForTimeout(400);
      await ev(() => [...document.querySelectorAll("body > div button")].find((b) => b.textContent === "Повернуть на 90°")?.click());
      await p.waitForTimeout(800);
      const turned = await pileNow();
      check("меню: «Повернуть на 90°» — стопка повёрнута на месте", Math.abs((((turned.angle - after.angle) % 360) + 360) % 360 - 90) < 1 && Math.hypot(turned.x - after.x, turned.y - after.y) < 0.01, { a0: after.angle, a1: turned.angle });
      // 4. правая кнопка с движением вращает стопку на месте
      await camsHome();
      const c = await stableTop((await pileNow()).top), a0 = (await pileNow()).angle;
      await p.mouse.move(c.x + 22, c.y); await p.mouse.down({ button: "right" }); await p.mouse.move(c.x, c.y + 22, { steps: 8 }); await p.waitForTimeout(200); await p.mouse.up({ button: "right" }); await p.waitForTimeout(900);
      const rot = await pileNow();
      check("правая кнопка с движением вращает стопку вокруг центра (место то же, угол сменился)", Math.abs((((rot.angle - a0) % 360) + 540) % 360 - 180) > 20 && Math.hypot(rot.x - turned.x, rot.y - turned.y) < 0.01, { a0, a1: rot.angle });
      // вернуть как было для проверок дальше
      await ev(() => window.__me.send({ t: "deckMove", pile: "deck", x: 0, y: 0.8, angle: -8 })); await p.waitForTimeout(500);
      await ev(() => { if (window.__me.state.piles[0].cards.at(-1)?.up === true) window.__me.send({ t: "deckDo", pile: "deck", how: "flip" }); }); await p.waitForTimeout(500);
    }
    // Ж. КАРТА НА КАРТУ И СТОПКА НА КАРТУ: отпускание после посадки сливает в одну вещь (карта на карту — стопка из двух; стопка на карту — одна стопка).
    {
      await home();
      const place = (k, x, y) => f.evaluate(([i, xx, yy]) => { const id = window.__me.state.piles[0].cards.at(-1).id; window.__me.send({ t: "grab", id }); window.__me.send({ t: "drop", id, to: { in: "felt", x: xx, y: yy, up: false, angle: 0 } }); }, [k, x, y]);
      const piles2 = () => f.evaluate(() => window.__me.state.piles.map((q) => ({ id: q.id, n: q.cards.length, locked: window.__me.state.locks?.[q.id] ?? null })));
      const feltIds = () => f.evaluate(() => window.__me.state.felt.map((c) => c.id));
      await place(0, 2.4, 0.9); await p.waitForTimeout(700); await place(1, -2.4, 0.9); await p.waitForTimeout(900);
      const [a, b] = await feltIds();
      await f.evaluate(() => { window.__top.home(); window.__first.home(); }); await p.waitForTimeout(1500);
      await clock(0);
      const A = await stable(a), B = await stable(b);
      await p.mouse.move(A.x, A.y); await p.mouse.down(); await p.mouse.move(A.x - 12, A.y - 6, { steps: 3 }); await p.mouse.move(B.x, B.y, { steps: 10 });
      await p.waitForTimeout(300);
      await clock(300); await p.waitForTimeout(400);
      const hi = await info();
      check("карта над лежащей картой: через 0,25 с легла на неё и горит ровно", hi.seated && hi.steady && String(hi.pile).startsWith("heap:"), hi);
      await p.mouse.up(); await p.waitForTimeout(1200); await clock(0);
      const afterA = await piles2();
      check("карта на карту: отпустил после посадки — вместо двух карт одна стопка из двух", (await feltIds()).length === 0 && afterA.length === 2 && afterA.some((q) => q.id !== "deck" && q.n === 2), afterA);
      // стопку из двух несут за язычок над третьей картой на сукне
      await place(2, 2.4, 0.9); await p.waitForTimeout(900);
      const small = (await piles2()).find((q) => q.id !== "deck") ?? { id: "none" }, c3 = (await feltIds())[0];
      await f.evaluate(() => { window.__top.home(); window.__first.home(); }); await p.waitForTimeout(1500);
      const tab = (await f.evaluate((id) => window.__top.test.tabs().find((t) => t.pile === id), small.id)) ?? { x: 20, y: 20 }, C = await stable(c3);
      await clock(0);
      await p.mouse.move(tab.x, tab.y); await p.mouse.down(); await p.mouse.move(tab.x + 12, tab.y, { steps: 3 }); await p.mouse.move(C.x, C.y, { steps: 10 });
      await p.waitForTimeout(300); await clock(300); await p.waitForTimeout(400);
      const hs = await info();
      await p.mouse.up(); await p.waitForTimeout(1200); await clock(0);
      const afterB = await piles2();
      check("стопка на карту: стопка из двух над лежащей картой — легла, а после отпускания в одной стопке три карты", hs.seated && String(hs.pile).startsWith("heap:") && (await feltIds()).length === 0 && afterB.filter((q) => q.id !== "deck").length === 1 && afterB.find((q) => q.id !== "deck")?.n === 3, { hs, afterB });
      // как было: собрать малую стопку обратно в основную
      await f.evaluate(() => { const other = window.__me.state.piles.find((x) => x.id !== "deck"); if (other) window.__me.send({ t: "pileDrop", pile: other.id, to: { in: "deck", pile: "deck" } }); }); await p.waitForTimeout(900);
      await home();
    }
    // З. Карта удержана над картой до подъёма: получилась стопка из двух, она в руке, и на язычке «2», а не «1»; после отпускания — одна стопка из двух.
    {
      const place = (x, y) => f.evaluate(([xx, yy]) => { const id = window.__me.state.piles[0].cards.at(-1).id; window.__me.send({ t: "grab", id }); window.__me.send({ t: "drop", id, to: { in: "felt", x: xx, y: yy, up: false, angle: 0 } }); }, [x, y]);
      const snap = () => f.evaluate(() => ({ piles: window.__me.state.piles.filter((q) => q.id !== "deck").map((q) => ({ n: q.cards.length, locked: window.__me.state.locks?.[q.id] ?? null, tab: window.__top.test.tabs().find((t) => t.pile === q.id)?.count })), felt: window.__me.state.felt.length }));
      await home(); await place(2.4, 0.9); await p.waitForTimeout(700); await place(-2.4, 0.9); await p.waitForTimeout(900);
      const [a, b] = await f.evaluate(() => window.__me.state.felt.map((c) => c.id));
      await f.evaluate(() => { window.__top.home(); window.__first.home(); }); await p.waitForTimeout(1500);
      await clock(0);
      const A = await stable(a), B = await stable(b);
      await p.mouse.move(A.x, A.y); await p.mouse.down(); await p.mouse.move(A.x - 12, A.y - 6, { steps: 3 }); await p.mouse.move(B.x, B.y, { steps: 10 });
      await p.waitForTimeout(300); await clock(5000);
      const held = await waitFor(async () => { const s2 = await snap(); return s2.piles[0]?.locked ? s2 : null; }, 12000);
      await p.waitForTimeout(600);
      const held2 = await snap();
      check("карта над картой поднята удержанием: одна стопка из двух в руке, на язычке два", !!held && held2.piles.length === 1 && held2.piles[0].n === 2 && held2.piles[0].tab === 2 && held2.felt === 0, held2);
      await clock(0); await p.mouse.up(); await p.waitForTimeout(1200);
      await f.evaluate(() => { const other = window.__me.state.piles.find((x) => x.id !== "deck"); if (other) window.__me.send({ t: "pileDrop", pile: other.id, to: { in: "deck", pile: "deck" } }); }); await p.waitForTimeout(900);
      await home();
    }
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
