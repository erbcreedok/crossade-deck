// СТОЛ В ПРИЛОЖЕНИИ CROSSADE: страница зовёт камеру приложения, прозрачна насквозь в AR и ставит стол по
// позе ARKit (`arNative.ts`); по ссылке с пропуском входит тем же человеком. Приложение здесь подменено:
// `__crossadeNative` пишет вызовы, позы шлёт прогон.
//   TABLE_SECRET=probe TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test CROSSADE_DB_FILE=":memory:" PORT=2597 npx tsx src/index.ts
//   node scripts/tableNativeAr.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");
const { Client } = require("colyseus.js");

const base = process.argv[2] ?? "http://localhost:2597";
const secret = process.argv[3] ?? "probe";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "test";
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

const browser = await chromium.launch();
const page = async (url) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log("ERROR", e.message));
  await p.addInitScript(() => {
    window.__arCalls = [];
    window.__crossadeNative = { version: 1, ar: (on) => window.__arCalls.push(on) };
  });
  await p.goto(url);
  return p;
};

// ── AR на стенде ─────────────────────────────────────────────────────────────────────────────────
const p = await page(`${base}/table/?stand`);
await p.waitForFunction(() => !!document.querySelector("canvas")?.dataset.spots);
const home = await p.locator("[data-home]").boundingBox();
await p.mouse.move(home.x + home.width / 2, home.y + home.height / 2);
await p.mouse.down();
await p.waitForTimeout(750);
await p.mouse.up();
await p.waitForTimeout(250);
check("AR включился — приложение позвали включить камеру", JSON.stringify(await p.evaluate(() => window.__arCalls)) === "[true]", await p.evaluate(() => window.__arCalls));

// Телефон смотрит вниз на 50°, стоит в нуле.
const down = (deg) => [Math.sin((-deg * Math.PI) / 360), 0, 0, Math.cos((deg * Math.PI) / 360)];
const frame = (pos, deg = 50, fov = 62) => p.evaluate(([q, x, fv]) => window.__arFrame(q[0], q[1], q[2], q[3], x[0], x[1], x[2], fv, 1), [down(deg), pos, fov]);
await frame([0, 0, 0]);
await p.waitForTimeout(300);
const bg = await p.evaluate(() => ({
  floor: getComputedStyle(document.querySelector("[data-ar-floor]")).backgroundImage + "|" + getComputedStyle(document.querySelector("[data-ar-floor]")).backgroundColor,
  body: getComputedStyle(document.body).backgroundColor,
  html: getComputedStyle(document.documentElement).backgroundColor,
  grid: document.querySelector("[data-ar-floor] path")?.getAttribute("d") ?? "",
}));
check("в AR страница прозрачна — под ней камера приложения", bg.floor === "none|rgba(0, 0, 0, 0)" && bg.body === "rgba(0, 0, 0, 0)" && bg.html === "rgba(0, 0, 0, 0)", bg);
check("сетки пола нет — пол настоящий", bg.grid === "", bg.grid.slice(0, 40));
await p.waitForTimeout(2500);
check("кнопки «Включить наклон» нет — датчик не нужен", (await p.locator("[data-ar-ask]").count()) === 0);

// Экран говорит, где у него середина стола и какого он размера (`canvas.dataset.spots`).
const spot = () => p.evaluate(() => { const s = JSON.parse(document.querySelector("canvas").dataset.spots || "{}"); return { ...s.middle, k: s.k }; });
const at0 = await spot();
check("стол встал туда, куда смотрит телефон", Math.abs(at0.x - 195) <= 3 && Math.abs(at0.y - 422) <= 3, at0);
await frame([0, 0, -0.25]);
await p.waitForTimeout(300);
const at1 = await spot();
check("шагнул к столу на 25 см — стол ближе: крупнее и ниже", at1.k > at0.k * 1.1 && at1.y > at0.y + 20, [at0, at1]);
await frame([0, 0, 0], 50, 40);
await p.waitForTimeout(300);
const at2 = await spot();
check("обзор камеры уже — стол крупнее (обзор берётся из приложения)", at2.k > at0.k * 1.2, [at0, at2]);

await p.locator('[data-ar-do="exit"]').click();
await p.waitForTimeout(300);
const after = await p.evaluate(() => ({ calls: window.__arCalls, body: document.body.style.background, floor: document.querySelectorAll("[data-ar-floor]").length }));
check("вышел из AR — камеру выключили, фоны вернулись", JSON.stringify(after.calls) === "[true,false]" && after.body === "" && after.floor === 0, after);

// ── вход по пропуску ─────────────────────────────────────────────────────────────────────────────
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);
const f = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 7, first_name: "Ye" }) };
const sum = Object.keys(f).sort().map((k) => `${k}=${f[k]}`).join("\n");
const initData = new URLSearchParams({ ...f, hash: createHmac("sha256", createHmac("sha256", "WebAppData").update(TOKEN).digest()).update(sum).digest("hex") }).toString();
const web = await new Client(base.replace(/^http/, "ws")).joinOrCreate("table_room", { room, client: "html", door: "telegram", initData, protocol: 2 });
web.onMessage("*", () => {});
const pass = await new Promise((done) => { web.onMessage("app", (one) => done(one.pass)); web.send("hello"); setTimeout(() => web.send("app"), 300); });
const app = await page(`${base}/table/?room=${room}&pass=${encodeURIComponent(pass)}`);
await app.waitForSelector("[data-section]", { timeout: 15000 }).catch(() => {});
await app.waitForTimeout(800);
const owners = await app.evaluate(() => window.__tableState?.().chairs.filter((c) => c.owner === "tg:7").length ?? -1).catch(() => -1);
check("по ссылке с пропуском страница входит тем же человеком, на тот же стул", owners === 1, owners);
await web.leave();

await browser.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.ok ? "" : ` — ${JSON.stringify(c.got)}`}`);
}
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
