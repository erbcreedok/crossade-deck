// ЗАСТАВКА НЕ ЖДЁТ ЗАВИСШИЙ ЗАПРОС: картинки колоды и лица висят намертво — стол всё равно открывается
// за потолок (`READY_CAP_MS` в `main.ts`), а не держится за заставкой, пока запрос не сдастся.
//   TABLE_SECRET=probe TABLE_GUESTS=1 PORT=2611 npx tsx src/index.ts   (preview «table-probe»)
//   node scripts/tableBoot.mjs [base]
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2611";
const browser = await chromium.launch();
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
// Любая картинка и шрифт — не отвечают никогда.
await p.route(/\.(png|webp|jpe?g|svg|woff2?)(\?|$)/, () => {});
await p.route(/fonts\.(googleapis|gstatic)\.com/, () => {});

const t0 = Date.now();
await p.goto(`${base}/table/?stand`, { waitUntil: "commit" });
await p.waitForFunction(() => !!document.querySelector("canvas")?.dataset.spots, null, { timeout: 20000 });
const drawn = Date.now() - t0;
const gone = await p.waitForFunction(() => {
  const l = document.querySelector("body > .crossade-loading");
  return !l || l.hidden || getComputedStyle(l).opacity === "0" || getComputedStyle(l).display === "none";
}, null, { timeout: 15000 }).then(() => Date.now() - t0).catch(() => null);
check("картинки и шрифт висят — стол всё равно открылся за потолок", gone !== null && gone - drawn < 4500, { drawn, gone });
check("без ошибок на странице", errors.length === 0, errors.slice(0, 2).join(" | "));
await browser.close();
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.got !== undefined ? ` — ${typeof c.got === "object" ? JSON.stringify(c.got) : c.got}` : ""}`);
const bad = checks.filter((c) => !c.ok).length;
console.log(bad ? `УПАЛО: ${bad}` : "всё зелёное");
process.exit(bad ? 1 : 0);
