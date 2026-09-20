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

/**
 * НАВЕСТИ СЕРЕДИНУ НЕСОМОЙ КАРТЫ НА ТОЧКУ. Держат карту за край, а метится её СЕРЕДИНА: палец и цель
 * разъезжаются на пол-карты, и целиться пикселями вслепую значит мерить не тот закон. Подводим, пока
 * середина не встанет на цель.
 */
/**
 * ТОЧКА СТОЛА НА СТЕКЛЕ — тем же взглядом, каким рисовали: поворот камеры и наклон (он сжимает высоту).
 * Без наклона прицел уезжает на четверть карты, и прогон мерит не тот закон, а свою арифметику.
 */
const onGlass = async (at) => {
  const sp = await spots();
  const rad = (sp.spin * Math.PI) / 180;
  const x = at.x * Math.cos(rad) - at.y * Math.sin(rad);
  const y = at.x * Math.sin(rad) + at.y * Math.cos(rad);
  return { x: sp.middle.x + x * sp.k, y: sp.middle.y + y * sp.k * sp.squash };
};

const aimAt = async (to, want) => {
  // Несомая карта меняет размер, попав в зону, поэтому расстояние от пальца до её середины плавает.
  // Ведём палец по решётке вокруг цели и останавливаемся, когда ЭКРАН говорит, что метится нужное:
  // это же и доказывает, что до цели вообще можно дотянуться пальцем.
  const steps = [0, -6, 6, -12, 12, -18, 18, -24, 24];
  for (const dy of steps) {
    for (const dx of [0, -6, 6, -12, 12]) {
      await p.mouse.move(to.x + dx, to.y + dy, { steps: 2 });
      await p.waitForTimeout(60);
      const aim = (await spots()).aim;
      // Возвращаем ВМЕСТЕ с точкой, на которой остановились: сторожам дрожания нужна именно она.
      if (!want || (aim && want(aim))) return { ...aim, at: { x: to.x + dx, y: to.y + dy } };
    }
  }
  return { ...(await spots()).aim, at: { ...to } };
};

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
  const list = (sp.piles.find((one) => one.id === "ring") ?? {}).drew ?? [];
  const [x, y] = (list[i] ?? "0,0,0").split(",").map(Number);
  return onGlass({ x, y });
};
/** Свободное место круга: где лежала бы карта, которой там нет. Для прицела в дыру. */
const ringHoleAt = async (slot) => {
  const дыра = ((await spots()).piles.find((one) => one.id === "ring") ?? {}).holes?.find((one) => one.slot === slot);
  return дыра ? onGlass(дыра) : { x: -1, y: -1 };
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
  await aimAt(to);
  await p.mouse.up();
  await p.waitForTimeout(700);
  return id;
};

const pair = await ringIds();
const inserted = await fromDeckTo(await ringAt(0));
const after = await ringIds();
check("навёл на карту — встал НА ЕЁ МЕСТО, а она съехала вперёд", after[0] === inserted && after[1] === pair[0] && after[2] === pair[1], { pair, after, inserted });

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

// СТРЕЛКА КРУГА — где он обрывается и начинается. Рисуется, только когда в круге есть карты, стоит
// ровно перед головой и лежит на том же радиусе, что и карты.
{
  const sp = (await spots()).piles.find((x) => x.id === "ring");
  const cards = (sp.drew ?? []).filter(Boolean).map((one) => one.split(",").map(Number));
  const turnOf = ([x, y]) => ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
  const tail = turnOf(cards.at(-1));
  const gap = ((sp.arrow.turn - tail) + 360) % 360;
  const halfOf = (away) => (Math.asin(Math.min(1, 1.15 / 2 / away)) * 180) / Math.PI;
  check("стрелка нарисована и стоит ЗА ХВОСТОМ", sp.arrow !== null && Math.abs(gap - (18 + halfOf(sp.arrow.spread))) < 1.5, { arrow: sp.arrow, tail, gap });
  check("и лежит на радиусе карт", Math.abs(sp.arrow.spread - Math.hypot(cards[0][0], cards[0][1])) < 0.01, { arrow: sp.arrow, away: Math.hypot(cards[0][0], cards[0][1]) });
  // КАРТА НЕ НАПОЛЗАЕТ НА СТРЕЛКУ. Карта шире своей середины: если доля стрелки отмеряна от середины
  // головы, край головы ложится прямо на стрелку — её и не видно. Меряем от КРАЯ.
  const half = halfOf(sp.arrow.spread);
  const near = Math.min(...cards.map((c) => Math.abs(((turnOf(c) - sp.arrow.turn + 540) % 360) - 180)));
  check("карта не накрывает стрелку собой", near >= half + 36 / 2 - 0.5, { near, need: half + 18, half });
  // И ДО ГОЛОВЫ ЕЙ ДАЛЕКО: разрыв шире доли на целый шаг, стрелка занимает только его начало.
  const toHead = ((turnOf(cards[0]) - sp.arrow.turn) + 360) % 360;
  check("между стрелкой и головой есть место", toHead > 18, { toHead });
}

// ВЗЯЛИ КАРТУ — ОСТАЛЬНЫЕ НЕ ШЕЛОХНУЛИСЬ. Место записано у самой карты, и двигать соседей некому.
/** НОМЕРА МЕСТ карт круга — состояние. Координат в столе нет ни у кого. */
const ringAts = async () => ((await spots()).piles.find((p) => p.id === "ring") ?? {}).at ?? [];
/** А ЭТО — где кисть их нарисовала: строки «x,y,угол». */
const ringDrew = async () => ((await spots()).piles.find((p) => p.id === "ring") ?? {}).drew ?? [];
/** Кто где НАРИСОВАН: карта → место на столе. По этому видно движение, а не смену номеров. */
const ringWhereDrawn = async () => {
  const sp = (await spots()).piles.find((p) => p.id === "ring") ?? { ids: [], drew: [] };
  return Object.fromEntries((sp.ids ?? []).map((id, i) => [id, (sp.drew ?? [])[i]]).filter(([, at]) => at));
};
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

// ВЕРНУЛИ ИЗ РУКИ — КРУГ НОРМАЛИЗУЕТСЯ ВЕСЬ: мест ровно столько, сколько карт, и они равномерны.
// Дыра, оставшаяся от взятой карты, схлопывается; голова остаётся на якоре — стрелка не сдвигалась.
const inHand = await p.locator("[data-card]").last().boundingBox();
await p.mouse.move(inHand.x + inHand.width / 2, inHand.y + 8);
await p.mouse.down();
await p.mouse.move((await spots()).middle.x, (await spots()).middle.y, { steps: 8 });
await p.mouse.up();
await p.waitForTimeout(800);
{
  const sp = (await spots()).piles.find((x) => x.id === "ring");
  const turnOf = (one) => { const [x, y] = one.split(",").map(Number); return ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360; };
  const turns = (sp.drew ?? []).filter(Boolean).map(turnOf);
  const steps = turns.slice(1).map((one, i) => ((one - turns[i]) + 360) % 360);
  check("вернули из руки — круг нормализовался: шаг между всеми один", steps.length >= 3 && steps.every((one) => Math.abs(one - steps[0]) < 0.5), { turns, steps });
  check("…и голова осталась на якоре — стрелка не сдвигалась", Math.abs(((turns[0] - sp.spot.turn) + 540) % 360 - 180) < 0.5, { head: turns[0], turn: sp.spot.turn });
  // Шаг — это круг без РАЗРЫВА, делённый на промежутки между картами. Разрыв — доля стрелки и по
  // половине карты по краям: считаем его по тому же радиусу, на котором карты и лежат.
  const slots = Math.max(3, sp.count);
  check("…а дыр в круге не осталось: шаг — это круг без доли стрелки, делённый на карты", Math.abs(steps[0] - (360 - 36) / slots) < 0.5, { step: steps[0], n: sp.count });
}

// ПРИЦЕЛ В СТРЕЛКУ — ЭТО КОНЕЦ КРУГА. Стрелка стоит за хвостом и показывает, куда ляжет следующая;
// навести на неё — то же самое, что навести на пустое место круга.
{
  const sp = (await spots()).piles.find((x) => x.id === "ring");
  const onArrow = await onGlass({ x: sp.arrow.x, y: sp.arrow.y });
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
  const got = await aimAt(onArrow, (aim) => aim.kind === "deck");
  check("прицел на стрелке — это конец круга", got.kind === "deck", got);
  check("и контур показывает, куда ляжет карта", (await p.locator("[data-g=ring-slot]").count()) === 1, null);
  await p.mouse.up();
  await p.waitForTimeout(800);
  check("наведи на стрелку — карта встала В КОНЕЦ круга", (await ringIds()).at(-1) === id, { ids: await ringIds(), id });
}

// ВЕРНУЛИ В КРУГ, НЕ ЦЕЛЯСЬ НИ ВО ЧТО: карта из круга и не уходила — садится на своё же место, и
// НИКТО не двигается. Двигать карты стоит только там, где иначе не встать.
{
  const was = await ringWho();
  const backId = (await ringIds())[2];
  const from = await ringAt(2);
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  await p.mouse.move(195, 760, { steps: 6 });
  const middle = (await spots()).middle;
  await p.mouse.move(middle.x, middle.y, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(800);
  const now = await ringWho();
  check("вернули в круг мимо всего — круг не шелохнулся", Object.entries(was).every(([id, at]) => now[id] === at), { was, now, back: backId });
  check("…и сама вернулась на своё место", now[backId] === was[backId], { was: was[backId], now: now[backId] });
}

// КАРТЫ ЛЕТЯТ, А НЕ ПРЫГАЮТ. Летящая карта живёт отдельным элементом в воздухе (`data-flight`);
// его-то и ловим сразу после дропа, пока полёт не кончился.
const at0Now = async () => ((await spots()).piles.find((x) => x.id === "ring") ?? {}).drew ?? [];
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
// ВСЕ ТРОГАЮТСЯ ВМЕСТЕ И ПРИХОДЯТ ВМЕСТЕ. Каскад по очереди читается как дёрганье, а не как
// «подвинулись», и положенная карта приходит не вовремя.
const waits = await p.evaluate(() => [...document.querySelectorAll("[data-flight]")].flatMap((e) => e.getAnimations().map((a) => a.effect.getTiming().delay ?? 0)));
check("карты круга трогаются одновременно, а не по очереди", waits.length > 1 && waits.every((one) => one === 0), waits);
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
// КРУГ ВИДЕН ВСЕГДА — и пока его карты в воздухе. Он очерчен на сукне, а не нарисован «под стопкой»:
// уехать вместе с картами он не может, и стрелка с ним — карты ещё могут вернуться.
{
  const sp = (await spots()).piles.find((x) => x.id === "ring");
  // Смотрим на НАРИСОВАННОЕ: стрелку кисть отдаёт только тогда, когда сам круг до неё дошёл. Пустое
  // состояние зоны тут ничего не доказывает — зона в состоянии есть всегда.
  check("круг НАРИСОВАН, пока его карты несут", sp?.ring !== null && sp?.ring !== undefined, sp?.ring ?? null);
  check("…и нарисован там, где очерчен, а не под пальцем", sp?.ring?.x === 0 && sp?.ring?.y === 0, sp?.ring ?? null);
}

// Вернули туда же — круг цел и стоит там же, где стоял.
await p.mouse.move(grip.x, grip.y, { steps: 8 });
await p.mouse.up();
await p.waitForTimeout(500);
const back = (await spots()).piles.find((p) => p.id === "ring");
check("вернули в круг — карты на месте", back.ids.length === (await ringIds()).length && back.ids.length > 0, back.ids);
check("КРУГ С МЕСТА НЕ СДВИНУЛСЯ", back.spot.x === before.x && back.spot.y === before.y, { before, now: back.spot });

// ПРЕВЬЮ: КАРТЫ РАЗДВИГАЮТСЯ ЗАРАНЕЕ, и после дропа НЕ ДВИГАЮТСЯ — они уже там.
//
// Превью и настоящий дроп считает одна и та же раскладка. Разойдись они — карта после отпускания
// поехала бы второй раз, и это был бы рывок в самом конце жеста.
{
  const d = (await spots()).deckTop;
  await p.mouse.move(d.x, d.y);
  await p.mouse.down();
  await p.mouse.move(195, 800, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(500);
  const before = await ringDrew();
  const box = await p.locator("[data-card]").last().boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + 8);
  await p.mouse.down();
  await aimAt((await spots()).middle, (aim) => aim.kind === "deck" && aim.pile === "ring");
  await p.waitForTimeout(450);
  const shown = await ringDrew();
  const shownWho = await ringWhereDrawn();
  check("мимо карт — контур показывает, куда ляжет карта", (await p.locator("[data-g=ring-slot]").count()) === 1, null);
  // СТРЕЛКА ВСТАЁТ ЗА КОНТУРОМ, а не за последней лежащей картой: контур и есть будущий хвост круга.
  {
    const sp = (await spots()).piles.find((x) => x.id === "ring");
    const mark = await p.evaluate(() => { const e = document.querySelector("[data-g=ring-slot]"); const r = e?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; });
    const arrowAt = await onGlass({ x: sp.arrow.x, y: sp.arrow.y });
    const mid = (await spots()).middle;
    const turn = (at) => ((Math.atan2(at.x - mid.x, mid.y - at.y) * 180) / Math.PI + 360) % 360;
    const наКонтур = ((turn(arrowAt) - turn(mark)) + 360) % 360;
    if (process.env.AIM) console.log("СТРЕЛКА/КОНТУР", JSON.stringify({ наКонтур, arrow: turn(arrowAt), mark: turn(mark), ghost: sp.ghost, slots: sp.spot.slots, count: sp.count }));
    // Не «просто дальше», а на полкарты с лишним: иначе годится и случайный зазор в пару градусов,
    // который получается, когда стрелку считают от последней ЛЕЖАЩЕЙ карты.
    check("стрелка стоит ЗА контуром, а не перед ним", mark !== null && наКонтур > 20 && наКонтур < 90, { наКонтур, mark, arrowAt });
  }
  check("держу карту над кругом — остальные УЖЕ раздвинулись", JSON.stringify(shown) !== JSON.stringify(before), { before, shown });
  const step = (list) => {
    const turn = (one) => { const [x, y] = one.split(",").map(Number); return ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360; };
    const t = list.map(turn);
    return t.slice(1).map((one, i) => ((one - t[i]) + 360) % 360);
  };
  check("…и раздвинулись ровно: шаг у всех один", step(shown).every((one) => Math.abs(one - step(shown)[0]) < 0.5), step(shown));
  await p.mouse.up();
  await p.waitForTimeout(900);
  // СРАВНИВАЕМ «КТО ГДЕ», а не набор мест: мест-то столько же, и набор совпал бы, даже если превью
  // расставило карты по ним иначе, чем дроп. Именно этот случай и есть враньё превью.
  const afterWho = await ringWhereDrawn();
  const kept = Object.entries(shownWho).every(([id, at]) => afterWho[id] === at);
  check("ОТПУСТИЛ — КАРТЫ НЕ ДВИНУЛИСЬ: превью показало то, что и вышло", kept, { shown: shownWho, after: afterWho });
}

// УВЁЛ КАРТУ ИЗ КРУГА — ПРЕВЬЮ СНЯЛОСЬ, и карты вернулись на свои места сами.
{
  const rest = await ringDrew();
  const d = (await spots()).deckTop;
  await p.mouse.move(d.x, d.y);
  await p.mouse.down();
  await p.mouse.move(195, 800, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(500);
  const one = await p.locator("[data-card]").last().boundingBox();
  await p.mouse.move(one.x + one.width / 2, one.y + 8);
  await p.mouse.down();
  await aimAt((await spots()).middle, (aim) => aim.kind === "deck" && aim.pile === "ring");
  await p.waitForTimeout(400);
  check("над кругом круг раздвинут", JSON.stringify(await ringDrew()) !== JSON.stringify(rest), { rest, now: await ringDrew() });
  await p.mouse.move(360, 780, { steps: 10 });
  await p.waitForTimeout(500);
  check("увёл прочь — круг вернулся как был", JSON.stringify(await ringDrew()) === JSON.stringify(rest), { rest, now: await ringDrew() });
  await p.mouse.up();
  await p.waitForTimeout(600);
}

// ЦЕЛЬ ПРИЛИПАЕТ: палец дрожит на границе между двумя целями — круг не должен перекладываться на
// каждый пиксель. Ведём палец туда-сюда через границу малым шагом и считаем, сколько раз передумали.
{
  const d = (await spots()).deckTop;
  await p.mouse.move(d.x, d.y);
  await p.mouse.down();
  await p.mouse.move(195, 800, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(500);
  const box = await p.locator("[data-card]").last().boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + 8);
  await p.mouse.down();
  // ГДЕ ЦЕЛЬ МЕНЯЕТСЯ — ищем ПО САМОЙ ЦЕЛИ, шагая пальцем от карты к середине между соседями.
  // Палец и прицел — разные точки (карту держат за край), поэтому грань считается по тому, что
  // говорит экран, а не по расстояниям на стекле.
  const a = await ringAt(1);
  const b = await ringAt(2);
  // Путь ведём ДО СОСЕДНЕЙ КАРТЫ, а не до середины между ними: палец и прицел разъезжаются, и на
  // коротком отрезке грань может не попасться вовсе.
  const mid = { x: b.x, y: b.y };
  const steps = [];
  for (let i = 0; i <= 30; i += 1) {
    const at = { x: Math.round(a.x + ((mid.x - a.x) * i) / 30), y: Math.round(a.y + ((mid.y - a.y) * i) / 30) };
    await p.mouse.move(at.x, at.y, { steps: 1 });
    await p.waitForTimeout(35);
    const aim = (await spots()).aim;
    steps.push({ at, key: `${aim.kind}:${aim.index ?? ""}` });
  }
  const flip = steps.findIndex((one, i) => i > 0 && one.key !== steps[i - 1].key);
  check("на пути от карты к соседке цель хоть раз меняется", flip > 0, steps.map((one) => one.key));
  const seen = new Set();
  if (flip > 0) {
    // Дрожим ровно на грани: два соседних положения пальца, между которыми цель и менялась.
    for (let i = 0; i < 12; i += 1) {
      const at = steps[flip - (i % 2)].at;
      await p.mouse.move(at.x, at.y, { steps: 1 });
      await p.waitForTimeout(40);
      const aim = (await spots()).aim;
      seen.add(`${aim.kind}:${aim.index ?? ""}`);
    }
  }
  check("палец дрожит на границе — цель НЕ мечется", seen.size === 1, [...seen]);
  await p.mouse.move(360, 780, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(600);
}

// ДЫРА — ЦЕЛЬ, И В НЕЁ САДЯТСЯ, НИКОГО НЕ ДВИГАЯ.
//
// Взяли карту, унесли в руку — на её месте осталось свободное место. Наводим туда другую карту:
// круг не перекладывается, потому что место уже есть, а контур стоит ровно в дыре.
{
  const было = await ringWho();
  const ids = await ringIds();
  const takenId = ids[1];
  const дыра = await ringAt(1);
  await p.mouse.move(дыра.x, дыра.y);
  await p.mouse.down();
  await p.mouse.move(195, 810, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(700);
  const после = await ringWho();
  check("вынесли карту — круг не шелохнулся", Object.entries(было).filter(([id]) => id !== takenId).every(([id, at]) => после[id] === at), { было, после });
  // Берём ДРУГУЮ карту (из колоды) и целимся в оставшуюся дыру.
  const d = (await spots()).deckTop;
  await p.mouse.move(d.x, d.y);
  await p.mouse.down();
  await p.mouse.move(195, 800, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(500);
  const box = await p.locator("[data-card]").last().boundingBox();
  const чужая = await p.locator("[data-card]").last().getAttribute("data-card");
  await p.mouse.move(box.x + box.width / 2, box.y + 8);
  await p.mouse.down();
  const got = await aimAt(дыра, (aim) => aim.kind === "deckSpot");
  check("палец на дыре — прицел в свободное место", got.kind === "deckSpot", got);
  const приНаведении = await ringWho();
  check("НАД ДЫРОЙ КРУГ НЕ РАССТУПАЕТСЯ: место уже есть", Object.entries(после).every(([id, at]) => приНаведении[id] === at), { после, приНаведении });
  check("и контур горит ровно один", (await p.locator("[data-g=ring-slot]").count()) === 1, null);
  await p.mouse.up();
  await p.waitForTimeout(800);
  const итог = await ringWho();
  check("села в дыру — соседи не двинулись", Object.entries(после).every(([id, at]) => итог[id] === at), { после, итог });
  check("…и чужая карта легла ровно в дыру", итог[чужая] === было[takenId], { легла: итог[чужая], дыра: было[takenId] });
  const своё = (await spots()).piles.find((x) => x.id === "ring");
  check("место, занятое в дыре, круг не пересчитывал: мест столько же", своё.spot.slots === своё.count, { slots: своё.spot.slots, count: своё.count });
}

// ЧТО ВИДИТ ЧУЖОЙ ЭКРАН — правда СТОЛА, а не моя догадка.
//
// Всё выше меряно на своём экране, а он показывает и то, что сам себе предсказал. Второй зритель
// ничего не трогал: у него только то, что прислал стол. Разошлись — значит, догадка врёт, и это
// всплывёт у людей, а не здесь.
const p2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
await p2.goto(`${base}/table/?room=${room}&name=B`);
await p2.waitForSelector("[data-section]");
await p2.waitForTimeout(1200);
const hisRing = async () => JSON.parse(await p2.getAttribute("canvas", "data-spots")).piles.find((x) => x.id === "ring");

// ПРЕВЬЮ — ТОЛЬКО МОЁ. Пока я вожу картой над кругом, у соседа не должно шевелиться НИЧЕГО: это мой
// прицел, а не мой ход. Он увидит круг после дропа.
{
  const was = (await hisRing()).drew;
  const d = (await spots()).deckTop;
  await p.mouse.move(d.x, d.y);
  await p.mouse.down();
  await p.mouse.move(195, 800, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(500);
  const box = await p.locator("[data-card]").last().boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + 8);
  await p.mouse.down();
  await aimAt((await spots()).middle, (aim) => aim.kind === "deck" && aim.pile === "ring");
  await p.waitForTimeout(500);
  check("у МЕНЯ круг раздвинут", JSON.stringify(await ringDrew()) !== JSON.stringify(was), { was, mine: await ringDrew() });
  check("а у СОСЕДА ничего не шелохнулось: превью не его дело", JSON.stringify((await hisRing()).drew) === JSON.stringify(was), { was, his: (await hisRing()).drew });
  await p.mouse.up();
  await p.waitForTimeout(900);
  check("отпустил — вот теперь и сосед видит новый круг", JSON.stringify((await hisRing()).drew) === JSON.stringify(await ringDrew()), { his: (await hisRing()).drew, mine: await ringDrew() });
}

const his = JSON.parse(await p2.getAttribute("canvas", "data-spots")).piles.find((x) => x.id === "ring");
const mine = (await spots()).piles.find((x) => x.id === "ring");
// ЧИСЛО МЕСТ — ПРАВДА СТОЛА, а не картинка. После обычного хода мест ровно столько, сколько карт:
// дыры закрылись. Смотрим у соседа: он ничего не трогал, и у него только то, что прислал стол.
check("у стола мест ровно столько, сколько карт: дыр не осталось", his.spot.slots === his.count, { slots: his.spot.slots, count: his.count });
check("чужой экран видит те же карты круга", JSON.stringify(his.ids) === JSON.stringify(mine.ids), { his: his.ids, mine: mine.ids });
check("и на тех же номерах — стол раздал, а не догадка", JSON.stringify(his.at) === JSON.stringify(mine.at), { his: his.at, mine: mine.at });
{
  const turnOf = (one) => { const [x, y] = (one ?? "").split(",").map(Number); return ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360; };
  const turns = (his.drew ?? []).filter(Boolean).map(turnOf);
  const steps = turns.slice(1).map((one, i) => ((one - turns[i]) + 360) % 360);
  check("у КАЖДОЙ карты круга на чужом экране есть номер места", his.at.every((one) => typeof one === "number"), his.at);
  check("СТОЛ НОРМАЛИЗУЕТ КРУГ САМ: шаг между всеми картами один", steps.length >= 2 && steps.every((one) => Number.isFinite(one) && Math.abs(one - steps[0]) < 0.5), { turns, steps });
  check("…и это доля круга без стрелки, делённая на число карт", Math.abs(steps[0] - (360 - 36) / Math.max(3, his.count)) < 0.5, { step: steps[0], n: his.count });
}

// ВЫСЫПАЛИ НА СУКНО — карты легли новой стопкой ТАМ, а круг остался на месте и пуст. И это должно
// быть видно СРАЗУ, ещё до ответа стола: догадка обязана высыпать так же, как высыпает стол.
{
  const g = await ringGrip();
  await p.mouse.move(g.x, g.y);
  await p.mouse.down();
  await p.mouse.move(g.x + 120, g.y + 150, { steps: 10 });
  await p.waitForTimeout(350);
  await p.mouse.up();
  await p.waitForTimeout(120);
  const soon = (await spots()).piles.find((x) => x.id === "ring");
  check("сразу после дропа круг стоит, где очерчен", soon.spot.x === 0 && soon.spot.y === 0, soon.spot);
  check("…и он пуст: карты ушли новой стопкой", soon.count === 0, soon.count);
  await p.waitForTimeout(800);
  const now = (await spots()).piles.find((x) => x.id === "ring");
  check("и после ответа стола — там же и пуст", now.spot.x === 0 && now.spot.y === 0 && now.count === 0, { spot: now.spot, count: now.count });
  check("а стрелки больше нет: круг опустел", now.arrow === null || now.arrow === undefined, now.arrow);
  const born = (await spots()).piles.filter((x) => x.id !== "ring" && x.id !== "deck" && x.count > 0);
  check("высыпанная стопка родилась на сукне", born.length > 0, born.map((one) => one.id));
}

// ГОРИТ ТОЛЬКО ТО, ЧТО ПРИМЕТ. Экран спрашивает тот же закон, каким ответит стол: круг берёт карту и
// не берёт охапку, а охапку в крестовом принимает только рука крупье. Пока экран зажигал всё подряд,
// игрок поднимал стопку и видел контуры на стульях, куда её всё равно не положат.
{
  const lit = async () => ({
    стопки: await p.$$eval('[data-g="deck-zone"]', (els) => els.map((e) => e.getAttribute("data-pile"))),
    стулья: await p.$$eval('[data-g="chair-zone"]', (els) => els.map((e) => e.getAttribute("data-chair"))),
  });
  const крупье = (await spots()).seats.filter((one) => one.croupier).map((one) => one.key);

  // НЕСУ КАРТУ: круг её берёт.
  const top = (await spots()).deckTop;
  await p.mouse.move(top.x, top.y);
  await p.mouse.down();
  await p.mouse.move(top.x + 30, top.y + 60, { steps: 6 });
  await p.waitForTimeout(350);
  const подКарту = await lit();
  await p.mouse.up();
  await p.waitForTimeout(400);
  check("под картой горит круг", подКарту.стопки.includes("ring"), подКарту);

  // НЕСУ ОХАПКУ: круг её не берёт, а рука крупье берёт. Ручка появляется только у круга с картами —
  // если он пуст, сперва кладём в него карту.
  if (((await spots()).piles.find((one) => one.id === "ring")?.count ?? 0) === 0) {
    const ещё = (await spots()).deckTop;
    await p.mouse.move(ещё.x, ещё.y);
    await p.mouse.down();
    await p.mouse.move(195, 800, { steps: 6 });
    await p.mouse.up();
    await p.waitForTimeout(450);
    const вРуке = await p.locator("[data-card]").last().boundingBox();
    const середина = (await spots()).middle;
    await p.mouse.move(вРуке.x + вРуке.width / 2, вРуке.y + 8);
    await p.mouse.down();
    await p.mouse.move(середина.x, середина.y, { steps: 8 });
    await p.mouse.up();
    await p.waitForTimeout(650);
  }
  const ручка = (await spots()).piles.find((one) => one.id === "ring")?.grip;
  check("у круга с картами есть ручка", Boolean(ручка && ручка.x > 0), ручка);
  if (ручка && ручка.x > 0) {
    await p.mouse.move(ручка.x, ручка.y);
    await p.mouse.down();
    await p.mouse.move(ручка.x + 20, ручка.y + 70, { steps: 8 });
    await p.waitForTimeout(450);
    const подСтопку = await lit();
    await p.mouse.up();
    check("под стопкой круг НЕ горит: охапку он не берёт", !подСтопку.стопки.includes("ring"), подСтопку);
    check("…а рука крупье горит: ей охапку можно", крупье.every((one) => подСтопку.стулья.includes(one)), { горят: подСтопку.стулья, крупье });
    check("…и чужие стулья не горят", подСтопку.стулья.every((one) => крупье.includes(one)), подСтопку.стулья);
  }
}

await browser.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(c.ok ? "  ok" : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
}
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
