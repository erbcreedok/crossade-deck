// «МОИ КОМНАТЫ» — мини-апп без ссылки на стол открывает список комнат человека: создал, распорядитель,
// сидел, стол его чата; чужого нет, закрытая — отдельно и только записью. Тап — в стол, «назад» Telegram
// — к списку. Прямая ссылка на стол открывает стол. Ярлык на домашний экран — пока Telegram его умеет.
//   TABLE_SECRET=probe TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test CROSSADE_DB_FILE=":memory:" PORT=2597 npx tsx src/index.ts
//   node scripts/tableMyRooms.mjs [base] [secret]
import { createHmac } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2597";
const secret = process.argv[3] ?? "probe";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "test";
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const ask = (p, i = {}) => fetch(base + p, { ...i, headers: { "x-table-secret": secret, "content-type": "application/json" } });
const tag = Math.random().toString(36).slice(2, 7);
const open = async (by, chat, title) => (await (await ask("/table/rooms", { method: "POST", body: JSON.stringify({ by, home: { kind: "chat", chat: `${chat}-${tag}`, chatTitle: `Чат ${chat}` }, title: `${title} ${tag}` }) })).json()).room;
function initData(id, name, start) {
  const f = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: name }), ...(start ? { start_param: start } : {}) };
  const sum = Object.keys(f).sort().map((k) => `${k}=${f[k]}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  return new URLSearchParams({ ...f, hash: createHmac("sha256", key).update(sum).digest("hex") }).toString();
}

const owned = await open("tg:7", "a", "Мой");
const adminOf = await open("tg:9", "b", "Админ");
await ask(`/table/rooms/${adminOf}/admins`, { method: "POST", body: JSON.stringify({ by: "tg:9", key: "tg:7", on: true }) });
const sameChat = await open("tg:9", "a", "Соседний");
const stranger = await open("tg:9", "z", "Чужой");
const closed = await open("tg:9", "c", "Закрытый");

const browser = await chromium.launch();
/** Телефон в Telegram: подпись, запуск без стола или со столом, ярлык со статусом `home`. */
const phone = async (id, name, { start, home = "unknown", path = "/table/" } = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.addInitScript(([d, start, home]) => {
    const on = {};
    const fire = (n, e) => (on[n] ?? []).forEach((f) => f(e));
    window.__tg = { added: 0, back: 0 };
    const app = {
      initData: d, initDataUnsafe: start ? { start_param: start } : {}, platform: "ios", version: "8.0",
      ready() {}, expand() {}, isVersionAtLeast: (v) => Number(v) <= 8,
      onEvent: (n, f) => (on[n] ??= []).push(f),
      addToHomeScreen() { window.__tg.added += 1; fire("homeScreenAdded"); },
      checkHomeScreenStatus() { setTimeout(() => fire("homeScreenChecked", { status: home }), 50); },
      BackButton: { show() { window.__tg.back = 1; }, onClick(f) { window.__tg.goBack = f; } },
      requestFullscreen() {}, isFullscreen: false,
    };
    const a = {};
    Object.defineProperty(a, "WebApp", { value: app });
    Object.defineProperty(window, "Telegram", { value: a });
  }, [initData(id, name, start), start ?? null, home]);
  await p.goto(`${base}${path}`);
  await p.waitForTimeout(1500);
  return { p, errors, ctx };
};
const listed = (p) => p.evaluate(() => [...document.querySelectorAll("[data-room]")].map((b) => ({ room: b.dataset.room, text: b.innerText.replace(/\s+/g, " "), h: b.getBoundingClientRect().height })));

// Ye (tg:7) сидел в «Закрытом» — после этого его закрыли.
{
  const { p, ctx } = await phone(7, "Ye", { start: closed });
  await p.waitForSelector("[data-section]", { timeout: 15000 });
  await p.waitForTimeout(2500);
  await ctx.close();
  await ask(`/table/rooms/${closed}`, { method: "DELETE" });
}

// ЗАПУСК БЕЗ СТОЛА — «Мои комнаты».
const { p, errors, ctx } = await phone(7, "Ye");
const rooms = await listed(p);
const of = (room) => rooms.find((r) => r.room === room)?.text ?? "";
check("без ссылки на стол — «Мои комнаты», а не ошибка", (await p.$("[data-rooms]")) !== null && (await p.$("[data-section]")) === null, await p.evaluate(() => document.body.innerText.slice(0, 200)));
check("создал — со своим основанием", of(owned).includes("создал"), of(owned));
check("распорядитель — со своим основанием", of(adminOf).includes("распорядитель"), of(adminOf));
check("стол чата, где он бывал за столом, — «из чата» с именем чата", of(sameChat).includes("из чата «Чат a»"), of(sameChat));
check("чужой стол чужого чата не показан", !rooms.some((r) => r.room === stranger), rooms.map((r) => r.text));
check("закрытая — не среди действующих", !rooms.some((r) => r.room === closed), rooms.map((r) => r.room));
const closedRow = await p.evaluate((room) => document.querySelector(`[data-closed="${room}"]`)?.innerText ?? null, closed);
check("закрытая — отдельно, в «Закрытые — только записи»", closedRow !== null && (await p.textContent("[data-rooms]")).includes("Закрытые — только записи"), closedRow);
check("без дублей: одна строка на комнату", new Set(rooms.map((r) => r.room)).size === rooms.length, rooms.length);
check("строки под палец (≥ 56px)", rooms.every((r) => r.h >= 56), rooms.map((r) => r.h));
check("телефон: прокрутки вбок нет", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector("[data-rooms]").scrollWidth <= innerWidth));

// ЯРЛЫК: статус «unknown» (так отвечает iPhone) — кнопка есть; нажали — Telegram спросил и сказал «добавлен».
check("ярлык: Telegram умеет — кнопка «на главный экран» есть", (await p.$("[data-add-home]")) !== null);
await p.tap("[data-add-home]");
await p.waitForTimeout(200);
check("ярлык: кнопка зовёт addToHomeScreen, после «добавлен» кнопки нет", (await p.evaluate(() => window.__tg.added)) === 1 && (await p.$("[data-add-home]")) === null);
await p.screenshot({ path: `${process.env.SHOTS ?? "."}/my-rooms.png` });

// ИЗ СПИСКА — В СТОЛ, «НАЗАД» — К СПИСКУ.
await p.tap(`[data-room="${owned}"]`);
await p.waitForSelector("[data-section]", { timeout: 15000 });
const inTable = await p.evaluate(() => ({ url: location.search, back: window.__tg.back }));
check("тап по комнате — в этот стол, кнопка «назад» Telegram показана", inTable.url.includes(`room=${owned}`) && inTable.back === 1, inTable);
await p.evaluate(() => window.__tg.goBack());
await p.waitForSelector("[data-rooms]", { timeout: 10000 });
check("«назад» — снова «Мои комнаты»", (await listed(p)).length === rooms.length);
check("без ошибок страницы", errors.length === 0, errors);
await ctx.close();

// ПРЯМАЯ ССЫЛКА — ИМЕННО ЭТОТ СТОЛ.
{
  const { p, ctx } = await phone(7, "Ye", { start: adminOf });
  await p.waitForSelector("[data-section]", { timeout: 15000 });
  check("прямая ссылка на стол открывает этот стол, а не список", (await p.$("[data-rooms]")) === null && (await p.evaluate(() => JSON.stringify(window.__tableState?.()?.people ?? []))).includes("Ye"));
  await ctx.close();
}
// ПРЯМАЯ ССЫЛКА НА ЗАКРЫТЫЙ — «Стол закрыт», и он не ожил.
{
  const { p, ctx } = await phone(7, "Ye", { start: closed });
  await p.waitForTimeout(2500);
  check("прямая ссылка на закрытый — «Стол закрыт», не ожил", (await p.textContent("#note")).includes("Стол закрыт") && !((await (await ask("/table/rooms?by=tg:9")).json()).some((r) => r.room === closed)));
  await ctx.close();
}
// НИКОГО НЕ ЗНАЕТ — пусто и понятно, что делать; ярлык, который Telegram не умеет, — без кнопки.
{
  const { p, ctx } = await phone(77, "Новый", { home: "unsupported" });
  await p.waitForTimeout(300);
  check("пустой список — подсказка, как открыть стол", (await p.textContent("[data-rooms]")).includes("/table"));
  check("ярлык не поддержан — кнопки нет", (await p.$("[data-add-home]")) === null);
  await ctx.close();
}
// БЕЗ TELEGRAM — не угадывает, кто ты.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const q = await ctx.newPage();
  await q.goto(`${base}/table/`);
  await q.waitForTimeout(1200);
  check("без Telegram — просьба открыть из Telegram, а не чужой список", (await q.textContent("[data-rooms]")).includes("из Telegram"));
  await ctx.close();
}
await browser.close();
for (const one of checks) console.log(one.ok ? "✓" : "✗", one.name, one.ok ? "" : JSON.stringify(one.got).slice(0, 400));
console.log(`${checks.filter((one) => one.ok).length}/${checks.length}`);
if (checks.some((one) => !one.ok)) process.exitCode = 1;
