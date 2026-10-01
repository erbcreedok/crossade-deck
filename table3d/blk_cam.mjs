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
    check("размер руки не зависит от карты на столе: в руке 0.54, в чужой руке (голова) в 1.7 раза крупнее, на столе 1.3", Math.abs(widths.hand - 0.54) < 0.02 && Math.abs(widths.theirs - 0.54 * 1.7) < 0.04 && Math.abs(widths.table - 1.3) < 0.02, widths);
    check("голова: рука в кадре внизу и после поворота возвращается на то же место экрана", c0.x > 0 && c0.x < 390 && c0.y > 450 && c0.y < 790 && Math.hypot(c1.x - c0.x, c1.y - c0.y) < 12 && Math.hypot(c2.x - c0.x, c2.y - c0.y) < 12, { c0, c1, c2 });
    {
      // Камера едет, а рука с картами целиком поспевает за ней с запозданием (отстаёт и догоняет) — одной точкой камеры, без отдельных догонялок у карт и кисти.
      const where = () => t(() => { const T = window.__t3d, st = T.state(), seat = st.people.find((x) => x.key === T.me()).seat, h = st.chairs.find((c) => c.id === seat).hand, a = T.screenOf(h[0].id), b = T.screenOf(h.at(-1).id); return { a, b, span: Math.hypot(b.x - a.x, b.y - a.y) }; });
      await p.keyboard.press("Home"); await p.waitForTimeout(900);
      const w0 = await where(); let worst = 0, spanDrift = 0;
      await p.mouse.move(40, 250); await p.mouse.down();
      for (let i = 1; i <= 14; i++) { await p.mouse.move(40 + i * 24, 250 - i * 12); await p.waitForTimeout(25); const w = await where(); worst = Math.max(worst, Math.hypot(w.a.x - w0.a.x, w.a.y - w0.a.y)); spanDrift = Math.max(spanDrift, Math.abs(w.span - w0.span)); }
      await p.mouse.up(); await p.waitForTimeout(1200);
      const wEnd = await where();
      check("камера едет — рука с картами отстаёт (видно смещение), как одно целое (карты не разъезжаются), и догоняет", worst > 6 && spanDrift < 4 && Math.hypot(wEnd.a.x - w0.a.x, wEnd.a.y - w0.a.y) < 8, { worst, spanDrift, end: Math.hypot(wEnd.a.x - w0.a.x, wEnd.a.y - w0.a.y) });
    }
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
    check("оптика (Shift+колесо): поле зрения уже, камера на месте, шея не тянется", f1.fov < f0.fov - 3 && f1.lean === f0.lean && Math.hypot(f1.pos[0] - f0.pos[0], f1.pos[2] - f0.pos[2]) < 0.01, { f0: f0.fov, f1: f1.fov, l: f1.lean, p0: f0.pos, p1: f1.pos, cf0, cf1 });
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
    check("кнопка левой руки — рука поднимается перед лицом, на прежнее место кадра", Math.hypot(cUp.x - c0.x, cUp.y - c0.y) < 24, { c0, cUp });
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
    // Ручка не вылетает из-под пальца, пока меняется поза: от стопки до ряда она всё время под пальцем.
    const gj = await tabBox("left"), jx = gj.x + gj.width / 2, jy = gj.y + gj.height / 2;
    await p.mouse.move(jx, jy); await p.mouse.down();
    let worst = 0;
    for (let k = 1; k <= 14; k++) { const fx = jx + k * 12; await p.mouse.move(fx, jy); await p.waitForTimeout(60); const gb = await tabBox("left"); worst = Math.max(worst, Math.abs(gb.x + gb.width / 2 - fx), Math.abs(gb.y + gb.height / 2 - jy)); }
    await p.mouse.up(); await p.waitForTimeout(400);
    check("боковая ручка идёт ровно под пальцем всё время, пока меняется поза и охват руки (не прыгает ни по горизонтали, ни по вертикали)", worst < 3, { worst });
    await tdrag("left", 0, 0);
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
    await p.mouse.move(tx, ty); await p.mouse.down(); await p.mouse.move(tx, ty - 100, { steps: 6 }); await p.waitForTimeout(300);
    const fanRaised = await t(() => window.__t3d.handShape());
    check("верхняя ручка вверх: рука поднялась и веер выпрямляется в ряд (высота влияет на веер)", fanRaised.lift > fanBefore.lift + 0.2, { fanBefore: fanBefore.lift, fanRaised: fanRaised.lift });
    // Не отпуская: вытянул карты на стол — и вернул обратно вниз; карты снова в руке.
    await p.mouse.move(tx, ty - 235, { steps: 8 }); await p.waitForTimeout(250);
    const carried = await t(() => window.__t3d.carrying());
    await p.mouse.move(tx, ty + 100, { steps: 10 }); await p.waitForTimeout(300);
    // На границе худа стопка не дрожит: палец ползёт сквозь границу — состояние меняется не больше двух раз.
    let flips = 0, prev = carried;
    for (let k = 0; k <= 40; k++) { await p.mouse.move(tx, ty - 150 + k * 3); await p.waitForTimeout(25); const now = await t(() => window.__t3d.carrying()); if (now !== prev) flips++; prev = now; }
    for (let k = 40; k >= 0; k--) { await p.mouse.move(tx, ty - 150 + k * 3); await p.waitForTimeout(25); const now = await t(() => window.__t3d.carrying()); if (now !== prev) flips++; prev = now; }
    check("на границе худа стопка не дрожит: туда-обратно палец — не больше двух переключений", flips <= 2, { flips });
    await p.mouse.move(tx, ty - 235, { steps: 6 });
    await p.mouse.move(tx, ty + 100, { steps: 10 }); await p.waitForTimeout(300);
    const back = await t(() => window.__t3d.carrying());
    await p.mouse.up(); await p.waitForTimeout(500);
    check("верхняя ручка: вверх — карты на столе, обратно вниз не отпуская — вернулись в руку (удержание возвращает, как и дроп)", carried === true && back === false && (await poseOf()).tuck === false, { carried, back });
    check("веер помещается у обычной руки и не помещается, когда разлёт слишком широкий", (await t(() => window.__t3d.fanFitsN(7, 3.1))) === true && (await t(() => window.__t3d.fanFitsN(40, 25))) === false, null);
    // Верхний язычок вниз — рука опускается и ложится; кнопка левой руки — поднимает.
    // Диапазон верхней ручки широкий: небольшой ход вниз руку не прячет, небольшой ход вверх не вытягивает на стол.
    await tdrag("top", 0, 60);
    const small = await poseOf(), smallUp = await t(() => window.__t3d.carrying());
    await tdrag("top", 0, -30);
    check("короткий ход ручки вниз не прячет руку, короткий вверх не вытягивает на стол", small.tuck === false && smallUp === false && (await t(() => window.__t3d.carrying())) === false && (await poseOf()).tuck === false, { small });
    const chatC = await rectOf(".screen:not(.off) [data-g=thumb-chat]"), tabC = await tabBox("top");
    await tdrag("top", 0, chatC.y + chatC.height / 2 + 12 - (tabC.y + tabC.height / 2));
    await p.waitForTimeout(400);
    check("верхняя ручка длинным ходом вниз: карты положены на стол, ручек руки нет", (await poseOf()).tuck === true && (await p.locator(".screen:not(.off) [data-hand-tab=top], .screen:not(.off) [data-hand-tab=left]").count()) === 0, await poseOf());
    // Положенная рука: у стопки на столе своя боковая ручка — потянул, и рука поднялась, а ручка стала верхней ручкой руки.
    await p.waitForTimeout(700);
    const laidSt = await t(() => ({ tabs: [...document.querySelectorAll('.screen:not(.off) [data-hand-tab]')].map((e) => e.dataset.handTab), pose: (() => { const s = window.__t3d.state(), seat = s.people.find((x) => x.key === window.__t3d.me()).seat; return s.chairs.find((c) => c.id === seat).pose; })() }));
    check("положена: пока стопки не видно на экране, ручки нет (она привязана к стопке, а не к камере)", laidSt.pose.tuck === true && laidSt.tabs.length === 0, laidSt);
    await dragLook(0, -170);
    const seen = await t(() => [...document.querySelectorAll('.screen:not(.off) [data-hand-tab]')].map((e) => e.dataset.handTab));
    check("посмотрел вниз — у стопки на столе одна боковая ручка", seen.length === 1 && seen[0] === "stack", seen);
    const sg = await tabBox("stack");
    const sx0 = sg.x + sg.width / 2, sy0 = sg.y + sg.height / 2;
    // Тап по ручке стопки поднимает руку; держать или чуть потянуть и вернуть — нет (рука остаётся на столе).
    await p.mouse.move(sx0, sy0); await p.mouse.down(); await p.waitForTimeout(600); await p.mouse.up(); await p.waitForTimeout(500);
    const afterHold = (await poseOf()).tuck;
    await p.mouse.move(sx0, sy0); await p.mouse.down(); await p.mouse.move(sx0, sy0 - 25, { steps: 5 }); await p.mouse.move(sx0, sy0, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(500);
    const afterShort = (await poseOf()).tuck;
    check("ручка у стопки: держать или чуть потянуть и вернуть — рука остаётся на столе", afterHold === true && afterShort === true, { afterHold, afterShort });
    await p.mouse.move(sx0, sy0); await p.mouse.down();
    // Ручка у стопки превращается в верхнюю ручку руки под пальцем: не прыгает, разворачивается из вертикальной в горизонтальную.
    let worstHeld = 0;
    for (let k = 1; k <= 12; k++) { await p.mouse.move(sx0, sy0 - k * 9); await p.waitForTimeout(70); const gh = await tabBox("top"); if (gh) worstHeld = Math.max(worstHeld, Math.abs(gh.x + gh.width / 2 - sx0), Math.abs(gh.y + gh.height / 2 - (sy0 - k * 9))); else worstHeld = 999; }
    const pill = await t(() => { const e = document.querySelector('.screen:not(.off) [data-hand-tab="top"] span'); const r = e?.getBoundingClientRect(); return r ? { w: r.width, h: r.height } : null; });
    check("ручка у стопки при подъёме руки — та же ручка под пальцем: не убегает и разворачивается в верхнюю (горизонтальную)", worstHeld < 4 && !!pill && pill.w > pill.h, { worstHeld, pill });
    await p.waitForTimeout(500);
    const liftedMid = await poseOf(), tabsMid = await tabsOn();
    await p.mouse.up(); await p.waitForTimeout(700);
    check("потянул ручку у стопки: рука поднялась, ручки руки (верхняя и левая) на месте", liftedMid.tuck === false && (await poseOf()).tuck === false && (await tabsOn()) === 2, { liftedMid, tabsMid });
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

} finally { await browser.close(); }
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.ok ? "" : " — " + JSON.stringify(c.got).slice(0,220)}`);
