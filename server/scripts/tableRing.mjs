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
const RING_HOME = 1.5;
/** Где на стекле лежит i-я карта круга: места делят круг поровну, и их не меньше трёх. */
const ringAt = async (i, slots) => {
  const sp = await spots();
  const a = ((360 / slots) * i * Math.PI) / 180;
  return { x: sp.middle.x + RING_HOME * sp.k * Math.sin(a), y: sp.middle.y - RING_HOME * sp.k * Math.cos(a) };
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
const inserted = await fromDeckTo(await ringAt(0, 3));
const after = await ringIds();
check("навёл на первую карту — встал сразу после неё", after[1] === inserted && after[0] === pair[0] && after[2] === pair[1], { pair, after, inserted });

// МИМО КАРТ — В КОНЕЦ, как было всегда: прицел по карте, а не по всему кругу.
const tail = await fromDeckTo((await spots()).middle);
check("мимо карт — карта уходит в конец", (await ringIds()).at(-1) === tail, { ids: await ringIds(), tail });

// КАРТЫ ЛЕЖАТ НА ПОЛПУТИ К КОНТУРУ, а не у самой линии: круг хода читается как ход, а не как ободок.
// ХВАТ ПРЯМО ПО КАРТЕ: тултип для этого открывать не нужно — палец берёт ту карту, на которой лежит.
const onRing = await ringAt(0, 4);
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

// ГРИП КРУГА: карты сходятся под палец, на местах остаются контуры, круг с места не двигается.
const before = (await spots()).piles.find((p) => p.id === "ring").spot;
const grip = await ringGrip();
await p.mouse.move(grip.x, grip.y);
await p.mouse.down();
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
const ring = RING_HOME * (await spots()).k;
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
