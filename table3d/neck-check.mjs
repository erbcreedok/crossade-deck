// ГОЛОВА НАЗАД И ВБОК — отъезд (щипок к себе) откидывает голову от стола по радиусу, как приближение двигает её вперёд; два пальца вбок
// ведут голову по кругу вокруг стола (расстояние до середины то же); шея одна: натяг держится недолго и возвращается сам.
//   node neck-check.mjs [base]     (стенд: `npm run dev`, порт 9590)
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
const cam = () => p.evaluate(() => window.__t3d.cam());
const radius = (c) => Math.hypot(c.pos[0], c.pos[2]);
await p.goto(`${base}/?stand`);
await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
await p.waitForTimeout(600);
const rest = await cam();
await p.evaluate(() => { for (let i = 0; i < 6; i++) window.__t3d.zoomBy(0.6); });
await p.waitForTimeout(200);
const back = await cam();
check("отъезд: голова откинулась назад (наклон меньше нуля)", back.lean < -0.3, { lean: back.lean });
check("назад — дальше от середины стола и выше, чем в покое", radius(back) > radius(rest) + 1 && back.pos[1] > rest.pos[1], { rest: [radius(rest), rest.pos[1]], back: [radius(back), back.pos[1]] });
await p.evaluate(() => window.__t3d.sideBy(0.5));
await p.waitForTimeout(200);
const side = await cam();
check("вбок: голова пошла по кругу — та же дальность от середины, другое место", Math.abs(radius(side) - radius(back)) < 0.05 && Math.hypot(side.pos[0] - back.pos[0], side.pos[2] - back.pos[2]) > 1, { back: back.pos, side: side.pos });
await p.waitForTimeout(3400);
const later = await cam();
check("шея одна: натяг вернулся сам (и вперёд, и назад, и вбок)", Math.abs(later.lean) <= 0.06 && Math.abs(later.side) <= 0.06, { lean: later.lean, side: later.side });
await p.evaluate(() => window.__t3d.zoomBy(1.8));
await p.waitForTimeout(200);
const fwd = await cam();
check("приближение по-прежнему тянет голову вперёд", fwd.lean > 0 || (later.neck && later.neck.rest > 0), { lean: fwd.lean, rest: later.neck });
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
