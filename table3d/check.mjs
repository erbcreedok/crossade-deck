// ПРОВЕРКА ПЕСОЧНИЦЫ НА THREE.JS — стол в вкладке с ботами (`?stand`), палец мышью по сцене:
// из стопки на сукно, из руки на сукно, с сукна в руку, двойной тап — перевернуть, облёт камеры.
// С `--net <стол> <ключ>` — ещё и живая комната на том столе (он должен пускать гостей, `TABLE_GUESTS=1`): песочница и
// обычный стол (2D) за одним столом, карта, положенная в 3D, — у соседа в 2D.
//   node check.mjs [base] [shot.png] [--net http://localhost:2611 probe]
//   (сервер песочницы: `npm run dev`, порт 9590; картинки карт — со стола :2590)
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const shot = process.argv[3]?.startsWith("--") ? undefined : process.argv[3];
const netAt = process.argv.indexOf("--net");
const net = netAt > 0 ? { table: process.argv[netAt + 1], secret: process.argv[netAt + 2] } : null;
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const t = (fn, arg) => p.evaluate(fn, arg);
const frames = () => p.evaluate(() => new Promise((r) => { let k = 0; const f = () => (++k > 20 ? r() : requestAnimationFrame(f)); f(); }));
const drag = async (from, to) => {
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  await p.mouse.move(to.x, to.y, { steps: 10 });
  await p.mouse.up();
  await frames();
};
try {
  await p.goto(`${base}/?stand`);
  await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await frames();
  const s0 = await t(() => { const s = window.__t3d.state(); const seat = s.people.find((x) => x.key === window.__t3d.me()).seat; return { felt: s.felt.length, pile: s.piles[0].cards.length, top: s.piles[0].cards.at(-1).id, hand: s.chairs.find((c) => c.id === seat).hand.map((c) => c.id) }; });
  check("стол собран: стопка, моя рука из 7, на сукне пусто, надпись загрузки спрятана", s0.pile > 0 && s0.hand.length === 7 && s0.felt === 0 && await p.locator("#note").isHidden(), s0);

  // ТЕЛА: у Алии — тело у стула, голова на экране, её карты — в её левой руке; ушедший Тимур и я — без тела.
  const bodies = await t(() => window.__t3d.bodies());
  const alia = bodies.find((b) => b.by === "alia");
  const aliaHand = await t(() => { const s = window.__t3d.state(); const seat = s.people.find((x) => x.key === "alia").seat; return s.chairs.find((c) => c.id === seat).hand.map((c) => window.__t3d.world(c.id)); });
  const nearLeft = alia && aliaHand.every((w) => Math.hypot(w.x - alia.left.x, w.y - alia.left.y) < 1.6 && Math.abs(w.h - alia.left.h) < 1.5);
  check("тело Алии: голова на экране, её карты — веером в её левой руке", !!alia && !alia.away && alia.head.x > 0 && alia.head.x < 390 && alia.head.y > 0 && alia.head.y < 844 && nearLeft, { alia, aliaHand });
  check("ушедший Тимур — без тела, своё тело не рисуется (своя голова — камера)", bodies.length === 1 && !bodies.some((b) => b.by === "timur" || b.by === "me"), bodies.map((b) => b.by));

  // Из стопки на сукно: верхняя карта — в середину стола.
  const topAt = await t((id) => window.__t3d.screenOf(id), s0.top);
  await drag(topAt, { x: 195, y: 470 });
  const s1 = await t(() => window.__t3d.state());
  check("из стопки на сукно: верхняя карта легла на сукно", s1.felt.some((c) => c.id === s0.top) && s1.piles[0].cards.length === s0.pile - 1, { felt: s1.felt.map((c) => c.id) });

  // Из руки на сукно — крайнюю правую: она поверх веера, видна целиком.
  const card = s0.hand.at(-1);
  await drag(await t((id) => window.__t3d.screenOf(id), card), { x: 140, y: 420 });
  const s2 = await t(() => window.__t3d.state());
  check("из руки на сукно — лицом вверх", s2.felt.find((c) => c.id === card)?.up === true, s2.felt.find((c) => c.id === card));

  // Двойной тап — перевернуть.
  const at = await t((id) => window.__t3d.screenOf(id), card);
  await p.mouse.click(at.x, at.y);
  await p.mouse.click(at.x, at.y);
  await frames();
  check("двойной тап — карта перевернулась рубашкой", (await t((id) => window.__t3d.state().felt.find((c) => c.id === id)?.up, card)) === false, null);

  // С сукна в руку: несёшь вниз экрана, в свою руку.
  await drag(await t((id) => window.__t3d.screenOf(id), s0.top), { x: 120, y: 800 });
  const s3 = await t(() => { const s = window.__t3d.state(); const seat = s.people.find((x) => x.key === window.__t3d.me()).seat; return s.chairs.find((c) => c.id === seat).hand.map((c) => c.id); });
  check("с сукна в руку — встала в руку, слева", s3.includes(s0.top) && s3.indexOf(s0.top) <= 2 && s3.length === 7, s3);
  // Своя рука: лицо у каждой карты видно мне — и нарисовано лицом (а не рубашкой, с какой карта лежала на сукне).
  const shown = await t(() => window.__t3d.handFaces());
  check("своя рука — все лицом к тебе, и рисунок — лицо", shown.length === 7 && shown.every((x) => x.face && x.drawn === "face"), shown);

  // Двойной тап по карте в руке — лицом наружу: мне — рубашкой.
  const last = s3.at(-1);
  const lp = await t((id) => window.__t3d.screenOf(id), last);
  await p.mouse.click(lp.x, lp.y);
  await p.mouse.click(lp.x, lp.y);
  await frames();
  const hf = await t(() => window.__t3d.handFaces());
  check("двойной тап в руке — карта лицом наружу, мне — рубашкой", hf.find((x) => x.id === last)?.drawn === "back" && hf.filter((x) => x.drawn === "face").length === 6, hf);

  // Облёт.
  const v0 = await t(() => window.__t3d.view());
  await drag({ x: 60, y: 200 }, { x: 260, y: 200 });
  const v1 = await t(() => window.__t3d.view());
  check("тянешь по пустому — камера облетает стол", Math.abs(v1.yaw - v0.yaw) > 20, [v0, v1]);
  await p.click("[data-home]");
  await frames();
  check("«Моя сторона» — камера снова за своим стулом", Math.abs((await t(() => window.__t3d.view())).yaw - v0.yaw) < 1, null);
  if (shot) await p.screenshot({ path: shot });
  if (net) {
    // Подписанный id комнаты — как у бота: тело и подпись ключом стола.
    const body = randomBytes(8).toString("base64url");
    const room = body + createHmac("sha256", net.secret).update(body).digest("base64url").slice(0, 12);
    const flat = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await flat.goto(`${net.table}/table/?room=${room}&name=Боря`);
    await flat.waitForFunction(() => !!document.querySelector("#stage canvas"), null, { timeout: 15000 });
    await p.goto(`${base}/?room=${room}&host=${encodeURIComponent(net.table)}&name=Ерж`);
    await p.waitForFunction(() => window.__t3d && window.__t3d.state().piles.length > 0, null, { timeout: 15000 });
    await frames();
    const people = await t(() => window.__t3d.state().people.map((x) => x.name));
    check("по сети: песочница в живой комнате, за столом и сосед из 2D", people.includes("Боря") && people.includes("Ерж"), people);
    const boria = await t(() => window.__t3d.state().people.find((x) => x.name === "Боря")?.key);
    await p.waitForFunction((k) => window.__t3d.bodies().some((b) => b.by === k), boria, { timeout: 5000 }).catch(() => {});
    check("по сети: у соседа из 2D — тело в 3D", await t((k) => window.__t3d.bodies().some((b) => b.by === k), boria), await t(() => window.__t3d.bodies()));
    await drag({ x: 60, y: 300 }, { x: 200, y: 300 });
    await flat.waitForFunction(() => !!document.querySelector('[data-g="body"][data-name="Ерж"]'), null, { timeout: 5000 }).catch(() => {});
    check("по сети: моё тело из 3D — у соседа в 2D (голова туда, куда смотрит камера)", await flat.evaluate(() => !!document.querySelector('[data-g="body"][data-name="Ерж"]')), await flat.evaluate(() => [...document.querySelectorAll('[data-g="body"]')].map((e) => e.dataset.name)));
    const top = await t(() => window.__t3d.state().piles[0].cards.at(-1).id);
    await drag(await t((id) => window.__t3d.screenOf(id), top), { x: 200, y: 440 });
    await p.waitForFunction((id) => window.__t3d.state().felt.some((c) => c.id === id), top, { timeout: 5000 }).catch(() => {});
    const onFelt = await t((id) => window.__t3d.state().felt.some((c) => c.id === id), top);
    // У 2D-стола сукно — холст: его снимок для проверок — `__tableState`.
    await flat.waitForFunction((id) => globalThis.__tableState?.().felt.some((c) => c.id === id), top, { timeout: 5000 }).catch(() => {});
    const seenFlat = await flat.evaluate((id) => !!globalThis.__tableState?.().felt.some((c) => c.id === id), top);
    check("по сети: карта из стопки на сукно в 3D — на сукне у стола, и сосед в 2D её видит", onFelt && seenFlat, { onFelt, seenFlat });
    if (shot) await p.screenshot({ path: shot.replace(/\.png$/, "-net.png") });
    await flat.close();
  }
  check("без ошибок", errors.length === 0, errors);
} finally {
  await browser.close();
}
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.ok ? "" : ` — ${String(JSON.stringify(c.got)).slice(0, 300)}`}`);
const bad = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
