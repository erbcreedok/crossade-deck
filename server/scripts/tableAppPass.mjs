// ПРОПУСК В ПРИЛОЖЕНИЕ: вошедший через Telegram берёт в настройках пропуск, переход на маке зовёт
// `crossade://table` с комнатой, пропуском и адресом, и с этим пропуском за стол входит тот же человек на
// тот же стул. Гостю раздела нет; подделанный пропуск не пускает.
//   TABLE_SECRET=probe TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test CROSSADE_DB_FILE=":memory:" PORT=2597 npx tsx src/index.ts
//   node scripts/tableAppPass.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");
const { Client } = require("colyseus.js");

const base = process.argv[2] ?? "http://localhost:2597";
const secret = process.argv[3] ?? "probe";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "test";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
function initData(id, name) {
  const f = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: name, username: name.toLowerCase() }) };
  const sum = Object.keys(f).sort().map((k) => `${k}=${f[k]}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  return new URLSearchParams({ ...f, hash: createHmac("sha256", key).update(sum).digest("hex") }).toString();
}

const browser = await chromium.launch();
const open = async (tg, name) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message));
  if (tg !== null) {
    await p.addInitScript((d) => {
      window.__opened = [];
      const a = {};
      Object.defineProperty(a, "WebApp", { value: { initData: d, initDataUnsafe: {}, ready() {}, expand() {}, openLink: (u) => window.__opened.push(u) } });
      Object.defineProperty(window, "Telegram", { value: a });
    }, initData(tg, name));
  }
  await p.goto(`${base}/table/?room=${room}&name=${name}`);
  await p.waitForSelector("[data-section]");
  await p.waitForSelector(".crossade-loading", { state: "detached" });
  return p;
};

const Ye = await open(7, "Ye");
await Ye.click("[data-settings]");
await Ye.click('[data-look="app"]');
await Ye.waitForSelector('[data-look="appOpen"]', { timeout: 5000 }).catch(() => {});
check("пропуск пришёл — кнопка «Открыть в приложении»", (await Ye.$('[data-look="appOpen"]')) !== null);
await Ye.click('[data-look="appOpen"]').catch(() => {});
const opened = await Ye.evaluate(() => window.__opened);
check("открывается наружу через Telegram — одна ссылка", opened.length === 1, opened);
const link = new URL(opened[0] ?? "http://x/");
check("ссылка — переход на маке с комнатой, пропуском и адресом", link.pathname === "/table/app" && link.searchParams.get("room") === room && !!link.searchParams.get("pass") && link.searchParams.get("host") === base, link.toString());

const page = await (await fetch(link)).text();
check("переход зовёт crossade://table с той же строкой", page.includes('"crossade://table"+location.search'));

const pass = link.searchParams.get("pass");
const client = new Client(base.replace(/^http/, "ws"));
const app = await client.joinOrCreate("table_room", { room, client: "unity", door: "app", pass, protocol: 2 }).catch((e) => e);
const welcome = app instanceof Error ? { you: { error: app.message }, snapshot: { chairs: [] } } : await new Promise((done) => {
  app.onMessage("welcome", done);
  app.onMessage("*", () => {});
  app.send("hello");
});
check("приложение вошло тем же человеком", welcome.you.key === "tg:7" && welcome.you.name === "Ye", welcome.you);
const web = await Ye.evaluate(() => JSON.parse(JSON.stringify(window.__tableState())));
const seatOf = (s) => s.chairs.filter((c) => c.owner === "tg:7").map((c) => c.id);
check("на тот же стул — второго стула не завелось", JSON.stringify(seatOf(welcome.snapshot)) === JSON.stringify(seatOf(web)) && seatOf(web).length === 1, [seatOf(welcome.snapshot), seatOf(web)]);
if (!(app instanceof Error)) await app.leave();
await Ye.waitForTimeout(400);
check("приложение ушло — веб за столом остался", seatOf(await Ye.evaluate(() => JSON.parse(JSON.stringify(window.__tableState())))).length === 1);

const forged = pass.replace(/^[^.]+/, Buffer.from(JSON.stringify({ key: "tg:9", name: "Чужой" })).toString("base64url"));
const refused = await client.joinOrCreate("table_room", { room, client: "unity", door: "app", pass: forged, protocol: 2 }).then(() => "вошёл", (e) => e.message);
check("подделанный пропуск не пускает", refused !== "вошёл", refused);

const guest = await open(null, "Гость");
await guest.click("[data-settings]");
check("гостю раздела «Приложение» нет", (await guest.$('[data-look="app"]')) === null);

await browser.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.ok ? "" : ` — ${JSON.stringify(c.got)}`}`);
}
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
