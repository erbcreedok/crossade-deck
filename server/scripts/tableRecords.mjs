// ЗАПИСИ ПАРТИЙ — от игры до просмотра: сыграли партию — у стола есть её запись; ссылка из записи
// открывает страницу именно этой партии, глазами крупье, а в выборе глаз — каждый игрок.
//   TABLE_SECRET=probe TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test CROSSADE_DB_FILE=":memory:" PORT=2597 npx tsx src/index.ts
//   node scripts/tableRecords.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2597";
const secret = process.argv[3] ?? "probe";
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
const open = async (id, name) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message));
  await p.addInitScript((d) => {
    const a = {};
    Object.defineProperty(a, "WebApp", { value: { initData: d, initDataUnsafe: {}, ready() {}, expand() {} } });
    Object.defineProperty(window, "Telegram", { value: a });
  }, initData(id, name));
  await p.goto(`${base}/table/?room=${room}&name=${name}`);
  await p.waitForSelector("[data-section]");
  await p.waitForSelector(".crossade-loading", { state: "detached" });
  await p.waitForTimeout(500);
  return p;
};
const Ye = await open(7, "Ye");
const Bo = await open(8, "Bo");
const state = (p) => p.evaluate(() => JSON.parse(JSON.stringify(window.__tableState())));

// ПАРТИЯ ИЗ ДВУХ ХОДОВ: по карте каждому, оба кладут в круг — руки пусты, партия кончилась.
const seats = (await state(Ye)).chairs.filter((c) => c.owner === "tg:7" || c.owner === "tg:8").map((c) => c.id);
check("раздача принята", (await (await ask(`/table/rooms/${room}/run`, { method: "POST", body: JSON.stringify({ by: "tg:7", command: { t: "deal", rule: "each", n: 1, seats, force: true } }) })).json()).ok === true);
await Ye.waitForTimeout(2500);
for (let i = 0; i < 2; i += 1) {
  const s = await state(Ye);
  const turn = s.play?.turn;
  const page = turn === "tg:7" ? Ye : Bo;
  const card = s.chairs.find((c) => c.owner === turn)?.hand[0]?.id;
  await page.evaluate((id) => {
    window.__tableSend({ t: "grab", id });
    window.__tableSend({ t: "drop", id, to: { in: "deck", pile: "ring" } });
  }, card);
  await page.waitForTimeout(800);
}
await Ye.waitForTimeout(2500); // журнал уходит в базу пачкой раз в две секунды

// ЗАПИСИ СТОЛА — то, что покажет бот и страница «Все столы».
const got = await (await ask(`/table/rooms/${room}/records`)).json();
const matches = got.sessions?.flatMap((s) => s.matches) ?? [];
check("у стола есть запись доигранной партии", matches.length === 1 && matches[0].to !== null, matches);
check("в ней оба игрока", JSON.stringify([...(matches[0]?.players ?? [])].sort()) === JSON.stringify(["tg:7", "tg:8"]), matches[0]);

// ССЫЛКА — как её соберёт бот: пропуск записи и границы партии.
const m = matches[0];
const url = `${base}/table/replay?room=${room}&pass=${encodeURIComponent(got.pass)}&from=${m.from}&to=${m.to}`;
const R = await browser.newPage({ viewport: { width: 1000, height: 800 } });
const errors = [];
R.on("pageerror", (e) => errors.push(e.message));
await R.goto(url);
await R.waitForTimeout(2500);
const eyes = await R.evaluate(() => [...document.querySelectorAll("#eyes option")].map((o) => ({ key: o.value, text: o.textContent, on: o.selected })));
check("страница записи открылась без ошибок", errors.length === 0, errors);
check("по умолчанию — глазами крупье", eyes.find((o) => o.on)?.text?.includes("крупье") === true, eyes);
check("в выборе глаз — оба игрока", ["tg:7", "tg:8"].every((k) => eyes.some((o) => o.key === k)), eyes);
const steps = await R.evaluate(() => Number(document.getElementById("bar")?.max ?? -1));
check("лента — одна эта партия, а не вся посиделка", steps > 0 && steps < 60, steps);
await R.screenshot({ path: process.argv[4] ?? "records.png" });

await browser.close();
for (const one of checks) console.log(one.ok ? "✓" : "✗", one.name, one.ok ? "" : JSON.stringify(one.got));
console.log(`${checks.filter((one) => one.ok).length}/${checks.length}`);
if (checks.some((one) => !one.ok)) process.exitCode = 1;
