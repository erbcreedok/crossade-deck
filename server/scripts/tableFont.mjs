// ЧУЖОГО ШРИФТА НЕ ВИДНО НИ МИГА. Свой Tiny5 задержан на 2 с; всё это время страницу щупают каждые 30 мс:
// видимый текст (не прозрачный, на экране) при ещё не пришедшем Tiny5 — провал. Потом шрифт приходит, и
// текст появляется уже им. Стол и запись партии.
//   TABLE_SECRET=probe TABLE_GUESTS=1 PORT=2611 npx tsx src/index.ts   (preview «table-probe»)
//   node scripts/tableFont.mjs [base]
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2611";
const HOLD_MS = 2000;
const browser = await chromium.launch();
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

async function watch(path, name) {
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  const fonts = [];
  await p.route(/\/table\/fonts\/.*\.woff2$/, async (route) => {
    fonts.push(route.request().url());
    await new Promise((r) => setTimeout(r, HOLD_MS));
    await route.continue();
  });
  await p.route(/googleapis|gstatic/, (route) => { fonts.push("GOOGLE " + route.request().url()); return route.abort(); });
  await p.goto(`${base}${path}`, { waitUntil: "commit" });
  const seen = [];
  const t0 = Date.now();
  while (Date.now() - t0 < HOLD_MS + 2500) {
    const bad = await p.evaluate(() => {
      if (!document.body) return null;
      const ours = document.fonts.check("16px Tiny5", "ЖA");
      if (ours) return "ok";
      for (const el of document.body.querySelectorAll("*")) {
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
        const ink = cs.webkitTextFillColor || cs.color;
        if (!/rgba\(.*,\s*0\)$/.test(ink) && ink !== "transparent") return `${el.tagName}.${el.textContent.trim().slice(0, 20)} ${ink}`;
      }
      return null;
    }).catch(() => null);
    if (bad && bad !== "ok") seen.push(bad);
    if (bad === "ok") break;
    await p.waitForTimeout(30);
  }
  const arrived = await p.evaluate(() => document.fonts.check("16px Tiny5", "ЖA") && document.documentElement.classList.contains("fonts-ok")).catch(() => false);
  check(`${name}: пока своего шрифта нет — ни одной видимой буквы`, seen.length === 0, seen.slice(0, 3));
  check(`${name}: шрифт пришёл с нашего адреса, Google не спрашивали`, arrived && fonts.length >= 1 && !fonts.some((f) => f.startsWith("GOOGLE")), fonts.map((f) => f.split("/").pop()));
  check(`${name}: без ошибок на странице`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await p.close();
}

await watch("/table/?stand", "стол");
await watch("/table/replay", "запись");
await browser.close();
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.got !== undefined ? ` — ${typeof c.got === "object" ? JSON.stringify(c.got) : c.got}` : ""}`);
const bad = checks.filter((c) => !c.ok).length;
console.log(bad ? `УПАЛО: ${bad}` : "всё зелёное");
process.exit(bad ? 1 : 0);
