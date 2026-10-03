// ПОТОЛОК РУКИ: взгляд не выше потолка — рука, язычок и счётчик на месте, как были; выше потолка — рука не поднимается следом, уезжает вниз из кадра вместе с язычком и счётчиком;
// взгляд вниз руку не двигает. Вернул взгляд — всё на месте.
//   node ceil-check.mjs [base]
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch();
const errors = [];
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`${base}/?stand&cam=head`);
await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
await p.waitForTimeout(1500);
const look = async (pitch) => { await p.evaluate((v) => window.__t3d.setLook(v), pitch); await p.waitForTimeout(900); };
const read = () => p.evaluate(() => {
  const s = window.__t3d.state(), c = s.chairs.find((x) => x.owner === window.__t3d.me()), id = c.hand[Math.floor(c.hand.length / 2)].id;
  const grip = document.querySelector(".screen:not(.off) [data-grip]"), clip = document.querySelector(".screen:not(.off) .c-handclip");
  return { shift: window.__t3d.handShift(), cardY: window.__t3d.screenOf(id)?.y ?? null, gripTop: grip ? grip.getBoundingClientRect().top : null, clipBottom: clip ? clip.getBoundingClientRect().bottom : null };
});
await look(-40); const a = await read();
check("обычный взгляд (−40°): рука не сдвинута", a.shift === 0 && a.gripTop !== null, a);
await look(-10); const b = await read();
check("взгляд выше потолка (−10°): рука ушла вниз, карты ниже на экране", b.shift > 20 && b.cardY > a.cardY + 20, { a, b });
check("язычок поехал вместе с рукой", b.gripTop > a.gripTop + 15, { a: a.gripTop, b: b.gripTop });
await look(12); const c = await read();
check("взгляд высоко вверх (12°): рука целиком ниже низа экрана", c.cardY > 844 - 70, c);
check("язычок спрятан за нижней строкой", c.gripTop >= c.clipBottom - 1, c);
await look(-65); const d = await read();
check("взгляд вниз (−65°): рука на месте, как у головы — не сдвигается", d.shift === 0 && Math.abs(d.cardY - a.cardY) < 30, { a, d });
await look(-40); const e = await read();
check("вернул взгляд — всё на месте", e.shift === 0 && Math.abs(e.cardY - a.cardY) < 8 && Math.abs(e.gripTop - a.gripTop) < 6, { a, e });
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const k of checks) console.log(k.ok ? "ok  " : "FAIL", k.name, k.ok ? "" : JSON.stringify(k.got));
process.exit(checks.every((k) => k.ok) ? 0 : 1);
