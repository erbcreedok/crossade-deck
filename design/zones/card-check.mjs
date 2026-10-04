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
check("лицом вверх", await f.evaluate(() => window.__me.state.felt[0].up === true));
const depth = () => f.evaluate(() => window.__top.test.depthOf(window.__me.state.felt[0].id));
const box = await f.evaluate(() => { const r = document.getElementById("f-top").getBoundingClientRect(); return { x: r.x, y: r.y }; });
const d0 = await depth();
await p.mouse.move(box.x + 190, box.y + 150); for (let i = 0; i < 3; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(150); } await p.waitForTimeout(400);
check("камера включена без тумблера: колесо приближает", (await depth()) < d0 - 1, { d0, d1: await depth() });
for (const [which, scene] of [["top", "__top"], ["first", "__first"]]) {
  const at = await f.evaluate((s) => window[s].test.screenOf(window.__me.state.felt[0].id), scene);
  await p.mouse.move(at.x, at.y); await p.mouse.down(); await p.mouse.move(at.x + 12, at.y + 8, { steps: 4 }); await p.waitForTimeout(300);
  const drag = await f.evaluate((s) => window[s].test.draggingId(), scene);
  await p.mouse.up(); await p.waitForTimeout(500);
  check(`карту можно взять в сцене «${which}»`, !!drag, drag);
}
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
