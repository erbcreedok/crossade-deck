// ССЫЛКА НА ЗАПИСЬ ПАРТИИ — из настроек, распорядителю.
//
// Запись партии сервер пишет всегда, но достать её можно было только ключом от всех комнат. Пропуск
// живёт отдельно: открывает одну эту запись и пересылается, не отдавая ключ.
//
// Здесь проверяется вся дорога: кнопка есть только у распорядителя, ссылка приходит, она открывается
// и показывает ту самую партию — а гостю кнопки нет вовсе.
//
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableReplayLink.mjs [base] [secret]
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
const open = async (name, tg) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message));
  if (tg) await p.addInitScript((d) => {
    const a = {};
    Object.defineProperty(a, "WebApp", { value: { initData: d, initDataUnsafe: {}, ready() {}, expand() {} } });
    Object.defineProperty(window, "Telegram", { value: a });
  }, initData(tg, name));
  await p.goto(`${base}/table/?room=${room}${tg ? "" : `&name=${name}`}`);
  await p.waitForSelector("[data-section]");
  await p.waitForSelector(".crossade-loading", { state: "detached" });
  await p.waitForTimeout(500);
  return p;
};

const хозяин = await open("Ye", 7);
const гость = await open("Боря");

/** Открыть настройки тем же жестом, что и человек — тапом по шестерёнке. */
const настройки = async (p) => {
  await p.click("[data-settings]");
  await p.waitForTimeout(400);
};

await настройки(хозяин);
check("кнопка записи есть у распорядителя", await хозяин.evaluate(() => document.querySelector('[data-look="replay"]') !== null), null);

await настройки(гость);
check("а у гостя её нет", await гость.evaluate(() => document.querySelector('[data-look="replay"]') === null), null);

// Сделаем, что записывать: раздача и пара ходов машин.
await ask(`/table/rooms/${room}/run`, { method: "POST", body: JSON.stringify({ by: "tg:7", command: { t: "bots", n: 2 } }) });
await хозяин.waitForTimeout(2500);
await ask(`/table/rooms/${room}/run`, { method: "POST", body: JSON.stringify({ by: "tg:7", command: { t: "deal", rule: "krest" } }) });
await хозяин.waitForTimeout(12000);

await хозяин.click('[data-look="replay"]');
await хозяин.waitForTimeout(1200);
const ссылка = await хозяин.evaluate(() => document.querySelector("[data-replay-link]")?.getAttribute("href") ?? null);
check("ссылка пришла и показана целиком", typeof ссылка === "string" && ссылка.includes("pass="), ссылка);

if (ссылка) {
  // ССЫЛКА ОТКРЫВАЕТСЯ САМА ПО СЕБЕ — без ключа от комнат и без входа за стол.
  const запись = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const ошибки = [];
  запись.on("pageerror", (e) => ошибки.push(e.message));
  await запись.goto(ссылка);
  await запись.waitForTimeout(3000);
  const текст = await запись.evaluate(() => document.body.innerText.slice(0, 400));
  check("запись открылась без ошибок", ошибки.length === 0, ошибки);
  check("и в ней видна эта партия", !/не найдено|нет доступа|ошибка/i.test(текст), текст.replace(/\n/g, " | ").slice(0, 160));
}

await browser.close();
for (const one of checks) console.log(one.ok ? "ok  " : "FAIL", one.name, one.ok ? "" : JSON.stringify(one.got));
const bad = checks.filter((one) => !one.ok).length;
console.log(bad === 0 ? `\nвсё сошлось: ${checks.length}` : `\nпровалов: ${bad} из ${checks.length}`);
process.exit(bad === 0 ? 0 : 1);
