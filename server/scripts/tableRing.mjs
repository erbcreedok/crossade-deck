// КРУГ ХОДА НА ЭКРАНЕ: очерченное поле в середине, ручка стопки только когда в круге есть карты, и
// ровно в его середине.
//
// Глазами это не проверяется: «пипс не на месте» — это десяток пикселей, и заметен он только тогда,
// когда уже мешает. Поэтому меряются числа.
//   TABLE_SECRET=dev TABLE_GUESTS=1 PORT=2599 npx tsx src/index.ts   (в соседнем окне)
//   node scripts/tableRing.mjs [base] [secret]
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
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
p.on("pageerror", (e) => console.log("ERROR", e.message));
await p.goto(`${base}/table/?room=${room}&name=A`);
await p.waitForSelector("[data-section]");
await p.waitForTimeout(1000);

const spots = async () => JSON.parse(await p.getAttribute("canvas", "data-spots"));
/** Ручки всех стопок: чья, сколько карт и где её середина. */
const grips = () => p.evaluate(() => [...document.querySelectorAll("[data-g=deck-grip]")].map((e) => {
  const r = e.getBoundingClientRect();
  return { pile: e.dataset.pile, n: Number(e.dataset.count), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
}));
const ringGrip = async () => (await grips()).find((g) => g.pile === "ring") ?? null;

check("пустой круг ручки не показывает", (await ringGrip()) === null, await grips());

// Карта с колоды в руку, из руки — в круг.
const deck = (await spots()).deckTop;
await p.mouse.move(deck.x, deck.y);
await p.mouse.down();
await p.mouse.move(195, 800, { steps: 6 });
await p.mouse.up();
await p.waitForTimeout(500);
const card = await p.locator("[data-card]").last().boundingBox();
const mid = (await spots()).middle;
await p.mouse.move(card.x + card.width / 2, card.y + 8);
await p.mouse.down();
await p.mouse.move(mid.x, mid.y, { steps: 8 });
await p.mouse.up();
await p.waitForTimeout(600);

const one = await ringGrip();
check("карта в круге — ручка появилась и считает её", one !== null && one.n === 1, one);
check("и стоит ровно в середине круга", one !== null && Math.abs(one.x - mid.x) <= 2 && Math.abs(one.y - mid.y) <= 2, [one, mid]);

// ВТОРАЯ КАРТА В КРУГ — чтобы «взять» перестало значить «взять верхнюю»: места разные, и палец
// обязан брать ту карту, на которой лежит, а не последнюю положенную.
await p.mouse.move(deck.x, deck.y);
await p.mouse.down();
await p.mouse.move(195, 800, { steps: 6 });
await p.mouse.up();
await p.waitForTimeout(500);
const second = await p.locator("[data-card]").last().boundingBox();
await p.mouse.move(second.x + second.width / 2, second.y + 8);
await p.mouse.down();
await p.mouse.move(mid.x, mid.y, { steps: 8 });
await p.mouse.up();
await p.waitForTimeout(600);
check("в круге две карты", (await ringGrip())?.n === 2, await ringGrip());

// ВСТАВКА ПО ПРИЦЕЛУ: навёл точно на карту — встанешь СРАЗУ ПОСЛЕ неё, а не в конец.
const ringIds = async () => ((await spots()).piles.find((p) => p.id === "ring") ?? {}).ids ?? [];
/**
 * Где на стекле лежит i-я карта круга. Место — СОСТОЯНИЕ, записанное у самой карты, поэтому оно
 * читается, а не вычисляется: считать его здесь заново значило бы держать вторую копию раскладки.
 */
const ringAt = async (i) => {
  const sp = await spots();
  const list = (sp.piles.find((one) => one.id === "ring") ?? {}).at ?? [];
  const [x, y] = (list[i] ?? "0,0,0").split(",").map(Number);
  return { x: sp.middle.x + x * sp.k, y: sp.middle.y + y * sp.k };
};
/** Свободное место круга: где лежала бы карта, которой там нет. Для прицела в дыру. */
const ringHoleAt = async (was) => {
  const sp = await spots();
  const [x, y] = was.split(",").map(Number);
  return { x: sp.middle.x + x * sp.k, y: sp.middle.y + y * sp.k };
};
/** Карта с колоды в руку и оттуда — в точку `to`. */
const fromDeckTo = async (to) => {
  const d = (await spots()).deckTop;
  await p.mouse.move(d.x, d.y);
  await p.mouse.down();
  await p.mouse.move(195, 800, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(500);
  const box = await p.locator("[data-card]").last().boundingBox();
  const id = await p.locator("[data-card]").last().getAttribute("data-card");
  await p.mouse.move(box.x + box.width / 2, box.y + 8);
  await p.mouse.down();
  await p.mouse.move(to.x, to.y, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(700);
  return id;
};

const pair = await ringIds();
const inserted = await fromDeckTo(await ringAt(0));
const after = await ringIds();
check("навёл на первую карту — встал сразу после неё", after[1] === inserted && after[0] === pair[0] && after[2] === pair[1], { pair, after, inserted });

// МИМО КАРТ — В КОНЕЦ, как было всегда: прицел по карте, а не по всему кругу.
const tail = await fromDeckTo((await spots()).middle);
check("мимо карт — карта уходит в конец", (await ringIds()).at(-1) === tail, { ids: await ringIds(), tail });

// КАРТЫ ЛЕЖАТ НА ПОЛПУТИ К КОНТУРУ, а не у самой линии: круг хода читается как ход, а не как ободок.
// ХВАТ ПРЯМО ПО КАРТЕ: тултип для этого открывать не нужно — палец берёт ту карту, на которой лежит.
const onRing = await ringAt(0);
await p.mouse.move(onRing.x, onRing.y);
await p.mouse.down();
await p.mouse.move(195, 800, { steps: 8 });
await p.waitForTimeout(200);
// МЕСТО ДЕРЖИТСЯ, ПОКА КАРТУ НЕСУТ: контур стоит там, откуда её взяли, и круг не пересобирается.
const held = await p.evaluate(() => {
  const e = document.querySelector("[data-g=ring-home]");
  const r = e?.getBoundingClientRect();
  return e ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
});
check("карту несут — её место в круге держит контур", held !== null && Math.hypot(held.x - onRing.x, held.y - onRing.y) < 12, { held, onRing });
await p.mouse.up();
await p.waitForTimeout(600);
check("отпустили вне круга — контур убран", (await p.locator("[data-g=ring-home]").count()) === 0, null);
// Тянули за место ПЕРВОЙ карты, а не за верхнюю: ушла ровно она, вторая осталась лежать.
check("КАРТУ ИЗ КРУГА БЕРУТ ХВАТОМ ПО НЕЙ, не открывая окно стопки", (await ringGrip())?.n === 3, await grips());
check("и окно стопки при этом не открылось", (await p.locator("[data-deck-tip]").count()) === 0, null);
check("а у колоды ручка на месте всегда", (await grips()).some((g) => g.pile === "deck"), await grips());

// ВЗЯЛИ КАРТУ — ОСТАЛЬНЫЕ НЕ ШЕЛОХНУЛИСЬ. Место записано у самой карты, и двигать соседей некому.
const ringAts = async () => ((await spots()).piles.find((p) => p.id === "ring") ?? {}).at ?? [];
/** Кто где лежит: карта → её место. Закон в том, что у КАЖДОЙ карты место своё и оно не меняется. */
const ringWho = async () => {
  const sp = (await spots()).piles.find((p) => p.id === "ring") ?? { ids: [], at: [] };
  return Object.fromEntries((sp.ids ?? []).map((id, i) => [id, (sp.at ?? [])[i]]));
};
// ЧЕТЫРЕ КАРТЫ И СРЕДНЯЯ — тот случай, где «встать в дыру» и «переложить круг» дают РАЗНОЕ: дыра
// оставляет всех на местах, а перекладывание сдвигает трёх оставшихся на шаг.
while ((await ringIds()).length < 4) await fromDeckTo((await spots()).middle);
const beforeTake = await ringAts();
const whoBefore = await ringWho();
const idsBefore = await ringIds();
const takenId = idsBefore[1];
const mineAt = await ringAt(1);
await p.mouse.move(mineAt.x, mineAt.y);
await p.mouse.down();
await p.mouse.move(195, 810, { steps: 8 });
await p.mouse.up();
await p.waitForTimeout(700);
check("вынесли среднюю — остальные стоят на своих местах", JSON.stringify(await ringAts()) === JSON.stringify([beforeTake[0], ...beforeTake.slice(2)]), { was: beforeTake, now: await ringAts() });
check("и дыра осталась дырой", (await ringIds()).length === idsBefore.length - 1, await ringIds());

// ВЕРНУЛИ В ДЫРУ — встал ровно туда, и НИЧЕГО не переложилось.
const holeAt = await ringHoleAt(beforeTake[1]);
const inHand = await p.locator("[data-card]").last().boundingBox();
await p.mouse.move(inHand.x + inHand.width / 2, inHand.y + 8);
await p.mouse.down();
await p.mouse.move(holeAt.x, holeAt.y, { steps: 8 });
await p.waitForTimeout(200);
check("над дырой горит её контур", (await p.locator("[data-g=ring-slot]").count()) === 1, null);
await p.mouse.up();
await p.waitForTimeout(700);
const nowWho = await ringWho();
const kept = Object.entries(whoBefore).filter(([id]) => id !== takenId).every(([id, at]) => nowWho[id] === at);
check("вернули в дыру — КАЖДАЯ карта осталась на своём месте", kept, { was: whoBefore, now: nowWho, taken: takenId });
check("…и вернувшаяся легла ровно в дыру", nowWho[takenId] === whoBefore[takenId], { was: whoBefore[takenId], now: nowWho[takenId] });

// КАРТЫ ЛЕТЯТ, А НЕ ПРЫГАЮТ. Летящая карта живёт отдельным элементом в воздухе (`data-flight`);
// его-то и ловим сразу после дропа, пока полёт не кончился.
const at0Now = async () => ((await spots()).piles.find((x) => x.id === "ring") ?? {}).at ?? [];
const flying = () => p.evaluate(() => [...document.querySelectorAll("[data-flight]")].map((e) => e.dataset.flight));
const four = await ringIds();
// РОНЯЕМ В ХВОСТ, А НЕ НА КАРТУ: при вставке в середину номера карт и так сдвигаются, и полёт вышел
// бы даже у неверного кода. В хвосте номера у всех прежние, а МЕСТА меняются у всех — вот это и есть
// случай, ради которого карта узнаётся по своему месту.
const toVoid = (await spots()).middle;
const extra = (await spots()).deckTop;
await p.mouse.move(extra.x, extra.y);
await p.mouse.down();
await p.mouse.move(195, 800, { steps: 5 });
await p.mouse.up();
await p.waitForTimeout(400);
const lastCard = await p.locator("[data-card]").last().boundingBox();
await p.mouse.move(lastCard.x + lastCard.width / 2, lastCard.y + 8);
await p.mouse.down();
await p.mouse.move(toVoid.x, toVoid.y, { steps: 8 });
await p.mouse.up();
// ОТКУДА НАЧИНАЕТСЯ ПОЛЁТ. Ловим первый же кадр: карта обязана стартовать ОТ ПАЛЬЦА. Стартуя из руки,
// она сперва прыгнет назад в руку — это и читается как телепорт.
const started = await p.evaluate(() => {
  const e = document.querySelector("[data-flight]");
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
// НИ ОДНОГО ЛИШНЕГО ПРЫЖКА. Пока места у карты нет, зона рисует её в своей середине — и карта летела
// бы сперва в центр круга, а оттуда на место. Раскладка на клиенте та же, что на столе, поэтому место
// у неё есть сразу.
check("полёт начинается от пальца, а не из руки", started !== null && Math.hypot(started.x - toVoid.x, started.y - toVoid.y) < 120, { started, finger: toVoid });
// Сразу после дропа: летит и сама карта из-под пальца, и соседи на новые места.
await p.waitForTimeout(90);
const inAir = await flying();
// ЛЕТЯТ СОСЕДИ — те, что уже лежали в круге: их места сменились, и они обязаны переехать плавно.
const neighbours = four.filter((id) => inAir.includes(id));
check("переложенные карты круга ЛЕТЯТ, а не прыгают", neighbours.length >= 2, { inAir, four });
// ...и сама сброшенная летит из-под пальца на своё место, а не возникает там.
const dropped = (await ringIds()).find((id) => !four.includes(id));
check("и сброшенная летит из-под пальца", inAir.includes(dropped), { inAir, dropped });
await p.waitForTimeout(700);
check("и долетают — в воздухе пусто", (await flying()).length === 0, await flying());

// «МЕНЬШЕ АНИМАЦИЙ» НЕ ЗНАЧИТ «МГНОВЕННО». На айфоне в энергосбережении кадры падают до тридцати, и
// экран сам выключает свои анимации. Для круга это недопустимо: без движения перекладывание читается
// как подмена карт — человек теряет, где чья.
await p.evaluate(() => {
  localStorage.setItem("crossade.table.motion", JSON.stringify({ speed: 1, reduce: true }));
});
await p.reload();
await p.waitForSelector("[data-section]");
await p.waitForTimeout(1200);
const quiet = (await spots()).deckTop;
await p.mouse.move(quiet.x, quiet.y);
await p.mouse.down();
await p.mouse.move(195, 800, { steps: 5 });
await p.mouse.up();
await p.waitForTimeout(400);
const quietCard = await p.locator("[data-card]").last().boundingBox();
await p.mouse.move(quietCard.x + quietCard.width / 2, quietCard.y + 8);
await p.mouse.down();
await p.mouse.move((await spots()).middle.x, (await spots()).middle.y, { steps: 8 });
await p.mouse.up();
await p.waitForTimeout(70);
check("при «меньше анимаций» карты круга всё равно летят", (await flying()).length >= 2, await flying());
await p.evaluate(() => localStorage.removeItem("crossade.table.motion"));
await p.reload();
await p.waitForSelector("[data-section]");
await p.waitForTimeout(1000);

// ГРИП КРУГА: карты сходятся под палец, на местах остаются контуры, круг с места не двигается.
const before = (await spots()).piles.find((p) => p.id === "ring").spot;
const grip = await ringGrip();
// ПОЛЁТ НЕ ПЛОДИТ КАДРОВ. Рисование зовут по многу раз за кадр, и кадр, заказанный каждым вызовом,
// оборачивается лавиной — на телефоне это и есть «подвисло». Заказан должен быть один, поэтому
// кадры считаются РОВНО С МОМЕНТА ХВАТА: полёт живёт две десятых секунды и весь тут.
await p.evaluate(() => { window.__raf = 0; const was = window.requestAnimationFrame; window.requestAnimationFrame = (f) => { window.__raf += 1; return was(f); }; });
await p.mouse.move(grip.x, grip.y);
await p.mouse.down();
for (let i = 0; i < 40; i += 1) await p.mouse.move(grip.x + 20 + (i % 8) * 5, grip.y + 20 + (i % 8) * 4);
const frames = await p.evaluate(() => window.__raf);
check("полёт карт не плодит кадров", frames < 80, { frames });
await p.mouse.move(grip.x + 60, grip.y + 60, { steps: 8 });
await p.waitForTimeout(400);
const marks = await p.locator("[data-g=ring-home]").count();
// РАЗЛЁТ КАРТ В ВОЗДУХЕ — по их местам на экране: схлопнулись в стопку, значит они друг на друге.
const flight = await p.evaluate(() => {
  const air = document.querySelector("[data-g=deck-carry]");
  const kids = [...(air?.children ?? [])].map((e) => {
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (kids.length === 0) return { n: 0, far: -1 };
  let far = 0;
  for (const a of kids) for (const b of kids) far = Math.max(far, Math.hypot(a.x - b.x, a.y - b.y));
  return { n: kids.length, far };
});
// Порог — от самого круга: карта, оставшаяся лежать кольцом, стоит на RING_HOME от середины.
const ring = 1.5 * (await spots()).k;
check("стопка круга поднята в воздух вся", flight.n === (await ringIds()).length, flight);
check("карты круга слетелись под палец", flight.far >= 0 && flight.far < ring * 0.5, { flight, ring });
check("а на их местах остались контуры", marks === (await ringIds()).length, { marks, n: (await ringIds()).length });

// Вернули туда же — круг цел и стоит там же, где стоял.
await p.mouse.move(grip.x, grip.y, { steps: 8 });
await p.mouse.up();
await p.waitForTimeout(500);
const back = (await spots()).piles.find((p) => p.id === "ring");
check("вернули в круг — карты на месте", back.ids.length === (await ringIds()).length && back.ids.length > 0, back.ids);
check("КРУГ С МЕСТА НЕ СДВИНУЛСЯ", back.spot.x === before.x && back.spot.y === before.y, { before, now: back.spot });

await browser.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(c.ok ? "  ok" : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
}
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
