// КНОПКИ ПОД РУКОЙ ИГРОКА БЕЗ ЧЕЛОВЕКА ЖИВУТ И ПОСЛЕ ОБНОВЛЕНИЯ СТРАНИЦЫ.
//
// Окно под рукой машины («Походи», «Оборвать мысль», «Увести») рисуется по состоянию игроков без
// человека. Пока оно рассылалось только ПО СОБЫТИЮ, обновивший страницу не знал, что за стулом
// машина: значок пропадал, а с ним и кнопки — до первой же её мысли. Управлять ботом было нечем.
//
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableBotActs.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const secret = process.argv[3] ?? "dev";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "test";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);

const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const ask = (p, i = {}) => fetch(base + p, { ...i, headers: { "x-table-secret": secret, "content-type": "application/json" } });
function initData(id, name) {
  const f = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: name, username: name.toLowerCase() }) };
  const sum = Object.keys(f).sort().map((k) => `${k}=${f[k]}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  return new URLSearchParams({ ...f, hash: createHmac("sha256", key).update(sum).digest("hex") }).toString();
}

await ask("/table/rooms", { method: "POST", body: JSON.stringify({ by: "tg:7", home: { kind: "inline", message: "m" }, kind: "krest", room }) });

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
p.on("pageerror", (e) => console.log("ERROR", e.message));
await p.addInitScript((d) => {
  const a = {};
  Object.defineProperty(a, "WebApp", { value: { initData: d, initDataUnsafe: {}, ready() {}, expand() {} } });
  Object.defineProperty(window, "Telegram", { value: a });
}, initData(7, "Ye"));
await p.goto(`${base}/table/?room=${room}&name=Ye`);
await p.waitForSelector("[data-section]");
await p.waitForSelector(".crossade-loading", { state: "detached" });
await p.waitForTimeout(600);

// САЖАЕМ МАШИНУ И ОТКРЫВАЕМ ЕЁ РУКУ.
await ask(`/table/rooms/${room}/run`, { method: "POST", body: JSON.stringify({ by: "tg:7", command: { t: "bots", n: 1 } }) });
await p.waitForTimeout(2500);
const state = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__tableState())));
const стул = (await state()).chairs.find((c) => c.owner?.startsWith("bot:игрок"));
check("машина села за стол", стул !== undefined, (await state()).chairs.map((c) => c.owner));

/**
 * ОТКРЫТЬ ОКНО СТУЛА ТЕМ ЖЕ ЖЕСТОМ, ЧТО И ЧЕЛОВЕК, — тапом по аватару, а не через внутренности
 * экрана: проверяется то, что видит игрок, а не то, что думает код.
 */
const кнопки = async (chair) => {
  const открыто = await p.evaluate((id) => document.querySelector(`[data-mind-acts][data-chair="${id}"]`) !== null, chair);
  if (!открыто) {
    const sp = JSON.parse(await p.getAttribute("canvas", "data-spots")).seats.find((one) => one.key === chair);
    if (!sp) return ["нет аватара у стула"];
    await p.mouse.click(sp.x, sp.y);
    await p.waitForTimeout(500);
  }
  return p.evaluate((id) => [...document.querySelectorAll(`[data-mind-acts][data-chair="${id}"] [data-bot]`)].map((el) => el.dataset.bot), chair);
};

const до = await кнопки(стул.id);
check("кнопки под рукой машины есть", до.length > 0, до);

await p.reload();
await p.waitForSelector("[data-section]");
await p.waitForSelector(".crossade-loading", { state: "detached" });
await p.waitForTimeout(1500);

const после = await кнопки(стул.id);
check("ПОСЛЕ ОБНОВЛЕНИЯ кнопки на месте", после.length > 0, после);
check("и те же самые", JSON.stringify(после) === JSON.stringify(до), { до, после });
check("среди них «увести»", после.includes("kick"), после);

await browser.close();
for (const one of checks) console.log(one.ok ? "ok  " : "FAIL", one.name, one.ok ? "" : JSON.stringify(one.got));
const bad = checks.filter((one) => !one.ok).length;
console.log(bad === 0 ? `\nвсё сошлось: ${checks.length}` : `\nпровалов: ${bad} из ${checks.length}`);
process.exit(bad === 0 ? 0 : 1);
