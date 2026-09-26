// УПРАВЛЕНИЕ ЗАПИСЬЮ — С ТЕЛЕФОНА И С ДЕСКТОПА. Метки важных событий на шкале (тесные — группой),
// список «События» с переходом на паузе, «к прошлому / следующему важному», два режима камеры (рука
// зрителя переводит в свободную, перемотка её держит, кнопка возвращает записанную), окна зрителя
// переживают перемотку, и ничто из этого не шлёт столу ни одного действия.
//   сервер с журналом записи; node scripts/tableReplayControls.mjs <base> <room> <pass> <from> <to> <eyes>
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const [base, room, pass, from, to, eyes] = process.argv.slice(2);
const lane = `room=${room}&pass=${encodeURIComponent(pass)}&from=${from}&to=${to}`;
const { deeds } = await (await fetch(`${base}/table/journal?${lane}`)).json();
const recorded = (step) => { for (let i = step; i >= 0; i -= 1) if (deeds[i].side === "screen" && deeds[i].kind === "view" && deeds[i].who === eyes) return deeds[i].what; return deeds.find((d) => d.side === "screen" && d.kind === "view" && d.who === eyes)?.what ?? null; };
const norm = (a) => ((Math.round(a) % 360) + 360) % 360;
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const browser = await chromium.launch();

for (const [label, viewport, touch] of [["телефон", { width: 390, height: 844 }, true], ["десктоп", { width: 1280, height: 800 }, false]]) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const R = await ctx.newPage();
  const errors = [];
  const writes = [];
  R.on("pageerror", (e) => errors.push(e.message));
  R.on("request", (q) => { if (q.method() !== "GET") writes.push(`${q.method()} ${q.url()}`); });
  R.on("websocket", (w) => writes.push(`ws ${w.url()}`));
  await R.goto(`${base}/table/replay?${lane}&eyes=${encodeURIComponent(eyes)}&at=0`);
  await R.waitForSelector("canvas[data-spots]");
  await R.waitForTimeout(1500);
  const at = () => R.evaluate(() => Number(document.getElementById("bar").value));
  const paused = async () => (await R.textContent("#play")) === "▶";
  const view = () => R.evaluate(() => document.querySelector("canvas").dataset.view.split(",").map(Number));
  const spots = () => R.evaluate(() => JSON.parse(document.querySelector("canvas").dataset.spots));
  const seek = (i) => R.evaluate((i) => { const b = document.getElementById("bar"); b.value = String(i); b.dispatchEvent(new Event("input")); }, i);
  const click = (sel) => (touch ? R.tap(sel) : R.click(sel));

  // СПИСОК СОБЫТИЙ — он же правда о метках.
  await click("#eventsOpen");
  const list = await R.evaluate(() => [...document.querySelectorAll("#eventsBody [data-step]")].map((e) => ({ step: Number(e.dataset.step), text: e.innerText.replace(/\s+/g, " ") })));
  check(`${label}: «События» — крупный список со временем и описанием`, list.length > 0 && list.every((e) => /^\d+:\d\d\.\d /.test(e.text)), list.slice(0, 3));
  const kinds = await R.evaluate(() => [...new Set([...document.querySelectorAll("#eventsBody b")].map((b) => b.textContent))]);
  check(`${label}: закрытие круга и сбор — разные события`, kinds.includes("Круг закрыт") && kinds.includes("Сбор круга"), kinds);
  const rowH = await R.evaluate(() => document.querySelector("#eventsBody .ev").getBoundingClientRect().height);
  check(`${label}: строки списка крупные (≥ 44px)`, rowH >= 44, rowH);
  await click("#eventsClose");
  check(`${label}: ✕ закрывает список`, await R.isHidden("#events"));
  await click("#play");
  await R.waitForTimeout(300);
  const target = list[Math.floor(list.length / 2)];
  await click("#eventsOpen");
  await click(`#eventsBody [data-step="${target.step}"]`);
  await R.waitForTimeout(200);
  check(`${label}: тап по событию — к нему, на паузе, список закрыт`, (await at()) === target.step && (await paused()) && (await R.isHidden("#events")), { at: await at(), want: target.step, paused: await paused() });

  // К ПРОШЛОМУ / СЛЕДУЮЩЕМУ ВАЖНОМУ — отдельно от шага.
  const steps = list.map((e) => e.step);
  await seek(steps[1] + 1);
  await click("#nextMark");
  const nx = await at();
  await click("#prevMark");
  const pv = await at();
  check(`${label}: ▶◆ и ◆◀ — к следующему и прошлому важному, мимо обычных шагов`, nx === steps[2] && pv === steps[1], { nx, pv, want: [steps[2], steps[1]] });

  // МЕТКИ НА ШКАЛЕ: каждая — событие из списка; тесные — группой, раскрываются списком.
  const drawn = await R.evaluate(() => [...document.querySelectorAll("#marks .mark")].map((m) => ({ x: m.getBoundingClientRect().x, group: m.classList.contains("group"), n: m.dataset.group !== undefined ? Number(m.textContent) : 1, step: m.dataset.mark ? Number(m.dataset.mark) : null })));
  const sum = drawn.reduce((s, m) => s + m.n, 0);
  const tight = drawn.some((m, i) => i > 0 && m.x - drawn[i - 1].x < 18);
  check(`${label}: на шкале все события (${list.length}), метки не налезают друг на друга`, sum === list.length && !tight, { sum, tight, drawn: drawn.length });
  const single = drawn.find((m) => !m.group);
  if (single) {
    await click(`#marks [data-mark="${single.step}"]`);
    check(`${label}: тап по метке — к событию, на паузе`, (await at()) === single.step && (await paused()), await at());
  }
  const group = drawn.find((m) => m.group);
  if (group) {
    await click("#marks .mark.group");
    const n = await R.evaluate(() => document.querySelectorAll("#eventsBody [data-step]").length);
    check(`${label}: группа раскрывается списком своих событий`, !(await R.isHidden("#events")) && n === group.n, { n, want: group.n });
    await click("#eventsClose");
  }

  // КАМЕРА. Как у игрока — записанная камера на мгновение.
  const s0 = steps[3];
  await seek(s0);
  await R.waitForTimeout(400);
  const want0 = recorded(s0);
  const v0 = await view();
  check(`${label}: «как у игрока» — записанная камера выбранного игрока`, want0 !== null && norm(v0[3]) === norm(want0.turn), { v0, want0 });
  // Рука зрителя двигает стол → свободная; рука и глаза — те же.
  const box = await R.evaluate(() => { const r = document.querySelector("canvas").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const sx = box.x + box.w * 0.5, sy = box.y + box.h * 0.3;
  if (touch) {
    const c = await ctx.newCDPSession(R);
    const pt = (x, y) => [{ x, y, id: 1 }];
    await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(sx, sy) });
    for (let k = 1; k <= 8; k += 1) await c.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(sx + k * 12, sy + k * 8) });
    await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await R.mouse.move(sx, sy);
    await R.mouse.down();
    await R.mouse.move(sx + 100, sy + 60, { steps: 8 });
    await R.mouse.up();
  }
  await R.waitForTimeout(900);
  const v1 = await view();
  const freeOn = await R.evaluate(() => document.getElementById("cam").hasAttribute("data-free"));
  check(`${label}: палец по столу двигает камеру и переводит в «свободную»`, freeOn && (v1[0] !== v0[0] || v1[1] !== v0[1]), { v0, v1, freeOn });
  check(`${label}: свободная камера не меняет глаза`, (await spots()).me === eyes, (await spots()).me);
  // Перемотка в свободном режиме держит ракурс.
  await seek(steps.at(-2));
  await R.waitForTimeout(400);
  await click("#nextMark");
  await R.waitForTimeout(400);
  const v2 = await view();
  // Поворот, наклон и зум — точно; центр — насколько пускает стол: область, куда камере можно
  // смотреть, зависит от высоты руки внизу, а рука на другом мгновении другая.
  check(`${label}: перемотка в свободной — поворот, наклон и зум зрителя те же, центр рядом`, v2[2] === v1[2] && v2[3] === v1[3] && v2[4] === v1[4] && Math.hypot(v2[0] - v1[0], v2[1] - v1[1]) < 0.6, { v1, v2 });
  await seek(s0);
  await R.waitForTimeout(400);
  check(`${label}: вернулся на то же мгновение — ракурс зрителя в точности`, JSON.stringify(await view()) === JSON.stringify(v1), { v1, back: await view() });
  // Вернуть камеру игрока — его записанная на текущее мгновение.
  await click("#cam");
  await R.waitForTimeout(400);
  const now = await at();
  const v3 = await view();
  const want3 = recorded(now);
  check(`${label}: «вернуть» — записанная камера игрока на текущее мгновение`, !(await R.evaluate(() => document.getElementById("cam").hasAttribute("data-free"))) && norm(v3[3]) === norm(want3.turn) && Math.round(v3[4]) === Math.round(want3.lean), { v3, want3 });
  await seek(s0);
  await R.waitForTimeout(400);
  check(`${label}: перемотка в режиме игрока — снова его камера`, norm((await view())[3]) === norm(recorded(s0).turn), await view());

  // ОКНА ЗРИТЕЛЯ ПЕРЕЖИВАЮТ ПЕРЕМОТКУ И ИГРУ.
  const sp = await spots();
  const other = sp.seats.find((one) => one.key !== sp.mine && one.who && !one.croupier);
  const k = box.w / (await R.evaluate(() => document.querySelector("canvas").clientWidth));
  if (other) {
    const px = box.x + other.x * k, py = box.y + other.y * k;
    if (touch) await R.touchscreen.tap(px, py); else await R.mouse.click(px, py);
    await R.waitForTimeout(300);
  }
  await click("[data-journal]");
  await R.waitForTimeout(300);
  const opened = async () => R.evaluate(() => ({ tip: document.querySelectorAll("#over [data-tip]").length, journal: document.querySelectorAll('#over [data-g="journal"]').length }));
  const before = await opened();
  for (const i of [5, steps[0], steps.at(-1), 1]) { await seek(i); await R.waitForTimeout(150); }
  await click("#play");
  await R.waitForTimeout(1200);
  await click("#play");
  const after = await opened();
  check(`${label}: окно стула и журнал, открытые зрителем, не закрываются перемоткой и игрой`, before.tip > 0 && before.journal > 0 && after.tip === before.tip && after.journal === before.journal, { before, after, other: other?.key });

  check(`${label}: просмотр не отправил столу ни одного действия (только чтение)`, writes.length === 0, writes);
  check(`${label}: без ошибок страницы`, errors.length === 0, errors);
  await R.screenshot({ path: `${process.env.SHOTS ?? "."}/controls-${label}.png` });
  await ctx.close();
}
await browser.close();
for (const one of checks) console.log(one.ok ? "✓" : "✗", one.name, one.ok ? "" : JSON.stringify(one.got).slice(0, 500));
console.log(`${checks.filter((one) => one.ok).length}/${checks.length}`);
if (checks.some((one) => !one.ok)) process.exitCode = 1;
