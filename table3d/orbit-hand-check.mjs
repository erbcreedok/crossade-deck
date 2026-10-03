// СВОБОДНАЯ КАМЕРА (орбита): рука не привязана к экрану и не висит в воздухе — карты лежат стопкой на столе у моего стула; вернулся в «голову» — рука снова у глаза.
//   node orbit-hand-check.mjs [base]
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
await p.goto(`${base}/?stand&cam=orbit`);
await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
await p.waitForTimeout(1500);
const hand = () => p.evaluate(() => { const s = window.__t3d.state(); const c = s.chairs.find((x) => x.owner === window.__t3d.me()); return c.hand.map((h) => ({ t: window.__t3d.cardTarget(h.id), hud: window.__t3d.cardOnHud(h.id)?.onCamera === true })); });
const o = await hand();
check("в орбите карты руки лежат на столе, а не висят в воздухе", o.length > 3 && o.every((c) => c.t[1] < 0.5), o.map((c) => c.t));
check("и лежат стопкой в одном месте", Math.max(...o.map((c) => c.t[0])) - Math.min(...o.map((c) => c.t[0])) < 0.5 && Math.max(...o.map((c) => c.t[2])) - Math.min(...o.map((c) => c.t[2])) < 0.5, o.map((c) => c.t));
check("и не привязаны к экрану", o.every((c) => !c.hud), o.map((c) => c.hud));
await p.evaluate(() => window.__t3d.setCamMode("head")); await p.waitForTimeout(900);
const h = await hand();
check("вернулся в «голову» — рука снова у глаза", h.some((c) => c.hud), h.map((c) => c.hud));
await p.evaluate(() => window.__t3d.setCamMode("orbit")); await p.waitForTimeout(900);
check("и снова на столе в орбите", (await hand()).every((c) => c.t[1] < 0.5));
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
