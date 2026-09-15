// НИЖНИЙ БАР СЕКЦИЯМИ И ПОЗА РУКИ — два браузера: A держит руку, B смотрит на неё в окне стула.
// Секции открываются перелётом кнопок; сжатая рука отдаёт касанию только верхнюю карту, скрытая — только
// то, что торчит; порядок меняется один раз; «Покинуть стул» — только через вопрос.
//   TABLE_SECRET=dev TABLE_GUESTS=1 PORT=2599 npx tsx src/index.ts   (в соседнем окне)
//   node scripts/tableHud.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const secret = process.argv[3] ?? "dev";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);

const browser = await chromium.launch();
const open = async (name) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message));
  await p.goto(`${base}/table/?room=${room}&name=${name}`);
  await p.waitForSelector("[data-section]");
  await p.waitForTimeout(400);
  return p;
};
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const spots = async (p) => JSON.parse(await p.getAttribute("canvas", "data-spots"));
const wait = (p, ms = 450) => p.waitForTimeout(ms);
const bar = (p) => p.evaluate(() => ({
  sections: [...document.querySelectorAll("button[data-section]:not([data-g=ghost])")].map((b) => b.dataset.section),
  subs: [...document.querySelectorAll("button[data-bar]:not([data-g=ghost])")].map((b) => b.dataset.bar),
  ghosts: document.querySelectorAll("[data-g=ghost]").length,
}));
const drag = async (p, x, y, x2, y2) => {
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.mouse.move(x2, y2, { steps: 10 });
  await p.mouse.up();
  await wait(p, 600);
};
const cardsOf = (p, owner) => p.evaluate((o) => [...document.querySelectorAll(`[data-card][data-owner="${o}"]`)].map((el) => {
  const r = el.getBoundingClientRect();
  return { id: el.dataset.card, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), top: Math.round(r.top), h: r.height, rank: el.textContent };
}), owner);
const hit = (p, x, y) => p.evaluate(([x, y]) => {
  const el = document.elementFromPoint(x, y)?.closest("[data-card],[data-g=curtain]");
  return el ? el.dataset.card ?? "curtain" : null;
}, [x, y]);

const A = await open("A");
const B = await open("B");
const aSeat = (await spots(A)).seats.find((s) => s.who === "A").key;

// ── 1. Бар: три секции; открыть — кнопка уезжает влево, остальные улетают, прилетают свои; ещё раз — закрыть ──
let b = await bar(A);
check("в баре четыре кнопки секций (с диалогом) и больше ничего", b.sections.join() === "pose,chair,order,say" && b.subs.length === 0, b);
const x0 = await A.locator('[data-section="pose"]').evaluate((e) => e.getBoundingClientRect().left);
await A.click('[data-section="order"]');
await wait(A, 70);
const mid = await A.evaluate(() => ({
  ghosts: document.querySelectorAll("[data-g=ghost]").length,
  moved: getComputedStyle(document.querySelector('[data-section="order"]')).transform,
}));
check("посреди перелёта: улетающие копии есть, кнопка секции в пути", mid.ghosts === 3 && mid.moved !== "none", mid);
await wait(A);
b = await bar(A);
const x1 = await A.locator('[data-section="order"]').evaluate((e) => e.getBoundingClientRect().left);
check("секция открыта: её кнопка слева, остальных нет, её кнопки на месте", b.sections.join() === "order" && x1 === x0 && b.subs.join() === "suit,rank,reverse,shuffle" && b.ghosts === 0, [b, x0, x1]);
check("кнопка секции горит", (await A.getAttribute('[data-section="order"]', "aria-pressed")) === "true", null);
const looks = await A.evaluate(() => {
  const sec = getComputedStyle(document.querySelector('[data-section="order"]'));
  return { round: sec.borderRadius.startsWith("50%") || parseFloat(sec.borderRadius) >= 20, fill: sec.backgroundImage, divider: Boolean(document.querySelector("[data-g=divider]")), back: document.querySelector('[data-section="order"] path')?.getAttribute("d") };
});
check("открытая секция не похожа на включённую кнопку: круг, без золотой заливки, «назад», черта", looks.round && !/248, 216, 133/.test(looks.fill) && looks.back === "M14.5 5.5 8 12l6.5 6.5" && looks.divider, looks);
await A.click('[data-section="order"]');
await wait(A);
b = await bar(A);
check("та же кнопка закрыла секцию", b.sections.join() === "pose,chair,order,say" && b.subs.length === 0 && b.ghosts === 0, b);

// ── 2. Четыре карты в руку A ─────────────────────────────────────────────────────────────────────
const m = (await spots(A)).middle;
for (let i = 0; i < 4; i += 1) await drag(A, m.x, m.y, 195, 700);
check("у A в руке 4 карты", (await cardsOf(A, aSeat)).length === 4, await cardsOf(A, aSeat));

// ── 3. Порядок: по номиналу — один раз ───────────────────────────────────────────────────────────
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const rankOf = (t) => RANKS.findIndex((r) => t.startsWith(r) && !(r === "1"));
await A.click('[data-section="order"]');
await wait(A);
await A.click('[data-bar="rank"]');
await wait(A, 600);
const ranks = (await cardsOf(A, aSeat)).sort((p, q) => p.x - q.x).map((c) => rankOf(c.rank.replace(/[♠♥♦♣★]/g, "")));
check("по номиналу: слева направо не убывает", ranks.every((r, i) => i === 0 || ranks[i - 1] <= r), ranks);
// Реверс: перелёты карт не выходят за верх нижнего бара.
await A.click('[data-bar="reverse"]');
await wait(A, 90);
const under = await A.evaluate(() => {
  const barTop = document.querySelector("[data-g=bar]").getBoundingClientRect().top;
  return [...document.querySelectorAll("[data-flight]")].map((el) => {
    const layer = el.parentElement.getBoundingClientRect();
    return { clip: getComputedStyle(el.parentElement).overflow === "hidden" && Math.abs(layer.bottom - barTop) < 1.5, bottom: Math.round(el.getBoundingClientRect().bottom), barTop: Math.round(barTop) };
  });
});
check("реверс: карты летят, и их слой обрезан по верху бара", under.length >= 2 && under.every((f) => f.clip), under);
await wait(A, 500);
await A.click('[data-section="order"]');
await wait(A);

// ── 4. B открывает окно стула A: подписи с числом нет, позы у не-админа нет ────────────────────────
const aSpot = (await spots(B)).seats.find((s) => s.who === "A");
await B.mouse.click(aSpot.x, aSpot.y);
await wait(B);
const tipText = await B.evaluate((id) => document.querySelector(`[data-tip="${id}"]`)?.textContent ?? null, aSeat);
check("окно стула A открыто и без «РУКА · N»", tipText !== null && !/РУКА/.test(tipText), tipText);
check("B не админ — позы чужой руки в окне нет", (await B.locator("[data-pose]").count()) === 0, null);

// ── 5. Сжать: одна карта видна, касание — только у верхней; и у A, и у B ───────────────────────────
await A.click('[data-section="pose"]');
await wait(A);
await A.click('[data-bar="shrink"]');
await wait(A, 600);
for (const [who, p] of [["A", A], ["B", B]]) {
  const cs = await cardsOf(p, aSeat);
  const same = cs.every((c) => Math.abs(c.x - cs[0].x) < 2 && Math.abs(c.y - cs[0].y) < 2);
  const top = (await p.evaluate((o) => [...document.querySelectorAll(`[data-card][data-owner="${o}"]`)].at(-1)?.dataset.card, aSeat));
  const under = await p.evaluate((o) => [...document.querySelectorAll(`[data-card][data-owner="${o}"]`)].slice(0, -1).every((el) => getComputedStyle(el).pointerEvents === "none"), aSeat);
  check(`сжата у ${who}: карты стопкой, под пальцем верхняя, остальные касание не ловят`, cs.length === 4 && same && (await hit(p, cs[0].x, cs[0].y)) === top && under, cs);
}
await A.click('[data-bar="shrink"]');
await wait(A, 600);

// ── 6. Скрыть: у B рука за краем окна — торчит край, за него тянется; ниже — занавес ────────────────
await A.click('[data-bar="tuck"]');
await wait(A, 600);
const tucked = await cardsOf(B, aSeat);
const curtainTop = await B.evaluate(() => document.querySelector("[data-g=curtain]")?.getBoundingClientRect().top ?? null);
const edge = tucked.sort((p, q) => p.x - q.x)[0];
check("скрыта у B: занавес есть", curtainTop !== null, curtainTop);
check("скрыта у B: торчащий край карты ловит касание", curtainTop !== null && (await hit(B, edge.x, Math.round((edge.top + curtainTop) / 2))) !== null && (await hit(B, edge.x, Math.round((edge.top + curtainTop) / 2))) !== "curtain", [edge, curtainTop]);
check("скрыта у B: середина карты под занавесом", (await hit(B, edge.x, Math.round(curtainTop + 6))) === "curtain", null);
await drag(B, edge.x, Math.round((edge.top + curtainTop) / 2), 195, 380);
check("B вытянул карту из скрытой руки за край", (await spots(B)).felt.length === 1, (await spots(B)).felt);
await A.click('[data-bar="tuck"]');
await wait(A, 600);
await A.click('[data-section="pose"]');
await wait(A);

// ── 7. Покинуть стул: вопрос, тап мимо закрывает, «Встать» — встал ────────────────────────────────
await A.click('[data-section="chair"]');
await wait(A);
await A.click('[data-bar="leave"]');
await wait(A, 200);
check("«Покинуть» открыло вопрос", (await A.locator("[data-confirm]").count()) === 1, null);
await A.mouse.click(30, 150);
await wait(A, 200);
check("тап мимо закрыл вопрос, стул на месте", (await A.locator("[data-confirm]").count()) === 0 && (await spots(A)).seatAngle !== null, null);
await A.click('[data-bar="leave"]');
await wait(A, 200);
await A.click("[data-stand]");
await wait(A, 700);
check("«Встать» — A без стула", (await spots(A)).seatAngle === null, (await spots(A)).seatAngle);
const left = (await spots(B)).seats.find((s) => s.key === aSeat);
check("у B стул A стоит покинутым с картами", left && left.who === undefined, left);

await browser.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
}
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
