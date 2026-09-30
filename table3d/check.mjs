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
const frames = () => p.evaluate(() => new Promise((r) => { let k = 0; const f = () => (++k > 40 ? r() : requestAnimationFrame(f)); f(); }));
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

  // КАРТА В ПАЛЬЦЕ: под курсором, на высоте от камеры; моя рука с ней; над рукой — щель и правая рука у левой.
  const feltNow = await t(() => window.__t3d.state().felt[0].id);
  const fp = await t((id) => window.__t3d.screenOf(id), feltNow);
  await p.mouse.move(fp.x, fp.y); await p.mouse.down(); await p.mouse.move(200, 430, { steps: 8 });
  await frames();
  const held = await t(() => window.__t3d.held());
  const heldAt = await t((id) => window.__t3d.screenOf(id), feltNow);
  check("несомая над столом — ровно под курсором, на высоте от камеры (доля высоты глаза), с моей рукой", held && Math.abs(held.h - held.lift) < 0.2 && Math.abs(held.lift - 0.3 * held.camY) < 0.05 && Math.hypot(heldAt.x - 200, heldAt.y - 430) < 30 && held.arm, { held, heldAt });
  const bodyFelt = await t(() => window.__t3d.lastBody());
  await p.mouse.move(150, 800, { steps: 8 });
  await frames();
  const over = await t(() => window.__t3d.held());
  const handZ = await t(() => { const s = window.__t3d.state(); const seat = s.people.find((x) => x.key === window.__t3d.me()).seat; return s.chairs.find((c) => c.id === seat).hand.map((c) => c.id); });
  const body = await t(() => window.__t3d.lastBody()), left = await t(() => window.__t3d.leftHand());
  const handYs = await Promise.all(handZ.map((id) => t((i) => window.__t3d.screenOf(i).y, id)));
  const heldY = await t((id) => window.__t3d.screenOf(id).y, feltNow);
  check("над своей рукой — в щели руки, выше соседей на экране и ближе к глазу, моей руки над столом нет", over && over.gap !== null && over.onCamera && over.near > -4.9 && !over.arm && heldY < Math.min(...handYs) - 25, { over, heldY, handYs });
  check("остальным: правая рука с картой — у левой руки (над столом была у карты)", body.right && Math.hypot(body.right.x - left.x, body.right.y - left.y) < 0.01 && Math.hypot(bodyFelt.right.x - body.right.x, bodyFelt.right.y - body.right.y) > 1, { felt: bodyFelt.right, hand: body.right, left });
  await p.mouse.move(200, 430, { steps: 8 });
  await p.mouse.up();
  // Пружина: отпущенная не встаёт мгновенно, а долетает.
  const trace = await p.evaluate((id) => new Promise((r) => { const out = []; const f = () => { out.push(window.__t3d.world(id)); out.length < 50 ? requestAnimationFrame(f) : r(out); }; f(); }), feltNow);
  const settled = trace.at(-1);
  check("отпустил — карта опускается пружиной (не мгновенно) и ложится на сукно, не проваливаясь", trace[1].h > 0.1 && settled.h < 0.05 && trace.every((q) => q.h >= 0.0) , trace.filter((_, i) => i % 10 === 0).map((q) => q.h.toFixed(2)));
  check("тени: включены, солнце отбрасывает, сукно принимает", Object.values(await t(() => window.__t3d.shadows())).every(Boolean), null);

  // Облёт.
  const v0 = await t(() => window.__t3d.view());
  await drag({ x: 60, y: 200 }, { x: 260, y: 200 });
  const v1 = await t(() => window.__t3d.view());
  check("тянешь по пустому — камера облетает стол", Math.abs(v1.yaw - v0.yaw) > 20, [v0, v1]);
  await p.click("[data-home]");
  await frames();
  check("«Моя сторона» — камера снова за своим стулом", Math.abs((await t(() => window.__t3d.view())).yaw - v0.yaw) < 1, null);
  if (shot) await p.screenshot({ path: shot });
  // HUD — как у стола 2D.
  const my = () => t(() => { const s = window.__t3d.state(); const seat = s.people.find((x) => x.key === window.__t3d.me()).seat; return s.chairs.find((c) => c.id === seat); });
  const hudHas = await p.evaluate(() => ["[data-rooms-back]", "[data-table-name]", "[data-settings]", "[data-journal]", '[data-section="chair"]', '[data-section="lasso"]', "[data-home]", "[data-stance-toggle]", '[data-section="say"]', "[data-pose-handle]", '[data-g="deck-grip"]'].filter((q) => !document.querySelector(q)));
  check("HUD стола: верх (выход, имя, настройки, журнал), бар «стул» и «лассо», компас, поза, диалог, ручка позы, индикатор стопки", hudHas.length === 0, hudHas);
  await p.click('[data-section="chair"]');
  await p.click('[data-bar="lock"]');
  await frames();
  check("«Стул» → замок: рука заперта, кнопка горит", (await my()).lock === true && (await p.getAttribute('[data-bar="lock"]', "aria-pressed")) === "true", (await my()).lock);
  await p.click('[data-bar="lock"]');
  await p.click('[data-bar="leave"]');
  check("«Встать» — сперва вопрос «Покинуть стул?»", (await p.locator("[data-confirm]").innerText()).includes("Покинуть стул?"), null);
  await p.click('[data-bar="leave"]');
  await p.click('[data-section="chair"]');
  // Ручка позы: вниз — спрятать; тап — меню руки.
  const hb = await p.locator('[data-g="pose-handle"] [data-pose-handle]').boundingBox();
  await drag({ x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }, { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 + 160 });
  check("ручка позы вниз — рука спрятана (поза стула), ручка ушла в бар", (await my()).pose.tuck === true && (await p.locator("[data-pose-handle][data-in-bar]").count()) === 1, (await my()).pose);
  await p.click("[data-pose-handle][data-in-bar]");
  await p.click('[data-hand-do="rank"]');
  await frames();
  const ranks = (await my()).hand.map((c) => c.face?.rank);
  check("меню руки → «По номиналу»: рука разложена", ranks.length > 1, ranks);
  const ib = await p.locator("[data-pose-handle][data-in-bar]").boundingBox();
  await drag({ x: ib.x + ib.width / 2, y: ib.y + ib.height / 2 }, { x: ib.x + ib.width / 2, y: ib.y - 70 });
  check("ручка из бара вверх — рука снова видна", (await my()).pose.tuck === false, (await my()).pose);
  // Поза тела, журнал, настройки.
  await p.click("[data-stance-toggle]");
  await frames();
  check("поза тела — стоя (кнопка горит)", (await p.getAttribute("[data-stance-toggle]", "aria-pressed")) === "true", null);
  await p.click("[data-stance-toggle]");
  await p.click("[data-journal]");
  await frames();
  check("журнал партии — записи о том, что делали", (await p.locator('[data-g="journal"] [data-deed]').count()) > 0, await p.locator('[data-g="journal"]').innerText().catch(() => ""));
  await p.click("[data-journal]");
  await p.click("[data-settings]");
  await frames();
  check("настройки стола — открылись", await p.locator("[data-settings-panel]").isVisible(), null);
  await p.click("[data-settings-close]");
  // Индикатор стопки: число — как в стопке, тап — меню, «Перемешать».
  const pile0 = await t(() => window.__t3d.state().piles[0]);
  check("индикатор стопки — сколько карт", (await p.getAttribute('[data-g="deck-grip"]', "data-count")) === String(pile0.cards.length), pile0.cards.length);
  await p.click('[data-g="deck-grip"]');
  await frames();
  const tipCards = await p.locator('[data-g="deck-tip"] ~ [data-tip-card][data-from="pile"], [data-tip-card][data-from="pile"]').evaluateAll((els) => els.map((e) => ({ id: e.dataset.tipCard, src: e.querySelector("img")?.getAttribute("src") ?? "" })));
  check("тап по индикатору — окно колоды: все её карты веером, рубашкой (как лежат)", tipCards.length === pile0.cards.length && tipCards.every((c) => c.src.includes("/backs/")), tipCards.length);
  await p.click('[data-deck-do="shuffle"]');
  await frames();
  check("окно колоды → «Перемешать»: стопка перемешана", (await t(() => window.__t3d.state().piles[0].shuffles)) > pile0.shuffles, null);
  await p.click("[data-deck-lock]");
  await frames();
  check("окно колоды → «Лок»: стопка под локом, кнопка горит", (await t(() => window.__t3d.state().piles[0].lock)) === true && (await p.getAttribute("[data-deck-lock]", "aria-pressed")) === "true", null);
  await p.click("[data-deck-lock]");
  await frames();
  // Карту — из окна на сукно.
  // Перемешанная колода — новые имена карт: берём, что в окне сейчас.
  // Крайняя справа — поверх веера, видна целиком.
  const fromTip = (await p.locator('[data-tip-card][data-from="pile"]').evaluateAll((els) => els.map((e) => e.dataset.tipCard))).at(-1);
  const tb = await p.locator(`[data-tip-card="${fromTip}"]`).boundingBox();
  // Из окна наружу — над окном, на сукно (над самим окном карта целит обратно в колоду).
  const tipTop = (await p.locator('[data-g="deck-tip"]').boundingBox()).y;
  await drag({ x: tb.x + tb.width / 2, y: tb.y + 8 }, { x: 250, y: tipTop - 40 });
  check("карта из окна колоды — вытащена на сукно", await t((id) => window.__t3d.state().felt.some((c) => c.id === id), fromTip), null);
  // В КОЛОДУ: без окна — по месту колоды на экране (с края карты), ложится наверх.
  if (await p.locator('[data-g="deck-tip"]').count()) await p.click("[data-deck-shut]");
  await frames();
  const onTable = (await my()).hand.at(-1).id;
  const gAt = await p.locator('[data-g="deck-grip"]').boundingBox();
  const pileTopScreen = { x: gAt.x + gAt.width / 2 + 14, y: gAt.y - 30 };
  await p.mouse.move(...Object.values(await t((id) => window.__t3d.screenOf(id), onTable))); await p.mouse.down();
  await p.mouse.move(pileTopScreen.x, pileTopScreen.y, { steps: 10 });
  await frames();
  const rightOnPile = await t(() => window.__t3d.lastBody().right);
  const pileNow = await t(() => window.__t3d.state().piles[0]);
  await p.mouse.up();
  await frames();
  check("в колоду без окна — попал, целясь в край карты: легла наверх; остальным рука на колоде", await t((id) => window.__t3d.state().piles[0].cards.at(-1).id === id, onTable) && Math.hypot(rightOnPile.x - pileNow.x, rightOnPile.y - pileNow.y) < 0.01, { rightOnPile, pile: [pileNow.x, pileNow.y] });
  // Окно колоды открыто — рука остальным на колоде, даже без карты.
  await p.click('[data-g="deck-grip"]');
  await frames();
  const restBody = await t(() => window.__t3d.lastBody());
  check("окно колоды открыто — остальным моя рука на колоде (без карты)", restBody.right && Math.hypot(restBody.right.x - pileNow.x, restBody.right.y - pileNow.y) < 0.01, restBody.right);
  // Над окном колоды — щель в веере, карта ложится на это место (не наверх).
  const handCard = (await my()).hand.at(-1).id;
  const tipBox = await p.locator('[data-g="deck-tip"]').boundingBox();
  const hc = await t((id) => window.__t3d.screenOf(id), handCard);
  await p.mouse.move(hc.x, hc.y); await p.mouse.down();
  await p.mouse.move(tipBox.x + tipBox.width * 0.3, tipBox.y + tipBox.height * 0.75, { steps: 12 });
  await frames();
  const zone = await t(() => window.__t3d.zone());
  const gapShown = await p.locator(`[data-g="tip-held"][data-card="${handCard}"]`).count();
  await p.mouse.up();
  await frames();
  const landedAt = await t((id) => window.__t3d.state().piles[0].cards.findIndex((c) => c.id === id), handCard);
  const n = await t(() => window.__t3d.state().piles[0].cards.length);
  check("над окном колоды — сама карта в щели веера поверх окна, легла на это место, а не наверх", zone && zone.i < n - 1 && landedAt === zone.i && gapShown > 0, { zone, landedAt, n });
  if (await p.locator('[data-g="deck-tip"]').count()) await p.click("[data-deck-shut]");
  await frames();
  // Колода — за грипом: едет под пальцем, отпустил — стоит там, не прыгая.
  if (await p.locator('[data-g="deck-tip"]').count()) await p.click("[data-deck-shut]");
  const gb = await p.locator('[data-g="deck-grip"]').boundingBox();
  const topNow = await t(() => window.__t3d.state().piles[0].cards.at(-1).id);
  await p.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await p.mouse.down();
  await p.mouse.move(200, 430, { steps: 10 });
  await frames();
  const under = await t(() => window.__t3d.state().piles[0]);
  const gripRight = await t(() => window.__t3d.lastBody().right);
  const mid = await t((id) => window.__t3d.screenOf(id), topNow);
  check("колоду несут — она едет под пальцем (не на старом месте), остальным — рука под ней", Math.hypot(mid.x - 200, mid.y - 430) < 60 && !!under && gripRight && Math.hypot(gripRight.x - under.x, gripRight.y - under.y) > 0.5, { mid, gripRight });
  await p.mouse.move(210, 450, { steps: 3 });
  await p.mouse.up();
  const right = await t((id) => window.__t3d.screenOf(id), topNow);
  await frames();
  const after = await t(() => window.__t3d.state().piles[0]);
  check("отпустил — колода на новом месте сразу, без прыжка назад", Math.hypot(right.x - 210, right.y - 450) < 60 && Math.hypot(after.x - under.x, after.y - under.y) > 0.5, { right, was: [under.x, under.y], now: [after.x, after.y] });
  // Лассо: обвёл карты на сукне — выделены; «Перевернуть» — перевернулись.
  const feltIds = await t(() => window.__t3d.state().felt.map((c) => c.id));
  await p.click('[data-section="lasso"]');
  await p.click('[data-bar="lasso"]');
  const pts = await Promise.all(feltIds.map((id) => t((i) => window.__t3d.screenOf(i), id)));
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  const box = { l: Math.min(...xs) - 40, r: Math.max(...xs) + 40, t: Math.min(...ys) - 40, b: Math.max(...ys) + 40 };
  await p.mouse.move(box.l, box.t); await p.mouse.down();
  for (const [x, y] of [[box.r, box.t], [box.r, box.b], [box.l, box.b], [box.l, box.t + 2]]) await p.mouse.move(x, y, { steps: 6 });
  await p.mouse.up();
  await frames();
  const picked = await t(() => Object.keys(window.__t3d.state().picks));
  check("лассо: обвёл — карты сукна выделены", feltIds.length > 0 && feltIds.every((id) => picked.includes(id)), { feltIds, picked });
  const ups0 = await t(() => window.__t3d.state().felt.map((c) => c.up));
  await p.click('[data-lasso-act="flip"]');
  await frames();
  check("полоса лассо → «Перевернуть»: все выделенные перевёрнуты", (await t(() => window.__t3d.state().felt.map((c) => c.up))).every((u, i) => u !== ups0[i]), null);
  await p.click('[data-lasso-act="cancel"]');
  await p.click('[data-section="lasso"]');
  await frames();
  // Тап по голове — окно стула.
  const alia2 = (await t(() => window.__t3d.bodies())).find((b) => b.by === "alia");
  await p.mouse.click(alia2.head.x, alia2.head.y);
  await frames();
  check("тап по голове — окно стула: имя и флаги", (await p.locator('[data-g="tip"]').innerText().catch(() => "")).includes("Алия") && (await p.locator('[data-g="tip"] [data-status="lock"], [data-g="tip"] [data-flag="lock"]').count()) === 1, await p.locator('[data-g="tip"]').innerText().catch(() => ""));
  if (shot) await p.screenshot({ path: shot.replace(/\.png$/, "-hud.png") });

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
