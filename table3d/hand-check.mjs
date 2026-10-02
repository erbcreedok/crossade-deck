// РУКА В НОВОМ ХУДЕ — вид «голова», стенд: палец по руке поднимает одну карту под собой и отпускает её; тап оставляет карту поднятой,
// повторный тап опускает; потянул вверх — карта берётся и ложится на стол; язычок и кнопки позы ведут высоту руки и позу (на столе —
// корешок — веер — в ряд); тап по вкладке открывает лист, по листу — меняет позу.
//   node hand-check.mjs [base]     (стенд: `npm run dev`, порт 9590)
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const t = (fn, arg) => p.evaluate(fn, arg);
const hand = () => t(() => { const s = window.__t3d.state(); const seat = s.people.find((x) => x.key === window.__t3d.me()).seat; return s.chairs.find((c) => c.id === seat).hand.map((c) => c.id); });
const at = (id) => t((i) => window.__t3d.screenOf(i), id);
const wait = (ms) => p.waitForTimeout(ms);

await p.goto(`${base}/?stand`);
await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
await wait(900);
const ids = await hand();
check("в руке семь карт", ids.length === 7, ids.length);
await t(() => window.__t3d.setHandLevel(0.8)); await wait(1800);
const [a, b2] = [ids[2], ids[5]], pa = await at(a), pb = await at(b2);
// скольжение по руке
await p.mouse.move(pa.x, pa.y); await p.mouse.down(); await p.mouse.move((pa.x + pb.x) / 2, pa.y, { steps: 4 }); await p.mouse.move(pb.x, pb.y, { steps: 4 }); await wait(150);
const dur = await t(() => window.__t3d.lifted());
check("палец скользит по руке — поднята одна карта, под пальцем", dur === b2, { dur, want: b2 });
await p.mouse.up(); await wait(150);
check("отпустил после скольжения — карта опустилась", (await t(() => window.__t3d.lifted())) === null, await t(() => window.__t3d.lifted()));
// тап оставляет карту поднятой, тап по ней — опускает
const last = ids[ids.length - 1], pc = await at(last);
await p.mouse.click(pc.x, pc.y); await wait(500);
check("тап — карта осталась поднятой", (await t(() => window.__t3d.lifted())) === last, await t(() => window.__t3d.lifted()));
await p.mouse.click(pc.x, pc.y); await wait(500);
check("ещё тап по ней (не сразу) — опустилась", (await t(() => window.__t3d.lifted())) === null, await t(() => window.__t3d.lifted()));
// потянул вверх — взял и положил на стол
const pd = await at(last);
await p.mouse.move(pd.x, pd.y); await p.mouse.down(); await p.mouse.move(pd.x, pd.y - 40, { steps: 5 }); await p.mouse.move(150, 420, { steps: 8 }); await p.mouse.up(); await wait(500);
const onFelt = await t((i) => window.__t3d.state().felt.some((c) => c.id === i), last);
check("потянул вверх — карта взята и легла на стол", onFelt, onFelt);
// язычок и поза
const pose = () => t(() => { const s = window.__t3d.state(); const seat = s.people.find((x) => x.key === window.__t3d.me()).seat; const c = s.chairs.find((x) => x.id === seat); return { ...c.pose, level: window.__t3d.handLevel() }; });
await t(() => window.__t3d.setHandLevel(0.45)); await wait(200);
let ps = await pose(); check("высота 45% — веер", ps.fan && !ps.tuck, ps);
await t(() => window.__t3d.setHandLevel(0.085)); await wait(200);
ps = await pose(); check("высота 8% — корешок (в ряд, не на столе)", !ps.fan && !ps.tuck, ps);
await t(() => window.__t3d.setHandLevel(0)); await wait(200);
ps = await pose(); check("высота 0 — рука на столе", ps.tuck, ps);
await t(() => window.__t3d.setHandLevel(0.8)); await wait(200);
ps = await pose(); check("высота 80% — в ряд", !ps.fan && !ps.tuck, ps);
// язычок пальцем: вниз до конца — на столе
await wait(1600);
const grip = await t(() => { const e = [...document.querySelectorAll("[data-grip]")].find((x) => x.getBoundingClientRect().width > 0 && !x.closest(".screen.off")); const r = e?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; });
check("язычок над рукой есть", !!grip, grip);
if (grip) {
  await p.mouse.move(grip.x, grip.y); await p.mouse.down(); await p.mouse.move(grip.x, grip.y + 200, { steps: 10 }); await p.mouse.up(); await wait(400);
  ps = await pose(); check("язычок вниз до конца — рука на столе", ps.tuck && ps.level === 0, ps);
}
// кнопки позы
await t(() => window.__t3d.setHandLevel(0.8)); await wait(200);
const click = async (sel) => { const r = await t((q) => { const e = [...document.querySelectorAll(q)].find((x) => x.getBoundingClientRect().width > 0 && !x.closest(".screen.off")); const b = e?.getBoundingClientRect(); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; }, sel); if (r) { await p.mouse.click(r.x, r.y); await wait(350); } return !!r; };
check("вкладка «Рука» открывается", await click('[data-section="pose"]'), null);
check("кнопка «Веер» ставит веер", (await click('[data-hand-pose2="fan"]')) && (await pose()).fan === true, await pose());
check("кнопка «На стол» кладёт руку на стол", (await click('[data-hand-pose2="tuck"]')) && (await pose()).tuck === true, await pose());
// ЯЗЫЧОК ВБОК — ширина руки: влево теснее (самый край — стопкой, видна одна карта), вправо шире
{
  const w = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  w.on("pageerror", (e) => errors.push(e.message));
  await w.goto(`${base}/?stand`);
  await w.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await w.waitForTimeout(900);
  await w.evaluate(() => window.__t3d.setHandLevel(0.8)); await w.waitForTimeout(1800);
  const gripOf = () => w.evaluate(() => { const e = [...document.querySelectorAll("[data-grip]")].find((x) => x.getBoundingClientRect().width > 0 && !x.closest(".screen.off")); const r = e?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; });
  const spread = () => w.evaluate(() => { const s = window.__t3d.state(); const seat = s.people.find((x) => x.key === window.__t3d.me()).seat; const xs = s.chairs.find((c) => c.id === seat).hand.map((c) => window.__t3d.screenOf(c.id).x); return Math.max(...xs) - Math.min(...xs); });
  const poseNow = () => w.evaluate(() => { const s = window.__t3d.state(); const seat = s.people.find((x) => x.key === window.__t3d.me()).seat; return s.chairs.find((c) => c.id === seat).pose; });
  const wide0 = await spread(), g0 = await gripOf();
  await w.mouse.move(g0.x, g0.y); await w.mouse.down(); await w.mouse.move(g0.x - 40, g0.y, { steps: 4 }); await w.mouse.move(g0.x - 260, g0.y, { steps: 10 }); await w.mouse.up(); await w.waitForTimeout(1600);
  const narrow = await spread(), pn = await poseNow(), wn = await w.evaluate(() => window.__t3d.handWidthNow());
  check("язычок влево до края — рука стопкой: ширина ≈ 0, видна одна карта, остальным ушла поза «стопкой»", wn < 0.12 && narrow < 20 && pn.shrink === true, { wn, narrow, pn });
  await w.waitForTimeout(800);
  const g1 = await gripOf();
  await w.mouse.move(g1.x, g1.y); await w.mouse.down(); await w.mouse.move(g1.x + 40, g1.y, { steps: 4 }); await w.mouse.move(g1.x + 300, g1.y, { steps: 10 }); await w.mouse.up(); await w.waitForTimeout(1600);
  const wide1 = await spread(), pw = await poseNow(), ww = await w.evaluate(() => window.__t3d.handWidthNow());
  check("язычок вправо — рука шире: ширина растёт, карты разошлись шире прежнего, «стопкой» снято", ww > 0.9 && wide1 > Math.max(narrow + 80, wide0 * 0.9) && pw.shrink === false, { ww, wide1, wide0, pw });
  await w.close();
}
// ЯЗЫЧОК ЗА САМЫЙ ВЕРХ — вся рука стопкой на стол
const q = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
q.on("pageerror", (e) => errors.push(e.message));
await q.goto(`${base}/?stand`);
await q.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
await q.waitForTimeout(900);
await q.evaluate(() => window.__t3d.setHandLevel(0.8)); await q.waitForTimeout(1800);
const g2 = await q.evaluate(() => { const e = [...document.querySelectorAll("[data-grip]")].find((x) => x.getBoundingClientRect().width > 0 && !x.closest(".screen.off")); const r = e?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; });
const n0 = await q.evaluate(() => { const s = window.__t3d.state(); const seat = s.people.find((x) => x.key === window.__t3d.me()).seat; return s.chairs.find((c) => c.id === seat).hand.length; });
await q.mouse.move(g2.x, g2.y); await q.mouse.down(); await q.mouse.move(g2.x, g2.y - 120, { steps: 6 }); await q.mouse.move(195, 380, { steps: 8 }); await q.waitForTimeout(300); await q.mouse.up(); await q.waitForTimeout(700);
const after = await q.evaluate(() => { const s = window.__t3d.state(); const seat = s.people.find((x) => x.key === window.__t3d.me()).seat; return { hand: s.chairs.find((c) => c.id === seat).hand.length, pile: Math.max(0, ...s.piles.map((p) => p.cards.length)), felt: s.felt.length }; });
check("язычок за самый верх — вся рука ушла на стол стопкой", n0 > 0 && after.hand === 0 && (after.pile >= n0 || after.felt >= n0), { n0, after });
{
  // ЦЕНТР ПО УМОЛЧАНИЮ: сдвиг вправо появляется только когда игрок сам растянул руку шире экрана, и сам уходит, когда ширина меньше.
  const c = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await c.goto(`${base}/?stand&cam=head`);
  await c.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await c.waitForTimeout(800);
  const mid = () => c.evaluate(() => { const s = window.__t3d.state(); const seat = s.people.find((x) => x.key === window.__t3d.me()).seat; const xs = s.chairs.find((k) => k.id === seat).hand.map((k) => window.__t3d.screenOf(k.id).x); return xs.length ? (Math.max(...xs) + Math.min(...xs)) / 2 : null; });
  await c.evaluate(() => { window.__t3d.fillHand(24); window.__t3d.setHandWidthNow(1); });
  await c.waitForTimeout(1800);
  const full = await mid();
  check("рука во всю ширину экрана — по центру", full !== null && Math.abs(full - 195) < 25, full);
  await c.evaluate(() => window.__t3d.setHandWidthNow(1.5));
  await c.waitForTimeout(1800);
  const over = await mid();
  check("игрок растянул шире экрана — рука растёт вправо от левого края", over !== null && over > full + 30, { full, over });
  await c.evaluate(() => window.__t3d.setHandWidthNow(1));
  await c.waitForTimeout(1800);
  const back = await mid();
  check("ширину вернули — рука снова по центру", back !== null && Math.abs(back - full) < 15, { full, back });
  await c.close();
}
{
  // ПУСТОЙ СТУЛ — карты его руки сложены стопкой на стол (все в одном месте), а не веером.
  const c = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await c.goto(`${base}/?stand&cam=head`);
  await c.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await c.waitForTimeout(1500);
  const spread = await c.evaluate(() => { const ch = window.__t3d.state().chairs.find((x) => !x.owner && x.hand.length > 1); if (!ch) return null; const ps = ch.hand.map((k) => window.__t3d.cardTarget(k.id)); const xs = ps.map((q) => q[0]), zs = ps.map((q) => q[2]), ys = ps.map((q) => q[1]); return { dx: Math.max(...xs) - Math.min(...xs), dz: Math.max(...zs) - Math.min(...zs), y: Math.max(...ys) }; });
  check("пустой стул: карты руки лежат стопкой на столе", spread !== null && spread.dx < 0.3 && spread.dz < 0.3 && spread.y < 1, spread);
  await c.close();
}
{
  // ПРАВАЯ РУКА В ПОКОЕ ВСЕГДА НА СТОЛЕ (у остальных и у меня), и рука с локтем: у чужой руки локоть — два отрезка и шар.
  const c = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await c.goto(`${base}/?stand&cam=head`);
  await c.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await c.waitForTimeout(1500);
  const arms = await c.evaluate(() => ({ others: window.__t3d.bodies().map((b) => ({ by: b.by, right: b.right })), mine: window.__t3d.myArm() }));
  check("правая рука соседа в покое нарисована и лежит на столе", arms.others.length > 0 && arms.others.every((b) => b.right && b.right.h < 0.6), arms.others);
  check("моя правая рука в покое лежит на столе", arms.mine !== null && arms.mine.h < 0.6, arms.mine);
  await c.close();
}
{
  // КАРТУ ТЯНУТ В РУКУ СО СТОЛА — рука подсвечена («В руку»), даже когда рука пуста и щели нет; ушёл от руки или отпустил — подсветки нет.
  const c = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await c.goto(`${base}/?stand&cam=head`);
  await c.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await c.waitForTimeout(1200);
  await c.evaluate(() => window.__t3d.trimHand(0));
  await c.waitForTimeout(1200);
  const felt = await c.evaluate(() => { const s = window.__t3d.state(); const id = s.felt.at(-1)?.id; return id ? { id, at: window.__t3d.screenOf(id) } : null; });
  const lit = () => c.evaluate(() => { const e = document.querySelector("[data-hand-drop]"); return !!e && e.style.display !== "none"; });
  check("до: подсветки руки нет", !(await lit()), null);
  if (felt?.at) {
    await c.mouse.move(felt.at.x, felt.at.y); await c.mouse.down(); await c.mouse.move(felt.at.x, felt.at.y - 40, { steps: 4 });
    await c.waitForTimeout(150);
    check("несут со стола, пока над сукном — руку не подсвечивают", !(await lit()), null);
    await c.mouse.move(195, 700, { steps: 8 });
    await c.waitForTimeout(250);
    check("над своей (пустой) рукой — рука подсвечена", await lit(), null);
    await c.mouse.move(195, 330, { steps: 8 });
    await c.waitForTimeout(250);
    check("ушла обратно на стол — подсветка погасла", !(await lit()), null);
    await c.mouse.move(195, 700, { steps: 6 });
    await c.waitForTimeout(150);
    await c.mouse.up();
    await c.waitForTimeout(500);
    check("отпустили — подсветки нет", !(await lit()), null);
  } else check("на столе есть карта для проверки", false, felt);
  await c.close();
}
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
