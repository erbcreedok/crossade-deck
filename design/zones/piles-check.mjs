// СТРАНИЦА «СТОПКИ — ПРИЁМКА»: взятая в виде сверху карта идёт за пальцем и остаётся на столе — не улетает в руку (рука помечена «не принимает»).
//   (нужны стенд :9588 и dev-сервер игры :9590)   node design/zones/piles-check.mjs [host]
import { createRequire } from "module";
const require = createRequire(new URL("../../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const host = process.argv[2] ?? "localhost";
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await browser.newContext({ viewport: { width: 430, height: 1000 } })).newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`http://${host}:9588/piles.html`);
await p.waitForTimeout(3000);
const f = p.frames().find((x) => x.url().includes("piles-scenes"));
await f.waitForFunction(() => window.__ready, null, { timeout: 60000 });
await p.waitForTimeout(2000);
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const felt = () => f.evaluate(() => window.__me.state.felt.length);
for (let k = 0; k < 4; k++) {
  const at = await f.evaluate((i) => { const s = window.__me.state; return window.__top.test.screenOf(s.felt[i % s.felt.length].id); }, k);
  await p.mouse.move(at.x, at.y); await p.mouse.down(); await p.mouse.move(at.x + 8, at.y + 6); await p.waitForTimeout(500);
  const during = await f.evaluate(() => { const id = window.__top.test.draggingId(); return id ? window.__top.test.screenOf(id) : null; });
  await p.mouse.up(); await p.waitForTimeout(600);
  check(`захват ${k + 1}: карта у пальца, а не в руке`, !!during && Math.abs(during.x - (at.x + 8)) < 40 && Math.abs(during.y - (at.y + 6)) < 40, { at, during });
  check(`захват ${k + 1}: обе карты на столе`, (await felt()) === 2, await felt());
}
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
