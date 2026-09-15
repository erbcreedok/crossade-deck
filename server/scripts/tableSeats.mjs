// РАССАДКА ОДНА НА ВСЕХ И КАМЕРА У СВОЕГО СТУЛА — два-три браузера в одной комнате. Стол и карты у всех
// в одних осях; свой стул внизу ставит камера. Плюс кнопка «к своему стулу», пересадка и высота стопок.
//   TABLE_SECRET=dev TABLE_GUESTS=1 PORT=2599 npx tsx src/index.ts   (в соседнем окне)
//   node scripts/tableSeats.mjs [base] [secret] [shot]
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
const view = async (p) => (await p.getAttribute("canvas", "data-view")).split(",").map(Number);
const seatOf = async (p, who) => (await spots(p)).seats.find((s) => s.who === who);
const turnOf = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;

const A = await open("A");
const B = await open("B");

// ── 1. Каждый видит свой стул внизу, соседа напротив — наверху ─────────────────────────────────
for (const [p, me, other] of [[A, "A", "B"], [B, "B", "A"]]) {
  const s = await spots(p);
  const mine = await seatOf(p, me);
  const theirs = await seatOf(p, other);
  check(`${me}: свой стул внизу, ${other} наверху`, mine.y > s.middle.y + 50 && theirs.y < s.middle.y - 50, [mine, theirs, s.middle]);
}

// ── 2. A тянет карту с колоды на юг своего экрана — у B она на севере его экрана ──────────────────
const m = (await spots(A)).middle;
await A.mouse.move(m.x, m.y);
await A.mouse.down();
await A.mouse.move(m.x, m.y + 90, { steps: 8 });
await A.mouse.up();
await A.waitForTimeout(800);
const onA = (await spots(A)).felt[0];
const onB = (await spots(B)).felt[0];
const mb = (await spots(B)).middle;
check("A положил карту ниже колоды у себя", onA && onA.y > m.y + 40, onA);
check("у B та же карта выше колоды — он сидит напротив", onB && onB.y < mb.y - 40, [onB, mb]);
check("и у B она лежит повёрнутой, как у A ровно", onB && Math.abs(turnOf((await view(B))[3] + onB.angle - 180)) < 2, [onB, await view(B)]);

// ── 3. Кнопка «к своему стулу»: нет, пока камера на месте; появилась после поворота; вернула ─────
check("кнопки нет, пока камера у своего стула", (await A.locator("[data-home]").count()) === 0, null);
await A.keyboard.down("Control");
await A.mouse.move(80, 200);
await A.mouse.down();
await A.mouse.move(180, 150, { steps: 8 });
await A.mouse.up();
await A.keyboard.up("Control");
await A.waitForTimeout(200);
const turned = await view(A);
check("после поворота и наклона кнопка появилась", (await A.locator("[data-home]").count()) === 1 && Math.abs(turned[3] - (await spots(A)).seatAngle) > 10, turned);
await A.locator("[data-home]").dispatchEvent("pointerdown");
await A.waitForTimeout(900);
const home = await view(A);
check("кнопка вернула поворот к стулу и сняла наклон", Math.abs(turnOf(home[3] - (await spots(A)).seatAngle)) < 1 && home[4] < 0.5, home);
check("и сама пропала", (await A.locator("[data-home]").count()) === 0, null);

// ── 4. Высота стопок: колода растёт вверх при наклоне, разбег — к правому верху при любом повороте ───
const flatTop = (await spots(A)).deckTop;
const flatMid = (await spots(A)).middle;
await A.keyboard.down("Control");
await A.mouse.move(195, 300);
await A.mouse.down();
await A.mouse.move(195, 150, { steps: 8 });
await A.mouse.up();
await A.keyboard.up("Control");
await A.waitForTimeout(200);
const tilt = await spots(A);
const flatRise = flatMid.y - flatTop.y;
const tiltRise = tilt.middle.y - tilt.deckTop.y;
check("наклон — колода выше", (await view(A))[4] > 20 && tiltRise > flatRise + 3, [flatRise, tiltRise, await view(A)]);
await A.keyboard.down("Control");
await A.mouse.move(100, 300);
await A.mouse.down();
await A.mouse.move(400, 300, { steps: 12 });
await A.mouse.up();
await A.keyboard.up("Control");
await A.waitForTimeout(200);
const spun = await spots(A);
check("повернул стол — разбег колоды всё равно вправо-вверх экрана", spun.deckTop.x > spun.middle.x && spun.deckTop.y < spun.middle.y, [spun.deckTop, spun.middle, await view(A)]);
await A.locator("[data-home]").dispatchEvent("pointerdown");
await A.waitForTimeout(900);

// ── 5. Карта на карте поднята; при наклоне — выше ───────────────────────────────────────────────
const put = async (dx, dy) => {
  const mm = (await spots(A)).middle;
  await A.mouse.move(mm.x, mm.y);
  await A.mouse.down();
  await A.mouse.move(mm.x + dx, mm.y + dy, { steps: 8 });
  await A.mouse.up();
  await A.waitForTimeout(500);
};
const firstFelt = (await spots(A)).felt[0];
const mm = (await spots(A)).middle;
await put(firstFelt.x - mm.x, firstFelt.y - mm.y);
const pair = (await spots(A)).felt;
check("карта на карте сверху лежит без зазора", pair.length === 2 && pair[0].rise === 0 && pair[1].rise === 0, pair);
await A.keyboard.down("Control");
await A.mouse.move(195, 300);
await A.mouse.down();
await A.mouse.move(195, 100, { steps: 8 });
await A.mouse.up();
await A.keyboard.up("Control");
await A.waitForTimeout(200);
const pairT = (await spots(A)).felt;
check("при наклоне поднята, но не больше толщины карты", pairT[1].rise > 0 && pairT[1].rise <= 1, [pairT, await view(A)]);

// ── 5б. Прокрутил камеру за полоборота — своя карта, поднятая и положенная, не летит и не крутится ──
await A.locator("[data-home]").dispatchEvent("pointerdown");
await A.waitForTimeout(900);
for (let k = 0; k < 2; k += 1) {
  await A.keyboard.down("Control");
  await A.mouse.move(20, 250);
  await A.mouse.down();
  await A.mouse.move(370, 250, { steps: 10 });
  await A.mouse.up();
  await A.keyboard.up("Control");
}
await A.waitForTimeout(300);
const spunView = await view(A);
await A.evaluate(() => {
  window.__own = 0;
  new MutationObserver((l) => l.forEach((x) => x.addedNodes.forEach((n) => n.dataset?.flight && (window.__own += 1)))).observe(document.body, { childList: true, subtree: true });
});
const top2 = (await spots(A)).felt.at(-1);
await A.mouse.move(top2.x, top2.y);
await A.mouse.down();
await A.mouse.move(top2.x + 30, top2.y + 20, { steps: 6 });
await A.mouse.up();
await A.waitForTimeout(800);
check("камера прокручена за полоборота — своя положенная карта не летит", Math.abs(spunView[3] - (await spots(A)).seatAngle) > 180 && (await A.evaluate(() => window.__own)) === 0, [spunView, await A.evaluate(() => window.__own)]);

// ── 6. Пересел — камера доворачивается плавно, и новый стул внизу ────────────────────────────────
const C = await open("C");
const cm = (await spots(C)).middle;
await C.mouse.move(cm.x, cm.y);
await C.mouse.down();
await C.mouse.move(195, 760, { steps: 8 });
await C.mouse.up();
await C.waitForTimeout(500);
await C.close();
await B.waitForTimeout(800);
const bEmpty = (await spots(B)).seats.find((s) => !s.who);
await B.mouse.click(bEmpty.x, bEmpty.y);
await B.waitForTimeout(300);
const before = (await view(B))[3];
await B.locator(`[data-sit="${bEmpty.key}"]`).dispatchEvent("pointerdown");
await B.waitForTimeout(200);
const mid = (await view(B))[3];
await B.waitForTimeout(900);
const after = await spots(B);
const bSeat = await seatOf(B, "B");
check("пересел — камера доворачивается, а не прыгает", Math.abs(turnOf(mid - before)) > 2 && Math.abs(turnOf(mid - after.seatAngle)) > 2, [before, mid, after.seatAngle]);
check("новый стул B внизу", bSeat.y > after.middle.y + 50, [bSeat, after.middle]);

await A.screenshot({ path: process.argv[4] ?? "seats.png" });
await browser.close();
for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
if (checks.some((c) => !c.ok)) process.exitCode = 1;
