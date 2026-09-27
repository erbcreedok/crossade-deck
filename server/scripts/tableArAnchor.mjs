// AR-СТОЛ НА ЯКОРЕ: кнопки якоря и выхода в верхнем ряду, окно якоря, камера за столом (и честный отказ),
// подгонка пальцами, предмет с камеры — стол на картине на стене, «плашмя», пропажа предмета, джойстик
// спит, пока предмет виден. И главное: касаниями пальца под потоком датчика кнопки HUD нажимаются
// каждый раз — стол, сдвигаясь за камерой, их больше не пересоздаёт.
//
// Камера — подделка: холст 720×1280 с «обложкой» (пёстрый квадрат), отдаётся через getUserMedia.
// Датчик — подделанные `deviceorientation`. Метку MindAR собирает прямо в браузере (нужна сеть: CDN).
// Всё читается из `canvas.dataset.spots` (где середина стола, насколько он сжат) и из `stage.dataset.ar*`.
//   CROSSADE_DB_FILE=":memory:" TABLE_SECRET=probe TABLE_GUESTS=1 PORT=2597 npx tsx src/index.ts
//   node scripts/tableArAnchor.mjs [base] [папка скриншотов]
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2597";
const shots = process.argv[3] ?? null;
const W = 390, H = 844, VW = 720, VH = 1280;

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
  const F = window.__fake = { gum: 0, scene: "cover", x: 360, y: 510, side: 520 };
  // Кадры — вручную, после каждой отрисовки (captureStream(0) + requestFrame): поток с частотой на
  // программном GL под нагрузкой иногда не отдаёт ни одного. Каждому запросу — копия потока:
  // выключенную камеру (дорожки копии остановлены) можно включить снова.
  const stream = cam.captureStream(0);
  const track = stream.getVideoTracks()[0];
  setInterval(() => {
    g.fillStyle = "#6f6a60"; g.fillRect(0, 0, VW, VH);
    if (F.scene === "cover") g.drawImage(cover, F.x - F.side / 2, F.side ? F.y - F.side / 2 : 0, F.side, F.side);
    track.requestFrame?.();
  }, 33);
  navigator.mediaDevices.getUserMedia = async () => { F.gum += 1; if (F.deny) throw new DOMException("нет", "NotAllowedError"); return stream.clone(); };
})();`;

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const checks = [];
const check = (name, ok, got) => { checks.push({ name, ok, got }); console.log(`${ok ? "✓" : "✗"} ${name}${got === undefined ? "" : ` — ${typeof got === "string" ? got : JSON.stringify(got)}`}`); };
const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
/** Палец, как на телефоне: касание, чуть подержать, отпустить — браузер сам даёт pointer* и click. */
const finger = async (x, y, hold = 90) => {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
  await p.waitForTimeout(hold);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await p.waitForTimeout(250);
};
const fingerOn = async (sel) => {
  if (!(await p.locator(sel).count())) return false; // нет кнопки — провал в проверке, а не ожидание до таймаута
  const b = await p.locator(sel).first().boundingBox();
  if (b) await finger(b.x + b.width / 2, b.y + b.height / 2);
  return !!b;
};
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
await p.addInitScript(FAKE);

const spots = () => p.evaluate(() => JSON.parse(document.querySelector("canvas").dataset.spots || "{}"));
// Датчик — ПОТОКОМ, 30 раз в секунду, как на телефоне: `orient` лишь меняет, куда телефон смотрит. Без
// потока страница стоит, и безголовый браузер перестаёт отдавать кадры камеры-подделки.
const orient = (alpha, beta, gamma = 0) => p.evaluate(([a, b, g]) => {
  window.__aim = { alpha: a, beta: b, gamma: g };
  // Дрожь руки (`__shake`, градусы) — пока проверяются кнопки: стол тогда сдвигается на каждом отсчёте.
  window.__sensor ??= setInterval(() => {
    const k = window.__shake ?? 0, t = performance.now() / 90;
    dispatchEvent(new DeviceOrientationEvent("deviceorientation", { alpha: window.__aim.alpha + Math.sin(t) * k, beta: window.__aim.beta + Math.cos(t * 1.3) * k, gamma: window.__aim.gamma }));
  }, 16);
  dispatchEvent(new DeviceOrientationEvent("deviceorientation", window.__aim));
}, [alpha, beta, gamma]);
const settle = (ms = 300) => p.waitForTimeout(ms);
const anchor = () => p.evaluate(() => document.querySelector("[data-ar-bar]") && document.querySelector("#stage, [data-ar-anchor]")?.dataset.arAnchor || [...document.querySelectorAll("*")].find((e) => e.dataset?.arAnchor)?.dataset.arAnchor);
const seat = () => p.evaluate(() => JSON.parse([...document.querySelectorAll("*")].find((e) => e.dataset?.arSeat)?.dataset.arSeat || "null"));
const shot = async (name) => { if (shots) await p.screenshot({ path: `${shots}/${name}.png` }); };
const box = async (sel) => p.locator(sel).first().boundingBox();
const click = async (sel) => { const b = await box(sel); await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await settle(); };
const compass = async () => { const b = await box("[data-home]"); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const enterAr = async () => {
  const c = await compass();
  await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.waitForTimeout(750); await p.mouse.up();
  await settle();
};
/** Синтетические касания двумя пальцами — туда, что лежит под точкой (у мыши палец один). */
const touch = (steps) => p.evaluate(async (steps) => {
  for (const [type, id, x, y] of steps) {
    (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch", isPrimary: id === 1 }));
    await new Promise((r) => setTimeout(r, 16));
  }
  await new Promise((r) => setTimeout(r, 500)); // spots пишет отрисовка, а она на программном GL не каждые 16 мс
}, steps);
const two = (c, r, k = 1, lift = 0, n = 8) => {
  const at = (i) => { const t = i / n, rr = r * (1 + (k - 1) * t), dy = lift * t; return [[c.x + rr, c.y + dy], [c.x - rr, c.y + dy]]; };
  const [a0, b0] = at(0), [a1, b1] = at(n);
  const steps = [["pointerdown", 1, ...a0], ["pointerdown", 2, ...b0]];
  for (let i = 1; i <= n; i += 1) { const [a, b] = at(i); steps.push(["pointermove", 1, ...a], ["pointermove", 2, ...b]); }
  return [...steps, ["pointerup", 1, ...a1], ["pointerup", 2, ...b1]];
};

// 0. стенд с ботами, AR — удержанием компаса
await p.goto(`${base}/table/?stand`);
await p.waitForFunction(() => !!document.querySelector("canvas")?.dataset.spots);
await p.evaluate(() => { try { localStorage.removeItem("crossade.table.ar.seats"); } catch {} });
await enterAr();
await orient(0, 50);
await settle();
check("AR: в верхнем ряду справа две кнопки — якорь и выход", (await p.locator("[data-ar-bar] button").count()) === 2);
const gear = await box("[data-settings]"), anc = await box('[data-ar-do="menu"]'), ex = await box('[data-ar-do="exit"]');
check("они зеркальны шестерёнке и журналу: тот же ряд, тот же размер, тот же отступ от края",
  Math.abs(anc.y - gear.y) < 1 && Math.abs(ex.y - gear.y) < 1 && anc.width === gear.width && Math.abs(W - (ex.x + ex.width) - gear.x) < 1 && Math.abs(ex.x - anc.x - 48) < 1,
  `шестерёнка ${gear.x},${gear.y}; якорь ${anc.x},${anc.y}; выход ${ex.x},${ex.y}`);
const hits = [];
for (const sel of ["[data-home]", "[data-settings]", "[data-journal]", "[data-table-name] span"]) {
  const o = await box(sel).catch(() => null);
  for (const bb of [anc, ex]) if (o && bb.x < o.x + o.width && o.x < bb.x + bb.width && bb.y < o.y + o.height && o.y < bb.y + bb.height) hits.push(sel);
}
check("кнопки ни на что не наезжают — компас, шестерёнка, журнал, имя стола", hits.length === 0, hits.join(" "));
check("якорь по умолчанию — перед собой, камера не тронута", (await anchor()) === "gravity:search" && (await p.evaluate(() => window.__fake.gum)) === 0, await anchor());
await shot("0-ar-bar");

// 1. ✕ — выход из AR, и обратно
await click('[data-ar-do="exit"]');
check("✕ выключил AR", (await p.locator("[data-ar-floor]").count()) === 0 && (await p.locator("[data-ar-bar]").count()) === 0);
await enterAr();
await orient(0, 50);
await settle();

// 2. подгонка у гравитации
// КНОПКИ HUD ПОД ПОТОКОМ ДАТЧИКА — пальцем, шесть кругов: шестерёнка, переключатель в настройках, ✕.
const hudRounds = async () => {
  await p.evaluate(() => { window.__shake = 2; });
  await p.waitForTimeout(200);
  const got = [];
  for (let i = 0; i < 6; i += 1) {
    await fingerOn("[data-settings]");
    const open = await p.evaluate(() => getComputedStyle(document.querySelector("[data-settings-layer]")).display !== "none");
    const was = await p.evaluate(() => document.querySelector('[data-look="fourColour"]')?.getAttribute("aria-checked"));
    await fingerOn('[data-look="fourColour"]');
    const now = await p.evaluate(() => document.querySelector('[data-look="fourColour"]')?.getAttribute("aria-checked"));
    await fingerOn("[data-settings-close]");
    const shut = await p.evaluate(() => getComputedStyle(document.querySelector("[data-settings-layer]")).display === "none");
    got.push(open && was !== now && now !== undefined && shut ? "✓" : `✗(${open ? "откр" : "не откр"},${was}→${now},${shut ? "закр" : "не закр"})`);
    if (!shut && (await p.locator("[data-settings-close]").count())) await p.locator("[data-settings-close]").click();
  }
  await p.evaluate(() => { window.__shake = 0; });
  await p.waitForTimeout(200);
  return got;
};
await orient(0, 50);
let rounds = await hudRounds();
check("под потоком датчика пальцем: шестерёнка, переключатель, ✕ — каждый раз", rounds.every((r) => r === "✓"), rounds.join(" "));

let s0 = await spots();
await click('[data-ar-do="menu"]');
check("якорь — окно в виде «Настроек»: сейчас, камера, за что держится стол, подогнать", (await p.locator("[data-ar-now]").count()) === 1 && (await p.locator('[data-ar-do="camera"][role="switch"]').count()) === 1 && (await p.locator('[data-ar-do="fit"]').count()) === 1, await p.locator("[data-ar-now]").textContent());
check("сейчас: стол перед тобой, гироскоп, камера выключена", /перед тобой.*гироскоп.*камера выключена/.test(await p.locator("[data-ar-now]").textContent()));
await click('[data-ar-do="fit"]');
check("«подогнать» — окно ушло, рамка подгонки и плашка", await p.locator("[data-ar-fit-ring]").isVisible() && !(await p.locator("[data-ar-sheet]").isVisible()) && (await p.locator('[data-ar-do="done"]').count()) === 1);
await touch([["pointerdown", 1, s0.middle.x, s0.middle.y], ...[1, 2, 3, 4, 5, 6].map((i) => ["pointermove", 1, s0.middle.x + i * 10, s0.middle.y]), ["pointerup", 1, s0.middle.x + 60, s0.middle.y]]);
let s1 = await spots();
check("подгонка: один палец повёл на 60 px — стол поехал за пальцем", Math.abs(s1.middle.x - s0.middle.x - 60) < 5 && Math.abs(s1.middle.y - s0.middle.y) < 5, `${(s1.middle.x - s0.middle.x).toFixed(1)}, ${(s1.middle.y - s0.middle.y).toFixed(1)}`);
s0 = s1;
await touch(two(s0.middle, 50, 1.5));
s1 = await spots();
check("подгонка: развёл пальцы в 1.5 раза — стол вырос в 1.5 раза", Math.abs(s1.k / s0.k - 1.5) < 0.1, `×${(s1.k / s0.k).toFixed(2)}`);
s0 = s1;
await touch(two(s0.middle, 50, 1, -100));
s1 = await spots();
const st = await seat();
check("подгонка: два пальца вверх на 100 px — наклон от себя на 30°", Math.abs(st.tilt + 30) < 1 && Math.abs(s1.squash - s0.squash) > 0.05, `наклон ${st.tilt.toFixed(1)}°, сжатие ${s0.squash.toFixed(2)} → ${s1.squash.toFixed(2)}`);
const other = s1.seats.find((x) => x.who && x.who !== "Ye");
await p.mouse.click(other.x, other.y);
await settle();
check("подгонка: тап по чужому стулу окна не открыл — стол не играет", (await p.locator("[data-tip]").count()) === 0);
rounds = await hudRounds();
check("в подгонке шестерёнка, настройки и ✕ нажимаются пальцем каждый раз", rounds.every((r) => r === "✓"), rounds.join(" "));
await shot("1-fit");
await click('[data-ar-do="done"]');
const saved = await seat();
check("«готово» — рамка ушла, посадка записана", !(await p.locator("[data-ar-fit-ring]").isVisible()) && (await p.evaluate(() => !!JSON.parse(localStorage.getItem("crossade.table.ar.seats") || "{}").gravity)));
await click('[data-ar-do="exit"]');
await enterAr();
await orient(0, 50);
await settle();
check("вышел и вошёл — посадка та же", JSON.stringify(await seat()) === JSON.stringify(saved), await seat());
await click('[data-ar-do="menu"]');
await click('[data-ar-do="fit"]');
await click('[data-ar-do="reset"]');
await click('[data-ar-do="done"]');

// 2б. камера за столом: отказ — словами в окне; разрешили — видео под сукном, стол держит гироскоп
await p.evaluate(() => { window.__fake.deny = true; });
await click('[data-ar-do="menu"]');
await click('[data-ar-do="camera"]');
await p.waitForFunction(() => /камеры нет/.test(document.querySelector("[data-ar-now]")?.textContent ?? ""), null, { timeout: 10000 }).catch(() => {});
check("камеру не дали — окно якоря говорит почему, значок без точки", /камеры нет: камеру не разрешили/.test(await p.locator("[data-ar-now]").textContent()) && (await p.locator("[data-ar-cam-dot]").count()) === 0, await p.locator("[data-ar-now]").textContent());
await p.evaluate(() => { window.__fake.deny = false; });
await click('[data-ar-do="camera"]');
await p.waitForFunction(() => /камера включена/.test(document.querySelector("[data-ar-now]")?.textContent ?? ""), null, { timeout: 20000 }).catch(() => {});
check("«Камера за столом» — видео под сукном, стол держится гироскопом, на значке точка", (await p.locator("[data-ar-camera]").count()) === 1 && /перед тобой.*гироскоп.*камера включена/.test(await p.locator("[data-ar-now]").textContent()) && (await p.locator("[data-ar-cam-dot]").count()) === 1, await p.locator("[data-ar-now]").textContent());
await click('[data-ar-do="camera"]');
check("выключил — камеры нет", (await p.locator("[data-ar-camera]").count()) === 0 && /камера выключена/.test(await p.locator("[data-ar-now]").textContent()));
await click('[data-ar-do="close"]');

// 3. предмет: картина на стене — телефон стоймя смотрит вперёд
await orient(0, 90);
await settle();
await click('[data-ar-do="menu"]');
check("в окне: перед собой, снять предмет", (await p.locator('[data-ar-do="gravity"]').count()) === 1 && (await p.locator('[data-ar-do="new"]').count()) === 1);
await click('[data-ar-do="new"]');
await p.waitForFunction(() => getComputedStyle(document.querySelector("[data-ar-frame]")).display !== "none" || /камеры нет/.test(document.querySelector("[data-ar-now]")?.textContent ?? ""), null, { timeout: 20000 }).catch(() => {});
check("«снять предмет» — камера под столом и рамка", (await p.locator("[data-ar-camera]").count()) === 1 && (await p.locator("[data-ar-frame]").isVisible()), `${await p.locator("[data-ar-strip]").textContent()} | gum ${await p.evaluate(() => window.__fake.gum)} | ${errors.join(" / ")}`);
await p.waitForTimeout(800);
await shot("2-capture");
await click('[data-ar-do="shoot"]');
const t0 = Date.now();
await p.waitForFunction(() => [...document.querySelectorAll("*")].some((e) => e.dataset?.arAnchor === "marker:seen"), null, { timeout: 180000, polling: 250 }).catch(() => {});
check("метка собрана на телефоне, стол встал на предмет", (await anchor()) === "marker:seen", `${await anchor()} за ${((Date.now() - t0) / 1000).toFixed(1)} с`);
await p.waitForTimeout(1500);
let m = await spots();
const frame = await box("[data-ar-frame]").catch(() => null);
const side = Math.round(Math.min(W, H) * 0.72);
const want = { x: W / 2, y: Math.max(180, H * 0.42 - side / 2) + side / 2 }; // середина рамки съёмки (`captureBox`)
check("стол серединой на середине предмета", Math.hypot(m.middle.x - want.x, m.middle.y - want.y) < 15, `${m.middle.x.toFixed(0)},${m.middle.y.toFixed(0)} при ${want.x.toFixed(0)},${want.y.toFixed(0)}${frame ? "" : ""}`);
check("стол на стене — лицом ко мне, не сжат", m.squash > 0.9, m.squash.toFixed(2));
await shot("3-wall");

// 4. «плашмя» и обратно
await click('[data-ar-do="menu"]');
await click('[data-ar-do="flat"]');
await p.waitForFunction(() => [...document.querySelectorAll("*")].some((e) => e.dataset?.arAnchor === "marker:seen"), null, { timeout: 15000 }).catch(() => {});
await p.waitForTimeout(1200);
const flat = await spots();
check("«стол: плашмя» — стол лёг по гравитации: смотрю вдоль — сильно сжат", flat.squash < 0.5 && (await seat()).flat === true, flat.squash.toFixed(2));
await shot("4-flat");
await click('[data-ar-do="flat"]'); // окно якоря ещё открыто
await click('[data-ar-do="close"]');
await p.waitForTimeout(1500);

// 5. предмет виден — джойстик спит; пропал — стол стоит, джойстик ходит
const c = await compass();
await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c.x, c.y - 30, { steps: 3 }); await p.waitForTimeout(150);
check("предмет виден — компас не ходит, подсказка «ходи ногами»", (await p.locator("[data-ar-stick]").count()) === 0 && (await p.locator("[data-ar-hint]").textContent()).includes("ногами"));
await p.mouse.up();
await settle(1500);
const beforeLost = await spots();
await p.evaluate(() => { window.__fake.scene = "blank"; });
await p.waitForFunction(() => [...document.querySelectorAll("*")].some((e) => e.dataset?.arAnchor === "marker:lost"), null, { timeout: 5000 }).catch(() => {});
await orient(0, 90);
await settle(600);
const lost = await spots();
check("предмет закрыли — «не вижу», стол стоит на месте", (await anchor()) === "marker:lost" && Math.hypot(lost.middle.x - beforeLost.middle.x, lost.middle.y - beforeLost.middle.y) < 3, `${await anchor()}, сдвиг ${Math.hypot(lost.middle.x - beforeLost.middle.x, lost.middle.y - beforeLost.middle.y).toFixed(1)} px`);
await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c.x, c.y - 30, { steps: 3 }); await p.waitForTimeout(150);
check("предмета не видно — компас снова ходит", (await p.locator("[data-ar-stick]").count()) === 1);
await p.mouse.up();
await shot("5-lost");

// 6. «перед собой» — стол снова на гравитации, камера остаётся фоном, пока её не выключишь
await click('[data-ar-do="menu"]');
await click('[data-ar-do="gravity"]');
check("«перед собой» — якорь гравитация, камера фоном осталась", (await p.locator("[data-ar-camera]").count()) === 1 && (await anchor()) === "gravity:search", await anchor());
await click('[data-ar-do="menu"]');
await click('[data-ar-do="camera"]');
check("камеру выключил — видео нет", (await p.locator("[data-ar-camera]").count()) === 0);

check("без ошибок на странице", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
const bad = checks.filter((x) => !x.ok);
console.log(bad.length ? `\nУПАЛО: ${bad.length} из ${checks.length}` : `\nвсё зелёное: ${checks.length}`);
process.exit(bad.length ? 1 : 0);
