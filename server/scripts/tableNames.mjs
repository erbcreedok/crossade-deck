// ИМЕНА СТОЛОВ — стол зовётся по чату, вне чата берёт имя похода, одинаковых имён у живых комнат не бывает,
// и имя видно в шапке самого стола.
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableNames.mjs [base] [secret]
import { createHmac } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const secret = process.argv[3] ?? "dev";
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

const api = async (method, path, body) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-table-secret": secret },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.status === 200 ? res.json() : { status: res.status };
};
const open = (chat, chatTitle, title) => api("POST", "/table/rooms", { home: { kind: "chat", chat, chatTitle }, by: "tg:1", ...(title ? { title } : {}) });
const chat = `night-${Date.now()}`;

const one = await open(chat, "Чат пиццы");
check("имя стола — по названию чата", one.title === "Стол «Чат пиццы»", one.title);

const two = await open(chat, "Чат пиццы");
check("второй такой же — с префиксом [2]", two.title === "[2] Стол «Чат пиццы»", two.title);
const three = await open(chat, "Чат пиццы");
check("третий — [3]", three.title === "[3] Стол «Чат пиццы»", three.title);

await api("DELETE", `/table/rooms/${two.room}`);
const again = await open(chat, "Чат пиццы");
check("закрыли [2] — номер снова свободен", again.title === "[2] Стол «Чат пиццы»", again.title);

const nameless = await open(`${chat}-inline`, undefined);
check("без названия чата — имя похода", /^Стол «[^»]+ [^»]+»$/.test(nameless.title) && nameless.title !== "Стол «»", nameless.title);

const renamed = await api("PATCH", `/table/rooms/${three.room}`, { title: "Стол «Чат пиццы»" });
check("переименование в занятое имя — тоже с номером", renamed.title === "[3] Стол «Чат пиццы»", renamed.title);

const all = await api("GET", `/table/rooms?chat=${chat}`);
const titles = (Array.isArray(all) ? all : all.rooms ?? []).map((c) => c.title);
check("у живых комнат одинаковых имён нет", titles.length > 0 && new Set(titles).size === titles.length, titles);

// МОИ СТОЛЫ: и те, что я открыл, и те, за которыми сижу.
const byMe = await api("GET", `/table/rooms?by=tg:1`);
check("столы, которые я открыл, в моём списке", Array.isArray(byMe) && byMe.some((c) => c.room === one.room), byMe?.length);
check("карточка говорит, кто админ", Array.isArray(byMe) && byMe.every((c) => c.by === "tg:1"), byMe?.[0]);
const foreign = await api("POST", "/table/rooms", { home: { kind: "chat", chat: `${chat}-чужой`, chatTitle: "Чужой" }, by: "tg:99" });
check("чужой стол в мой список не попал", !(await api("GET", `/table/rooms?by=tg:1`)).some((c) => c.room === foreign.room));

// Плашка в шапке стола.
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
p.on("pageerror", (e) => console.log("ERROR", e.message));
await p.route("https://telegram.org/**", (r) => r.abort());
await p.goto(`${base}/table/?room=${one.room}&name=A`);
await p.waitForSelector(".crossade-loading", { state: "detached" });
await p.waitForSelector("[data-table-name]");
check("имя комнаты — плашкой в шапке стола", (await p.textContent("[data-table-name]")).trim() === "Стол «Чат пиццы»", await p.textContent("[data-table-name]"));
const plate = await p.locator("[data-table-name] span").boundingBox();
const gear = await p.locator("[data-settings]").boundingBox();
check("плашка не наезжает на шестерёнку", plate.x >= gear.x + gear.width, { plate, gear });

// СЕЛ ЗА ЧУЖОЙ СТОЛ — он появляется в моём списке, но админом я там не становлюсь. Заходим настоящей
// дверью Telegram: `initData` подписан тем же токеном, с каким поднят тестовый сервер.
const initData = (() => {
  const user = JSON.stringify({ id: 1, first_name: "Админ" });
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), query_id: "AA", user };
  const check2 = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update("test").digest();
  return new URLSearchParams({ ...fields, hash: createHmac("sha256", key).update(check2).digest("hex") }).toString();
})();
const guest = await browser.newPage({ viewport: { width: 390, height: 844 } });
await guest.route("https://telegram.org/**", (r) => r.abort());
await guest.addInitScript((data) => {
  window.Telegram = {
    WebApp: {
      initData: data, initDataUnsafe: {}, platform: "ios", version: "8.0",
      ready() {}, expand() {}, disableVerticalSwipes() {}, isVersionAtLeast: () => true,
      onEvent() {}, SettingsButton: { show() {}, onClick() {} },
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
    },
  };
}, initData);
await guest.goto(`${base}/table/?room=${foreign.room}`);
await guest.waitForSelector(".crossade-loading", { state: "detached" });
await guest.waitForTimeout(600);
const withMe = await api("GET", `/table/rooms?by=tg:1`);
const seated = withMe.find((c) => c.room === foreign.room);
check("стол, за которым я сижу, в моём списке есть", Boolean(seated), withMe.map((c) => c.title));
check("…но админ там не я", seated?.by === "tg:99", seated?.by);
await browser.close();

for (const room of [one.room, three.room, again.room, nameless.room, foreign.room]) await api("DELETE", `/table/rooms/${room}`);

for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
console.log(`tableNames ${checks.filter((c) => c.ok).length}/${checks.length}`);
process.exit(checks.every((c) => c.ok) ? 0 : 1);
