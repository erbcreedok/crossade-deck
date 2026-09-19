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
/**
 * Карты по местам — из окна координат, а не из разметки: руку рисует только её хозяин, а в конце
 * записи он уже встал из-за стола, и считать её по нарисованному значит мерить не то.
 */
const handsOf = async (page) => {
  const s = await spotsOf(page);
  return (s.seats ?? []).map((one) => one.hand).reduce((a, b) => a + b, 0);
};
const openOf = async (page) => {
  const s = await spotsOf(page);
  return (s.seats ?? []).flatMap((one) => one.open ?? []).length;
};
// Кладём карту из руки в круг — ради проверки раскладки круга в записи.
const handCard = await p.locator("[data-card]").last().boundingBox();
const middle = (await spotsOf(p)).middle;
await p.mouse.move(handCard.x + handCard.width / 2, handCard.y + 8);
await p.mouse.down();
await p.mouse.move(middle.x, middle.y, { steps: 8 });
await p.mouse.up();
await p.waitForTimeout(800);
const ringInPlay = p.evaluate(() => {
  const s = JSON.parse(document.querySelector("canvas").dataset.spots);
  const r = s.piles.find((one) => one.id === "ring");
  return r ? { count: r.count, slots: r.at ?? null } : null;
}).catch(() => null);

const played = await spotsOf(p);
const hand = await handsOf(p);
const opened = await openOf(p);
check("в столе и правда играли: карта осталась в руке", hand === 1, hand);
check("…и колода убыла ровно на них", played.deck === 34, played.deck);
await p.close();

// Журнал уходит пачкой — дождёмся, пока запись доедет.
const journal = async () => {
  const res = await fetch(`${base}/table/journal?room=${room}&limit=5000`, { headers: { "x-table-secret": secret } });
  return res.ok ? (await res.json()).deeds : [];
};
// Ждём не «хоть что-нибудь», а ПОСЛЕДНИЙ ход партии: журнал уходит пачкой раз в пару секунд, и
// страница, открытая раньше, покажет запись без её конца — а проверка соврёт, что конца там и не было.
const landed = (list) => list.some((d) => d.kind === "patch" && Array.isArray(d.what?.ops) && d.what.ops.some((o) => o.t === "move" && o.to?.pile === "ring"));
let deeds = [];
for (let i = 0; i < 60; i += 1) {
  deeds = await journal();
  if (deeds.some((d) => d.kind === "table.first") && landed(deeds)) break;
  await new Promise((r) => setTimeout(r, 250));
}
const first = deeds.find((d) => d.kind === "table.first");
check("в записи есть первый кадр", Boolean(first), null);
check("…и в нём колода с лицами", (first?.what?.snapshot?.piles?.[0]?.cards ?? []).filter((c) => c.face).length > 30, first?.what?.snapshot?.piles?.[0]?.cards?.length);
// Зоны рода встают не мгновенно: кадр, снятый слишком рано, выходил то с кругом, то без.
check("…и стол в нём собран: зона рода на месте", (first?.what?.snapshot?.piles ?? []).some((p) => p.zone), (first?.what?.snapshot?.piles ?? []).map((p) => p.id));

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
const handAgain = await handsOf(r);
check("в конце записи карты по местам те же, что были в партии", handAgain === hand, { запись: handAgain, партия: hand });
// Открытая карта должна остаться открытой и в записи: журнал хранит правду, а не то, что видно
// соседу, — иначе перевёрнутая колода в записи превратится в рубашки.
const openAgain = await openOf(r);
check("…и открытые карты остались открытыми", openAgain === opened, { запись: openAgain, партия: opened });
check("…и колода в записи убыла так же", (end.deck ?? 0) === (played.deck ?? -1), { запись: end.deck, партия: played.deck });

// Назад к началу — запись отматывается в обе стороны, а не только вперёд.
await r.evaluate(() => {
  const bar = document.getElementById("bar");
  bar.value = "0";
  bar.dispatchEvent(new Event("input"));
});
await r.waitForTimeout(500);
const again = await spotsOf(r);
const handStart = await handsOf(r);
check("отмотали назад — стол вернулся к началу", again.deck === 36 && handStart === 0, { колода: again.deck, рука: handStart });

// 2б. КРУГ ХОДА В ЗАПИСИ ЛЕЖИТ КРУГОМ, а не кучей. Место карты в зоне — это НОМЕР, и он прибавляется
// к ходу только когда ход готовят зрителю. Запись, сложенная из сырых ходов, номера не знает, и круг
// в ней сваливается стопкой посередине — стол вроде тот, а партию по нему не разобрать.
{
  const ring = (page) => page.evaluate(() => {
    const s = JSON.parse(document.querySelector("canvas").dataset.spots);
    const r = s.piles.find((one) => one.id === "ring");
    return r ? { count: r.count, slots: r.at ?? null } : null;
  });
  // В партии карта ушла в круг — посмотрим, знает ли запись её место. Смотреть надо В КОНЦЕ записи:
  // в начале круг пуст, и проверка «мест нет» прошла бы на пустом месте.
  const inPlay = await ringInPlay;
  if (inPlay && inPlay.count > 0) {
    await r.evaluate(() => {
      const b = document.getElementById("bar");
      b.value = b.max;
      b.dispatchEvent(new Event("input"));
    });
    await r.waitForTimeout(700);
    const inFilm = await ring(r);
    check("круг в записи знает места карт, а не валит их в стопку", JSON.stringify(inFilm?.slots) === JSON.stringify(inPlay.slots), { запись: inFilm?.slots, партия: inPlay.slots });
  }
}

// 3. ПРОПУСК — обычный способ смотреть запись: одна комната, свой срок, без ключа от стола.
const passRes = await fetch(`${base}/table/journal/pass`, {
  method: "POST",
  headers: { "x-table-secret": secret, "content-type": "application/json" },
  body: JSON.stringify({ room }),
});
const { pass } = passRes.ok ? await passRes.json() : {};
check("пропуск выписывается по секрету стола", Boolean(pass), passRes.status);

const byPass = await browser.newPage({ viewport: { width: 900, height: 900 } });
await byPass.goto(`${base}/table/replay?room=${room}&pass=${encodeURIComponent(pass ?? "нет")}`);
await byPass.waitForTimeout(1600);
const passNote = await byPass.evaluate(() => (document.getElementById("note").hidden ? null : document.getElementById("note").textContent));
check("по пропуску запись открывается без секрета", passNote === null, passNote);

// Пропуск назван ОДНОЙ комнатой: соседнюю он не открывает.
const other = await fetch(`${base}/table/journal?room=чужая-комната&pass=${encodeURIComponent(pass ?? "")}`);
check("пропуск не открывает чужую комнату", other.status === 401, other.status);

// И списка комнат по нему не видно: пропуск — на запись, а не в журнал целиком.
const all = await fetch(`${base}/table/journal?pass=${encodeURIComponent(pass ?? "")}`);
check("пропуск не показывает список комнат", all.status === 401, all.status);

// 4. ЖУРНАЛ НЕ ДЛЯ ПОСТОРОННИХ: без секрета запись не соберётся.
const bare = await browser.newPage();
await bare.goto(`${base}/table/replay?room=${room}&secret=wrong-secret`);
await bare.waitForTimeout(900);
const jail = await bare.evaluate(() => document.getElementById("note").textContent);
check("с чужим секретом запись не показывается", /секрет/i.test(jail ?? ""), jail);

// 5. ВТОРАЯ ПОСИДЕЛКА ЗА ТЕМ ЖЕ СТОЛОМ. Комната живёт в памяти и умирает с перезапуском, а ссылка
// остаётся: по ней открывается новый стол с тем же именем. Записи ложатся в ту же ленту, и запись
// обязана показать ПОСЛЕДНЮЮ — иначе к свежему столу применятся вчерашние ходы.
{
  // Комнату закрывают — стол умирает, как умирает он и при перезапуске сервера.
  await fetch(`${base}/table/rooms/${room}`, { method: "DELETE", headers: { "x-table-secret": secret } });
  await new Promise((r) => setTimeout(r, 800));

  // А ссылка живёт: по ней открывается НОВЫЙ стол с тем же именем, и его записи лягут в ту же ленту.
  const again = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await again.goto(`${base}/table/?room=${room}&name=B`);
  await again.waitForSelector("[data-section]");
  await again.waitForTimeout(900);
  const from = (await spotsOf(again)).deckTop;
  await again.mouse.move(from.x, from.y);
  await again.mouse.down();
  await again.mouse.move(195, 800, { steps: 6 });
  await again.mouse.up();
  await again.waitForTimeout(700);
  const deckNow = (await spotsOf(again)).deck;
  await again.close();
  await new Promise((r) => setTimeout(r, 3500));

  const twice = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await twice.goto(`${base}/table/replay?room=${room}&pass=${encodeURIComponent(pass ?? "нет")}`);
  await twice.waitForTimeout(1800);
  // НАСТОЯЩИЕ НАЖАТИЯ, а не вызов обработчика: кнопку может накрыть невидимый слой, и подмена
  // пальца программой этого не увидит — однажды так и вышло.
  const before = await twice.evaluate(() => document.getElementById("now").textContent);
  await twice.click("#fwd", { timeout: 4000 }).catch(() => {});
  await twice.waitForTimeout(400);
  const after = await twice.evaluate(() => document.getElementById("now").textContent);
  check("кнопку шага можно НАЖАТЬ пальцем", before !== after, { было: before, стало: after });

  await twice.click("#play", { timeout: 4000 }).catch(() => {});
  await twice.waitForTimeout(2500);
  const rolling = await twice.evaluate(() => document.getElementById("now").textContent);
  check("play и правда крутит запись", rolling !== after, { нажали: after, стало: rolling });
  await twice.click("#play", { timeout: 4000 }).catch(() => {});

  const last = await twice.evaluate(() => Number(document.getElementById("bar").max));
  await twice.evaluate((m) => {
    const b = document.getElementById("bar");
    b.value = String(m);
    b.dispatchEvent(new Event("input"));
  }, last);
  await twice.waitForTimeout(800);
  const shown = (await spotsOf(twice)).deck;
  // У новой посиделки колода своя: если бы ленту склеили, из неё убыло бы вдвое больше карт.
  check("показана последняя посиделка, а не склейка с прошлой", shown === deckNow, { запись: shown, стол: deckNow });
  const said = await twice.evaluate(() => document.body.textContent.includes("прежних в журнале"));
  check("…и про прежние посиделки сказано честно", said, said);
}

await browser.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(c.ok ? "  ok" : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
}
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
