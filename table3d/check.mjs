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
const pngChunks = (buf, kind) => { const out = []; for (let i = 8; i < buf.length; ) { const n = buf.readUInt32BE(i); if (buf.toString("latin1", i + 4, i + 8) === kind) out.push(buf.subarray(i + 8, i + 8 + n)); i += 12 + n; } return out; };
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const t = (fn, arg) => p.evaluate(fn, arg);
const tabInfo = () => p.evaluate(() => window.__t3d.tabs()[0]);
const gripBox = async () => { const a = await tabInfo(); return { x: a.x - a.w / 2, y: a.y - a.h / 2, width: a.w, height: a.h }; };
const clickGrip = async () => { const a = await tabInfo(); await p.mouse.click(a.x, a.y); };
const rectOf = (sel) => p.evaluate((q) => { const e = [...document.querySelectorAll(q)].find((x) => !x.closest(".screen.off")); const r = e?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null; }, sel);
const frames = () => p.evaluate(() => new Promise((r) => { let k = 0; const f = () => (++k > 40 ? r() : requestAnimationFrame(f)); f(); }));
const drag = async (from, to) => {
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  await p.mouse.move(to.x, to.y, { steps: 10 });
  await p.mouse.up();
  await frames();
};
try {
  await p.goto(`${base}/?stand&cam=orbit`);
  await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await frames();
  const s0 = await t(() => { const s = window.__t3d.state(); const seat = s.people.find((x) => x.key === window.__t3d.me()).seat; return { felt: s.felt.length, pile: s.piles[0].cards.length, top: s.piles[0].cards.at(-1).id, hand: s.chairs.find((c) => c.id === seat).hand.map((c) => c.id) }; });
  check("стол собран: стопка, моя рука из 7, на сукне пусто, надпись загрузки спрятана", s0.pile > 0 && s0.hand.length === 7 && s0.felt === 0 && await p.locator("#note").isHidden(), s0);

  // ТЕЛА: у Алии — тело у стула, голова на экране, её карты — в её левой руке; ушедший Тимур и я — без тела.
  const bodies = await t(() => window.__t3d.bodies());
  const alia = bodies.find((b) => b.by === "alia");
  const aliaHand = await t(() => { const s = window.__t3d.state(); const seat = s.people.find((x) => x.key === "alia").seat; return s.chairs.find((c) => c.id === seat).hand.map((c) => window.__t3d.world(c.id)); });
  const nearLeft = alia && aliaHand.every((w) => Math.hypot(w.x - alia.left.x, w.y - alia.left.y) < 3.5 && Math.abs(w.h - alia.left.h) < 1.5);
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
  check("с сукна в руку — встала в руку, слева", s3.includes(s0.top) && s3.indexOf(s0.top) <= 3 && s3.length === 7, s3);
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
  check("над своей рукой — в щели руки, выше соседей на экране и ближе к глазу, моей руки над столом нет", over && over.gap !== null && !over.onCamera && !over.arm && heldY < Math.min(...handYs) - 25, { over, heldY, handYs });
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
  const hudHas = await p.evaluate(() => ["[data-rooms-back]", "[data-table-name]", "[data-settings]", "[data-journal]", '[data-section="chair"]', '[data-section="lasso"]', "[data-home]", "[data-stance-toggle]", '[data-section="say"]', "[data-hand-btn]"].filter((q) => !document.querySelector(q)));
  check("HUD стола: верх (выход, имя, настройки, журнал), бар «стул» и «лассо», компас, поза, диалог, левая рука", hudHas.length === 0, hudHas);
  await p.click('[data-section="chair"]');
  await p.click('[data-bar="lock"]');
  await frames();
  check("«Стул» → замок: рука заперта, кнопка горит", (await my()).lock === true && (await p.getAttribute('[data-bar="lock"]', "aria-pressed")) === "true", (await my()).lock);
  await p.click('[data-bar="lock"]');
  await p.click('[data-bar="leave"]');
  check("«Встать» — сперва вопрос «Покинуть стул?»", (await p.locator("[data-confirm]").innerText()).includes("Покинуть стул?"), null);
  await p.click('[data-bar="leave"]');
  await p.click('[data-section="chair"]');
  // Левая рука — самая левая кнопка бара, видна всегда: нажал — раскрылось сабменю (порядок, поза, отпустить), без тултипа; «Отпустить» — рука на стол, кнопка поднимает.
  const handBtn = ".screen:not(.off) [data-hand-btn]", menu = ".screen:not(.off) [data-hand-menu]", sub = (k) => `.screen:not(.off) [data-hand-sub="${k}"]`;
  const barXs = await p.evaluate(() => [...document.querySelectorAll('.screen:not(.off) [data-g="bar"] button')].map((e) => e.getBoundingClientRect().x));
  const hbx = await rectOf("[data-hand-btn]");
  check("левая рука — самая левая кнопка бара и видна всегда", !!hbx && hbx.x <= Math.min(...barXs) + 1, { hbx, barXs });
  check("рука поднята — сабменю не раскрыто, пока кнопку не нажали", (await p.locator(".screen:not(.off) [data-hand-sub]").count()) === 0, null);
  await p.click(handBtn); await frames();
  check("кнопка левой руки раскрывает сабменю в баре: порядок, поза, отпустить — а не тултип", (await p.locator(".screen:not(.off) [data-hand-sub]").count()) === 3 && (await p.locator(menu).count()) === 0, null);
  await p.click(sub("pose")); await frames();
  check("сабменю → «Поза»: список позы (веер, ужать)", (await p.locator(`${menu} [data-hand-pose]`).count()) === 2 && (await p.locator(`${menu} [data-hand-do]`).count()) === 0, null);
  await p.click(`${menu} [data-hand-pose="fan"]`); await frames();
  const row = (await my()).pose;
  await p.click(sub("pose")); await p.click(`${menu} [data-hand-pose="fan"]`);
  check("«Поза» → «В ряд»: веер выключен, повторно — включён", row.fan === false && (await my()).pose.fan === true, { row, now: (await my()).pose });
  await p.click(sub("pose")); await p.click(`${menu} [data-hand-pose="shrink"]`); await frames();
  const shr = (await my()).pose.shrink;
  await p.click(sub("pose")); await p.click(`${menu} [data-hand-pose="shrink"]`);
  check("«Поза» → «Ужать» и обратно «Разжать»", shr === true && (await my()).pose.shrink === false, { shr });
  await p.click(sub("sort")); await frames();
  check("сабменю → «Порядок»: масть, номинал, перемешать, перевернуть, наоборот", (await p.locator(`${menu} [data-hand-do]`).count()) === 5 && (await p.locator(`${menu} [data-hand-pose]`).count()) === 0, null);
  await p.click(`${menu} [data-hand-do="rank"]`);
  await frames();
  const ranks = (await my()).hand.map((c) => c.face?.rank);
  check("«Порядок» → «По номиналу»: рука разложена", ranks.length > 1, ranks);
  await p.click(sub("release")); await frames();
  check("сабменю → «Отпустить»: рука на стол, сабменю свернулось", (await my()).pose.tuck === true && (await p.locator(".screen:not(.off) [data-hand-sub]").count()) === 0, (await my()).pose);
  check("рука положена — кнопка левой руки по-прежнему на месте", (await p.locator(handBtn).count()) === 1, null);
  await p.click(handBtn); await frames();
  check("кнопка левой руки при положенной руке — рука поднимается и сабменю раскрыто", (await my()).pose.tuck === false && (await p.locator(".screen:not(.off) [data-hand-sub]").count()) === 3, (await my()).pose);
  await p.click(handBtn); await frames();
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
  check("язычок стопки лежит на столе — сколько карт", (await tabInfo()).count === pile0.cards.length, pile0.cards.length);
  await clickGrip();
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
  const gAt = await gripBox();
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
  await clickGrip();
  await frames();
  check("окно колоды открыто, но я его не трогаю — рука не на колоде", (await t(() => window.__t3d.myArm())) === null && !(await t(() => window.__t3d.lastBody().right)), await t(() => window.__t3d.lastBody().right));
  { const tb = await p.locator('[data-g="deck-tip"]').boundingBox(); await p.mouse.move(tb.x + 60, tb.y + 40, { steps: 4 }); await p.waitForTimeout(200); }
  const restBody = await t(() => window.__t3d.lastBody());
  check("работаю с окном колоды — остальным моя рука на колоде (без карты)", restBody.right && Math.hypot(restBody.right.x - pileNow.x, restBody.right.y - pileNow.y) < 0.01, restBody.right);
  const myArmPile = await t(() => window.__t3d.myArm());
  check("работаю с окном колоды — и мне видна моя правая рука на колоде, над её верхом", myArmPile && Math.hypot(myArmPile.x - pileNow.x, myArmPile.y - pileNow.y) < 0.01 && myArmPile.h > 0.15, myArmPile);
  // Над окном колоды — щель в веере, карта ложится на это место (не наверх).
  const handCard = (await my()).hand.at(-1).id;
  const tipBox = await p.locator('[data-g="deck-tip"]').boundingBox();
  const hc = await t((id) => window.__t3d.screenOf(id), handCard);
  await p.mouse.move(hc.x, hc.y + 22); await p.mouse.down();
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
  await p.click("[data-home]"); await p.waitForTimeout(1200); await frames();
  const gb = await gripBox();
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
  await p.hover('[data-g="tip"]');
  await frames();
  {
    const aliaHand = (await t(() => window.__t3d.bodies())).find((b) => b.by === "alia").left, mine = await t(() => window.__t3d.myArm()), sent = await t(() => window.__t3d.lastBody().right);
    check("окно чужого стула — моя правая рука у его левой руки (с веером): вижу я, видят остальные", mine && sent && Math.hypot(mine.x - aliaHand.x, mine.y - aliaHand.y) < 0.01 && Math.abs(mine.h - aliaHand.h) < 0.01 && Math.hypot(sent.x - aliaHand.x, sent.y - aliaHand.y) < 0.01, { mine, sent, aliaHand });
  }
  if (shot) await p.screenshot({ path: shot.replace(/\.png$/, "-hud.png") });

  {
  // ПАНЕЛЬ HUD — одна на все окна: привязка к экрану или к столу, у стола — наклон; двигается всегда за заголовок.
  if (await p.locator("[data-tip-close]").count()) await p.click("[data-tip-close]");
  await p.click('[data-home]');
  await frames();
  await clickGrip();
  await frames();
  const panel = '[data-panel^="pile:"]';
  const rect = () => p.locator(panel).boundingBox();
  const zoom = async (dy) => { await p.mouse.move(40, 250); await p.mouse.wheel(0, dy); await frames(); };
  const turn = async (dx) => drag({ x: 40, y: 250 }, { x: 40 + dx, y: 250 });
  const attr = (a) => p.getAttribute(panel, a);
  // Кнопки строки стенда — окно на столе может уйти краем за кадр: жмём прямо.
  const tilt = (x) => p.evaluate(([q, v]) => document.querySelector(`${q} [data-panel-tilt="${v}"]`).click(), [panel, x]);
  const anchorTo = (x) => p.evaluate(([q, v]) => document.querySelector(`${q} [data-panel-anchor="${v}"]`).click(), [panel, x]);
  const dragHead = async (dx, dy) => { const hd = await p.locator(`${panel} [data-panel-drag]`).boundingBox(); await drag({ x: hd.x + 10, y: hd.y + hd.height / 2 }, { x: hd.x + 10 + dx, y: hd.y + hd.height / 2 + dy }); };
  check("панель стопки: по умолчанию привязка к экрану; внизу строка стенда (привязка)", (await attr("data-anchor")) === "screen" && (await p.locator(`${panel} [data-panel-anchor]`).count()) === 2, await attr("data-anchor"));
  const a0 = await rect();
  await zoom(-400);
  await turn(80);
  const a1 = await rect();
  check("к экрану — ни зум, ни поворот стола её не трогают", Math.abs(a1.x - a0.x) < 1 && Math.abs(a1.y - a0.y) < 1 && Math.abs(a1.width - a0.width) < 1, [a0, a1]);
  await dragHead(-20, -60);
  const a2 = await rect();
  check("к экрану — двигается за заголовок", Math.abs(a2.x - (a1.x - 20)) < 2 && Math.abs(a2.y - (a1.y - 60)) < 2, [a1, a2]);
  // Язычок масштаба: от середины — крупнее, к ней — мельче; карта в щель — по-прежнему на своё место.
  const tongue = async (dx, dy) => { const tg = await p.locator(`${panel} [data-panel-scale]`).boundingBox(); await drag({ x: tg.x + tg.width / 2, y: tg.y + tg.height / 2 }, { x: tg.x + tg.width / 2 + dx, y: tg.y + tg.height / 2 + dy }); };
  await tongue(-60, -60);
  const sm = await rect();
  check("язычок (на экране) — к середине: окно мельче", sm.width < a2.width - 20, [a2.width, sm.width]);
  const toS = (await my()).hand.at(-1).id, hs = await t((id) => window.__t3d.screenOf(id), toS);
  await p.mouse.move(hs.x, hs.y); await p.mouse.down();
  await p.mouse.move(sm.x + sm.width * 0.4, sm.y + sm.height * 0.6, { steps: 12 });
  await frames();
  const zs = await t(() => window.__t3d.zone());
  await p.mouse.up();
  await frames();
  check("окно мельче — карта в щель ложится на своё место", zs && (await t((id) => window.__t3d.state().piles[0].cards.findIndex((c) => c.id === id), toS)) === zs.i, zs);
  await p.click("[data-home]");
  await anchorTo("table");
  await frames();
  const tb0 = await rect();
  await tongue(40, 40);
  const tb1 = await rect();
  check("на столе — по умолчанию меньше экранной; язычок от середины — крупнее", tb0.width < a2.width * 0.7 && tb1.width > tb0.width + 10, [a2.width, tb0.width, tb1.width]);
  const b0 = await rect();
  await zoom(400);
  const b1 = await rect();
  check("к столу — зум меняет её размер на экране (дальше — меньше)", (await attr("data-anchor")) === "table" && b1.width < b0.width - 5, [b0.width, b1.width]);
  await turn(90);
  const b2 = await rect();
  check("к столу — поворот стола уносит её вместе со столом", Math.hypot(b2.x - b1.x, b2.y - b1.y) > 10, [b1, b2]);
  await p.click('[data-home]');
  await frames();
  const c0 = await rect();
  await dragHead(0, -50);
  const c1 = await rect();
  check("к столу — двигается за заголовок по столу", Math.hypot(c1.x - c0.x, c1.y - c0.y) > 10, [c0, c1]);
  // Карта в панель на столе — луч в её плоскость, щель веера, ложится на это место.
  const toTip = (await my()).hand.at(-1).id, hc2 = await t((id) => window.__t3d.screenOf(id), toTip);
  await p.mouse.move(hc2.x, hc2.y); await p.mouse.down();
  await p.mouse.move(c1.x + c1.width * 0.4, c1.y + c1.height * 0.6, { steps: 12 });
  await frames();
  const z2 = await t(() => window.__t3d.zone());
  await p.mouse.up();
  await frames();
  check("к столу: карта в щель её веера — ложится на это место", z2 && (await t((id) => window.__t3d.state().piles[0].cards.findIndex((c) => c.id === id), toTip)) === z2.i, z2);
  await zoom(500);
  // Кнопки наклона — строка стенда; окно на столе может уйти краем за кадр — жмём прямо.
  await tilt("flat");
  await frames();
  const d0 = await rect();
  await tilt("stand");
  await frames();
  const d1 = await rect();
  await tilt("camera");
  await frames();
  const d2 = await rect();
  // Камера сверху под углом: и лежащая, и стоящая сжаты перспективой (каждая по-своему), лицом к камере — в своих пропорциях.
  const natural = Number(await p.evaluate((q) => { const el = document.querySelector(q); return el.offsetHeight / el.offsetWidth; }, panel));
  const [rf, rs, rc] = [d0.height / d0.width, d1.height / d1.width, d2.height / d2.width];
  check("наклон: лежит и стоит — сжаты перспективой, по-разному; лицом к камере — в своих пропорциях", (await attr("data-tilt")) === "camera" && rf < natural - 0.05 && rs < natural - 0.05 && Math.abs(rf - rs) > 0.03 && Math.abs(rc - natural) < 0.05, { rf, rs, rc, natural });
  await p.reload();
  await p.waitForFunction(() => window.__t3d && window.__t3d.tabs().length);
  await frames();
  await clickGrip();
  await frames();
  check("обновил — панель стопки снова на столе (выбор помнит устройство)", (await attr("data-anchor")) === "table", await attr("data-anchor"));
  await anchorTo("screen");
  await frames();
  check("масштаб помнит устройство, у экрана и стола — свой: на экране — всё ещё мельче", Math.abs((await rect()).width - sm.width) < 2, [(await rect()).width, sm.width]);
  await anchorTo("table");
  await frames();
  const alia3 = (await t(() => window.__t3d.bodies())).find((x) => x.by === "alia");
  await p.mouse.click(alia3.head.x, alia3.head.y);
  await frames();
  check("панель стула — свой выбор: к экрану, хотя панель стопки на столе", (await p.getAttribute('[data-panel^="chair:"]', "data-anchor")) === "screen", await p.getAttribute('[data-panel^="chair:"]', "data-anchor"));
  await p.click("[data-tip-close]");
  await anchorTo("screen");
  await p.click("[data-deck-shut]");
  }

  // КОЛОДУ ЗА КРАЙ НЕСТИ МОЖНО, ДРОПНУТЬ НЕЛЬЗЯ — как карту: тянется за пальцем хоть за борт, отпустили — в ближайшую точку сукна.
  {
    await p.goto(`${base}/?stand&cam=orbit`);
    await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
    await frames();
    const grip = await gripBox();
    const topId = await t(() => window.__t3d.state().piles[0].cards.at(-1).id);
    await p.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await p.mouse.down();
    await p.mouse.move(8, 260, { steps: 14 });
    await frames();
    const far = await t((id) => { const w = window.__t3d.world(id); return Math.hypot(w.x, w.y); }, topId);
    await p.mouse.up();
    await frames();
    check("колоду тянут за край стола — идёт за пальцем, за бортом (радиус сукна 6.4)", far > 6.4, far);
    const rest = await t(() => { const q = window.__t3d.state().piles[0]; return { r: Math.hypot(q.x, q.y), x: q.x, y: q.y }; });
    const landed = await t((id) => { const w = window.__t3d.world(id); return Math.hypot(w.x, w.y); }, topId);
    check("отпустили за краем — стопка в ближайшей точке сукна, а не за столом", rest.r > 5 && rest.r < 6.0 && landed < 6.4, { rest, landed });
  }

  // ЯЗЫЧОК ПРИЖАТ К СТОЛУ, А НЕ К ЭКРАНУ: лежит у нижней кромки колоды в той же позе, облёт камеры его от колоды не отрывает;
  // тап по нему — окно колоды, камера не трогается; тянешь — колода и язычок под пальцем, как несомая карта.
  {
    await p.goto(`${base}/?stand&cam=orbit`);
    await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
    await frames();
    const at = async () => { const a = await tabInfo(), top = await t(() => { const s = window.__t3d.state(), q = s.piles[0]; return { id: q.cards[0].id, x: q.x, y: q.y }; }); const w = await t((id) => window.__t3d.world(id), top.id); return { a, w, top, d: Math.hypot(a.at.x - w.x, a.at.y - w.y), dh: a.y3 - w.h }; };
    const rest = await at();
    check("язычок лежит на столе у кромки колоды: торчит из нижней карты, на высоте сукна, плашмя", rest.d > 0.7 && rest.d < 1.2 && Math.abs(rest.dh) < 0.02 && rest.a.y3 < 0.05, { d: rest.d, dh: rest.dh, y3: rest.a.y3 });
    await p.mouse.move(195, 300); await p.mouse.down();
    for (let i = 0; i < 30; i++) { await p.mouse.move(195 + i * 5, 300 + (i % 3)); await p.waitForTimeout(16); }
    await p.mouse.up(); await frames();
    const orbited = await at();
    check("облёт камеры: язычок остался у той же кромки колоды (прижат к столу, не к экрану)", Math.abs(orbited.d - rest.d) < 0.03 && Math.abs(orbited.dh - rest.dh) < 0.02, { before: rest.d, after: orbited.d });
    const viewBefore = await t(() => window.__t3d.view());
    await clickGrip(); await frames();
    const viewAfter = await t(() => window.__t3d.view());
    check("тап по язычку — окно колоды, камера не поехала", (await p.locator('[data-g="deck-tip"]').count()) === 1 && Math.abs(viewBefore.yaw - viewAfter.yaw) < 0.01 && Math.abs(viewBefore.pitch - viewAfter.pitch) < 0.01, { viewBefore, viewAfter });
    await p.click("[data-deck-shut]"); await frames();
    // Верхнюю карту потянули — язычок остался с колодой, а не поехал за картой.
    const still = await at();
    const topId = await t(() => window.__t3d.state().piles[0].cards.at(-1).id);
    const tp = await t((id) => window.__t3d.screenOf(id), topId);
    await p.mouse.move(tp.x, tp.y - 6); await p.mouse.down();
    await p.mouse.move(tp.x + 70, tp.y - 90, { steps: 10 });
    await frames(); await p.waitForTimeout(300);
    const cardDragged = await t(() => window.__t3d.held());
    const during = await at();
    check("тянут верхнюю карту колоды — язычок остаётся у колоды, а не едет за картой", !!cardDragged && Math.hypot(during.a.at.x - still.a.at.x, during.a.at.y - still.a.at.y) < 0.02 && Math.abs(during.a.y3 - still.a.y3) < 0.02, { cardDragged: !!cardDragged, moved: Math.hypot(during.a.at.x - still.a.at.x, during.a.at.y - still.a.at.y) });
    await p.mouse.up(); await frames();
    // Тянем за язычок: он ровно под пальцем, колода — с ним, на том же месте относительно него.
    const a0 = await tabInfo(), s0 = await at();
    await p.mouse.move(a0.x, a0.y); await p.mouse.down();
    await p.mouse.move(a0.x + 90, a0.y - 60, { steps: 12 });
    await frames(); await p.waitForTimeout(400);
    const held = await at(), tab = await tabInfo();
    check("тянут за язычок — язычок ровно под пальцем (не колода и не карта)", Math.hypot(tab.x - (a0.x + 90), tab.y - (a0.y - 60)) < 8, { tab: [tab.x, tab.y], finger: [a0.x + 90, a0.y - 60] });
    check("тянут за язычок — колода при нём на прежнем расстоянии и поднята вместе с ним", Math.abs(held.d - s0.d) < 0.03 && held.a.y3 > 0.3, { d: held.d, was: s0.d, y3: held.a.y3 });
    await p.mouse.up(); await frames();
  }

  // КАРТЫ В ОКНАХ: чужая рука под локом — тянуть нельзя вовсе; несомая карта уходит из окна (на её месте пустой контур);
  // отпустили за столом — легла на край сукна.
  {
    await p.goto(`${base}/?stand&cam=orbit`);
    await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
    await frames();
    const alia = (await t(() => window.__t3d.bodies())).find((b) => b.by === "alia");
    await p.mouse.click(alia.head.x, alia.head.y);
    await frames();
    const lockedCards = await p.locator('[data-panel^="chair:"] [data-tip-card]').evaluateAll((els) => els.map((e) => e.getAttribute("data-take")));
    check("чужая рука под локом: карты в окне помечены «нельзя взять»", lockedCards.length > 0 && lockedCards.every((v) => v === "0"), lockedCards);
    const lb = await p.locator('[data-panel^="chair:"] [data-tip-card]').first().boundingBox();
    await p.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2); await p.mouse.down();
    await p.mouse.move(lb.x + lb.width / 2 + 10, lb.y + lb.height / 2 - 120, { steps: 10 });
    await frames();
    const lockedHeld = await t(() => window.__t3d.held());
    await p.mouse.up(); await frames();
    check("чужая рука под локом: потянуть карту из окна нельзя (её не несут)", lockedHeld === null, lockedHeld);
    await p.click("[data-tip-close]"); await frames();
    // Окно стопки: карту тянут — в окне контур, а не она.
    await clickGrip(); await frames();
    const cardEl = p.locator('[data-panel^="pile:"] [data-tip-card]').last();
    const cid = await cardEl.getAttribute("data-tip-card");
    const cb = await cardEl.boundingBox();
    await p.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2); await p.mouse.down();
    await p.mouse.move(6, 130, { steps: 14 });
    await frames();
    const inWindow = await p.locator(`[data-tip-card="${cid}"]`).count(), outline = await p.locator(`[data-tip-slot="${cid}"]`).count(), carried = await t(() => window.__t3d.held()?.id);
    check("тянут карту из окна стопки — в окне пустой контур, самой карты там нет, а несут её на столе", inWindow === 0 && outline === 1 && carried === cid, { inWindow, outline, carried, cid });
    await p.mouse.up(); await frames();
    const landed = await t((id) => { const f = window.__t3d.state().felt.find((x) => x.id === id); return f ? Math.hypot(f.x, f.y) : null; }, cid);
    check("отпустили за столом — карта легла на край сукна, а не вернулась в окно", landed !== null && landed > 5 && landed < 6.0, landed);
  }

  // ОКНО ЧУЖОЙ РУКИ — ЗОНА ДЛЯ НЕСОМОЙ КАРТЫ: рука принимает — карта встаёт в щель веера и ложится в неё; под замком щели нет.
  {
    await p.goto(`${base}/?stand&cam=orbit`);
    await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
    await frames();
    const alia = (await t(() => window.__t3d.bodies())).find((b) => b.by === "alia");
    await p.mouse.click(alia.head.x, alia.head.y); await frames();
    const aliaHand = () => t(() => window.__t3d.state().chairs.find((ch) => ch.owner === "alia").hand.map((x) => x.id));
    const carryOver = async () => {
      const mine = await t(() => { const s = window.__t3d.state(), seat = s.people.find((x) => x.key === window.__t3d.me()).seat; return s.chairs.find((ch) => ch.id === seat).hand.at(-1).id; });
      const at = await t((id) => window.__t3d.screenOf(id), mine);
      const box = await p.locator('[data-panel^="chair:"]').boundingBox();
      await p.mouse.move(at.x, at.y); await p.mouse.down();
      await p.mouse.move(box.x + box.width / 2, box.y + box.height * 0.5, { steps: 16 });
      await frames();
      const seen = { zone: await t(() => window.__t3d.zone()), held: await p.locator('[data-g="tip-held"]').count() };
      await p.mouse.up(); await frames();
      return { mine, ...seen };
    };
    const before = await aliaHand();
    const locked = await carryOver();
    check("чужая рука под замком: над окном щели нет, карта не в окне и в руку не легла", locked.zone === null && locked.held === 0 && (await aliaHand()).length === before.length && !(await aliaHand()).includes(locked.mine), { locked, len: (await aliaHand()).length });
    await p.click('[data-flag="lock"]'); await frames();
    const ok = await carryOver();
    const after = await aliaHand();
    check("чужая рука принимает: над окном — щель в веере и карта в ней", ok.zone && ok.zone.chair && ok.zone.i >= 0 && ok.zone.i <= before.length && ok.held === 1, ok);
    check("отпустили над окном — карта легла в чужую руку на это место", after.length === before.length + 1 && after[ok.zone.i] === ok.mine, { after, i: ok.zone?.i, card: ok.mine });
  }

  // СКРЫТАЯ КАРТА ЛИЦОМ КО МНЕ — не рубашка, а нарисованная рука с пальцем (не эмодзи), цвета разные и не по масти; у одной карты — всегда один и тот же.
  {
    await p.goto(`${base}/?stand&cam=orbit`);
    await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
    await frames();
    const arts = await t(() => window.__t3d.arts());
    const st = await t(() => { const s = window.__t3d.state(); return { open: s.felt.concat(s.piles.flatMap((q) => q.cards), s.chairs.flatMap((ch) => ch.hand)).filter((x) => x.face).map((x) => x.id), hidden: s.piles.flatMap((q) => q.cards).concat(s.chairs.flatMap((ch) => ch.hand)).filter((x) => !x.face).map((x) => x.id) }; });
    const byId = new Map(arts.map((a) => [a.id, a.face]));
    const hiddenKinds = new Set(st.hidden.map((id) => byId.get(id)));
    check("3D: у скрытых карт вместо рубашки палец, оттенков не меньше четырёх", st.hidden.length > 0 && st.hidden.every((id) => String(byId.get(id)).startsWith("finger:")) && hiddenKinds.size >= 4, { hidden: st.hidden.length, kinds: [...hiddenKinds] });
    check("3D: у открытых карт лицо своё, а не палец", st.open.length > 0 && st.open.every((id) => !String(byId.get(id)).startsWith("finger:")), st.open.length);
    const alia = (await t(() => window.__t3d.bodies())).find((b) => b.by === "alia");
    await p.mouse.click(alia.head.x, alia.head.y); await frames();
    const read = () => p.locator('[data-panel^="chair:"] [data-tip-card]').evaluateAll((els) => els.map((e) => [e.getAttribute("data-tip-card"), e.querySelector("[data-finger]")?.getAttribute("data-finger") ?? null, e.querySelectorAll("img").length]));
    const first = await read();
    check("окно чужой руки: скрытые карты — палец, а не рубашка", first.length > 0 && first.every(([, kind, imgs]) => kind !== null && imgs === 0) && new Set(first.map(([, kind]) => kind)).size >= 2, first);
    await p.click("[data-tip-close]"); await frames();
    await p.mouse.click(alia.head.x, alia.head.y); await frames();
    const again = await read();
    check("тот же палец у той же карты при повторном открытии (по id, не мигает)", JSON.stringify(again) === JSON.stringify(first), { first, again });
  }

  // БОК КОЛОДЫ — не белая плита: срез бумаги кремовый и темнее лица, у стопки есть тело на все её карты.
  {
    await p.goto(`${base}/?stand&cam=orbit`);
    await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
    await frames();
    const layers = await t(() => ({ bodies: window.__t3d.pileBodies(), n: window.__t3d.state().piles[0].cards.length }));
    check("у стопки из карт есть тело на все её карты (бок колоды)", layers.bodies.length === 1 && layers.bodies[0].layers === layers.n, layers);
    await p.mouse.move(300, 600); await p.mouse.down(); await p.mouse.move(300, 525, { steps: 10 }); await p.mouse.up();
    for (let i = 0; i < 2; i++) await p.mouse.wheel(0, -300);
    await frames();
    const a = await tabInfo(), vals = [];
    const lum = async (x, y) => { const png = await p.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 } }); const { inflateSync } = await import("zlib"); const raw = inflateSync(Buffer.concat(pngChunks(png, "IDAT"))); return 0.2126 * raw[1] + 0.7152 * raw[2] + 0.0722 * raw[3]; };
    for (const dy of [-9, -7, -5, -3]) for (const dx of [-12, -6, 0, 6, 12]) vals.push(await lum(a.x + dx, a.y + dy));
    const mean = vals.reduce((m, v) => m + v, 0) / vals.length, max = Math.max(...vals);
    check("бок колоды сбоку не белый: срез кремовый, темнее лица (средняя яркость < 175, самая яркая точка < 215)", mean < 175 && max < 215, { mean: Math.round(mean), max: Math.round(max) });
  }

  // СТУЛЬЯ: четыре места — два занято (мной и Алией, цветом хозяина), два свободных (серые); встал — стул отодвинут назад;
  // тап по свободному стулу — окно «Пустой стул» с «Сесть»; пересел — старый стул свободен, у меня руки нового.
  {
    await p.goto(`${base}/?stand&cam=orbit`);
    await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
    await frames();
    const chairs = await t(() => window.__t3d.chairs());
    const ink = await t(() => Object.fromEntries(window.__t3d.state().people.map((x) => [x.key, x.ink.slice(1)])));
    const free = chairs.filter((ch) => ch.owner === null);
    check("за столом четыре стула: два занято, два свободных", chairs.length === 4 && free.length === 2, chairs.map((ch) => [ch.id, ch.owner]));
    check("стул занятого — цвета его аватара, у свободного — серый, не цвет игрока", chairs.filter((ch) => ch.owner).every((ch) => ch.color === ink[ch.owner]) && free.every((ch) => !Object.values(ink).includes(ch.color)), chairs.map((ch) => [ch.id, ch.color]));
    for (let i = 0; i < 8; i++) await p.mouse.wheel(0, 300);
    await p.waitForTimeout(700); await frames();
    const seatTo = (await t(() => window.__t3d.chairs())).find((ch) => ch.owner === null && ch.id === "c4");
    await p.mouse.click(seatTo.x, seatTo.y); await frames();
    const sitBtn = await p.locator("[data-sit]").count(), label = await p.locator('[data-panel^="chair:"]').innerText().catch(() => "");
    check("тап по свободному стулу — окно «Пустой стул» с кнопкой «Сесть»", sitBtn === 1 && label.includes("Пустой стул"), { sitBtn, label: label.slice(0, 40) });
    await p.click("[data-sit]"); await frames();
    const after = await t(() => { const s = window.__t3d.state(), seat = s.people.find((x) => x.key === "me").seat; return { seat, c1: s.chairs.find((ch) => ch.id === "c1").owner, mine: s.chairs.find((ch) => ch.id === seat).hand.length, c1hand: s.chairs.find((ch) => ch.id === "c1").hand.length }; });
    check("пересел на свободный стул: старый свободен со своими картами, у меня — руки нового", after.seat === "c4" && after.c1 === null && after.c1hand === 7 && after.mine === 0, after);
    const mine = (await t(() => window.__t3d.chairs())).find((ch) => ch.owner === "me");
    await p.click("[data-stance-toggle]");
    await p.waitForTimeout(600); await frames();
    const stood = (await t(() => window.__t3d.chairs())).find((ch) => ch.owner === "me");
    await p.click("[data-stance-toggle]");
    await p.waitForTimeout(600); await frames();
    const sat = (await t(() => window.__t3d.chairs())).find((ch) => ch.owner === "me");
    check("встал — стул отодвинут назад, сел — вернулся", stood.r > mine.r + 1 && Math.abs(sat.r - mine.r) < 0.05, { sit: mine.r, stand: stood.r, again: sat.r });
  }

  // ТОЛЬКО ДЛЯ РАЗРАБОТКИ, только на стенде: стать Алией и обратно — стол её глазами, её стул, её карты, камера у её места.
  {
    await p.goto(`${base}/?stand&cam=orbit`);
    await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
    await frames();
    const as = () => t(() => { const s = window.__t3d.state(), key = window.__t3d.me(), seat = s.people.find((x) => x.key === key)?.seat; return { me: key, seat, hand: s.chairs.find((ch) => ch.id === seat)?.hand.length, yaw: Math.round(window.__t3d.view().yaw), chip: [...document.querySelectorAll("[data-dev-switch]")].find((e) => e.offsetParent !== null)?.textContent }; });
    const before = await as();
    await p.click("[data-dev-switch]:visible"); await p.waitForTimeout(800); await frames();
    const alia = await as();
    await p.click("[data-dev-switch]:visible"); await p.waitForTimeout(800); await frames();
    const back = await as();
    check("dev: стал Алией — её стул, её пять карт, камера у её места (yaw 180), на кнопке «→ Ye»", before.me === "me" && alia.me === "alia" && alia.seat === "c2" && alia.hand === 5 && alia.yaw === 180 && alia.chip.includes("Ye"), { before, alia });
    check("dev: и обратно — мой стул, мои семь карт", back.me === "me" && back.seat === "c1" && back.hand === 7, back);
    // ДВЕ КАМЕРЫ: между ними прыгают, у каждой своё место; голова того, кого оставили, стоит там, где камера была.
    const orbit = async (dx) => { await p.mouse.move(40, 330); await p.mouse.down(); await p.mouse.move(40 + dx, 330, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(500); };
    const view = () => t(() => window.__t3d.view());
    const near = (u, v) => Math.abs(u.yaw - v.yaw) < 0.6 && Math.abs(u.pitch - v.pitch) < 0.6;
    await orbit(220);
    const mineA = await view();
    await p.click("[data-dev-switch]:visible"); await p.waitForTimeout(800); await frames();
    const aliaHome = await view();
    const leftMe = (await t(() => window.__t3d.bodies())).find((b) => b.by === "me");
    check("dev: оставил свою камеру в стороне — моё тело остаётся с головой там, где она была (а не возвращается на плечи)", !!leftMe && leftMe.away === true && !near(mineA, aliaHome), { mineA, aliaHome, leftMe: leftMe && leftMe.away });
    await orbit(-160);
    const aliaB = await view();
    await p.click("[data-dev-switch]:visible"); await p.waitForTimeout(800); await frames();
    const meAgain = await view();
    await p.click("[data-dev-switch]:visible"); await p.waitForTimeout(800); await frames();
    const aliaAgain = await view();
    check("dev: возвращаюсь — камера там, где я её оставил; к Алии — там, где оставил её", near(meAgain, mineA) && near(aliaAgain, aliaB), { mineA, meAgain, aliaB, aliaAgain });
  }

  // ДВА ЭКРАНА (dev): мой и Алии живут оба, всё время; Tab прыгает между ними. Каждый помнит всё своё: камеру, окна, карту в пальце.
  {
    await p.goto(`${base}/?stand&cam=orbit`);
    await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
    await frames();
    const meNow = () => t(() => window.__t3d.me());
    await p.keyboard.press("Tab"); await p.waitForTimeout(400);
    const afterTab = await meNow();
    await p.keyboard.press("Tab"); await p.waitForTimeout(400);
    check("dev: клавиша Tab прыгает на другой экран и обратно", afterTab === "alia" && (await meNow()) === "me", { afterTab, back: await meNow() });
    check("dev: два экрана на странице, на виду один", (await p.locator("canvas").count()) === 2 && (await p.locator(".screen:not(.off)").count()) === 1, null);
    // Окно на моём экране остаётся открытым, пока я на экране Алии.
    const alia0 = (await t(() => window.__t3d.bodies())).find((b) => b.by === "alia");
    await p.mouse.click(alia0.head.x, alia0.head.y); await frames();
    const openBefore = await p.locator('[data-panel^="chair:"]:visible').count();
    await p.keyboard.press("Tab"); await p.waitForTimeout(400);
    const onAlia = await p.locator('[data-panel^="chair:"]:visible').count();
    await p.keyboard.press("Tab"); await p.waitForTimeout(400);
    const openAfter = await p.locator('[data-panel^="chair:"]:visible').count();
    check("dev: окно, открытое на моём экране, там и осталось — на экране Алии его нет, вернулся — оно на месте", openBefore === 1 && onAlia === 0 && openAfter === 1, { openBefore, onAlia, openAfter });
    await p.click("[data-tip-close]:visible"); await frames();
    const hold = async () => {
      const card = await t(() => { const s = window.__t3d.state(), seat = s.people.find((x) => x.key === "me").seat; return s.chairs.find((ch) => ch.id === seat).hand.at(-1).id; });
      const at = await t((id) => window.__t3d.screenOf(id), card);
      await p.mouse.move(at.x, at.y); await p.mouse.down();
      await p.mouse.move(195, 430, { steps: 12 }); await frames();
      return card;
    };
    const card1 = await hold();
    const heldBefore = await t(() => window.__t3d.held());
    await p.keyboard.press("Tab"); await p.waitForTimeout(500); await frames();
    const meBody = (await t(() => window.__t3d.bodies())).find((b) => b.by === "me");
    const aliaHeld = await t(() => window.__t3d.held());
    check("dev: с картой в пальце прыгнул на экран Алии — там она ничего не несёт, а моя правая рука осталась там, где была", !!heldBefore && !!meBody && meBody.right !== null && aliaHeld === null && (await meNow()) === "alia", { heldBefore: !!heldBefore, right: meBody && meBody.right, aliaHeld: !!aliaHeld });
    await p.keyboard.press("Tab"); await p.waitForTimeout(500); await frames();
    const resumed = await t(() => window.__t3d.held());
    check("dev: вернулся, не отпуская, — карта в пальце на моём экране, та же и там же", !!resumed && resumed.id === card1, { resumed: resumed && resumed.id, card1 });
    await p.mouse.up(); await frames();
    check("dev: отпустил после возвращения — карта легла на сукно, как обычно", await t((id) => window.__t3d.state().felt.some((f) => f.id === id), card1), null);
    // Отпустил, пока на виду был экран Алии: мой экран не застревает в тяге — карта легла там, где её держали.
    const card2 = await hold();
    await p.keyboard.press("Tab"); await p.waitForTimeout(500);
    await p.mouse.up(); await p.waitForTimeout(300);
    await p.keyboard.press("Tab"); await p.waitForTimeout(500); await frames();
    const after2 = await t((id) => { const s = window.__t3d.state(); return { held: window.__t3d.held(), felt: s.felt.some((x) => x.id === id), lock: s.locks[id] ?? null }; }, card2);
    check("dev: отпустил, пока был на экране Алии, — на моём экране не застряла тяга: карта легла там, где её держали", after2.held === null && after2.felt && after2.lock === null, after2);
  }

  // ОКНО «ГЛАЗАМИ ДРУГОГО» (dev): по кнопке второй экран показывается рядом — вид неактивного игрока, его камерой и столом не управляю;
  // выключил — скрыт. Tab меняет экраны местами: тот, что был окном, становится моим, мой — окном.
  {
    await p.goto(`${base}/?stand&cam=orbit`);
    await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
    await frames();
    const aside = () => p.locator(".screen.aside").count();
    const other = () => t(() => ({ me: window.__t3dScreens[1].me(), view: window.__t3dScreens[1].view() }));
    const before = await aside();
    await p.click("[data-dev-peek]:visible"); await p.waitForTimeout(800); await frames();
    const box = await p.evaluate(() => { const e = document.querySelector(".screen.aside"), r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), events: getComputedStyle(e).pointerEvents, inner: innerWidth }; });
    const o1 = await other();
    check("окно глазами другого: по кнопке появилось рядом (≈38% экрана), сквозное для пальца, там Алия", before === 0 && (await aside()) === 1 && box.w > box.inner * 0.3 && box.w < box.inner * 0.5 && box.events === "none" && o1.me === "alia", { before, box, o1 });
    // Мой экран крутится, окно — нет: чужой камерой не управляю.
    const mineBefore = await t(() => window.__t3d.view());
    await p.mouse.move(40, 330); await p.mouse.down(); await p.mouse.move(200, 330, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(400);
    const mineAfter = await t(() => window.__t3d.view()), o2 = await other();
    check("окно глазами другого: камера окна стоит на месте, когда кручу свой экран", Math.abs(mineAfter.yaw - mineBefore.yaw) > 5 && Math.abs(o2.view.yaw - o1.view.yaw) < 0.01, { mineBefore, mineAfter, o1: o1.view, o2: o2.view });
    // Свайп прямо по окну не «попадает» в него: он идёт в мой экран (в окне нет ни рук, ни камеры).
    const r = await p.evaluate(() => { const r = document.querySelector(".screen.aside").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await p.mouse.move(r.x, r.y); await p.mouse.down(); await p.mouse.move(r.x - 60, r.y, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(300);
    const o3 = await other();
    check("окно глазами другого: жест по окну камеру окна не двигает", Math.abs(o3.view.yaw - o1.view.yaw) < 0.01, { o1: o1.view, o3: o3.view });
    await p.keyboard.press("Tab"); await p.waitForTimeout(500);
    const swapped = await t(() => ({ active: window.__t3d.me(), asideWho: document.querySelector(".screen.aside")?.dataset.who }));
    check("окно глазами другого: Tab меняет экраны — управляю Алией, окном стал мой", swapped.active === "alia" && swapped.asideWho === "Ye", swapped);
    await p.keyboard.press("Tab"); await p.waitForTimeout(400);
    await p.click("[data-dev-peek]:visible"); await p.waitForTimeout(400);
    check("окно глазами другого: кнопка ещё раз — окно скрыто", (await aside()) === 0, await aside());
  }

  // МОЁ ТЕЛО: плечи, шея и рука на моём стуле, цвет — мой; кружок головы с именем — только когда камера ушла на другую сторону стола.
  {
    await p.goto(`${base}/?stand&cam=orbit`);
    await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
    await frames();
    const near = await t(() => window.__t3d.myBody());
    check("вижу своё тело: плечи, шея, рука на моём стуле; голова-кружок не мешает, пока камера на своей стороне", near.visible && near.parts >= 5 && near.head === false && near.shoulders.h === 4, near);
    await p.click("[data-stance-toggle]"); await p.waitForTimeout(500); await frames();
    const stood = await t(() => window.__t3d.myBody());
    check("встал — плечи выше (стоя семь, сидя четыре)", stood.shoulders.h === 7, stood);
    await p.click("[data-stance-toggle]"); await p.waitForTimeout(500); await frames();
    for (let k = 0; k < 3; k++) { await p.mouse.move(40, 300); await p.mouse.down(); await p.mouse.move(360, 300, { steps: 10 }); await p.mouse.up(); }
    await p.waitForTimeout(700); await frames();
    const far = await t(() => window.__t3d.myBody());
    check("камера на другой стороне стола — у моего тела голова-кружок с ниточкой, как у других, и левая рука с картами не пропала", far.head === true && far.parts >= 7, far);
  }

  // МОЯ РУКА ПОВЕРХ ВСЕГО: карты руки нарисованы вторым проходом — моё тело, стул и борт стола, оказавшиеся на линии взгляда, их не закрывают.
  {
    await p.goto(`${base}/?stand&cam=orbit&host=http://localhost:9591`);
    await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
    await frames();
    const mid = await t(() => { const s = window.__t3d.state(), seat = s.people.find((x) => x.key === window.__t3d.me()).seat, h = s.chairs.find((c) => c.id === seat).hand; return window.__t3d.screenOf(h[Math.floor(h.length / 2)].id); });
    const px = async (x, y) => { const png = await p.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 } }); const { inflateSync } = await import("zlib"); const raw = inflateSync(Buffer.concat(pngChunks(png, "IDAT"))); return [raw[1], raw[2], raw[3]]; };
    // Светлее всего в пятне вокруг середины карты: белая бумага, а не сукно и не борт (у них наименьший канал ниже 40).
    const seen = [];
    for (const dx of [-14, -7, 0, 7, 14]) for (const dy of [-12, -4, 4]) seen.push(Math.min(...(await px(mid.x + dx, mid.y + dy))));
    check("карта моей руки видна поверх тела и стула (светлая бумага, а не плечи, стул и не сукно)", Math.max(...seen) > 70, { mid, best: Math.max(...seen) });
  }

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
    // Второй игрок в 3D: я открываю окно колоды — у него моя правая рука на колоде, через весь стол.
    const q = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await q.goto(`${base}/?room=${room}&host=${encodeURIComponent(net.table)}&name=Вика`);
    await q.waitForFunction(() => window.__t3d && window.__t3d.state().piles.length > 0, null, { timeout: 15000 });
    const erzh = await t(() => window.__t3d.me());
    await p.click("[data-home]");
    await clickGrip();
    const pileAt = await t(() => window.__t3d.state().piles[0]);
    await q.waitForFunction(([k, x, y]) => window.__t3d.bodies().some((b) => b.by === k && b.right && Math.hypot(b.right.x - x, b.right.y - y) < 0.01), [erzh, pileAt.x, pileAt.y], { timeout: 5000 }).catch(() => {});
    const seen = await q.evaluate((k) => window.__t3d.bodies().find((b) => b.by === k), erzh);
    check("по сети: открыл окно колоды — второй игрок в 3D видит мою правую руку на колоде", !!seen?.right && Math.hypot(seen.right.x - pileAt.x, seen.right.y - pileAt.y) < 0.01, seen);
    await q.close();
    if (shot) await p.screenshot({ path: shot.replace(/\.png$/, "-net.png") });
    await flat.close();
  }

  // РУКА В МИРЕ: то, что в руке, держит левая рука тела — не осей камеры; камера едет, карты с головой; «спрятать» — стопкой на сукно.
  {
    await p.goto(`${base}/?stand&cam=orbit`);
    await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
    await frames();
    const mineIds = () => t(() => { const s = window.__t3d.state(), seat = s.people.find((x) => x.key === window.__t3d.me()).seat; return s.chairs.find((c) => c.id === seat).hand.map((c) => c.id); });
    const around = async () => { const ids = await mineIds(), left = await t(() => window.__t3d.leftHand()), ws = await Promise.all(ids.map((id) => t((i) => window.__t3d.world(i), id))); return { left, ws, far: Math.max(...ws.map((w) => Math.hypot(w.x - left.x, w.y - left.y))), low: Math.min(...ws.map((w) => w.h)) }; };
    const home = await around();
    check("моя рука — в мире у левой руки тела (там же, где у других), не в осях камеры", home.far < 3.5 && home.low > 1, home);
    const inView = await Promise.all((await mineIds()).map((id) => t((i) => window.__t3d.screenOf(i), id)));
    check("и на экране видна: карты руки в кадре", inView.every((q) => q.x > 0 && q.x < 390 && q.y > 0 && q.y < 844), inView);
    await drag({ x: 60, y: 200 }, { x: 200, y: 200 });
    const moved = await around();
    check("камера повернулась — рука с картами поехала вместе с головой (и осталась у левой руки)", Math.hypot(moved.ws[0].x - home.ws[0].x, moved.ws[0].y - home.ws[0].y) > 0.5 && moved.far < 3.5, { home: home.ws[0], moved: moved.ws[0], far: moved.far });
    await p.goto(`${base}/?stand&cam=orbit&host=http://localhost:9591`); await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas")); await frames();
    // Перевёрнутая рубашкой к себе (двойной тап) и обычная: «спрятать» кладёт обычную рубашкой вверх, перевёрнутую — лицом вверх.
    const ids = await mineIds(), rev = ids.at(-1);
    const rp = await t((id) => window.__t3d.screenOf(id), rev);
    await p.mouse.click(rp.x, rp.y); await p.mouse.click(rp.x, rp.y); await frames();
    const before = await t(() => window.__t3d.handFaces());
    await p.click(".screen:not(.off) [data-hand-btn]"); await p.click('.screen:not(.off) [data-hand-sub="release"]');
    await p.waitForTimeout(900); await frames();
    const tucked = await around();
    const faces = await t(() => window.__t3d.handFaces());
    check("«положить»: левая рука опустилась, карты стопкой на сукне", tucked.low < 0.6 && Math.max(...tucked.ws.map((w) => w.h)) < 0.8 && tucked.ws.every((w) => Math.hypot(w.x - tucked.ws[0].x, w.y - tucked.ws[0].y) < 0.6), tucked);
    const handOn = await t(() => window.__t3d.myBody().hand), stackAt = tucked.ws[0];
    check("положена: левая рука лежит на стопке сверху (кисть над картами, а не у головы)", !!handOn && Math.hypot(handOn.x - stackAt.x, handOn.y - stackAt.y) < 0.8 && handOn.h > stackAt.h && handOn.h < stackAt.h + 1.2, { handOn, stackAt });
    check("положена: сверху рубашки (а перевёрнутая рубашкой к себе — лицом вверх)", faces.filter((f) => f.id !== rev).every((f) => f.drawn === "back") && faces.find((f) => f.id === rev).drawn !== "back", { before, faces });
  }

  // МОДЕЛИ КАМЕРЫ: «голова» по умолчанию (с оптикой), «сверху» (2D) и «орбита» — dev-переключателем. Взгляд, приближение, рука в кадре, шея, штраф стоя.
  {
    await p.goto(`${base}/?stand&host=http://localhost:9591`);
    await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
    await frames();
    const cam = () => t(() => window.__t3d.cam());
    const cycle = async (to) => { for (let i = 0; i < 4 && (await cam()).mode !== to; i++) { await p.click("[data-dev-cam]:visible"); await p.waitForTimeout(600); } await frames(); };
    const myIds = () => t(() => { const s = window.__t3d.state(), seat = s.people.find((x) => x.key === window.__t3d.me()).seat; return s.chairs.find((c) => c.id === seat).hand.map((c) => c.id); });
    const firstCard = async () => t((id) => window.__t3d.screenOf(id), (await myIds())[0]);
    const dragLook = async (dx, dy, button = "left") => { await p.mouse.move(40, 250); await p.mouse.down({ button }); await p.mouse.move(40 + dx, 250 + dy, { steps: 8 }); await p.mouse.up({ button }); await p.waitForTimeout(250); };
    const h0 = await cam(), c0 = await firstCard();
    check("по умолчанию камера — голова: у плеч стула, не на орбите", h0.mode === "head" && h0.pos[1] < 8 && Math.hypot(h0.pos[0], h0.pos[2]) < 8 && h0.pitch < -20, h0);
    await dragLook(120, 0);
    const h1 = await cam(), c1 = await firstCard();
    check("голова: палец по пустому крутит взгляд на месте — камера стоит, поворот другой", Math.abs(h1.yaw - h0.yaw) > 10 && Math.hypot(h1.pos[0] - h0.pos[0], h1.pos[2] - h0.pos[2]) < 0.01, { h0, h1 });
    await dragLook(0, 150);
    const h2 = await cam(), c2 = await firstCard();
    check("голова: взгляд вверх-вниз меняет наклон", Math.abs(h2.pitch - h1.pitch) > 10, { h1: h1.pitch, h2: h2.pitch });
    const widths = await t(() => { const st = window.__t3d.state(), seat = st.people.find((x) => x.key === window.__t3d.me()).seat, hand = st.chairs.find((c) => c.id === seat).hand, top = st.piles[0].cards.at(-1).id; return { hand: window.__t3d.cardWidth(hand[0].id), theirs: window.__t3dScreens[1].cardWidth(hand[0].id), table: window.__t3d.cardWidth(top) }; });
    check("размер руки не зависит от карты на столе: в руке 0.29, в чужой руке (голова) в 1.7 раза крупнее, на столе 1.3", Math.abs(widths.hand - 0.2925) < 0.02 && Math.abs(widths.theirs - 0.2925 * 1.7) < 0.03 && Math.abs(widths.table - 1.3) < 0.02, widths);
    check("голова: рука в кадре внизу и держится на одном уровне — как в FPS: на повороте отстаёт и возвращается, взгляд вверх опускает руку", c0.x > 0 && c0.x < 390 && c0.y > 450 && c0.y < 790 && Math.abs(c1.x - c0.x) < 60 && Math.abs(c1.y - c0.y) < 30 && c2.y > c0.y + 10 && c2.y < 844, { c0, c1, c2 });
    // Остальные видят ту же руку там же: она в кадре головы (взгляд вверх-вниз идёт по сети).
    const both = await t(async () => { const id = window.__t3d.state().chairs.find((c) => c.id === window.__t3d.state().people.find((x) => x.key === window.__t3d.me()).seat).hand[3].id; await new Promise((r) => setTimeout(r, 500)); return window.__t3dScreens.map((sc) => sc.world(id)); });
    check("остальным моя рука — в той же точке головы (середина веера там же), но крупнее: они видят её издалека", !!both[0] && !!both[1] && Math.hypot(both[0].x - both[1].x, both[0].y - both[1].y) < 0.6 && Math.abs(both[0].h - both[1].h) < 0.6, both);
    await p.keyboard.press("Home"); await p.waitForTimeout(1200);
    const cHome = await firstCard();
    check("взгляд вернули домой — рука на прежнем уровне (осталась внизу, не уехала)", Math.hypot(cHome.x - c0.x, cHome.y - c0.y) < 10, { c0, cHome });
    await p.mouse.move(195, 300); await p.mouse.wheel(0, -300); await p.waitForTimeout(150);
    const z1 = await cam();
    check("голова: колесо приближает — шея наклонилась, камера ниже и дальше к столу", z1.lean > 0.1 && z1.pos[1] < h0.pos[1], { h0: h0.pos, z1 });
    await p.waitForFunction(() => window.__t3d.cam().lean <= 0.06, null, { timeout: 15000 }).catch(() => {});
    const z2 = await cam();
    check("голова: натяг держат долго — шея сама возвращается и отдыхает", z1.lean > 0.1 && z2.lean <= 0.06, { z1: z1.lean, z2 });
    // Оптика: Shift+колесо или правая кнопка вверх-вниз — поле зрения уже, тело и рука на месте.
    const f0 = await cam(), cf0 = await firstCard();
    await p.keyboard.down("Shift"); await p.mouse.move(195, 300); await p.mouse.wheel(0, -500); await p.keyboard.up("Shift"); await p.waitForTimeout(600);
    let cf1 = await firstCard();
    for (let i = 0; i < 12; i++) { await p.waitForTimeout(300); const n = await firstCard(); const still = Math.hypot(n.x - cf1.x, n.y - cf1.y) < 0.5; cf1 = n; if (still) break; }
    const f1 = await cam();
    check("оптика (Shift+колесо): поле зрения уже, камера на месте, шея не тянется, рука того же размера на том же месте", f1.fov < f0.fov - 3 && f1.lean === f0.lean && Math.hypot(f1.pos[0] - f0.pos[0], f1.pos[2] - f0.pos[2]) < 0.01 && Math.hypot(cf1.x - cf0.x, cf1.y - cf0.y) < 24, { f0: f0.fov, f1: f1.fov, l: f1.lean, p0: f0.pos, p1: f1.pos, cf0, cf1 });
    await p.keyboard.press("Home"); await frames();
    const r0 = await cam();
    await dragLook(0, -120, "right");
    const r1 = await cam();
    check("оптика (правая кнопка вверх-вниз): поле зрения меняется, взгляд не крутится", Math.abs(r1.fov - r0.fov) > 3 && Math.abs(r1.yaw - r0.yaw) < 0.5, { r0, r1 });
    await p.keyboard.press("Home"); await frames();
    // Положена на стол — рука и стопка остаются на месте, куда бы голова ни смотрела; поднял кнопкой — снова в кадре.
    const ids0 = await myIds(), handBtnSel = ".screen:not(.off) [data-hand-btn]";
    await p.click(handBtnSel); await p.click('.screen:not(.off) [data-hand-sub="release"]'); await p.waitForTimeout(2600);
    const w0 = await t((id) => window.__t3d.world(id), ids0[0]);
    await dragLook(130, 0); await dragLook(0, 110);
    const w1 = await t((id) => window.__t3d.world(id), ids0[0]);
    check("положена на стол: рука со стопкой не двигается за взглядом (влево-вправо, вверх-вниз)", Math.hypot(w1.x - w0.x, w1.y - w0.y) < 0.05 && Math.abs(w1.h - w0.h) < 0.05 && w0.h < 0.8, { w0, w1 });
    await p.keyboard.press("Home"); await p.click(handBtnSel); await p.waitForTimeout(1300);
    const cUp = await firstCard();
    check("кнопка левой руки — рука поднимается перед лицом, на прежнее место кадра", Math.hypot(cUp.x - c0.x, cUp.y - c0.y) < 10, { c0, cUp });
    await p.click(handBtnSel);
    // Два пальца на руке: вверх — в ряд (выровнять), щипок — шире и уже; отпустил — поза легла.
    const cdp = await p.context().newCDPSession(p);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map((q, i) => ({ x: q.x, y: q.y, id: i })) });
    const poseOf = () => t(() => { const s = window.__t3d.state(), seat = s.people.find((x) => x.key === window.__t3d.me()).seat; return s.chairs.find((c) => c.id === seat).pose; });
    const p0 = await poseOf(), cc = await firstCard();
    await touch("touchStart", [{ x: cc.x + 60, y: cc.y }, { x: cc.x + 100, y: cc.y }]);
    for (let i = 1; i <= 8; i++) await touch("touchMove", [{ x: cc.x + 60 - i * 12, y: cc.y }, { x: cc.x + 100 + i * 12, y: cc.y }]);
    await touch("touchEnd", []);
    await p.waitForTimeout(500);
    const p1 = await poseOf();
    check("два пальца на руке, растянул — рука раскрылась в ряд (самая широкая)", p0.fan === true && p1.fan === false && p1.shrink === false, { p0, p1 });
    const cs = await firstCard();
    const py = cs.y - 70;
    await touch("touchStart", [{ x: 100, y: py }, { x: 290, y: py }]);
    for (let i = 1; i <= 8; i++) await touch("touchMove", [{ x: 100 + i * 11, y: py }, { x: 290 - i * 11, y: py }]);
    await touch("touchEnd", []);
    await p.waitForTimeout(500);
    const p2 = await poseOf();
    check("два пальца на руке, щипок — рука ужалась стопкой", p2.shrink === true, { p1, p2 });
    // Ручки руки: сверху — высота (вниз — положить, высоко вверх — рука-стопка), слева — ширина (стопкой, веер, в ряд); вокруг — охват карт не уже 250, за него берутся двумя пальцами.
    const fr = await t(() => window.__t3d.handFrame());
    check("охват руки: не уже 250 и целиком в кадре", !!fr && fr.w >= 250 && fr.x >= 0 && fr.x + fr.w <= 390 && fr.y > 300, fr);
    const tabsOn = () => p.locator(".screen:not(.off) [data-hand-tab]").count();
    check("у руки две ручки, как у шторок: сверху и слева, без значков и без рамки", (await tabsOn()) === 2 && (await p.locator(".screen:not(.off) [data-hand-tab] svg").count()) === 0 && (await p.locator('.screen:not(.off) [data-g="hand-frame"]').count()) === 0, await tabsOn());
    const pBefore = await poseOf();
    await touch("touchStart", [{ x: fr.x + 14, y: fr.y + fr.h - 12 }, { x: fr.x + fr.w - 14, y: fr.y + fr.h - 12 }]);
    for (let i = 1; i <= 8; i++) await touch("touchMove", [{ x: fr.x + 14, y: fr.y + fr.h - 12 + i * 12 }, { x: fr.x + fr.w - 14, y: fr.y + fr.h - 12 + i * 12 }]);
    await touch("touchEnd", []);
    await p.waitForTimeout(500);
    const pAfter = await poseOf();
    check("два пальца за охват (мимо карт) берут руку, но вниз она не ложится", pAfter.tuck === false, { pBefore, pAfter });
    const tabBox = async (w) => rectOf(`[data-hand-tab="${w}"]`);
    const tdrag = async (w, dx, dy) => { const r = await tabBox(w); const x = r.x + r.width / 2, y = r.y + r.height / 2; await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + dx, y + dy, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(500); };
    // Начинаем с обычной руки: веер, не стопкой — через список «Поза», только то, что надо поменять.
    const setPose = async (want) => {
      for (const key of ["shrink", "fan"]) {
        if ((await poseOf())[key] === want[key]) continue;
        await p.click(handBtnSel); await p.click('.screen:not(.off) [data-hand-sub="pose"]'); await p.click(`.screen:not(.off) [data-hand-pose="${key}"]`); await p.waitForTimeout(250);
        await p.click(handBtnSel); await p.waitForTimeout(150);
      }
      await p.waitForTimeout(300);
    };
    await setPose({ shrink: false, fan: true });
    const base0 = await poseOf();
    check("перед язычками рука обычная: веер, не стопкой", base0.fan === true && base0.shrink === false && base0.tuck === false, base0);
    // Левая ручка — одна ось ширины: к краю шире, от края уже: стопка → веер (до 75%) → в ряд (самая широкая). Ручка идёт за пальцем всегда, а карты за краем экрана натягиваются и не растут.
    const side0 = await poseOf();
    await tdrag("left", -170, 0);
    const wide1 = await poseOf(), shapeRow = await t(() => window.__t3d.handShape());
    check("левая ручка к краю экрана: веер → в ряд (самый широкий размер)", side0.fan === true && side0.shrink === false && wide1.fan === false && wide1.shrink === false && shapeRow.f >= 0.99, { side0, wide1, shapeRow });
    const frRow = await t(() => window.__t3d.handFrame());
    check("в ряд рука раскрыта почти на весь экран: карты максимально не сжаты", frRow.w >= 320, frRow);
    // Ручка идёт за пальцем, даже когда дальше расширять нельзя; карты в этот момент натягиваются, но почти не растут.
    const gl = await tabBox("left"), gx = gl.x + gl.width / 2, gy = gl.y + gl.height / 2, wRow0 = (await t(() => window.__t3d.handFrame())).w;
    await p.mouse.move(gx, gy); await p.mouse.down(); await p.mouse.move(gx - 50, gy, { steps: 8 });
    await p.waitForTimeout(300);
    const wB = (await t(() => window.__t3d.handFrame())).w, gB = await tabBox("left");
    check("ручка идёт за пальцем и за пределом ширины: ручка сместилась, а рука почти не выросла (натяжение)", gB.x < gl.x - 20 && wB <= wRow0 * 1.08, { g0: gl.x, gB: gB.x, wRow0, wB });
    await p.mouse.up(); await p.waitForTimeout(400);
    await tdrag("left", 210, 0);
    const narrow = await poseOf();
    check("левая ручка от края: в ряд → ужато, видна одна карта", narrow.shrink === true, narrow);
    await tdrag("left", -90, 0);
    const mid = await poseOf();
    check("левая ручка на середину: из стопки — веер (второй по ширине размер)", mid.shrink === false && mid.fan === true, mid);
    // Веер держится до 75% ширины, выше — рука встаёт в ряд.
    await tdrag("left", -40, 0);
    const f70 = await t(() => window.__t3d.handShape()), pose70 = await poseOf();
    await tdrag("left", -60, 0);
    const f85 = await t(() => window.__t3d.handShape()), pose85 = await poseOf();
    check("веер до 75% ширины, выше — в ряд", f70.f < 0.75 && pose70.fan === true && f85.f > 0.75 && pose85.fan === false, { f70: f70.f, pose70, f85: f85.f, pose85 });
    await tdrag("left", 90, 0);
    // Высота влияет на веер: поднял руку верхней ручкой — веер выпрямляется.
    const fanBefore = await t(() => window.__t3d.handShape());
    const gt = await tabBox("top"), tx = gt.x + gt.width / 2, ty = gt.y + gt.height / 2;
    await p.mouse.move(tx, ty); await p.mouse.down(); await p.mouse.move(tx, ty - 45, { steps: 6 }); await p.waitForTimeout(300);
    const fanRaised = await t(() => window.__t3d.handShape());
    check("верхняя ручка вверх: рука поднялась и веер выпрямляется в ряд (высота влияет на веер)", fanRaised.lift > fanBefore.lift + 0.2, { fanBefore: fanBefore.lift, fanRaised: fanRaised.lift });
    // Не отпуская: вытянул карты на стол — и вернул обратно вниз; карты снова в руке.
    await p.mouse.move(tx, ty - 150, { steps: 6 }); await p.waitForTimeout(250);
    const carried = await t(() => window.__t3d.carrying());
    await p.mouse.move(tx, ty + 12, { steps: 10 }); await p.waitForTimeout(300);
    const back = await t(() => window.__t3d.carrying());
    await p.mouse.up(); await p.waitForTimeout(500);
    check("верхняя ручка: вверх — карты на столе, обратно вниз не отпуская — вернулись в руку (удержание возвращает, как и дроп)", carried === true && back === false && (await poseOf()).tuck === false, { carried, back });
    check("веер помещается у обычной руки и не помещается, когда разлёт слишком широкий", (await t(() => window.__t3d.fanFitsN(7, 3.1))) === true && (await t(() => window.__t3d.fanFitsN(40, 25))) === false, null);
    // Верхний язычок вниз — рука опускается и ложится; кнопка левой руки — поднимает.
    await tdrag("top", 0, 100);
    await p.waitForTimeout(400);
    check("верхняя ручка вниз: карты положены на стол, ручек нет", (await poseOf()).tuck === true && (await tabsOn()) === 0, await poseOf());
    await p.click(handBtnSel); await p.waitForTimeout(700); await p.click(handBtnSel);
    check("кнопка левой руки подняла руку — ручки снова на месте", (await poseOf()).tuck === false && (await tabsOn()) === 2, await tabsOn());
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    
    await cycle("top");
    const t0 = await cam(), tc = await firstCard();
    check("сверху: камера над серединой стола и смотрит вниз", t0.mode === "top" && t0.pos[1] > 15 && Math.abs(t0.pos[0]) < 0.01 && Math.abs(t0.pos[2]) < 0.01 && t0.pitch === -90, t0);
    check("сверху: рука — на худе внизу экрана (как у 2D-стола), а не на столе", tc.y > 650 && tc.x > 0 && tc.x < 390, tc);
    await dragLook(120, 0);
    const t1 = await cam();
    check("сверху: палец крутит стол (поворот вида), камера не сдвинулась", Math.abs(t1.yaw - t0.yaw) > 10 && Math.abs(t1.pos[0]) < 0.01, { t0, t1 });
    await p.mouse.move(195, 300); await p.mouse.wheel(0, -300); await p.waitForTimeout(150);
    const t2 = await cam();
    check("сверху: приближение — камера ниже (тот же наклон шеи), держать можно ненадолго", t2.lean > 0.1 && t2.pos[1] < t1.pos[1] - 2, { t1, t2 });
    await p.waitForFunction(() => window.__t3d.cam().lean <= 0.06, null, { timeout: 15000 }).catch(() => {});
    check("сверху: натяг не держится — камера возвращается к покою", t2.lean > 0.1 && (await cam()).lean <= 0.06, await cam());
    // Стоя: голова выше — сверху камера дальше, а приблизить можно только ненадолго (тот же штраф, что и у головы).
    await p.keyboard.press("Home"); await frames();
    const sit = await cam();
    await p.click("[data-stance-toggle]"); await p.waitForTimeout(700); await frames();
    const stand = await cam();
    check("стоя: сверху камера выше, чем сидя (штраф — мелкий масштаб стола, приближать придётся шеей)", stand.pos[1] > sit.pos[1] + 5, { sit: sit.pos[1], stand: stand.pos[1] });
    await p.click("[data-stance-toggle]"); await p.waitForTimeout(400);
    // Компас: поворот относительно стола в любой модели; тап по нему — домой.
    await cycle("head");
    const k0 = await cam();
    const cb = await rectOf("[data-home]");
    await drag({ x: cb.x + cb.width / 2, y: cb.y + cb.height / 2 }, { x: cb.x + cb.width / 2 + 60, y: cb.y + cb.height / 2 });
    const k1 = await cam();
    check("компас: поворачивает взгляд и в модели «голова»", Math.abs(k1.yaw - k0.yaw) > 10, { k0, k1 });
    await p.click("[data-home]"); await frames();
    check("компас: тап — взгляд домой, на свою сторону", Math.abs((await cam()).yaw - k0.yaw) < 0.5, await cam());
    await cycle("head");
  }

  // РУКА-СТОПКА: верхний язычок оттянули высоко вверх — левая рука несёт все карты над столом, как колоду: бросил — новая стопка, на колоду — в неё,
  // вернул на худ — всё как было. И вид «сверху»: положенные карты лежат на столе, а не пусто; голова видна.
  {
    await p.goto(`${base}/?stand&host=http://localhost:9591`);
    await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
    await frames();
    const info = () => t(() => { const s = window.__t3d.state(), seat = s.people.find((x) => x.key === window.__t3d.me()).seat; return { hand: s.chairs.find((c) => c.id === seat).hand.map((c) => c.id), piles: s.piles.map((q) => [q.id, q.cards.length]), felt: s.felt.length }; });
    const tab = () => rectOf('[data-hand-tab="top"]');
    const start = await info();
    const tb = await tab(), sx = tb.x + tb.width / 2, sy = tb.y + tb.height / 2;
    // Оттянули вверх, вернули на худ и отпустили — рука как была.
    await p.mouse.move(sx, sy); await p.mouse.down(); await p.mouse.move(195, 330, { steps: 10 });
    await p.waitForTimeout(400);
    const mid = await t((id) => ({ carrying: window.__t3d.carrying(), w: window.__t3d.world(id) }), start.hand[0]);
    check("верхний язычок высоко вверх: левая рука несёт все карты стопкой над столом", mid.carrying === true && mid.w.h > 0.5 && mid.w.h < 1.2, mid);
    await p.mouse.move(sx, sy + 20, { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(800);
    const back = await info();
    check("вернул на худ и отпустил — рука как была: те же карты, стопок не прибавилось", back.hand.length === start.hand.length && back.piles.length === start.piles.length && back.felt === start.felt, { start, back });
    // Отпустили на сукне — новая стопка из всей руки.
    const tb2 = await tab();
    await p.mouse.move(tb2.x + tb2.width / 2, tb2.y + tb2.height / 2); await p.mouse.down(); await p.mouse.move(250, 360, { steps: 10 }); await p.mouse.up();
    await p.waitForTimeout(900);
    const dropped = await info();
    const fresh = dropped.piles.find(([id]) => !start.piles.some(([o]) => o === id));
    check("отпустил над столом: появилась новая стопка из всей руки, рука пуста", dropped.hand.length === 0 && !!fresh && fresh[1] === start.hand.length, dropped);
  }
  {
    await p.goto(`${base}/?stand&host=http://localhost:9591`);
    await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
    await frames();
    const info = () => t(() => { const s = window.__t3d.state(), seat = s.people.find((x) => x.key === window.__t3d.me()).seat; return { hand: s.chairs.find((c) => c.id === seat).hand.map((c) => c.id), deck: s.piles.find((q) => q.id === "deck")?.cards.length }; });
    const start = await info();
    const tb = await rectOf('[data-hand-tab="top"]');
    const deckTop = await t(() => { const d = window.__t3d.state().piles.find((q) => q.id === "deck"); return window.__t3d.screenOf(d.cards.at(-1).id); });
    await p.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2); await p.mouse.down(); await p.mouse.move(deckTop.x, deckTop.y, { steps: 12 }); await p.mouse.up();
    await p.waitForTimeout(900);
    const after = await info();
    check("отпустил на колоду: вся рука легла в неё", after.hand.length === 0 && after.deck === start.deck + start.hand.length, { start, after });
  }
  {
    // Вид «сверху»: положенная рука — стопка на столе (а не пустой худ), голова видна.
    await p.goto(`${base}/?stand&host=http://localhost:9591`);
    await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
    await frames();
    for (let i = 0; i < 3 && (await t(() => window.__t3d.cam().mode)) !== "top"; i++) { await p.click("[data-dev-cam]:visible"); await p.waitForTimeout(500); }
    await p.click(".screen:not(.off) [data-hand-btn]"); await p.click('.screen:not(.off) [data-hand-sub="release"]'); await p.waitForTimeout(2600);
    const laidTop = await t(() => { const s = window.__t3d.state(), seat = s.people.find((x) => x.key === window.__t3d.me()).seat, ids = s.chairs.find((c) => c.id === seat).hand.map((c) => c.id); return { ws: ids.map((id) => window.__t3d.world(id)), body: window.__t3d.myBody() }; });
    check("сверху: положенная рука — стопка карт на столе, не пустота", laidTop.ws.length > 0 && laidTop.ws.every((w) => w.h < 0.8 && Math.hypot(w.x - laidTop.ws[0].x, w.y - laidTop.ws[0].y) < 0.6), laidTop.ws.slice(0, 2));
    check("сверху: моя голова видна (кружок с именем), рука на столе", laidTop.body.head === true && !!laidTop.body.hand, laidTop.body);
  }
  check("без ошибок", errors.length === 0, errors);
} finally {
  await browser.close();
}
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.ok ? "" : ` — ${String(JSON.stringify(c.got)).slice(0, 300)}`}`);
const bad = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
