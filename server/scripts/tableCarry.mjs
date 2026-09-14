// ЧУЖИЕ РУКИ И ПЕРЕЛЁТЫ — три браузера в одной комнате: A действует, B — хозяин чужого стула, C смотрит.
//   TABLE_SECRET=dev TABLE_GUESTS=1 PORT=2599 npx tsx src/index.ts   (в соседнем окне)
//   node scripts/tableCarry.mjs [base] [secret] [shot]
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
  await p.waitForSelector("[data-bar]");
  await p.waitForTimeout(400);
  return p;
};
const A = await open("A");
const B = await open("B");
const C = await open("C");
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const wait = (ms) => A.waitForTimeout(ms);

const middle = async (p) => JSON.parse(await p.getAttribute("canvas", "data-spots")).middle;
const seatOf = async (p, who) => JSON.parse(await p.getAttribute("canvas", "data-spots")).seats.find((s) => s.who === who);
const carried = (p) => p.evaluate(() => [...document.querySelectorAll("[data-carry]")].map((e) => ({ id: e.dataset.carry, at: e.dataset.at.split(",").map(Number), who: e.querySelector("[data-g=who]").textContent })));
/** Снимать копии перелётов, пока они в воздухе: где каждая была в первый и в последний кадр. */
const watchFlights = (p) =>
  p.evaluate(() => {
    window.__flights = [];
    new MutationObserver((list) => {
      for (const m of list) for (const n of m.addedNodes) if (n.dataset?.flight) {
        const track = { id: n.dataset.flight, frames: [] };
        window.__flights.push(track);
        const tick = () => {
          if (!n.isConnected) return;
          const r = n.getBoundingClientRect();
          track.frames.push([r.left + r.width / 2, r.top + r.height / 2]);
          requestAnimationFrame(tick);
        };
        tick();
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
const flights = (p) => p.evaluate(() => window.__flights);
const near = (a, b, px) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= px;

// ── 1. A тянет с колоды: у C карта в руке у A, над колодой; с колоды она вылетела ──────────────
for (const p of [B, C]) await watchFlights(p);
const m = await middle(A);
await A.mouse.move(m.x, m.y);
await A.mouse.down();
await A.mouse.move(m.x + 30, m.y - 40, { steps: 6 });
await wait(400);
const cDeck = await middle(C);
let seen = await carried(C);
check("C видит карту в руке у A, и подпись «A»", seen.length === 1 && seen[0].who === "A", seen);
const fromDeck = (await flights(C)).find((f) => f.id === seen[0]?.id);
check("у C карта вылетела из колоды", fromDeck && near(fromDeck.frames[0], [cDeck.x, cDeck.y], 20), fromDeck?.frames[0]);

// ── 2. A кладёт себе: у C летит от последней точки к стулу A; у B, открывшего окно A, — в окно ──
const bSeatA = await seatOf(B, "A");
await B.mouse.click(bSeatA.x, bSeatA.y);
await wait(300);
await watchFlights(B);
await watchFlights(C);
await A.mouse.move(195, 760, { steps: 8 });
await wait(300);
const lastAtC = (await carried(C))[0]?.at;
await A.mouse.up();
await wait(600);
const cSeatA = await seatOf(C, "A");
const toSeat = (await flights(C)).find((f) => f.id === seen[0]?.id);
check("у C: полёт от последней точки у A…", toSeat && lastAtC && near(toSeat.frames[0], lastAtC, 40), [toSeat?.frames[0], lastAtC]);
check("…к стулу A", toSeat && near(toSeat.frames.at(-1), [cSeatA.x, cSeatA.y], 40), [toSeat?.frames.at(-1), cSeatA]);
const inTip = await B.evaluate((id) => {
  const el = document.querySelector(`[data-card="${id}"]`);
  return el && el.getBoundingClientRect().top > 0 ? [el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2, el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2] : null;
}, seen[0]?.id);
const toTip = (await flights(B)).find((f) => f.id === seen[0]?.id);
check("у B с открытым окном A карта появилась в окне", inTip !== null && toTip && near(toTip.frames.at(-1), inTip, 30), [toTip?.frames.at(-1), inTip]);
check("в воздухе у C ничего не осталось", (await carried(C)).length === 0, await carried(C));

// ── 3. B кладёт себе карту, A вытаскивает её из руки B ────────────────────────────────────────
const mb = await middle(B);
await B.mouse.move(mb.x, mb.y);
await B.mouse.down();
await B.mouse.move(195, 760, { steps: 8 });
await B.mouse.up();
await wait(500);
const bCard = await B.evaluate(() => document.querySelector(`[data-card][data-owner]`)?.dataset.card);
// A открывает окно B и тянет из него карту на сукно.
const aSeatB = await seatOf(A, "B");
await A.mouse.click(aSeatB.x, aSeatB.y);
await wait(300);
const tipCard = await A.evaluate((id) => {
  const r = document.querySelector(`[data-card="${id}"]`)?.getBoundingClientRect();
  return r && [r.left + r.width / 2, r.top + r.height / 2];
}, bCard);
await watchFlights(C);
await A.mouse.move(...tipCard);
await A.mouse.down();
const ma = await middle(A);
await A.mouse.move(ma.x, ma.y + 60, { steps: 10 });
await wait(400);
check("у B карта ушла из его нижней руки", await B.evaluate((id) => !document.querySelector(`[data-card="${id}"]`), bCard), bCard);
const bSees = await carried(B);
check("у B эта карта в руке у A", bSees.length === 1 && bSees[0].id === bCard && bSees[0].who === "A", bSees);
const cSeatB = await seatOf(C, "B");
const fromB = (await flights(C)).find((f) => f.id === bCard);
check("у C карта вылетела от стула B", fromB && near(fromB.frames[0], [cSeatB.x, cSeatB.y], 40), [fromB?.frames[0], cSeatB]);

// ── 4. A несёт её над рукой B — у B в нижней руке щель в цвете A ────────────────────────────────
const aTip = await A.evaluate(() => {
  const r = document.querySelector("[data-tip]").getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height - 30];
});
await A.mouse.move(...aTip, { steps: 8 });
await wait(400);
check("у B в нижней руке щель под карту A", await B.evaluate(() => document.querySelectorAll('[data-g="mark"]').length === 1), null);

// ── 5. A бросает её на сукно: у C она ложится туда, где стояла над сукном ─────────────────────
await watchFlights(C);
await A.mouse.move(ma.x + 40, ma.y + 40, { steps: 8 });
await wait(300);
const overFelt = (await carried(C))[0]?.at;
await A.mouse.up();
await wait(600);
const toFelt = (await flights(C)).find((f) => f.id === bCard);
check("у C на сукно — от точки над сукном туда же", toFelt && overFelt && near(toFelt.frames.at(-1), overFelt, 12), [toFelt?.frames.at(-1), overFelt]);
check("у B щели больше нет", await B.evaluate(() => document.querySelectorAll('[data-g="mark"]').length === 0), null);

// ── 6. A взял с колоды и ушёл, не отпустив: у C карта улетает обратно на колоду ────────────────
await A.mouse.move(ma.x, ma.y);
await A.mouse.down();
await A.mouse.move(ma.x - 60, ma.y - 60, { steps: 6 });
await wait(400);
const gone = (await carried(C))[0];
await watchFlights(C);
await A.close();
await C.waitForTimeout(1200);
const back = (await flights(C)).find((f) => f.id === gone?.id);
const deckNow = await middle(C);
check("ушёл с картой в руке — у C она улетела назад на колоду", gone && back && near(back.frames.at(-1), [deckNow.x, deckNow.y], 20) && (await carried(C)).length === 0, [gone, back?.frames.at(-1), deckNow]);

await C.screenshot({ path: process.argv[4] ?? "carry.png" });
await browser.close();
for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
if (checks.some((c) => !c.ok)) process.exitCode = 1;
