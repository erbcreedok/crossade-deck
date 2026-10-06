// РЕЖИМ «В СТОПКУ»: кнопка вместо лассо; тап и проведение пальцем выделяют карты и стопки на столе; долгий холд на выделенном стягивает все выделенные под палец
// в одну стопку (неспешно; двинул палец — быстро и за пальцем); отпустил — одна стопка, стороны как лежали, выбор снят; карты в руках не выделяются.
//   node stack-check.mjs [base]     (стенд: `npm run dev`, порт 9590)
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
await p.goto(`${base}/?stand&cam=head`);
await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
await p.waitForTimeout(1000);
await p.evaluate(() => window.__t3d.trimHand(3));
await p.waitForTimeout(1200);
const st = () => p.evaluate(() => { const s = window.__t3d.state(); return { felt: s.felt.map((c) => ({ id: c.id, up: c.up })), picks: Object.entries(s.picks).filter(([, by]) => by === window.__t3d.me()).map(([id]) => id), piles: s.piles.map((q) => ({ id: q.id, n: q.cards.length })), hand: s.chairs.find((c) => c.owner === window.__t3d.me()).hand.map((c) => c.id) }; });
const at = (id) => p.evaluate((i) => window.__t3d.screenOf(i), id);
const before = await st();
check("на столе четыре свободные карты (три отложенные в руке — в руке остались)", before.felt.length >= 4 && before.hand.length === 3, { felt: before.felt.length, hand: before.hand.length });
check("вкладки «Выбор» (лассо) больше нет, есть «В стопку»", (await p.locator("[data-section=lasso]:visible").count()) === 0 && (await p.locator("[data-stack]:visible").count()) === 1, null);
await p.locator("[data-stack]:visible").first().click();
await p.waitForTimeout(300);
check("«В стопку» включает режим", (await p.evaluate(() => window.__t3d.stackMode())) === true, null);
const ids = before.felt.slice(-4).map((c) => c.id);
// Часть карт лежит лицом вверх, часть рубашкой: после сбора стороны должны остаться теми же.
await p.evaluate((a) => { window.__t3d.turnCard(a[1]); window.__t3d.turnCard(a[3]); }, ids);
await p.waitForTimeout(900);
const pos = await Promise.all(ids.map(at));
// ТАП выделяет, повторный тап снимает.
await p.mouse.click(pos[0].x, pos[0].y); await p.waitForTimeout(350);
check("тап по карте на столе — выделена", (await st()).picks.includes(ids[0]), (await st()).picks);
await p.mouse.click(pos[0].x, pos[0].y); await p.waitForTimeout(350);
check("повторный тап — выделение снято", !(await st()).picks.includes(ids[0]), (await st()).picks);
// ПРОВЕДЕНИЕ пальцем выделяет всё под ним.
const ordered = [...pos.keys()].sort((a, b) => pos[a].x - pos[b].x);
await p.mouse.move(pos[ordered[0]].x, pos[ordered[0]].y); await p.mouse.down();
for (const k of ordered.slice(1)) await p.mouse.move(pos[k].x, pos[k].y, { steps: 6 });
await p.mouse.up(); await p.waitForTimeout(400);
const swiped = (await st()).picks;
check("проведение пальцем по четырём картам — выделены все", ids.every((id) => swiped.includes(id)), swiped);
// ХОЛД на выделенной → сбор под палец.
const hold = pos[ordered[0]];
const upsBefore = Object.fromEntries((await st()).felt.map((c) => [c.id, c.up]));
await p.mouse.move(hold.x, hold.y); await p.mouse.down();
await p.waitForTimeout(800);
check("долгий холд на выделенной — начался сбор всех выделенных", (await p.evaluate(() => window.__t3d.gatherNow()))?.n >= 4, await p.evaluate(() => window.__t3d.gatherNow()));
await p.waitForTimeout(1500);
const spread = async () => { const q = await Promise.all(ids.map(at)); return { w: Math.max(...q.map((a) => a.x)) - Math.min(...q.map((a) => a.x)), h: Math.max(...q.map((a) => a.y)) - Math.min(...q.map((a) => a.y)), cx: q.reduce((m, a) => m + a.x, 0) / q.length, cy: q.reduce((m, a) => m + a.y, 0) / q.length }; };
const s1 = await spread();
check("карты слетелись под палец в одно место", s1.w < 30 && s1.h < 40 && Math.hypot(s1.cx - hold.x, s1.cy - hold.y) < 40, { s1, hold });
await p.mouse.move(hold.x - 90, hold.y + 40, { steps: 6 });
await p.waitForTimeout(500);
const s2 = await spread();
check("двинул палец — вся стопка идёт за ним", Math.hypot(s2.cx - (hold.x - 90), s2.cy - (hold.y + 40)) < 45 && (await p.evaluate(() => window.__t3d.gatherNow()))?.fast === true, { s2 });
await p.mouse.up();
await p.waitForTimeout(900);
const after = await st();
const inPile = after.piles.find((q) => q.n >= 4 && q.id !== "deck");
check("отпустил — одна новая стопка из всех выделенных, на сукне их больше нет", !!inPile && ids.every((id) => !after.felt.some((c) => c.id === id)), { piles: after.piles, felt: after.felt.length });
check("выбор снят", after.picks.length === 0, after.picks);
// Стороны как лежали: перевёрнутость карт не менялась «из-под коробки».
const stackUps = await p.evaluate((pid) => window.__t3d.state().piles.find((q) => q.id === pid).cards.map((c) => !!c.up), inPile?.id);
const stackCards = await p.evaluate((pid) => window.__t3d.state().piles.find((q) => q.id === pid).cards.map((c) => ({ id: c.id, up: !!c.up })), inPile?.id);
check("сбор строгий: все карты стопки лежат одной стороной (собственные стороны карт не в счёт)", stackCards.length >= 4 && ids.every((id) => stackCards.find((c) => c.id === id)?.up === stackCards[0].up) && ids.some((id) => upsBefore[id]) && ids.some((id) => !upsBefore[id]), { upsBefore, stackCards });
// Карты в руке не выделяются.
const h0 = (await st()).hand[0];
const hp = await at(h0);
await p.mouse.click(hp.x, hp.y); await p.waitForTimeout(350);
check("карта в своей руке в режиме «В стопку» не выделяется", !(await st()).picks.includes(h0), (await st()).picks);
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
