// СТРАНИЦА «КАРТА — БАЗА»: на столе одна карта, камера включена сразу, карту можно взять в любой сцене.
//   (нужны стенд :9588 и dev-сервер игры :9590)   node design/zones/card-check.mjs [host]
import { createRequire } from "module";
const require = createRequire(new URL("../../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const host = process.argv[2] ?? "localhost";
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await browser.newContext({ viewport: { width: 430, height: 1000 } })).newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`http://${host}:9588/card.html`);
await p.waitForTimeout(3000);
const f = p.frames().find((x) => x.url().includes("card-scenes"));
await f.waitForFunction(() => window.__ready, null, { timeout: 60000 });
await p.waitForTimeout(2000);
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
check("на столе одна карта", (await f.evaluate(() => window.__me.state.felt.length)) === 1);
check("на столе нет ни одной стопки (пустая колода убрана, карта не превратится в стопку)", (await f.evaluate(() => window.__me.state.piles.length)) === 0);
check("за столом сидят только два наблюдателя-камеры; у четырёх цветов-игроков нет ни стула, ни места", await f.evaluate(() => { const st = window.__me.state, colours = ["blue", "red", "green", "yellow"]; return st.chairs.length === 2 && st.chairs.every((c) => c.owner?.startsWith("eye-")) && colours.every((k) => { const pl = st.people.find((x) => x.key === k); return !!pl && !pl.seat; }); }), await f.evaluate(() => ({ chairs: window.__me.state.chairs.map((c) => c.owner), people: window.__me.state.people.map((p) => [p.key, p.seat ?? null]) })));
check("лицом вверх", await f.evaluate(() => window.__me.state.felt[0].up === true));
const depth = () => f.evaluate(() => window.__top.test.depthOf(window.__me.state.felt[0].id));
const box = await f.evaluate(() => { const r = document.getElementById("f-top").getBoundingClientRect(); return { x: r.x, y: r.y }; });
const d0 = await depth();
await p.mouse.move(box.x + 190, box.y + 150); for (let i = 0; i < 3; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(150); } await p.waitForTimeout(400);
check("камера включена без тумблера: колесо приближает", (await depth()) < d0 - 1, { d0, d1: await depth() });
{
  const d1 = await depth(); await p.waitForTimeout(4500);
  check("камеру не тянет обратно: после зума и простоя 4,5 с она там же", Math.abs((await depth()) - d1) < 0.05, { d1, d2: await depth() });
}
for (const [which, scene] of [["top", "__top"], ["first", "__first"]]) {
  const at = await f.evaluate((s) => window[s].test.screenOf(window.__me.state.felt[0].id), scene);
  await p.mouse.move(at.x, at.y); await p.mouse.down(); await p.mouse.move(at.x + 12, at.y + 8, { steps: 4 }); await p.waitForTimeout(300);
  const drag = await f.evaluate((s) => window[s].test.draggingId(), scene);
  await p.mouse.up(); await p.waitForTimeout(500);
  check(`карту можно взять в сцене «${which}»`, !!drag, drag);
}
// Свечение цвета несущего: видно в чужой сцене, у несущего его нет; крутится с картой.
{
  const id = await f.evaluate(() => window.__me.state.felt[0].id);
  const at = await f.evaluate((i) => window.__top.test.screenOf(i), id);
  const halo = (s) => f.evaluate(([w, i]) => window[w].test.haloInfo(i), [s, id]);
  check("пока карту не несут, свечения нет нигде", !(await halo("__top")).on && !(await halo("__first")).on);
  await p.mouse.move(at.x, at.y); await p.mouse.down(); await p.mouse.move(at.x + 14, at.y + 9, { steps: 4 });
  for (let i = 0; i < 10; i++) { await p.mouse.move(at.x + 14 + (i % 2) * 6, at.y + 9, { steps: 2 }); await p.waitForTimeout(60); }
  const mine = await halo("__top"), other = await halo("__first");
  check("у несущего свечения нет", mine && !mine.on, mine);
  check("в чужой сцене карта светится", other && other.on, other);
  const blue = await f.evaluate(() => window.__me.state.people.find((x) => x.key === "blue").ink.replace("#", "").toLowerCase());
  check("цвет свечения — цвет несущего (синий, не жёлтый запасной)", other && other.color === blue, { other, blue });
  await p.mouse.up(); await p.waitForTimeout(700);
  check("отпустил — свечение погасло", !(await halo("__first")).on);
}
// Цвет свечения — цвет того, КОГО выбрали у несущей сцены, в том числе когда в соседней сцене смотрят с его же места (красный сверху, а нижняя сцена стоит на месте красного).
{
  const id = await f.evaluate(() => window.__me.state.felt[0].id);
  const ink = (k) => f.evaluate((kk) => window.__me.state.people.find((x) => x.key === kk).ink.replace("#", "").toLowerCase(), k);
  for (const [who, mover, viewer] of [["top", "__top", "__first"]]) {
    for (const key of ["red", "blue", "green", "yellow"]) {
      await f.evaluate(([w, k]) => document.querySelector(`#who-${w} [data-k="${k}"]`).click(), [who, key]);
      const at = await f.evaluate(([w, i]) => window[w].test.screenOf(i), [mover, id]);
      await p.mouse.move(at.x, at.y); await p.mouse.down(); await p.mouse.move(at.x + 14, at.y - 9, { steps: 4 });
      for (let i = 0; i < 8; i++) { await p.mouse.move(at.x + 14 + (i % 2) * 6, at.y - 9, { steps: 2 }); await p.waitForTimeout(60); }
      const h = await f.evaluate(([w, i]) => window[w].test.haloInfo(i), [viewer, id]);
      await p.mouse.up(); await p.waitForTimeout(600);
      check(`двигаю карту в сцене «${who}» за ${key}: в соседней светится ${key}`, h && h.on && h.color === (await ink(key)), { h, want: await ink(key) });
    }
    await f.evaluate((w) => document.querySelector(`#who-${w} [data-k="blue"]`).click(), who);
  }
  // карту возвращаем на прежнее место: дальше проверки считают от него
  await f.evaluate((i) => { window.__me.send({ t: "grab", id: i }); window.__me.send({ t: "drop", id: i, to: { in: "felt", x: 0, y: 0.8, up: true, angle: -8 } }); window.__me.send({ t: "unpick", id: i }); }, id);
  await p.waitForTimeout(1200);
}
// Наклон несомой карты у зрителя — тот, что у несущего: несут сверху — у зрителя плашмя; несут от первого лица — наклонена.
{
  const id = await f.evaluate(() => window.__me.state.felt[0].id);
  await f.evaluate(() => document.querySelector('#who-first [data-k="red"]').click());
  for (const [from, to, tilted] of [["__top", "__first", false], ["__first", "__top", true]]) {
    const at = await f.evaluate(([w, i]) => window[w].test.screenOf(i), [from, id]);
    await p.mouse.move(at.x, at.y); await p.mouse.down(); await p.mouse.move(at.x + 14, at.y - 20, { steps: 4 });
    for (let i = 0; i < 12; i++) { await p.mouse.move(at.x + 14 + (i % 2) * 6, at.y - 20, { steps: 2 }); await p.waitForTimeout(60); }
    const t = await f.evaluate(([w, i]) => window[w].test.cardTilt(i), [to, id]);
    await p.mouse.up(); await p.waitForTimeout(800);
    check(`несут в «${from === "__top" ? "сверху" : "от первого лица"}» — у зрителя ${tilted ? "наклонена" : "плашмя"}`, tilted ? t.fromUp > 8 : t.fromUp < 3, t);
  }
}
// Край — это край кадра сцены на странице, а не холста (он больше кадра): тянем карту к правому краю кадра верхней сцены — камера едет.
{
  const id = await f.evaluate(() => window.__me.state.felt[0].id);
  const fr = await f.evaluate(() => { const r = document.getElementById("f-top").getBoundingClientRect(); return { r: r.right, y: r.top + r.height / 2 }; });
  const at = await f.evaluate((i) => window.__top.test.screenOf(i), id);
  const pan0 = await f.evaluate(() => window.__top.test.panInfo());
  await p.mouse.move(at.x, at.y); await p.mouse.down(); await p.mouse.move(at.x + 12, at.y, { steps: 3 }); await p.mouse.move(fr.r - 8, at.y, { steps: 5 }); await p.waitForTimeout(500);
  const pan1 = await f.evaluate(() => window.__top.test.panInfo());
  const bot = await f.evaluate(() => { const r = document.getElementById("f-top").getBoundingClientRect(); return r.bottom; });
  await p.mouse.move(fr.r - 60, bot - 30, { steps: 4 }); const pb = await f.evaluate(() => window.__top.test.panInfo()); await p.waitForTimeout(500);
  const pc = await f.evaluate(() => window.__top.test.panInfo());
  await p.mouse.up();
  check("без руки: у низа кадра (на 30 px выше кромки) камера тоже едет", pc.z - pb.z > 0.3, { pb, pc });
  check("карта у края кадра сцены (не окна браузера) — камера едет", Math.hypot(pan1.x - pan0.x, pan1.z - pan0.z) > 0.3, { pan0, pan1 });
}
// ПРАВИЛА КАРТЫ: флажки на странице — запрет «поднять» для красного, «перевернуть» и «переместить» для синего; отказ виден, когда включён «показывать».
{
  const id = await f.evaluate(() => window.__me.state.felt[0].id);
  const click = (sel) => f.evaluate((q) => document.querySelector(q).click(), sel);
  const info = (w) => f.evaluate(([s, i]) => window[s].test.ruleInfo(i), [w, id]);
  const grab = async (w) => { const at = await f.evaluate(([s, i]) => window[s].test.screenOf(i), [w, id]); await p.mouse.move(at.x, at.y); await p.mouse.down(); await p.mouse.move(at.x + 14, at.y - 6, { steps: 4 }); await p.waitForTimeout(250); return at; };
  const release = async () => { await p.mouse.up(); await p.waitForTimeout(400); };
  const spot = () => f.evaluate((i) => { const c = window.__me.state.felt.find((x) => x.id === i); return { x: c.x, y: c.y, up: c.up }; }, id);
  // 1. Нельзя поднять — красному (сцена от первого лица, управляет красный): не поднимается; синий в сцене сверху поднимает.
  await click('[data-rule="lift"] [data-k="red"]'); await p.waitForTimeout(300);
  check("флажок «нельзя поднять» у красного — сцены знают правило", (await info("__first")).lift && !(await info("__top")).lift, [await info("__first"), await info("__top")]);
  await grab("__first"); const liftedRed = await f.evaluate(() => window.__first.test.draggingId()); await release();
  check("красному нельзя поднять — карта не берётся", liftedRed === null, liftedRed);
  await grab("__top"); const liftedBlue = await f.evaluate(() => window.__top.test.draggingId()); await release();
  check("синему можно — карта поднимается", liftedBlue !== null, liftedBlue);
  await click('[data-rule="lift"] [data-k="red"]');
  // 2. Нельзя перевернуть — синему, отказ показывается: F не переворачивает, карта трясётся.
  await click('[data-rule="turn"] [data-k="blue"]'); await click('[data-rule="turn"] .tg'); await p.waitForTimeout(300);
  const up0 = (await spot()).up;
  await grab("__top"); await p.keyboard.press("f"); await p.waitForTimeout(120);
  const shake = await info("__top"); await release();
  check("нельзя перевернуть: F не переворачивает", (await spot()).up === up0, { up0, now: (await spot()).up });
  check("отказ включён — карта трясётся", shake.shaking === true, shake);
  check("красного бордера у отказа нет (во время тряски рамка не горит)", shake.shaking === true && shake.ring === false, shake);
  await click('[data-rule="turn"] .tg'); await p.waitForTimeout(200);
  await grab("__top"); await p.keyboard.press("f"); await p.waitForTimeout(120);
  const quiet = await info("__top"); await release();
  check("отказ выключен — тихо (не трясётся)", quiet.shaking === false, quiet);
  await click('[data-rule="turn"] [data-k="blue"]');
  // 3. Нельзя перемещать — синему: поднять можно, но уронил в другом месте — легла на старое; при включённом отказе виден контур возврата.
  await click('[data-rule="move"] [data-k="blue"]'); await p.waitForTimeout(300);
  await grab("__top"); const silent = await info("__top"); await release();
  check("у «нельзя перемещать» показ выключен — контура нет, хотя у «перевернуть» он выключен отдельно", silent.move === true && silent.home === false, silent);
  await click('[data-rule="move"] .tg'); await p.waitForTimeout(300);
  const home = await spot();
  const at = await grab("__top"); const carried = await info("__top");
  await p.mouse.move(at.x + 70, at.y + 40, { steps: 6 }); await p.waitForTimeout(250);
  const mark = await info("__top"); await release(); await p.waitForTimeout(500);
  const back = await spot();
  check("нельзя перемещать: карта поднимается и ходит за пальцем", carried.move === true, carried);
  check("нельзя перемещать: контур места возврата виден (отказ включён)", mark.home === true, mark);
  check("нельзя перемещать: отпустил в другом месте — легла на старое", Math.hypot(back.x - home.x, back.y - home.y) < 0.05, { home, back });
  await click('[data-rule="move"] [data-k="blue"]'); await click('[data-rule="move"] .tg');
}
// 4-й запрет «нельзя вращать»: красному/синему нельзя повернуть — меню «Повернуть» не меняет угол; нельзя поднять и нельзя переместить поворот не мешают.
{
  const id = await f.evaluate(() => window.__me.state.felt[0].id);
  const click = (sel) => f.evaluate((q) => document.querySelector(q).click(), sel);
  const angle = () => f.evaluate((i) => window.__me.state.felt.find((x) => x.id === i).angle, id);
  const menuSpin = async (deg) => {
    const at = await f.evaluate((i) => window.__top.test.screenOf(i), id);
    await p.mouse.move(at.x, at.y); await p.mouse.click(at.x, at.y, { button: "right" }); await p.waitForTimeout(200);
    await f.evaluate((d) => [...document.querySelectorAll('div[style*="z-index: 60"] button')].find((b) => b.textContent === `Повернуть на ${d}°`)?.click(), deg);
    await p.waitForTimeout(300);
  };
  const a0 = await angle();
  await click('[data-rule="lift"] [data-k="blue"]'); await click('[data-rule="move"] [data-k="blue"]'); await p.waitForTimeout(200);
  await menuSpin(30);
  check("нельзя поднять и переместить — поворот через меню всё равно работает", Math.abs((((await angle()) - a0 - 30 + 540) % 360) - 180) < 1, { a0, now: await angle() });
  await click('[data-rule="lift"] [data-k="blue"]'); await click('[data-rule="move"] [data-k="blue"]');
  await click('[data-rule="rotate"] [data-k="blue"]'); await p.waitForTimeout(200);
  const a1 = await angle(); await menuSpin(60);
  check("нельзя вращать — поворот через меню отказывает, угол прежний", (await angle()) === a1, { a1, now: await angle() });
  await click('[data-rule="rotate"] [data-k="blue"]');
}
// «На весь экран» у каждой сцены: кадр занимает окно, сцена растягивается под него, повторное нажатие возвращает.
for (const [which, fr, st] of [["top", "f-top", "s-top"], ["first", "f-first", "s-first"]]) {
  const size = () => f.evaluate(([a, b]) => { const r = document.getElementById(a).getBoundingClientRect(), c = document.querySelector("#" + b + " canvas").getBoundingClientRect(); return { fw: Math.round(r.width), fh: Math.round(r.height), cw: Math.round(c.width), ch: Math.round(c.height), vw: innerWidth, vh: innerHeight }; }, [fr, st]);
  const before = await size();
  await f.evaluate((id) => document.getElementById(id).querySelector(".fsbtn").click(), fr); await p.waitForTimeout(400);
  const on = await size();
  check(`сцена «${which}»: на весь экран — кадр и холст во всё окно`, on.fw === on.vw && on.fh >= on.vh - 2 && on.cw === on.vw && on.ch >= on.vh - 2, on);
  await f.evaluate((id) => document.getElementById(id).querySelector(".fsbtn").click(), fr); await p.waitForTimeout(400);
  const off = await size();
  check(`сцена «${which}»: повторное нажатие возвращает как было`, off.fh === before.fh && off.cw === before.cw && off.ch === before.ch, { before, off });
}
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
