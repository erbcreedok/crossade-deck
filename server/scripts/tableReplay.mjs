// ЗАПИСЬ ПАРТИИ СОБИРАЕТСЯ В СТОЛ.
//
// Проверяется целиком и только живьём: сыграли в настоящем столе → журнал записал → проигрыватель
// собрал из записи стол и прокрутил его. Разобрать это на части нельзя — ценность ровно в том, что
// из одних дифов получается та же картинка.
//
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableReplay.mjs [base] [secret]
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

const browser = await chromium.launch();
const spotsOf = (page) => page.evaluate(() => JSON.parse(document.querySelector("canvas").dataset.spots));

// 1. ПАРТИЯ. Играем по-настоящему: берём карту из колоды и кладём на сукно.
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
p.on("pageerror", (e) => console.log("ERROR В СТОЛЕ", e.message));
await p.goto(`${base}/table/?room=${room}&name=A`);
await p.waitForSelector("[data-section]");
await p.waitForTimeout(800);

// Сначала две карты с колоды в руку — тем же жестом, каким это делает палец.
for (let i = 0; i < 2; i += 1) {
  // Верхняя карта колоды — уже в пикселях экрана: окно координат отдаёт её там, где нарисовало.
  const from = (await spotsOf(p)).deckTop;
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  await p.mouse.move(195, 800, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(500);
}
const handOf = (page) => page.locator("[data-card]").count();
const played = await spotsOf(p);
const hand = await handOf(p);
check("в столе и правда играли: карты пришли в руку", hand === 2, hand);
check("…и колода убыла ровно на них", played.deck === 34, played.deck);
await p.close();

// Журнал уходит пачкой — дождёмся, пока запись доедет.
const journal = async () => {
  const res = await fetch(`${base}/table/journal?room=${room}&limit=5000`, { headers: { "x-table-secret": secret } });
  return res.ok ? (await res.json()).deeds : [];
};
let deeds = [];
for (let i = 0; i < 40; i += 1) {
  deeds = await journal();
  if (deeds.some((d) => d.kind === "table.first") && deeds.filter((d) => d.kind === "patch").length >= 3) break;
  await new Promise((r) => setTimeout(r, 250));
}
const first = deeds.find((d) => d.kind === "table.first");
check("в записи есть первый кадр", Boolean(first), null);
check("…и в нём колода с лицами", (first?.what?.snapshot?.piles?.[0]?.cards ?? []).filter((c) => c.face).length > 30, first?.what?.snapshot?.piles?.[0]?.cards?.length);

// 2. КИНО. Открываем запись и смотрим, собрался ли из неё стол.
const r = await browser.newPage({ viewport: { width: 900, height: 900 } });
r.on("pageerror", (e) => console.log("ERROR В ЗАПИСИ", e.message));
await r.goto(`${base}/table/replay?room=${room}&secret=${secret}`);
await r.waitForTimeout(1500);

const note = await r.evaluate(() => (document.getElementById("note").hidden ? null : document.getElementById("note").textContent));
check("запись открылась без жалобы", note === null, note);

const steps = await r.evaluate(() => Number(document.getElementById("bar").max));
check("в записи есть шаги", steps > 3, steps);

// Первый кадр: колода на месте, сукно пустое — партия ещё не началась.
const start = await spotsOf(r);
check("на первом кадре колода собрана", (start.deck ?? 0) >= 30, start.deck);
check("…и сукно ещё пустое", start.felt.length === 0, start.felt.length);

// Перематываем в конец — стол должен прийти туда же, где мы его оставили.
await r.evaluate((max) => {
  const bar = document.getElementById("bar");
  bar.value = String(max);
  bar.dispatchEvent(new Event("input"));
}, steps);
await r.waitForTimeout(600);
const end = await spotsOf(r);
const handAgain = await handOf(r);
check("в конце записи рука такая же, как была в партии", handAgain === hand, { запись: handAgain, партия: hand });
check("…и колода в записи убыла так же", (end.deck ?? 0) === (played.deck ?? -1), { запись: end.deck, партия: played.deck });

// Назад к началу — запись отматывается в обе стороны, а не только вперёд.
await r.evaluate(() => {
  const bar = document.getElementById("bar");
  bar.value = "0";
  bar.dispatchEvent(new Event("input"));
});
await r.waitForTimeout(500);
const again = await spotsOf(r);
const handStart = await handOf(r);
check("отмотали назад — стол вернулся к началу", again.deck === 36 && handStart === 0, { колода: again.deck, рука: handStart });

// 3. ЖУРНАЛ НЕ ДЛЯ ПОСТОРОННИХ: без секрета запись не соберётся.
const bare = await browser.newPage();
await bare.goto(`${base}/table/replay?room=${room}&secret=wrong-secret`);
await bare.waitForTimeout(900);
const jail = await bare.evaluate(() => document.getElementById("note").textContent);
check("с чужим секретом запись не показывается", /секрет/i.test(jail ?? ""), jail);

await browser.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(c.ok ? "  ok" : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
}
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
