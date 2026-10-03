// БЕСХОЗНЫЙ СТУЛ: стула не видно, перед ним на краю стола маленькая зона-«ноготок», в ней стопка впритык; её берут (верхнюю карту) и в неё кладут свои. Занятый стул: зоны нет.
//   node zone-check.mjs [base]     (стенд: `npm run dev`, порт 9590)
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
await p.goto(`${base}/?stand&cam=top`);
await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
await p.waitForTimeout(1200);
const zi = () => p.evaluate(() => window.__t3d.zoneInfo());
const z0 = await zi();
const owned = z0.filter((c) => c.owner), free = z0.filter((c) => !c.owner);
check("есть и занятые, и бесхозные стулья (стенд)", owned.length >= 2 && free.length >= 2, z0.map((c) => [c.id, !!c.owner]));
check("бесхозный стул не нарисован; зона видна только у пустого (без карт), у стула со стопкой зоны нет — видна сама стопка", free.every((c) => c.chair === false && c.zone === (c.hand.length === 0)), free);
check("занятый стул нарисован, его зоны нет", owned.every((c) => c.chair === true && c.zone === false), owned);
// Стопка лежит в зоне впритык: центр карт — в центре зоны.
const withCards = free.find((c) => c.hand.length > 0);
const pos = await Promise.all(withCards.hand.map((id) => p.evaluate((i) => window.__t3d.cardTarget(i), id)));
check("карты бесхозной руки лежат стопкой в зоне (центр зоны ±0.15)", pos.every((q) => Math.hypot(q[0] - withCards.centre.x, q[2] - withCards.centre.y) < 0.15), { pos, centre: withCards.centre });
// Тап по карте стопки открывает окно стула (в зону целиться не надо).
const tapped = await p.evaluate(([x, y]) => window.__t3d.pickAtNow(x, y), [(await p.evaluate((i) => window.__t3d.screenOf(i), withCards.hand.at(-1))).x, (await p.evaluate((i) => window.__t3d.screenOf(i), withCards.hand.at(-1))).y]);
check("тап по карте стопки бесхозного стула — это стул (откроется его окно), а не карта", tapped?.t === "chair" && tapped.id === withCards.id, tapped);
// Тап по язычку стопки — тоже стул.
{
  const tab = await p.evaluate((id) => window.__t3d.tabInfo(`chair:${id}`)?.screen ?? null, withCards.id);
  const tapTab = tab ? await p.evaluate(([x, y]) => window.__t3d.pickAtNow(x, y), [tab.x, tab.y]) : null;
  check("тап по язычку стопки бесхозного стула — это стул (откроется его окно)", tapTab?.t === "chair" && tapTab.id === withCards.id, tapTab);
}
// Настоящий тап по карте и по язычку открывает окно стула в худе (а не только метод выбора).
{
  const card = await p.evaluate((i) => window.__t3d.screenOf(i), withCards.hand.at(-1));
  await p.mouse.click(card.x, card.y);
  await p.waitForTimeout(500);
  const opened1 = await p.locator('[data-g="tip"]').count();
  check("тап по карте стопки бесхозного стула открыл окно стула", opened1 > 0, opened1);
  await p.mouse.click(card.x, card.y);
  await p.waitForTimeout(400);
  const tabAt = await p.evaluate((id) => window.__t3d.tabInfo(`chair:${id}`)?.screen ?? null, withCards.id);
  await p.mouse.click(tabAt.x, tabAt.y);
  await p.waitForTimeout(500);
  check("тап по язычку открыл окно стула", (await p.locator('[data-g="tip"]').count()) > 0, await p.locator('[data-g="tip"]').count());
  await p.mouse.click(tabAt.x, tabAt.y);
  await p.waitForTimeout(300);
}
// Верхнюю карту стопки можно взять и унести на стол.
const topId = withCards.hand.at(-1);
const from = await p.evaluate((i) => window.__t3d.screenOf(i), topId);
await p.mouse.move(from.x, from.y); await p.mouse.down(); await p.mouse.move(from.x, from.y - 40, { steps: 5 });
// Пока несут карту, зоны видны у тех, кто её примет: бесхозный стул со стопкой — да; занятый и запертый (у Алии замок) — нет; мой — нет.
const zOn = await p.evaluate(() => window.__t3d.zoneInfo().filter((c) => c.zone).map((c) => c.id));
check("несу карту — зона видна у бесхозного стула со стопкой, у запертого занятого нет", zOn.includes(withCards.id) && !zOn.includes(owned.find((c) => c.owner === "alia").id), zOn);
await p.mouse.move(195, 430, { steps: 8 });
await p.mouse.up();
await p.waitForTimeout(800);
const afterTake = await p.evaluate((id) => ({ onFelt: window.__t3d.state().felt.some((c) => c.id === id), hand: window.__t3d.state().chairs.find((c) => c.id === id) }), topId);
const st1 = await p.evaluate(([cid, id]) => ({ onFelt: window.__t3d.state().felt.some((c) => c.id === id), left: window.__t3d.state().chairs.find((c) => c.id === cid).hand.length }), [withCards.id, topId]);
check("верхнюю карту стопки взяли на стол: на сукне есть, в руке стула на одну меньше", st1.onFelt && st1.left === withCards.hand.length - 1, st1);
// Свою карту — в зону другого бесхозного стула.
const target = free.find((c) => c.id !== withCards.id);
const mine = await p.evaluate(() => { const s = window.__t3d.state(); const c = s.chairs.find((x) => x.owner === window.__t3d.me()); return c.hand.at(-1).id; });
const m = await p.evaluate((i) => window.__t3d.screenOf(i), mine);
const zs = await p.evaluate((c) => window.__t3d.feltScreen(c.x, c.y), target.centre);
await p.mouse.move(m.x, m.y - 40); await p.mouse.down(); await p.mouse.move(m.x, m.y - 100, { steps: 5 }); await p.mouse.move(zs.x, zs.y, { steps: 10 });
await p.waitForTimeout(250);
await p.mouse.up();
await p.waitForTimeout(900);
const st2 = await p.evaluate(([cid, id]) => ({ inHand: window.__t3d.state().chairs.find((c) => c.id === cid).hand.some((h) => h.id === id) }), [target.id, mine]);
check("свою карту уронил в зону бесхозного стула — она в его руке", st2.inHand, st2);
// ЯЗЫЧОК СТОПКИ БЕСХОЗНОГО СТУЛА: потянул — вся стопка идёт под палец и ложится на сукно новой стопкой (или в руку, если отпустил над ней).
{
  const q = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await q.goto(`${base}/?stand&cam=top`);
  await q.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await q.waitForTimeout(1200);
  const z = await q.evaluate(() => window.__t3d.zoneInfo().find((c) => !c.owner && c.hand.length > 1));
  const tab = await q.evaluate((id) => window.__t3d.tabInfo(`chair:${id}`)?.screen ?? null, z.id);
  check("у стопки бесхозного стула есть язычок", !!tab, tab);
  // Язычок — со стороны середины стола, а не со стороны стула: он ближе к центру, чем сама стопка.
  const dist = await q.evaluate((id) => { const t = window.__t3d.tabInfo(`chair:${id}`), c = window.__t3d.zoneInfo().find((x) => x.id === id).centre; return { tab: Math.hypot(t.x, t.z), stack: Math.hypot(c.x, c.y) }; }, z.id);
  const ownedTab = await q.evaluate(() => window.__t3d.zoneInfo().filter((c) => c.owner).map((c) => window.__t3d.tabInfo(`chair:${c.id}`)));
  check("у занятого стула язычка нет", ownedTab.every((t) => t === null), ownedTab);
  check("язычок стоит к центру стола: ближе к середине, чем стопка", dist.tab < dist.stack - 0.3, dist);
  if (tab) {
    await q.mouse.move(tab.x, tab.y); await q.mouse.down(); await q.mouse.move(tab.x + 6, tab.y - 40, { steps: 5 }); await q.mouse.move(195, 420, { steps: 8 });
    await q.mouse.up();
    await q.waitForTimeout(1000);
    const st = await q.evaluate((id) => ({ left: window.__t3d.state().chairs.find((c) => c.id === id)?.hand.length ?? 0, piles: window.__t3d.state().piles.map((p) => p.cards.length) }), z.id);
    check("потянули за язычок — вся стопка унесена на сукно новой стопкой", st.left === 0 && st.piles.some((n) => n === z.hand.length), { z: z.hand.length, st });
  }
  await q.close();
}
// СТОПКУ ТЯНУТ ЗА ЯЗЫЧОК: она сразу лицом ко мне, а язычок встаёт под её низ (со стороны меня), а не остаётся на старом месте с другой стороны.
{
  const q = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await q.goto(`${base}/?stand&cam=top`);
  await q.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await q.waitForTimeout(1200);
  const z = await q.evaluate(() => window.__t3d.zoneInfo().find((c) => !c.owner && c.hand.length > 1));
  const tab = await q.evaluate((id) => window.__t3d.tabInfo(`chair:${id}`)?.screen ?? null, z.id);
  await q.mouse.move(tab.x, tab.y); await q.mouse.down(); await q.mouse.move(tab.x + 4, tab.y - 30, { steps: 4 }); await q.mouse.move(195, 380, { steps: 8 });
  await q.waitForTimeout(700);
  const now = await q.evaluate((id) => { const t = window.__t3d.tabInfo(`chair:${id}`)?.screen ?? null; const c = window.__t3d.zoneInfo().find((x) => x.id === id); return { tab: t, hand: c ? c.hand : null }; }, z.id);
  const pile = now.hand && now.hand.length ? await q.evaluate((i) => window.__t3d.screenOf(i), now.hand[0]) : null;
  check("несут стопку за язычок: язычок под её низом, ближе ко мне (ниже по экрану), а не на старом месте", now.tab && pile && now.tab.y > pile.y + 5 && Math.abs(now.tab.x - pile.x) < 40, { tab: now.tab, pile });
  await q.mouse.up();
  await q.close();
}
// СТОПКУ НЕСУТ В РУКУ: над моей рукой её карты встают в руку (как несомая стопка), а не лежат у пальца с кривыми краями.
{
  const q = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await q.goto(`${base}/?stand&cam=head`);
  await q.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await q.waitForTimeout(1200);
  const z = await q.evaluate(() => window.__t3d.zoneInfo().find((c) => !c.owner && c.hand.length > 1));
  await q.mouse.move(100, 300); await q.mouse.down(); await q.mouse.move(360, 300, { steps: 8 }); await q.mouse.up();
  await q.waitForTimeout(400);
  const tab = await q.evaluate((id) => window.__t3d.tabInfo(`chair:${id}`)?.screen ?? null, z.id);
  if (tab && tab.x > 0 && tab.x < 390) {
    await q.mouse.move(tab.x, tab.y); await q.mouse.down(); await q.mouse.move(tab.x, tab.y - 30, { steps: 4 }); await q.mouse.move(195, 720, { steps: 10 });
    await q.waitForTimeout(500);
    const on = await q.evaluate((ids) => ids.map((i) => window.__t3d.cardOnHud(i)?.onCamera), z.hand);
    check("стопку бесхозного стула несут над рукой — все её карты на худе, в руке", on.every(Boolean), on);
    const dz = await q.evaluate(() => window.__t3d.handDropZone?.() ?? window.__t3d.dropZone?.() ?? null);
    check("стопку бесхозного стула несут над рукой — зона руки горит, как у любой стопки", !!dz && dz.over === true, dz);
    await q.mouse.up();
  } else check("язычок виден после поворота головы к бесхозному стулу", false, tab);
  await q.close();
}
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
