// ЖУРНАЛ ЗАПИСИ — СЛОВАМИ И ГЛАЗАМИ ЗРИТЕЛЯ. Внизу записи — не JSON, а «кто что сделал какой картой»;
// «Подробнее» открывает лист снизу с прокруткой, сырое спрятано в технических подробностях, а лица
// скрытой руки Ye в журнале глазами Бо не появляются ни на одном мгновении.
//   TABLE_SECRET=probe TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test CROSSADE_DB_FILE=":memory:" PORT=2597 npx tsx src/index.ts
//   node scripts/tableReplayLog.mjs [base] [secret]
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

await ask("/table/rooms", { method: "POST", body: JSON.stringify({ by: "tg:7", home: { kind: "inline", message: "m" }, kind: "sandbox", room }) });
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

// Ye БЕРЁТ ТРИ КАРТЫ С КОЛОДЫ В СВОЮ РУКУ — рука скрыта (по умолчанию), Бо их лиц не видит.
const chairYe = (await state(Ye)).chairs.find((c) => c.owner === "tg:7");
check("рука Ye скрыта от других", chairYe?.hide === true, chairYe);
for (let i = 0; i < 3; i += 1) {
  const top = (await state(Ye)).piles.find((p) => p.id === "deck").cards.at(-1).id;
  await Ye.evaluate(([id, chair, i]) => {
    window.__tableSend({ t: "grab", id });
    window.__tableSend({ t: "drop", id, to: { in: "hand", chair, i } });
  }, [top, chairYe.id, i]);
  await Ye.waitForTimeout(700);
}
const SUIT = { s: "♠", h: "♥", d: "♦", c: "♣", r: "★", b: "★" };
const hidden = (await state(Ye)).chairs.find((c) => c.owner === "tg:7").hand.map((c) => `${c.face.rank}${SUIT[c.face.suit]}`);
check("у Ye в руке три карты с лицами", hidden.length === 3, hidden);
await Ye.waitForTimeout(2500); // журнал уходит в базу пачкой раз в две секунды

const { pass } = await (await ask(`/table/rooms/${room}/records`)).json();
const url = (eyes) => `${base}/table/replay?room=${room}&pass=${encodeURIComponent(pass)}&eyes=${eyes}`;

/** Все строки журнала записи: пройти каждое мгновение и снять текст внизу. */
const allLines = (R) => R.evaluate(async () => {
  const bar = document.getElementById("bar");
  const out = [];
  for (let i = 0; i <= Number(bar.max); i += 1) {
    bar.value = String(i);
    bar.dispatchEvent(new Event("input"));
    out.push(document.getElementById("deed").textContent);
  }
  return out;
});

for (const [label, viewport] of [["телефон", { width: 390, height: 844 }], ["десктоп", { width: 1280, height: 800 }]]) {
  const R = await browser.newPage({ viewport });
  const errors = [];
  R.on("pageerror", (e) => errors.push(e.message));
  await R.goto(url("tg:8"));
  await R.waitForSelector("#bar");
  await R.waitForTimeout(2000);
  const bo = await allLines(R);
  check(`${label}: журнал — словами, без JSON`, bo.length > 0 && bo.every((t) => !t.includes("{\"") && !t.includes("\":")), bo.filter((t) => t.includes("\":")).slice(0, 3));
  check(`${label}: ход с колоды в руку рассказан: кто, откуда, куда`, bo.some((t) => t.includes("Ye") && t.includes("из «колода» себе в руку")), bo.filter((t) => t.includes("колода")).slice(0, 3));
  check(`${label}: глазами Бо — ни одного лица скрытой руки Ye`, bo.every((t) => hidden.every((h) => !t.includes(h))), bo.filter((t) => hidden.some((h) => t.includes(h))));
  check(`${label}: карты Ye у Бо — рубашкой`, bo.some((t) => t.includes("карта рубашкой")), bo.slice(0, 20));

  // Встать на ход с картой и раскрыть подробности.
  const at = bo.findIndex((t) => t.includes("из «колода» себе в руку"));
  await R.evaluate((i) => { const bar = document.getElementById("bar"); bar.value = String(i); bar.dispatchEvent(new Event("input")); }, at);
  check(`${label}: панели подробностей нет, пока не нажато`, await R.isHidden("#sheet"));
  await R.click("#more");
  await R.waitForTimeout(150);
  const sheet = await R.evaluate(() => {
    const box = document.getElementById("sheetBox").getBoundingClientRect();
    const body = document.getElementById("sheetBody");
    return { top: box.top, bottom: box.bottom, width: box.width, h: innerHeight, w: innerWidth, overflow: getComputedStyle(body).overflowY, title: document.getElementById("sheetTitle").textContent, text: body.innerText, techOpen: document.getElementById("tech").open, pre: document.querySelector("#sheetBody pre").checkVisibility(), fontPx: parseFloat(getComputedStyle(body).fontSize) };
  });
  check(`${label}: «Подробнее» открывает лист у нижнего края, в экран`, !(await R.isHidden("#sheet")) && Math.abs(sheet.bottom - sheet.h) < 2 && sheet.top > 0 && sheet.width <= sheet.w, sheet);
  check(`${label}: лист прокручивается сам`, sheet.overflow === "auto", sheet.overflow);
  check(`${label}: лист — выбранное мгновение`, sheet.title.includes(`${at + 1} из`) && sheet.title.includes("Bo"), sheet.title);
  check(`${label}: в листе словами, текст крупный (≥15px)`, sheet.text.includes("из «колода» себе в руку") && sheet.fontPx >= 15, sheet);
  check(`${label}: технические подробности свёрнуты по умолчанию`, sheet.techOpen === false && sheet.pre === false, sheet);
  await R.click("#tech summary");
  await R.waitForTimeout(100);
  const raw = await R.textContent("#sheetBody pre");
  check(`${label}: в технических — сырой JSON`, raw.includes('"ops"'), raw.slice(0, 80));
  check(`${label}: и в сыром JSON глазами Бо нет лица скрытой карты`, !raw.includes('"face"'), raw);
  await R.screenshot({ path: `${process.env.SHOTS ?? "."}/replay-log-${label}.png` });
  await R.click("#sheetFwd");
  await R.waitForTimeout(100);
  check(`${label}: ▶ в листе — следующее мгновение, лист следует`, (await R.textContent("#sheetTitle")).includes(`${at + 2} из`) && (await R.inputValue("#bar")) === String(at + 1), await R.textContent("#sheetTitle"));
  await R.click("#sheetClose");
  check(`${label}: ✕ закрывает`, await R.isHidden("#sheet"));
  await R.click("#more");
  await R.mouse.click(viewport.width / 2, 5);
  check(`${label}: касание мимо листа закрывает`, await R.isHidden("#sheet"));
  await R.click("#more");
  await R.keyboard.press("Escape");
  check(`${label}: Esc закрывает`, await R.isHidden("#sheet"));
  check(`${label}: без ошибок страницы`, errors.length === 0, errors);
  await R.close();
}

// ГЛАЗАМИ Ye — свои карты он видит, журнал их называет.
const R = await browser.newPage({ viewport: { width: 390, height: 844 } });
await R.goto(url("tg:7"));
await R.waitForSelector("#bar");
await R.waitForTimeout(2000);
const ye = await allLines(R);
check("глазами Ye — свои карты с лицами", hidden.every((h) => ye.some((t) => t.includes(h))), ye.filter((t) => t.includes("колода")));

await browser.close();
for (const one of checks) console.log(one.ok ? "✓" : "✗", one.name, one.ok ? "" : JSON.stringify(one.got));
console.log(`${checks.filter((one) => one.ok).length}/${checks.length}`);
if (checks.some((one) => !one.ok)) process.exitCode = 1;
