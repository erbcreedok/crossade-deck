// СЛИЯНИЕ В ИГРЕ (3D-песочница, не стенд зон): карта из РУКИ лежит лицом к хозяину, колода рубашкой — строго они не сливаются (ни посадки, ни света).
// Включили «переворачивать» (в настройках игры) — карта ложится на колоду, горит ровно, мигает, и колода поднимается под палец.
//   node merge-hand-check.mjs [base]
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [], checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`${base}/?stand&cam=top`);
await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
await p.waitForTimeout(1500);
const poll = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await p.waitForTimeout(60); } return null; };
const info = () => p.evaluate(() => window.__t3d.holdInfo());
const carry = async () => {
  const hid = await p.evaluate(() => window.__t3d.state().chairs.find((x) => x.owner === "me").hand[3].id);
  const top = await p.evaluate(() => window.__t3d.state().piles[0].cards.at(-1).id);
  const A = await p.evaluate((i) => window.__t3d.screenOf(i), hid), P = await p.evaluate((i) => window.__t3d.screenOf(i), top);
  await p.mouse.move(A.x, A.y); await p.mouse.down(); await p.mouse.move(A.x, A.y - 60, { steps: 5 }); await p.mouse.move(P.x, P.y, { steps: 10 });
};
// 1. строго: карта лицом к хозяину над закрытой колодой не садится и не горит
await carry();
await p.waitForTimeout(1500);
const strict = await info();
check("строго: карта из руки (лицом ко мне) над закрытой колодой не садится и не горит", !strict.seated && !strict.steady && !strict.blinking, strict);
await p.mouse.up(); await p.waitForTimeout(800);
// 2. «переворачивать» при отпускании и удержании: сесть, гореть, мигать, поднять
await p.evaluate(() => document.querySelector("[data-settings]").click()); await p.waitForTimeout(400);
await p.evaluate(() => { document.querySelector('[data-merge-mode="dropSides:flip"]').click(); });
await p.waitForTimeout(300);
await p.evaluate(() => { document.querySelector('[data-merge-mode="holdSides:flip"]').click(); });
await p.waitForTimeout(300);
await p.evaluate(() => document.querySelector("[data-settings-close]")?.click()); await p.waitForTimeout(300);
await carry();
const seated = await poll(async () => { const i = await info(); return i.seated && i.steady ? i : null; });
check("«переворачивать»: карта из руки легла на колоду и горит ровно", !!seated, seated);
const blink = await poll(async () => { const i = await info(); return i.blinking ? i : null; });
check("потом мигает", !!blink, blink);
const lifted = await poll(async () => p.evaluate(() => window.__t3d.pileCarrying()), 8000);
check("потом колода поднимается под палец вместе с картой", !!lifted, lifted);
await p.mouse.up();
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
