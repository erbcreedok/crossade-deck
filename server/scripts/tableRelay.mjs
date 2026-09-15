// СТОЛ ПОД АДРЕСОМ РЕЛЕ — Mini App открыт на постоянном адресе (`/t` на Fly), без переадресации: адрес
// страницы остаётся адресом реле, а скрипт, картинки, звуки и комната — с мака.
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2598 npx tsx src/index.ts   (реле)
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts   (мак)
//   node scripts/tableRelay.mjs [реле] [мак] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const relay = process.argv[2] ?? "http://localhost:2598";
const mac = process.argv[3] ?? "http://127.0.0.1:2599";
const secret = process.argv[4] ?? "dev";
await fetch(`${relay}/relay/table`, { method: "POST", headers: { "content-type": "application/json", "x-table-secret": secret }, body: JSON.stringify({ url: mac, boot: "e2e" }) });
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);

const browser = await chromium.launch();
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const open = async (name) => {
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const bad = [];
  p.on("pageerror", (e) => bad.push(e.message));
  p.on("requestfailed", (r) => bad.push(`${r.url()} ${r.failure()?.errorText}`));
  p.on("response", (r) => r.status() >= 400 && bad.push(`${r.url()} ${r.status()}`));
  const hits = [];
  p.on("request", (r) => hits.push(r.url()));
  await p.goto(`${relay}/t/?room=${room}&name=${name}`);
  await p.waitForSelector("[data-section]", { timeout: 20000 });
  await p.waitForSelector(".crossade-loading", { state: "detached" });
  await p.waitForTimeout(800);
  return { p, bad, hits };
};
const A = await open("A");
const B = await open("B");
check("адрес страницы — реле, переадресации нет", A.p.url().startsWith(`${relay}/t/`), A.p.url());
check("скрипт и карты — с мака", A.hits.some((u) => u.startsWith(`${mac}/table/app.js`)) && A.hits.some((u) => u.startsWith(`${mac}/table/cards/`)), A.hits.filter((u) => u.includes("/table/")).slice(0, 5));
check("ни одной ошибки и ни одного отказа", A.bad.length === 0 && B.bad.length === 0, [A.bad, B.bad]);
await A.p.mouse.click(60, 300);
const spots = JSON.parse(await A.p.getAttribute("canvas", "data-spots"));
await A.p.mouse.move(spots.deckTop.x, spots.deckTop.y);
await A.p.mouse.down();
await A.p.mouse.move(spots.middle.x - 80, spots.middle.y - 40, { steps: 8 });
await A.p.mouse.up();
await B.p.waitForTimeout(1200);
const bFelt = JSON.parse(await B.p.getAttribute("canvas", "data-spots")).felt.length;
check("карта A доехала до B", bFelt === 1, bFelt);
const sounds = await A.p.evaluate(() => performance.getEntriesByType("resource").map((r) => r.name).filter((n) => n.includes("/table/sounds/")));
check("звуки — с мака", sounds.length > 0 && sounds.every((n) => n.startsWith(mac)), sounds);

for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
console.log(`tableRelay ${checks.filter((c) => c.ok).length}/${checks.length}`);
await browser.close();
process.exit(checks.every((c) => c.ok) ? 0 : 1);
