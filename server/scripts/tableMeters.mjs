// ИЗМЕРИТЕЛИ — тумблер в настройках показывает пинг, кадры и камеру; выключенный — не показывает ничего,
// и выбор переживает перезагрузку.
//   TABLE_SECRET=probe TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test CROSSADE_DB_FILE=":memory:" PORT=2597 npx tsx src/index.ts
//   node scripts/tableMeters.mjs [base] [secret] [shot.png]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2597";
const secret = process.argv[3] ?? "probe";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("ERROR", e.message));
const ready = async () => {
  await p.waitForSelector("[data-section]");
  await p.waitForSelector(".crossade-loading", { state: "detached" });
  await p.waitForTimeout(400);
};
await p.goto(`${base}/table/?room=${room}&name=Аня`);
await ready();
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const shown = () => p.evaluate(() => { const m = document.querySelector("[data-meters]"); return m && m.style.display !== "none" ? { text: m.textContent, ping: m.dataset.ping, fps: Number(m.dataset.fps) } : null; });

check("по умолчанию измерителей нет", (await shown()) === null);
await p.click("[data-settings]");
check("в настройках есть тумблер отладки", (await p.$("[data-look=meters]")) !== null);
await p.click("[data-look=meters]");
check("тумблер включился", (await p.getAttribute("[data-look=meters]", "aria-checked")) === "true");
await p.click("[data-settings-close]");
await p.waitForTimeout(2300);
const on = await shown();
check("пинг измерен числом", on && /^\d+$/.test(on.ping) && Number(on.ping) < 2000, on);
check("кадры считаются", on && on.fps > 0, on);
check("камера названа: цель, зум, поворот, наклон", on && /камера x/.test(on.text) && /зум/.test(on.text) && /наклон 0°/.test(on.text), on?.text);

// Наклон мышью — строка камеры его видит.
const c = await (await p.$("canvas")).boundingBox();
await p.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
await p.mouse.down({ button: "right" });
await p.mouse.move(c.x + c.width / 2, c.y + c.height / 2 - 200, { steps: 10 });
await p.mouse.up({ button: "right" });
await p.waitForTimeout(1300);
const leaned = await shown();
const lean = Number(/наклон (\d+)°/.exec(leaned?.text ?? "")?.[1]);
check("наклон в строке тот же, что у камеры", lean > 10 && lean === Math.round(Number((await p.getAttribute("canvas", "data-view")).split(",")[4])), [lean, await p.getAttribute("canvas", "data-view")]);
await p.screenshot({ path: process.argv[4] ?? "meters.png" });

await p.reload();
await ready();
await p.waitForTimeout(1300);
check("после перезагрузки измерители на месте", (await shown()) !== null);
await p.click("[data-settings]");
await p.click("[data-look=meters]");
await p.click("[data-settings-close]");
await p.waitForTimeout(300);
check("выключил — исчезли", (await shown()) === null);

await browser.close();
for (const one of checks) console.log(one.ok ? "✓" : "✗", one.name, one.ok ? "" : JSON.stringify(one.got));
console.log(`${checks.filter((one) => one.ok).length}/${checks.length}`);
if (checks.some((one) => !one.ok)) process.exitCode = 1;
