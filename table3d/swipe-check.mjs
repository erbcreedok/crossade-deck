// СВАЙП ВНИЗ НЕ СВОРАЧИВАЕТ МИНИАПП — `touchmove` по столу отменяется, а по окну с собственной прокруткой (журнал) — нет, иначе
// его не пролистать.
//   node swipe-check.mjs [base]     (стенд: `npm run dev`, порт 9590)
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
await p.goto(`${base}/?stand`);
await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
await p.waitForTimeout(600);
const moved = (sel) => p.evaluate((q) => { const e = [...document.querySelectorAll(q)].find((x) => x.getBoundingClientRect().width > 0 && !x.closest(".screen.off")); if (!e) return null; const ev = new Event("touchmove", { bubbles: true, cancelable: true }); e.dispatchEvent(ev); return ev.defaultPrevented; }, sel);
check("палец по столу тянет вниз — touchmove отменён", (await moved("#stage canvas")) === true, await moved("#stage canvas"));
await p.evaluate(() => [...document.querySelectorAll("[data-journal]")].find((x) => x.getBoundingClientRect().width > 0)?.click());
await p.waitForTimeout(300);
check("в журнале (своя прокрутка) touchmove не отменяется", (await moved("[data-g=journal]")) === false, await moved("[data-g=journal]"));
check("страница не тянется резинкой", await p.evaluate(() => getComputedStyle(document.body).overscrollBehaviorY === "none"), null);
await browser.close();
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
