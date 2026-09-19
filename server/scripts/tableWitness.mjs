// ЭКРАН РАССКАЗЫВАЕТ О СЕБЕ, И РАССКАЗ ДОЕЗЖАЕТ ДО ЖУРНАЛА.
//
// Шов проверяется целиком и только живьём: страница в настоящем браузере → сообщение по сети →
// летопись комнаты → строка в базе → маршрут журнала. Тут нечего проверять в отдельности — каждое
// звено по себе уже закрыто своим прогоном, а сломаться может ровно стык.
//
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableWitness.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const secret = process.argv[3] ?? "dev";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);

const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

await fetch(`${base}/table/rooms`, {
  method: "POST",
  headers: { "x-table-secret": secret, "content-type": "application/json" },
  body: JSON.stringify({ by: "tg:1", home: { kind: "inline", message: "m" }, kind: "krest", room }),
});

/** Спросить журнал. Рассказ уходит пачкой и ложится пачкой — поэтому ждём, а не смотрим один раз. */
const journal = async () => {
  const res = await fetch(`${base}/table/journal?room=${room}&limit=2000`, { headers: { "x-table-secret": secret } });
  return res.ok ? (await res.json()).deeds : [];
};
const until = async (has, tries = 60) => {
  for (let i = 0; i < tries; i += 1) {
    const deeds = await journal();
    if (has(deeds)) return deeds;
    await new Promise((r) => setTimeout(r, 250));
  }
  return journal();
};
const of = (deeds, kind) => deeds.filter((d) => d.kind === kind);

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
p.on("pageerror", (e) => console.log("ERROR", e.message));
await p.goto(`${base}/table/?room=${room}&name=A`);
await p.waitForSelector("[data-section]");
await p.waitForTimeout(800);

// 1. ОТКРЫТИЕ. Стол знает, что комната открылась и человек вошёл, — это его собственная правда.
{
  const deeds = await until((d) => of(d, "join").length > 0);
  check("стол записал открытие комнаты", of(deeds, "room.open").length === 1, of(deeds, "room.open").length);
  check("стол записал вход человека", of(deeds, "join").length === 1, of(deeds, "join").length);
  check("записи стола помечены столом", deeds.every((d) => d.side === "table" || d.side === "screen"), deeds[0]?.side);
}

// 2. РАССКАЗ ЭКРАНА. Того, что видел человек, на сервере нет и быть не может — это приезжает с него.
{
  const deeds = await until((d) => of(d, "open").length > 0);
  const open = of(deeds, "open")[0];
  check("экран рассказал, что открылся", Boolean(open), null);
  check("…и рассказ помечен экраном, а не столом", open?.side === "screen", open?.side);
  check("…и в нём размер экрана человека", open?.what?.w === 390 && open?.what?.h === 844, open?.what);
}

// 3. НАЖАТИЕ. Ради него всё и затевалось: на сервере нажатия нет, если оно ничего не сделало.
{
  await p.mouse.click(195, 700);
  const deeds = await until((d) => of(d, "press").length > 0);
  check("нажатие человека доехало до журнала", of(deeds, "press").length > 0, of(deeds, "press").length);
  check("…и в нём записано, во что он ткнул", typeof of(deeds, "press")[0]?.what?.g === "string", of(deeds, "press")[0]?.what);
}

// 4. НАЖАТИЕ ВПУСТУЮ. Ткнули в пустое место сукна — стол не шелохнулся, и это ДОЛЖНО быть видно.
{
  await p.mouse.click(10, 300);
  const deeds = await until((d) => of(d, "press.idle").length > 0);
  check("нажатие впустую отмечено отдельно", of(deeds, "press.idle").length > 0, of(deeds, "press.idle").length);
}

// 5. ЗВУК. Единственная правда, которую вообще можно знать: пустил ли браузер звук.
{
  const deeds = await until((d) => of(d, "sound").length > 0, 80);
  const sound = of(deeds, "sound")[0];
  check("состояние звука доехало", Boolean(sound), null);
  check("…и это настоящее состояние звуковой машины", ["none", "running", "suspended", "closed"].includes(sound?.what?.state), sound?.what);
}

// 6. ПАДЕНИЕ. Ошибка на странице не теряется — иначе о ней не узнать никогда.
{
  await p.evaluate(() => setTimeout(() => { throw new Error("нарочно-упал"); }, 0));
  const deeds = await until((d) => of(d, "boom").length > 0);
  const boom = of(deeds, "boom")[0];
  check("падение страницы доехало до журнала", Boolean(boom), null);
  check("…с текстом ошибки", /нарочно-упал/.test(boom?.what?.text ?? ""), boom?.what);
}

// 7. ЖУРНАЛ НЕ ДЛЯ ПОСТОРОННИХ. В нём ключи людей и их ошибки.
{
  const open = await fetch(`${base}/table/journal?room=${room}`);
  check("без секрета журнал не отдаётся", open.status === 401 || open.status === 403, open.status);
}

await browser.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(c.ok ? "  ok" : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
}
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
