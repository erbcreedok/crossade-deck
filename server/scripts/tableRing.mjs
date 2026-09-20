// СВОБОДНЫЙ КРУГ ХОДА НА ЭКРАНЕ: карта ложится туда, куда её положили, прилипая к двенадцати часам
// от севера стола. Соседей не двигает никто — ни при укладке, ни при изъятии.
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

// ── ЗАКОНЫ СВОБОДНОГО КРУГА ───────────────────────────────────────────────────────────────────────

/** Кто лежит в круге, по порядку входа. */
const ringIds = async () => ((await spots()).piles.find((one) => one.id === "ring") ?? { ids: [] }).ids;
/** Углы карт круга — состояние, а не картинка. */
const ringAts = async () => ((await spots()).piles.find((one) => one.id === "ring") ?? { at: [] }).at;

const кругА = async () => (await spots()).piles.find((one) => one.id === "ring") ?? { at: [], ids: [], count: 0, hours: [] };
const углы = async () => (await кругА()).at.filter((one) => one !== null);
const врозь = (a, b) => {
  const away = Math.abs(((a - b) % 360 + 540) % 360 - 180);
  return Math.min(away, 360 - away);
};
/** Точка на стекле под этим углом круга — туда и целимся пальцем. */
const наУглу = async (turn) => {
  const r = await кругА();
  const час = r.hours.find((one) => one.turn === turn);
  return час ? onGlass({ x: час.x, y: час.y }) : onGlass({ x: 0, y: 0 });
};
/** Взять верхнюю с колоды в руку, вернуть её экранную карту. */
const вРуку = async () => {
  const top = (await spots()).deckTop;
  await p.mouse.move(top.x, top.y);
  await p.mouse.down();
  await p.mouse.move(195, 800, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(420);
  return p.locator("[data-card]").last();
};
/** Положить карту из руки в круг, целясь в этот угол. */
const вКруг = async (turn) => {
  const карта = await вРуку();
  const box = await карта.boundingBox();
  const цель = await наУглу(turn);
  await p.mouse.move(box.x + box.width / 2, box.y + 8);
  await p.mouse.down();
  await p.mouse.move(цель.x, цель.y, { steps: 8 });
  await p.waitForTimeout(220);
  const контур = await p.$("[data-g=ring-slot]");
  await p.mouse.up();
  await p.waitForTimeout(620);
  return Boolean(контур);
};

// СНЕППИНГ: карта прилипает к ближайшему часу. Двенадцать точек по 30° от севера СТОЛА, и камера на
// них не влияет.
{
  const было = (await углы()).length;
  const показали = await вКруг(90);
  const стало = await углы();
  check("карта легла в круг", стало.length === было + 1, стало);
  check("и прилипла ровно к часу, в который целились", стало.includes(90), стало);
  check("а контур показал место заранее", показали, показали);
}

// СОСЕДЕЙ НЕ ДВИГАЕТ НИКТО: ни новая карта, ни изъятие. Раскладки больше нет вовсе.
{
  const до = await углы();
  await вКруг(270);
  const после = await углы();
  check("новая карта соседей не шелохнула", до.every((one) => после.includes(one)), { до, после });
  check("и встала на свой час", после.includes(270), после);
}

// ЗАНЯТЫЙ ЧАС НЕ ЗАНИМАЮТ ВТОРОЙ РАЗ: карта встаёт рядом, не прячась под соседку.
{
  const до = await углы();
  await вКруг(90);
  const после = await углы();
  const новый = после.find((one) => !до.includes(one));
  check("вторая карта на занятый час легла РЯДОМ, а не поверх", новый !== undefined && новый !== 90, { до, после });
  if (новый !== undefined) {
    check("…и ни на кого не налезла", до.every((one) => врозь(one, новый) > 10), { новый, до });
  }
}

// СТРЕЛКА ПОКАЗЫВАЕТ ПЕРВУЮ ВОШЕДШУЮ и идёт ИЗ СЕРЕДИНЫ.
{
  const r = await кругА();
  const первая = r.at[0];
  check("стрелка есть, пока в круге есть карты", r.arrow !== null, r.arrow);
  check("и смотрит на первую ВОШЕДШУЮ карту", r.arrow !== null && врозь(r.arrow.turn, первая) < 1, { стрелка: r.arrow?.turn, первая });
  // Луч растёт из середины круга: очерченное поле и стрелка стоят в одной точке стола.
  check("…и растёт из середины круга", r.ring !== null && Math.hypot(r.ring.x - r.arrow.x, r.ring.y - r.arrow.y) < 0.01, { ring: r.ring, arrow: r.arrow });
}

// ЗАБРАЛИ ПЕРВУЮ ВОШЕДШУЮ — стрелка перешла к следующей, остальные не шелохнулись.
{
  const было = await кругА();
  const первая = было.ids[0];
  const место = await onGlass(await p.evaluate((id) => {
    const s = JSON.parse(document.querySelector("canvas").dataset.spots);
    const r = s.piles.find((one) => one.id === "ring");
    const i = r.ids.indexOf(id);
    const [x, y] = r.drew[i].split(",").map(Number);
    return { x, y };
  }, первая));
  await p.mouse.move(место.x, место.y);
  await p.mouse.down();
  await p.mouse.move(195, 800, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(700);
  const стало = await кругА();
  check("первая вошедшая ушла из круга", !стало.ids.includes(первая), стало.ids);
  check("остальные лежат ровно там же", стало.at.every((one) => было.at.includes(one)), { было: было.at, стало: стало.at });
  check("а стрелка перешла к следующей вошедшей", стало.arrow !== null && врозь(стало.arrow.turn, стало.at[0]) < 1, { стрелка: стало.arrow?.turn, первая: стало.at[0] });
}

// ВЕРНУЛАСЬ В КРУГ — ВОШЛА ПОСЛЕДНЕЙ: круг помнит порядок входа, а не положение.
{
  const было = await кругА();
  const первая = было.ids[0];
  const место = await onGlass(await p.evaluate((id) => {
    const s = JSON.parse(document.querySelector("canvas").dataset.spots);
    const r = s.piles.find((one) => one.id === "ring");
    const i = r.ids.indexOf(id);
    const [x, y] = r.drew[i].split(",").map(Number);
    return { x, y };
  }, первая));
  await p.mouse.move(место.x, место.y);
  await p.mouse.down();
  await p.mouse.move(195, 800, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(650);
  await вКруг(180);
  const стало = await кругА();
  check("ушла и вернулась — теперь она последняя", стало.ids.at(-1) === первая, { было: было.ids, стало: стало.ids });
  check("и стрелка смотрит уже не на неё", стало.arrow !== null && врозь(стало.arrow.turn, стало.at[0]) < 1 && стало.at[0] !== стало.at.at(-1), { стрелка: стало.arrow?.turn });
}

// ЧАСЫ КРУГА ЗНАЮТ, КТО ЗАНЯТ: по ним целится прицел и рисуется снеппинг.
{
  const r = await кругА();
  check("часов ровно двенадцать", r.hours.length === 12, r.hours.length);
  check("и занятыми помечены те, где лежат карты", r.hours.filter((one) => one.busy).length > 0, r.hours.filter((one) => one.busy).map((one) => one.turn));
}

// КАРТА ЛЕТИТ, А НЕ ПРЫГАЕТ — и летит ОДНА.
//
// Соседи не трогаются с места: круг их не двигает. Раньше здесь проверялось обратное — что летят
// все сразу, — потому что каждая новая карта раскладывала круг заново. Теперь лететь должна ровно
// та, которую положили.
{
  const до = await ringAts();
  const летели = [];
  const карта = await вРуку();
  const box = await карта.boundingBox();
  const цель = await наУглу(150);
  await p.mouse.move(box.x + box.width / 2, box.y + 8);
  await p.mouse.down();
  await p.mouse.move(цель.x, цель.y, { steps: 8 });
  await p.mouse.up();
  // Ловим полёт сразу после дропа: летящая карта живёт отдельным элементом в воздухе.
  for (let i = 0; i < 12; i += 1) {
    const air = await p.$$eval("[data-flight]", (els) => els.map((e) => e.getAttribute("data-flight")));
    летели.push(...air);
    await p.waitForTimeout(40);
  }
  await p.waitForTimeout(600);
  const после = await ringAts();
  check("положенная карта именно ЛЕТИТ", летели.length > 0, летели.slice(0, 3));
  check("и летит ОДНА: соседей круг не двигает", new Set(летели).size <= 1, [...new Set(летели)]);
  check("а углы соседей не изменились ни на градус", до.every((one) => после.includes(one)), { до, после });
}

// ГОРИТ ТОЛЬКО ТО, ЧТО ПРИМЕТ: круг берёт карту и не берёт охапку, а охапку в крестовом принимает
// только рука крупье.
{
  const lit = async () => ({
    стопки: await p.$$eval('[data-g="deck-zone"]', (els) => els.map((e) => e.getAttribute("data-pile"))),
    стулья: await p.$$eval('[data-g="chair-zone"]', (els) => els.map((e) => e.getAttribute("data-chair"))),
  });
  const крупье = (await spots()).seats.filter((one) => one.croupier).map((one) => one.key);

  const top = (await spots()).deckTop;
  await p.mouse.move(top.x, top.y);
  await p.mouse.down();
  await p.mouse.move(top.x + 30, top.y + 60, { steps: 6 });
  await p.waitForTimeout(350);
  const подКарту = await lit();
  await p.mouse.up();
  await p.waitForTimeout(400);
  check("под картой горит круг", подКарту.стопки.includes("ring"), подКарту);

  const ручка = await ringGrip();
  check("у круга с картами есть ручка", ручка !== null, ручка);
  if (ручка) {
    await p.mouse.move(ручка.x, ручка.y);
    await p.mouse.down();
    await p.mouse.move(ручка.x + 20, ручка.y + 70, { steps: 8 });
    await p.waitForTimeout(450);
    const подСтопку = await lit();
    await p.mouse.up();
    await p.waitForTimeout(500);
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
