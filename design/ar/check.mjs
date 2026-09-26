// ПРОГОН СТЕНДА С ПОДДЕЛЬНОЙ КАМЕРОЙ — вся цепочка без телефона.
//
//   python3 design/serve.py 9582 design/ar &   # или preview «ar-stand»
//   node design/ar/check.mjs                    # AR_URL, SHOTS=папка для скриншотов
//
// Камера — холст 720×1280, на котором рисуется «обложка» (или код ArUco) с заданным поворотом и
// масштабом. Проверяется не «что-то показалось», а геометрия: углы метки, спроецированные сценой,
// должны лечь туда, где их нарисовала камера, а тап по экрану — попасть в колоду на столе.

import { chromium } from "playwright";

const URL = process.env.AR_URL ?? "http://localhost:9582/";
const SHOTS = process.env.SHOTS ?? null;
const VW = 720, VH = 1280, SW = 390, SH = 844;

const FAKE = `(() => {
  const VW = ${VW}, VH = ${VH};
  const cam = document.createElement("canvas"); cam.width = VW; cam.height = VH;
  const g = cam.getContext("2d");
  let s = 7; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const cover = document.createElement("canvas"); cover.width = cover.height = 512;
  const c = cover.getContext("2d");
  c.fillStyle = "#e9dcc0"; c.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 140; i += 1) {
    c.fillStyle = "hsl(" + Math.floor(r() * 360) + "," + (40 + r() * 50) + "%," + (20 + r() * 60) + "%)";
    if (r() < 0.5) c.fillRect(r() * 512, r() * 512, 8 + r() * 60, 8 + r() * 60);
    else { c.beginPath(); c.arc(r() * 512, r() * 512, 5 + r() * 30, 0, 7); c.fill(); }
  }
  c.fillStyle = "#111"; c.font = "bold 64px serif"; c.fillText("КРЕСТ", 90, 280);
  const F = window.__fake = { gum: 0, scene: "cover", x: 360, y: 510, side: 520, rot: 0, img: null };
  setInterval(() => {
    g.fillStyle = "#6f6a60"; g.fillRect(0, 0, VW, VH);
    g.save(); g.translate(F.x, F.y); g.rotate(F.rot);
    const img = F.scene === "cover" ? cover : F.scene === "code" ? F.img : null;
    if (img) g.drawImage(img, -F.side / 2, -F.side / 2, F.side, F.side);
    g.restore();
  }, 33);
  const stream = cam.captureStream(30);
  navigator.mediaDevices.getUserMedia = async () => { F.gum += 1; return stream; };
})();`;

const fails = [];
const ok = (cond, what, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${what}${extra ? ` — ${extra}` : ""}`); if (!cond) fails.push(what); };

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: SW, height: SH }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.addInitScript(FAKE);
await page.goto(URL);

const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const S = (fn) => page.evaluate(fn);
const waitFor = (fn, timeout = 30000) => page.waitForFunction(fn, null, { timeout, polling: 200 });

/** Экранные точки углов метки (якорь ±0.5) — сцена сама проецирует. */
const projectedCorners = (halfH = 0.5) => page.evaluate((hh) => {
  const { anchor, camera } = window.__ar.three;
  const V = anchor.position.constructor;
  const el = document.getElementById("stage");
  return [[-0.5, hh], [0.5, hh], [0.5, -hh], [-0.5, -hh]].map(([x, y]) => {
    const v = new V(x, y, 0).applyMatrix4(anchor.matrixWorld).project(camera);
    return { x: ((v.x + 1) / 2) * el.clientWidth, y: ((1 - v.y) / 2) * el.clientHeight };
  });
}, halfH);

/** Пиксель видео → экран (видео «cover» в 390×844). */
const scale = Math.max(SW / VW, SH / VH), left = (SW - VW * scale) / 2, top = (SH - VH * scale) / 2;
const toScreen = ([x, y]) => ({ x: x * scale + left, y: y * scale + top });
const drawnCorners = (F, side) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
  const dx = (sx * side) / 2, dy = (sy * side) / 2, c = Math.cos(F.rot), s = Math.sin(F.rot);
  return toScreen([F.x + dx * c - dy * s, F.y + dx * s + dy * c]);
});
const worst = (a, b) => {
  const e = Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));
  if (process.env.VERBOSE) console.log("  сцена ", a.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join("  "), "\n  ждал  ", b.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join("  "));
  return e;
};

// 0. ГИРО по умолчанию: без камеры, стол стоит в мире, пока телефон поворачивают
const orient = (alpha, beta, gamma) => page.evaluate(([a, b, g]) => dispatchEvent(new DeviceOrientationEvent("deviceorientation", { alpha: a, beta: b, gamma: g })), [alpha, beta, gamma]);
await page.getByText("Начать").click();
await waitFor(() => window.__ar.screen === "play" && window.__ar.mode === "gyro");
await orient(0, 60, 0); // телефон в руке, смотрит вперёд-вниз
// первый кадр WebGL на программном рендере компилирует шейдеры долго — ждём, пока сцена отрисовалась
await waitFor(() => { const { anchor, camera } = window.__ar.three; return window.__ar.orient && anchor.matrixWorld.elements[14] !== 0 && Math.abs(camera.matrixWorld.elements[9] - 0.5) < 0.01; });
const tableCentre = () => page.evaluate(() => {
  const { anchor, camera } = window.__ar.three;
  const v = new anchor.position.constructor(0, 0, 0).applyMatrix4(anchor.matrixWorld).project(camera);
  return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight, m: anchor.matrix.elements.slice() };
});
const g1 = await tableCentre();
ok(await S(() => window.__fake.gum === 0), "ГИРО: камера не запрошена");
ok(Math.abs(g1.x - SW / 2) < 2 && Math.abs(g1.y - SH / 2) < 2, "ГИРО: стол встал в центр взгляда, когда датчик заговорил", `центр ${g1.x.toFixed(0)},${g1.y.toFixed(0)}`);
await shot("0-gyro");
await orient(20, 60, 0); // повернулся влево на 20°
await page.waitForTimeout(500);
const g2 = await tableCentre();
ok(g2.m.every((v, i) => Math.abs(v - g1.m[i]) < 1e-9), "ГИРО: стол не поехал вслед за телефоном");
ok(g2.x > g1.x + 40, "ГИРО: повернул телефон влево — стол уплыл вправо", `${g1.x.toFixed(0)} → ${g2.x.toFixed(0)}`);
await orient(0, 60, 0);
// ФОТО и КОД ниже проверяют сырой трекер: камера-подделка рисует метку «в лоб», а датчик говорит «смотрю
// вперёд» — связка такую метку честно выбросит как стоящую. Связка — отдельно, в п. 6б.
await S(() => { window.__ar.K.fuse = 0; });

// 1. ФОТО → камера → съёмка
await page.locator('#top .chip[data-mode="image"]').click();
await waitFor(() => window.__ar.screen === "capture");
ok(await S(() => window.__fake.gum === 1), "ФОТО: камера включилась");
await page.waitForTimeout(800);
ok(await S(() => window.__ar.q?.verdict === "ok"), "обложка в рамке — «годится»", JSON.stringify(await S(() => { const q = window.__ar.q; return q && { v: q.verdict, n: q.count, cov: +q.coverage.toFixed(2), sharp: +q.sharp.toFixed(2) }; })));
await shot("1-capture");
await S(() => { window.__fake.scene = "blank"; });
await page.waitForTimeout(700);
ok(await S(() => window.__ar.q?.verdict === "few"), "пустой стол — «мало рисунка»");
await S(() => { window.__fake.scene = "cover"; });
await page.waitForTimeout(700);

// Рамка съёмки в экранных координатах — это и есть границы метки.
const frame = await S(() => { const r = document.getElementById("frame").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });

// 2. компиляция
const t0 = Date.now();
await page.locator("#shoot").click();
await waitFor(() => window.__ar.screen === "play" && window.__ar.markers.length === 1, 180000);
const stats = await S(() => window.__ar.markers[0].stats);
ok(stats.tracking > 20, "метка собрана в браузере", `${((Date.now() - t0) / 1000).toFixed(1)} с, точек ${stats.tracking}, ${stats.kb} КБ`);

// 3. трекинг: метка на месте съёмки → её углы совпадают с рамкой
await waitFor(() => window.__ar.three.anchor.visible, 120000);
await page.waitForTimeout(1500);
const frameCorners = [{ x: frame.x, y: frame.y }, { x: frame.x + frame.w, y: frame.y }, { x: frame.x + frame.w, y: frame.y + frame.h }, { x: frame.x, y: frame.y + frame.h }];
let err = worst(await projectedCorners(), frameCorners);
ok(err < 14, "ФОТО: углы метки легли на рамку съёмки", `худший угол ${err.toFixed(1)} px`);
await shot("2-image-play");

// поворот и отъезд — стол едет за меткой
const moved = { x: 380, y: 560, rot: 0.3, side: 440 };
// плавно, как рука: за 1.5 с, а не рывком за кадр — рывок трекер честно теряет
await page.evaluate((m) => new Promise((done) => {
  const F = window.__fake, from = { x: F.x, y: F.y, rot: F.rot, side: F.side }, t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / 1500);
    for (const key of Object.keys(m)) F[key] = from[key] + (m[key] - from[key]) * k;
    if (k < 1) setTimeout(step, 16); else done();
  };
  step();
}), moved);
await page.waitForTimeout(2500);
ok(await S(() => window.__ar.three.anchor.visible), "ФОТО: метку не потерял, пока её двигали");
const coverSideScreen = frame.w / scale; // метка = та часть обложки, что была в рамке
const F0 = { x: 360, y: 510 };
const fx = (frame.x + frame.w / 2 - left) / scale - F0.x, fy = (frame.y + frame.h / 2 - top) / scale - F0.y; // центр рамки относительно центра обложки
const k = moved.side / 520, c = Math.cos(moved.rot), s = Math.sin(moved.rot);
const expected = drawnCorners({ x: moved.x + (fx * c - fy * s) * k, y: moved.y + (fx * s + fy * c) * k, rot: moved.rot }, coverSideScreen * k);
err = worst(await projectedCorners(), expected);
ok(err < 18, "ФОТО: после поворота на 17° и отъезда углы следуют", `худший угол ${err.toFixed(1)} px`);
await S(() => Object.assign(window.__fake, { x: 360, y: 510, rot: 0, side: 520 }));
await page.waitForTimeout(2000);

// 4. тап лучом: центр колоды на текстуре → экран → клик → «сдал карту»
const deckPoint = async () => page.evaluate(() => {
  const { anchor, camera, mesh } = window.__ar.three;
  const V = anchor.position.constructor;
  const u = (280 + 59) / 1024, vpx = (150 + 84) / 704;
  const v = new V(u - 0.5, (0.5 - vpx) * (704 / 1024), 0).applyMatrix4(mesh.matrixWorld).project(camera);
  const el = document.getElementById("stage");
  return { x: ((v.x + 1) / 2) * el.clientWidth, y: ((1 - v.y) / 2) * el.clientHeight };
});
const dp = await deckPoint();
await page.mouse.click(dp.x, dp.y);
await page.waitForTimeout(300);
const said = await S(() => window.__ar.log.at(-1));
ok(said?.said === "сдал карту", "тап по колоде на столе попал в колоду", JSON.stringify(said));
await shot("3-tap");

// 5. рука → сброс
const pileBefore = await S(() => window.__ar.table.pile.length);
await page.locator("#hand .c").first().click();
ok(await S(() => window.__ar.table.pile.length) === pileBefore + 1, "карта из руки ушла в сброс");

// 6. КОД
await page.locator('#top .chip[data-mode="code"]').click();
await waitFor(() => !!window.AR && !!window.__ar.detector, 30000);
await S(() => new Promise((res) => {
  const img = new Image();
  img.onload = () => { Object.assign(window.__fake, { scene: "code", img, x: 360, y: 560, rot: 0.2, side: 420 }); res(); };
  img.src = "data:image/svg+xml," + encodeURIComponent(new AR.Dictionary("ARUCO_MIP_36h12").generateSVG(0));
}));
await waitFor(() => window.__ar.three.anchor.visible, 15000);
await page.waitForTimeout(1500);
// у кода метка — чёрный квадрат: 8 из 10 клеток SVG (белая рамка по клетке с краю)
err = worst(await projectedCorners(), drawnCorners({ x: 360, y: 560, rot: 0.2 }, 420 * 0.8));
ok(err < 14, "КОД: углы кода легли на нарисованный квадрат", `худший угол ${err.toFixed(1)} px`);
await shot("4-code");

// 6б. СВЯЗКА на коде: телефон лежит экраном вверх (камера смотрит вниз) — метка «в лоб» лежит плашмя.
const centreNow = () => page.evaluate(() => {
  const { anchor, camera } = window.__ar.three;
  const v = new anchor.position.constructor(0, 0, 0).applyMatrix4(anchor.matrixWorld).project(camera);
  return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
});
const jiggle = (ms) => page.evaluate((ms) => new Promise((done) => {
  const F = window.__fake, x0 = F.x, y0 = F.y, got = [], t0 = performance.now();
  let s = 11; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32 - 0.5);
  const shake = setInterval(() => { F.x = x0 + r() * 8; F.y = y0 + r() * 8; }, 33);
  const look = setInterval(() => {
    const { anchor, camera } = window.__ar.three;
    const v = new anchor.position.constructor(0, 0, 0).applyMatrix4(anchor.matrixWorld).project(camera);
    got.push(v.x * innerWidth / 2);
    if (performance.now() - t0 > ms) { clearInterval(shake); clearInterval(look); F.x = x0; F.y = y0; const w = got.slice(got.length / 3); done(Math.max(...w) - Math.min(...w)); }
  }, 40);
}), ms);
await S(() => { window.__ar.K.arucoSmooth = 0; });
const rawSpread = await jiggle(2500);
await orient(0, 0, 0);
await S(() => { window.__ar.K.fuse = 1; });
await page.locator('#top .chip[data-mode="code"]').click();
await waitFor(() => window.__ar.fusion.locked && window.__ar.three.anchor.visible, 15000);
await page.waitForTimeout(1500);
err = worst(await projectedCorners(), drawnCorners({ x: 360, y: 560, rot: 0.2 }, 420 * 0.8));
ok(err < 14, "СВЯЗКА: стол встал на код", `худший угол ${err.toFixed(1)} px`);
const fusedSpread = await jiggle(2500);
ok(fusedSpread < rawSpread / 2, "СВЯЗКА: трекер дрожит ±4 px — стол дрожит в разы меньше сырого", `связка ${fusedSpread.toFixed(1)} px, сырой ${rawSpread.toFixed(1)} px`);
await page.waitForTimeout(1500);
const seenCorners = await projectedCorners();
const tableM = await S(() => window.__ar.three.anchor.matrix.elements.slice());
await S(() => { window.__fake.scene = "blank"; });
await page.waitForTimeout(1200);
ok(await S(() => window.__ar.three.anchor.visible), "СВЯЗКА: метку закрыли — стол остался");
err = worst(await projectedCorners(), seenCorners);
ok(err < 2, "СВЯЗКА: без метки стол стоит там же", `сдвиг ${err.toFixed(1)} px`);
const c0 = await centreNow();
await orient(0, 15, 0); // наклонил телефон на 15°, метки не видно
await page.waitForTimeout(600);
const c1 = await centreNow();
ok(Math.hypot(c1.x - c0.x, c1.y - c0.y) > 40, "СВЯЗКА: без метки поворот телефона ведёт стол гироскопом", `${c0.x.toFixed(0)},${c0.y.toFixed(0)} → ${c1.x.toFixed(0)},${c1.y.toFixed(0)}`);
await orient(0, 0, 0);
await page.waitForTimeout(600);
err = worst(await projectedCorners(), seenCorners);
ok(err < 2, "СВЯЗКА: повернулся обратно — стол ровно там же", `сдвиг ${err.toFixed(1)} px`);
await S(() => Object.assign(window.__fake, { scene: "code", x: 470, y: 600 })); // шагнул — метка в кадре съехала
await page.waitForTimeout(2500);
err = worst(await projectedCorners(), drawnCorners({ x: 470, y: 600, rot: 0.2 }, 420 * 0.8));
ok(err < 14, "СВЯЗКА: шагнул — стол снова лёг на код", `худший угол ${err.toFixed(1)} px`);
const tableM2 = await S(() => window.__ar.three.anchor.matrix.elements.slice());
ok(tableM2.every((v, i) => Math.abs(v - tableM[i]) < 0.05), "СВЯЗКА: сдвинулся телефон, а не стол в мире");
await shot("4b-fused");
await orient(0, 60, 0); // датчик: смотрю вперёд — а метка «в лоб», значит стоит стоймя
await page.locator("#again").click();
await page.waitForTimeout(1500);
ok(await S(() => !window.__ar.fusion.locked && window.__ar.fusion.last === "tilt" && !window.__ar.three.anchor.visible), "СВЯЗКА: метка стоймя — стол на неё не ставится");
await S(() => Object.assign(window.__fake, { x: 360, y: 560 }));

// 7. обратно в ГИРО — камера гаснет
await page.locator('#top .chip[data-mode="gyro"]').click();
await page.waitForTimeout(500);
ok(await S(() => window.__ar.three.anchor.visible && !document.getElementById("cam").srcObject), "ГИРО: стол стоит, камера выключена");
await shot("5-gyro");

// 8. перезагрузка — метка осталась
await page.reload();
await page.getByText("Начать").click();
await waitFor(() => window.__ar.screen === "play", 30000);
await page.locator('#top .chip[data-mode="image"]').click();
await waitFor(() => window.__ar.screen === "play" && window.__ar.mode === "image", 30000);
ok(await S(() => window.__ar.markers.length === 1 && window.__ar.active === window.__ar.markers[0].id), "после перезагрузки метка на месте и выбрана");
await waitFor(() => window.__ar.three.anchor.visible, 60000).catch(() => {});
ok(await S(() => window.__ar.three.anchor.visible), "сохранённая метка снова трекается");

const real = errors.filter((e) => !/favicon|fonts\.g/.test(e));
ok(real.length === 0, "без ошибок в консоли", real.slice(0, 3).join(" | "));
await browser.close();
console.log(fails.length ? `\nУПАЛО: ${fails.length}` : "\nвсё зелёное");
process.exit(fails.length ? 1 : 0);
