// КАРТА НА СТУЛ — три браузера: A несёт карту на стул B, C смотрит. Зона стула горит у всех, карта
// уходит в руку B; под локом зона молчит, и карта возвращается туда, откуда её взяли.
//   TABLE_SECRET=dev TABLE_GUESTS=1 PORT=2599 npx tsx src/index.ts   (в соседнем окне)
//   node scripts/tableChairDrop.mjs [base] [secret] [shot]
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
const A = await open("A");
const B = await open("B");
const C = await open("C");
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

const spots = async (p) => JSON.parse(await p.getAttribute("canvas", "data-spots"));
const seatOf = async (p, who) => (await spots(p)).seats.find((s) => s.who === who);
const myHand = (p) => p.evaluate(() => document.querySelectorAll('[data-card]').length);
const zone = (p, chair) => p.evaluate((id) => {
  const el = document.querySelector(`[data-g="chair-zone"][data-chair="${id}"]`);
  return el ? { here: el.dataset.here, border: el.style.borderColor } : null;
}, chair);

// ── 1. A несёт карту с колоды на стул B: зона горит у A золотом, у C — в цвете A; карта у B в руке ──
const m = (await spots(A)).middle;
const bSeat = await seatOf(A, "B");
const bHand = await myHand(B);
await A.mouse.move(m.x, m.y);
await A.mouse.down();
await A.mouse.move(bSeat.x + 4, bSeat.y + bSeat.chair * 0.6, { steps: 10 });
await A.waitForTimeout(400);
const aZone = await zone(A, bSeat.key);
const cZone = await zone(C, bSeat.key);
check("у A зона стула B горит золотом", aZone?.here === "true" && /242, 193, 78|f2c14e/i.test(aZone.border), aZone);
const aInk = await C.evaluate(() => document.querySelector('[data-carry] [data-g="who"]')?.style.background);
check("у C зона стула B горит в цвете A", cZone?.here === "true" && Boolean(aInk) && cZone.border.includes(aInk), [cZone, aInk]);
check("контура на сукне нет — карта целится в стул", await A.evaluate(() => !document.querySelector('[data-g="mark"]')), null);
await A.mouse.up();
await A.waitForTimeout(700);
check("карта ушла в руку B", (await myHand(B)) === bHand + 1, [bHand, await myHand(B)]);
check("на сукно ничего не легло", (await spots(A)).felt.length === 0, (await spots(A)).felt);
check("зоны погасли у всех", (await zone(A, bSeat.key)) === null && (await zone(C, bSeat.key)) === null, null);

// ── 2. B ставит лок: зона стула B не горит ни у кого, карта возвращается на колоду ─────────────────
await B.click('[data-section="chair"]');
await B.waitForTimeout(350);
await B.click('[data-bar="lock"]');
await A.waitForTimeout(400);
await A.evaluate(() => {
  window.__back = [];
  new MutationObserver((list) => {
    for (const x of list) for (const n of x.addedNodes) if (n.dataset?.flight) {
      const track = [];
      window.__back.push(track);
      const tick = () => { if (!n.isConnected) return; const r = n.getBoundingClientRect(); track.push([r.left + r.width / 2, r.top + r.height / 2]); requestAnimationFrame(tick); };
      tick();
    }
  }).observe(document.body, { childList: true, subtree: true });
});
await A.mouse.move(m.x, m.y);
await A.mouse.down();
await A.mouse.move(bSeat.x + 4, bSeat.y + bSeat.chair * 0.6, { steps: 10 });
await A.waitForTimeout(400);
check("под локом зона стула B не горит у A", (await zone(A, bSeat.key)) === null, await zone(A, bSeat.key));
check("…и у C", (await zone(C, bSeat.key)) === null, await zone(C, bSeat.key));
await A.mouse.up();
await A.waitForTimeout(700);
check("в руку B не попала", (await myHand(B)) === bHand + 1, await myHand(B));
check("на сукно не легла", (await spots(A)).felt.length === 0, (await spots(A)).felt);
const back = await A.evaluate(() => window.__back.at(-1));
const mNow = (await spots(A)).middle;
check("у A карта улетела из-под пальца на колоду", back && Math.hypot(back.at(-1)[0] - mNow.x, back.at(-1)[1] - mNow.y) < 20 && Math.hypot(back[0][0] - mNow.x, back[0][1] - mNow.y) > 60, back && [back[0], back.at(-1), mNow]);
check("колоду снова можно взять", await A.evaluate(() => true) && (await A.evaluate(() => document.querySelector('[data-g="carry"]') === null)), null);

// ── 3. Тап по стулу мимо аватара открывает окно; по аватару на стуле — тоже ─────────────────────────
const cSeat = await seatOf(C, "A");
await C.mouse.click(cSeat.x, cSeat.y + (cSeat.r + cSeat.chair) / 2);
await C.waitForTimeout(300);
check("тап по стулу мимо аватара открыл окно", await C.evaluate((id) => Boolean(document.querySelector(`[data-tip="${id}"]`)), cSeat.key), null);
await C.mouse.click(cSeat.x, cSeat.y);
await C.waitForTimeout(300);
check("тап по аватару на стуле закрыл его", await C.evaluate((id) => !document.querySelector(`[data-tip="${id}"]`), cSeat.key), null);

await C.screenshot({ path: process.argv[4] ?? "chair-drop.png" });
await browser.close();
for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
if (checks.some((c) => !c.ok)) process.exitCode = 1;
