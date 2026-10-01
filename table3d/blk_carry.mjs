// ПРОВЕРКА ПЕСОЧНИЦЫ НА THREE.JS — стол в вкладке с ботами (`?stand`), палец мышью по сцене:
// из стопки на сукно, из руки на сукно, с сукна в руку, двойной тап — перевернуть, облёт камеры.
// С `--net <стол> <ключ>` — ещё и живая комната на том столе (он должен пускать гостей, `TABLE_GUESTS=1`): песочница и
// обычный стол (2D) за одним столом, карта, положенная в 3D, — у соседа в 2D.
//   node check.mjs [base] [shot.png] [--net http://localhost:2611 probe]
//   (сервер песочницы: `npm run dev`, порт 9590; картинки карт — со стола :2590)
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const shot = process.argv[3]?.startsWith("--") ? undefined : process.argv[3];
const netAt = process.argv.indexOf("--net");
const net = netAt > 0 ? { table: process.argv[netAt + 1], secret: process.argv[netAt + 2] } : null;
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const pngChunks = (buf, kind) => { const out = []; for (let i = 8; i < buf.length; ) { const n = buf.readUInt32BE(i); if (buf.toString("latin1", i + 4, i + 8) === kind) out.push(buf.subarray(i + 8, i + 8 + n)); i += 12 + n; } return out; };
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const t = (fn, arg) => p.evaluate(fn, arg);
const tabInfo = () => p.evaluate(() => window.__t3d.tabs()[0]);
const gripBox = async () => { const a = await tabInfo(); return { x: a.x - a.w / 2, y: a.y - a.h / 2, width: a.w, height: a.h }; };
const clickGrip = async () => { const a = await tabInfo(); await p.mouse.click(a.x, a.y); };
const rectOf = (sel) => p.evaluate((q) => { const e = [...document.querySelectorAll(q)].find((x) => !x.closest(".screen.off")); const r = e?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null; }, sel);
const frames = () => p.evaluate(() => new Promise((r) => { let k = 0; const f = () => (++k > 40 ? r() : requestAnimationFrame(f)); f(); }));
const drag = async (from, to) => {
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  await p.mouse.move(to.x, to.y, { steps: 10 });
  await p.mouse.up();
  await frames();
};
try {
  // РУКА-СТОПКА: верхний язычок оттянули высоко вверх — левая рука несёт все карты над столом, как колоду: бросил — новая стопка, на колоду — в неё,
  // вернул на худ — всё как было. И вид «сверху»: положенные карты лежат на столе, а не пусто; голова видна.
  {
    await p.goto(`${base}/?stand&host=http://localhost:9591`);
    await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
    await frames();
    const info = () => t(() => { const s = window.__t3d.state(), seat = s.people.find((x) => x.key === window.__t3d.me()).seat; return { hand: s.chairs.find((c) => c.id === seat).hand.map((c) => c.id), piles: s.piles.map((q) => [q.id, q.cards.length]), felt: s.felt.length }; });
    const tab = () => rectOf('[data-hand-tab="top"]');
    const start = await info();
    const tb = await tab(), sx = tb.x + tb.width / 2, sy = tb.y + tb.height / 2;
    // Оттянули вверх, вернули на худ и отпустили — рука как была.
    await p.mouse.move(sx, sy); await p.mouse.down(); await p.mouse.move(195, sy - 200, { steps: 10 });
    await p.waitForTimeout(400);
    const mid = await t((id) => ({ carrying: window.__t3d.carrying(), w: window.__t3d.world(id) }), start.hand[0]);
    check("верхний язычок высоко вверх: левая рука несёт все карты стопкой над столом", mid.carrying === true && mid.w.h > 0.5 && mid.w.h < 1.2, mid);
    await p.mouse.move(sx, sy + 110, { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(800);
    const back = await info();
    check("вернул на худ и отпустил — рука как была: те же карты, стопок не прибавилось", back.hand.length === start.hand.length && back.piles.length === start.piles.length && back.felt === start.felt, { start, back });
    // Отпустили на сукне — новая стопка из всей руки.
    const tb2 = await tab();
    await p.mouse.move(tb2.x + tb2.width / 2, tb2.y + tb2.height / 2); await p.mouse.down(); await p.mouse.move(250, tb2.y + tb2.height / 2 - 200, { steps: 10 }); await p.mouse.up();
    await p.waitForTimeout(900);
    const dropped = await info();
    const fresh = dropped.piles.find(([id]) => !start.piles.some(([o]) => o === id));
    check("отпустил над столом: появилась новая стопка из всей руки, рука пуста", dropped.hand.length === 0 && !!fresh && fresh[1] === start.hand.length, dropped);
  }
  {
    await p.goto(`${base}/?stand&host=http://localhost:9591`);
    await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
    await frames();
    const info = () => t(() => { const s = window.__t3d.state(), seat = s.people.find((x) => x.key === window.__t3d.me()).seat; return { hand: s.chairs.find((c) => c.id === seat).hand.map((c) => c.id), deck: s.piles.find((q) => q.id === "deck")?.cards.length }; });
    const start = await info();
    const tb = await rectOf('[data-hand-tab="top"]');
    const deckTop = await t(() => { const d = window.__t3d.state().piles.find((q) => q.id === "deck"); return window.__t3d.screenOf(d.cards.at(-1).id); });
    await p.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2); await p.mouse.down(); await p.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2 - 200, { steps: 6 }); await p.mouse.move(deckTop.x, deckTop.y, { steps: 12 }); await p.mouse.up();
    await p.waitForTimeout(900);
    const after = await info();
    check("отпустил на колоду: вся рука легла в неё", after.hand.length === 0 && after.deck === start.deck + start.hand.length, { start, after });
  }
} finally { await browser.close(); }
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.ok ? "" : " — " + JSON.stringify(c.got).slice(0,220)}`);
