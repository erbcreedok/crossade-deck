// ЖУРНАЛ ПЕРЕЖИВАЕТ ОБНОВЛЕНИЕ СТРАНИЦЫ.
//
// Журнал собирается на экране — у каждого зрителя свой, чтобы не светить чужие карты. Из-за этого
// обновление страницы стирало партию: поток операций начинался с нуля, и журнал открывался пустым
// посреди игры. Комната держит хвост случившегося и отдаёт его вошедшему, прорезанным под него.
//
// Здесь же проверяется склейка: круг, унесённый крупье ОДНИМ движением, остаётся одной записью и
// после перезагрузки — а не разваливается на строку под каждую карту.
//
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableJournalKeeps.mjs [base] [secret]
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
  await p.goto(`${base}/table/?room=${room}&name=${name}`);
  await p.waitForSelector("[data-section]");
  await p.waitForSelector(".crossade-loading", { state: "detached" });
  await p.waitForTimeout(500);
  return p;
};

const a = await open("Ye", 7);
await open("Батыр");
const state = (p) => p.evaluate(() => JSON.parse(JSON.stringify(window.__tableState())));
/** Строки журнала на экране — тем же путём, каким их читает человек: открыть окно и посмотреть. */
const записи = async (p) => {
  const открыт = await p.evaluate(() => document.querySelector("[data-deed]") !== null);
  if (!открыт) {
    await p.click("[data-journal]");
    await p.waitForTimeout(500);
  }
  return p.evaluate(() => [...document.querySelectorAll("[data-deed]")].map((el) => el.textContent.trim()).filter(Boolean));
};

await ask(`/table/rooms/${room}/run`, { method: "POST", body: JSON.stringify({ by: "tg:7", command: { t: "deal", rule: "krest" } }) });
for (let i = 0; i < 90; i += 1) { if ((await state(a)).play) break; await a.waitForTimeout(300); }
check("партия началась", (await state(a)).play !== null, null);

// ХОД В КРУГ, ПОТОМ КРУПЬЕ УНОСИТ КРУГ ОДНИМ ДВИЖЕНИЕМ.
const st = await state(a);
const мой = st.chairs.find((c) => c.owner === st.you?.key || c.owner === st.people.find((p) => p.name === "Ye")?.key);
const карта = мой.hand[0].id;
await a.evaluate(([id]) => { window.__tableSend({ t: "grab", id }); window.__tableSend({ t: "drop", id, to: { in: "deck", pile: "ring" } }); }, [карта]);
await a.waitForTimeout(700);
await a.evaluate(() => window.__tableSend({ t: "crew", act: "ring" }));
await a.waitForTimeout(1200);

// ЖУРНАЛ СНИМАЕТСЯ, КОГДА СТОЛ ЗАТИХ. Раздача идёт по карте, и строка «раздал» растёт на глазах:
// снимок посреди неё сравнивать не с чем — числа в ней через секунду другие.
const затих = async () => {
  let прошлое = "";
  let подряд = 0;
  for (let ждал = 0; ждал < 30000; ждал += 900) {
    const сейчас = (await записи(a)).join("|");
    // ТРИ ОДИНАКОВЫХ СНИМКА ПОДРЯД: раздача идёт по карте с паузой, и двух совпавших мало — между
    // ними может просто не успеть прилететь следующая карта.
    подряд = сейчас !== "" && сейчас === прошлое ? подряд + 1 : 0;
    if (подряд >= 2) return;
    прошлое = сейчас;
    await a.waitForTimeout(900);
  }
};
await затих();
const до = await записи(a);
check("журнал полон, пока страницу не трогали", до.length > 0, до.length);
const сборДо = до.filter((s) => /себе в руку|в руку/.test(s)).length;

await a.reload();
await a.waitForSelector("[data-section]");
await a.waitForSelector(".crossade-loading", { state: "detached" });
await a.waitForTimeout(1200);

const после = await записи(a);
check("ПОСЛЕ ОБНОВЛЕНИЯ журнал не пуст", после.length > 0, после.length);
// Перезагрузка — это выход и вход, и они честно попадают в журнал. Сверяем не числа, а то, что вся
// прежняя партия на месте: каждая старая запись должна найтись в новом журнале.
const пропало = до.filter((one) => !после.includes(one));
check("вся прежняя партия на месте", пропало.length === 0, пропало.slice(0, 3));
check("а разница — только мой выход и вход", после.filter((one) => !до.includes(one)).every((one) => /вышел|сел за стол/.test(one)), после.filter((one) => !до.includes(one)));
check("сбор круга остался ОДНОЙ записью", после.filter((s) => /себе в руку|в руку/.test(s)).length === сборДо, { до: сборДо, после: после.filter((s) => /в руку/.test(s)).length });

await browser.close();
for (const one of checks) console.log(one.ok ? "ok  " : "FAIL", one.name, one.ok ? "" : JSON.stringify(one.got));
const bad = checks.filter((one) => !one.ok).length;
console.log(bad === 0 ? `\nвсё сошлось: ${checks.length}` : `\nпровалов: ${bad} из ${checks.length}`);
process.exit(bad === 0 ? 0 : 1);
