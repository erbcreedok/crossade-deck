// КОЛОДА И ФОН — лица и рубашки из готовых растров, вид колоды меняет админ из бота, за столом — сукно хаба.
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableDeck.mjs [base] [secret]
import { createHmac } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const secret = process.argv[3] ?? "dev";
const TOKEN = "test";
const H = { "content-type": "application/json", "x-table-secret": secret };
const post = async (path, json) => (await fetch(`${base}${path}`, { method: "POST", headers: H, body: JSON.stringify(json) })).json();

const room = (await post("/table/rooms", { home: { kind: "chat", chat: `-${Date.now()}` }, by: "tg:7", title: "Колода" })).room;
const run = (command, by = "tg:7") => post(`/table/rooms/${room}/run`, { by, command });

function initData(id, name) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: name, username: name.toLowerCase() }) };
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  return new URLSearchParams({ ...fields, hash: createHmac("sha256", key).update(check).digest("hex") }).toString();
}

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
p.on("pageerror", (e) => console.log("ERROR", e.message));
const art = [];
p.on("response", (r) => r.url().includes("/table/cards/") && art.push({ url: new URL(r.url()).pathname, status: r.status() }));
await p.addInitScript((data) => {
  const tg = {};
  Object.defineProperty(tg, "WebApp", { value: { initData: data, initDataUnsafe: {}, ready() {}, expand() {} }, writable: false });
  Object.defineProperty(window, "Telegram", { value: tg, writable: false });
}, initData(7, "Admin"));
// Картинки колоды приходят с опозданием: лоадер обязан дождаться последней.
const SLOW = 1500;
await p.route("**/table/cards/**", async (route) => {
  await new Promise((r) => setTimeout(r, SLOW));
  await route.continue();
});
// Каждый кадр: виден ли лоадер и чем нарисована колода — картинкой или бумажной картой.
await p.addInitScript(() => {
  window.__frames = [];
  const tick = () => {
    const sheet = document.querySelector(".crossade-loading:not(.gone)");
    const c = document.querySelector("canvas");
    const spots = c?.dataset.spots && JSON.parse(c.dataset.spots);
    if (spots?.middle) {
      const k = c.width / c.getBoundingClientRect().width;
      const [r, g, b] = c.getContext("2d").getImageData(Math.round(spots.middle.x * k), Math.round(spots.middle.y * k), 1, 1).data;
      window.__frames.push({ covered: Boolean(sheet), light: (r + g + b) / 3 });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
const t0 = Date.now();
await p.goto(`${base}/table/?room=${room}`);
await p.waitForTimeout(SLOW - 500);
const early = await p.evaluate(() => ({ sheet: Boolean(document.querySelector(".crossade-loading:not(.gone)")), label: document.querySelector(".crossade-loading .said")?.textContent, z: document.querySelector(".crossade-loading")?.style.zIndex }));
await p.waitForSelector(".crossade-loading", { state: "detached", timeout: 15000 });
const shownMs = Date.now() - t0;
await p.waitForSelector("[data-section]");
await p.waitForTimeout(300);
const frames = await p.evaluate(() => window.__frames);
const bare = frames.filter((f) => !f.covered);

const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const wait = (ms) => p.waitForTimeout(ms);
const spots = async () => JSON.parse(await p.getAttribute("canvas", "data-spots"));
/** Яркость пикселя холста в точке экрана. */
const canvasAt = (x, y) => p.evaluate(([x, y]) => {
  const c = document.querySelector("canvas");
  const k = c.width / c.getBoundingClientRect().width;
  const [r, g, b, a] = c.getContext("2d").getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
  return { r, g, b, a, light: (r + g + b) / 3 };
}, [x, y]);
const handArt = () => p.evaluate(() => [...document.querySelectorAll("[data-card]")].filter((el) => el.getBoundingClientRect().top > 600).map((el) => ({
  url: el.querySelector("[data-g=art]")?.style.backgroundImage ?? "",
  label: el.querySelector("[aria-label]")?.getAttribute("aria-label"),
  paper: el.textContent,
})));

// ── 0. Лоадер хаба, пока картинки колоды не пришли; открытый стол ни разу не показал бумажную колоду ──
check("лоадер хаба виден, пока картинки в пути", early.sheet && early.label === "Загружаю стол" && early.z === "1000", early);
check("лоадер ушёл только после картинок", shownMs >= SLOW, shownMs);
check("без лоадера колода ни в одном кадре не бумажная", bare.length > 5 && bare.every((f) => f.light > 170), { n: bare.length, worst: bare.reduce((m, f) => Math.min(m, f.light), 999) });

// ── 1. Фон: сукно хаба под прозрачным холстом, трилистники ползут, ромбики мерцают ─────────────────
const g0 = await p.evaluate(() => {
  const felt = document.querySelector("[data-g=ground]");
  const spark = document.querySelector("[data-g=sparkle]");
  return felt && spark && { pos: felt.style.backgroundPosition, image: felt.style.backgroundImage.slice(0, 30), color: getComputedStyle(felt).backgroundColor, spark: spark.style.backgroundPosition, opacity: Number(spark.style.opacity) };
});
await wait(700);
const g1 = await p.evaluate(() => ({ pos: document.querySelector("[data-g=ground]").style.backgroundPosition, spark: document.querySelector("[data-g=sparkle]").style.backgroundPosition, opacity: Number(document.querySelector("[data-g=sparkle]").style.opacity) }));
check("фон: цвет сукна хаба и плитка трилистника", g0 && g0.color === "rgb(23, 61, 45)" && g0.image.startsWith('url("data:image/svg+xml'), g0);
check("фон: трилистники и ромбики ползут", g0 && g0.pos !== g1.pos && g0.spark !== g1.spark, [g0, g1]);
check("фон: ромбики приглушены и мерцают", g0 && g1.opacity > 0.25 && g1.opacity <= 0.55 && g0.opacity !== g1.opacity, [g0?.opacity, g1.opacity]);
check("холст вокруг стола прозрачный — фон виден", (await canvasAt(4, 4)).a === 0, await canvasAt(4, 4));

// ── 2. По умолчанию: рубашка — плед (светлая), лица — классика ────────────────────────────────────
const m = (await spots()).middle;
// Кромка колоды на холсте: у самого края карты — чёрный. Край ищется от середины влево до первого тёмного пикселя.
const rim = await p.evaluate(([x, y]) => {
  const c = document.querySelector("canvas");
  const k = c.width / c.getBoundingClientRect().width;
  const g = c.getContext("2d");
  for (let dx = 0; dx < 60; dx += 0.5) {
    const [r, gg, b] = g.getImageData(Math.round((x - dx) * k), Math.round(y * k), 1, 1).data;
    if ((r + gg + b) / 3 < 40) return { dx, r, g: gg, b };
    if ((r + gg + b) / 3 < 120) return { dx, felt: true, r, g: gg, b };
  }
  return null;
}, [m.x, m.y]);
check("у колоды на столе чёрная кромка", rim && !rim.felt, rim);
check("колода на столе рубашкой-пледом: картинка пришла, пиксель светлый", art.some((a) => a.url === "/table/cards/backs/plaid.webp" && a.status === 200) && (await canvasAt(m.x, m.y)).light > 170, [art.slice(0, 3), await canvasAt(m.x, m.y)]);
for (let i = 0; i < 2; i += 1) {
  await p.mouse.move(m.x, m.y);
  await p.mouse.down();
  await p.mouse.move(195, 720, { steps: 8 });
  await p.mouse.up();
  await wait(700);
}
let hand = await handArt();
check("карты в руке — классика, с рангом в подписи, без бумажной подложки", hand.length === 2 && hand.every((c) => /\/table\/cards\/classic\/(spade|heart|diamond|club)-(\d+|[AJQK])\.webp/.test(c.url) && c.label && c.paper === ""), hand);
const edge = await p.evaluate(() => {
  const el = [...document.querySelectorAll("[data-card] [data-g=art]")][0];
  return el && getComputedStyle(el).boxShadow;
});
check("у карты в руке чёрная кромка", /rgb\(11, 7, 4\) 0px 0px 0px \d/.test(edge ?? "") && /inset/.test(edge ?? ""), edge);
const failed = art.filter((a) => a.status !== 200);
check("все запрошенные картинки отдались", failed.length === 0 && art.length > 50, { failed, n: art.length });

// ── 3. Админ из бота: минимал и чернила — у всех сразу ─────────────────────────────────────────────
check("админ меняет вид колоды", (await run({ t: "look", faces: "minimal", back: "ink" })).ok === true, null);
await wait(900);
hand = await handArt();
check("руки перерисованы минималом", hand.length === 2 && hand.every((c) => c.url.includes("/table/cards/minimal/")), hand);
check("колода — рубашкой «чернила» (тёмная)", (await canvasAt(m.x, m.y)).light < 90, await canvasAt(m.x, m.y));
check("не админ вид не меняет", (await run({ t: "look", faces: "classic" }, "tg:8")).error === "not-admin", null);

// ── 4. Пресет: дурак — минимал, после классики ─────────────────────────────────────────────────────
await run({ t: "look", faces: "classic" });
await wait(600);
check("вернули классику", (await handArt()).every((c) => c.url.includes("/classic/")), await handArt());
check("пресет дурака принят", (await run({ t: "preset", game: "durak" })).ok === true, null);
await wait(4000);
await run({ t: "deal", rule: "each", n: 1 });
await wait(1500);
hand = await handArt();
check("после пресета дурака — минимал", hand.length === 1 && hand[0].url.includes("/minimal/"), hand);

await browser.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
}
console.log(`tableDeck ${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
