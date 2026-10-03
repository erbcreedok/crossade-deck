// БЕСХОЗНЫЙ СТУЛ: стула не видно, перед ним на краю стола маленькая зона-«ноготок», в ней стопка впритык; её берут (верхнюю карту) и в неё кладут свои. Занятый стул: зоны нет.
//   node zone-check.mjs [base]     (стенд: `npm run dev`, порт 9590)
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
await p.goto(`${base}/?stand&cam=top`);
await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
await p.waitForTimeout(1200);
const zi = () => p.evaluate(() => window.__t3d.zoneInfo());
const z0 = await zi();
const owned = z0.filter((c) => c.owner), free = z0.filter((c) => !c.owner);
check("есть и занятые, и бесхозные стулья (стенд)", owned.length >= 2 && free.length >= 2, z0.map((c) => [c.id, !!c.owner]));
check("бесхозный стул не нарисован, а перед ним видна зона", free.every((c) => c.chair === false && c.zone === true), free);
check("занятый стул нарисован, его зоны нет", owned.every((c) => c.chair === true && c.zone === false), owned);
// Стопка лежит в зоне впритык: центр карт — в центре зоны.
const withCards = free.find((c) => c.hand.length > 0);
const pos = await Promise.all(withCards.hand.map((id) => p.evaluate((i) => window.__t3d.cardTarget(i), id)));
check("карты бесхозной руки лежат стопкой в зоне (центр зоны ±0.15)", pos.every((q) => Math.hypot(q[0] - withCards.centre.x, q[2] - withCards.centre.y) < 0.15), { pos, centre: withCards.centre });
// Верхнюю карту стопки можно взять и унести на стол.
const topId = withCards.hand.at(-1);
const from = await p.evaluate((i) => window.__t3d.screenOf(i), topId);
await p.mouse.move(from.x, from.y); await p.mouse.down(); await p.mouse.move(from.x, from.y - 40, { steps: 5 });
await p.mouse.move(195, 430, { steps: 8 });
await p.mouse.up();
await p.waitForTimeout(800);
const afterTake = await p.evaluate((id) => ({ onFelt: window.__t3d.state().felt.some((c) => c.id === id), hand: window.__t3d.state().chairs.find((c) => c.id === id) }), topId);
const st1 = await p.evaluate(([cid, id]) => ({ onFelt: window.__t3d.state().felt.some((c) => c.id === id), left: window.__t3d.state().chairs.find((c) => c.id === cid).hand.length }), [withCards.id, topId]);
check("верхнюю карту стопки взяли на стол: на сукне есть, в руке стула на одну меньше", st1.onFelt && st1.left === withCards.hand.length - 1, st1);
// Свою карту — в зону другого бесхозного стула.
const target = free.find((c) => c.id !== withCards.id);
const mine = await p.evaluate(() => { const s = window.__t3d.state(); const c = s.chairs.find((x) => x.owner === window.__t3d.me()); return c.hand.at(-1).id; });
const m = await p.evaluate((i) => window.__t3d.screenOf(i), mine);
const zs = await p.evaluate((c) => window.__t3d.feltScreen(c.x, c.y), target.centre);
await p.mouse.move(m.x, m.y - 40); await p.mouse.down(); await p.mouse.move(m.x, m.y - 100, { steps: 5 }); await p.mouse.move(zs.x, zs.y, { steps: 10 });
await p.waitForTimeout(250);
await p.mouse.up();
await p.waitForTimeout(900);
const st2 = await p.evaluate(([cid, id]) => ({ inHand: window.__t3d.state().chairs.find((c) => c.id === cid).hand.some((h) => h.id === id) }), [target.id, mine]);
check("свою карту уронил в зону бесхозного стула — она в его руке", st2.inHand, st2);
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
