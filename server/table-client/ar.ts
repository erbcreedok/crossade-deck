// AR-СТОЛ НА ЭКРАНЕ — датчик наклона, место стола в мире и пол под ним.
//
// СТОЛ = ЯКОРЬ + ПОСАДКА (`arSeat.ts`). Якорь по умолчанию — гравитация: стол встаёт туда, куда
// смотришь, камера не нужна. Ходить — джойстиком с компаса или ПРОГУЛКОЙ С КАМЕРОЙ: зажал компас и держишь
// секунду — камера невидимо смотрит на пол и ведёт шаги (`arStride.ts`), отпустил — погасла. По желанию —
// предмет (картина, доска): камера фоном, стол ложится в плоскость предмета (или плашмя), и вдоль него
// можно ходить ногами (`arMarker.ts`, `arFuse.ts`: поворот — гироскоп, метка говорит лишь, где стоит
// телефон). Посадку — сдвиг, наклон, размер — человек подгоняет сам («подогнать»), она своя у каждого
// якоря. Кнопки сверху — `arHud.ts`.
//
// Включает AR сам человек — долгим нажатием на компас (`compass.ts`), выходит — кнопкой сверху; стол
// всегда открывается обычным. Экран
// (`screen.ts`) спрашивает отсюда линзу (`arLens.ts`) вместо линзы пальцевой камеры — и больше ничего не знает. От пальцевой камеры AR берёт только поворот и зум: два пальца крутят и растят стол,
// а свой стул ставит ко мне тот же компас (`compass.ts`). Сдвиг и наклон — дело самого телефона.
//
// Датчик — Telegram (`WebApp.DeviceOrientation`, радианы), если мини-апп его даёт, иначе браузерный
// `deviceorientation` (градусы). iOS даёт браузерный только после разрешения из жеста — поэтому, пока
// датчик молчит, поверх стола висит кнопка «Включить наклон».

import { createFusion, FUSE, gyroTrack } from "./arFuse.js";
import { captureBox, mountHud, type HudState } from "./arHud.js";
import { hearNative, hearSurface, nativeShell, type NativePose } from "./arNative.js";
import { ease } from "./arBlend.js";
import { arLens, deviceQuat, placeAtGaze, yawQuat, type ArLens, type ArPlace, type Quat } from "./arLens.js";
import { deleteMarker, listMarkers, makeMarker, openCamera, saveMarker, track, VIDEO_LAG, warm, type Backdrop, type StoredMarker } from "./arMarker.js";
import { assess, greyOf } from "./arQuality.js";
import { clampSeat, moveSeat, readSeat, SEAT0, seated, superClamp, tableOnMarker, tiltBy, writeSeat, type ArSeat } from "./arSeat.js";
import { startStride } from "./arStride.js";
import { rotate } from "./arTrack.js";
import { leftToGo, walkStep, WALK } from "./arWalk.js";
import { R, RIM } from "./felt.js";

/** Вертикальный обзор: телефонный экран в портрете. */
const FOV = 62;
/** Сколько стол переезжает из обычного вида в AR, мс — как «Выровнять». */
const ENTRY_MS = 700;
/** Стол ниже глаз на столько метров, а если смотреть в горизонт — на столько впереди. */
const DROP = 0.35;
const AHEAD = 0.45;
/** Метров в ширине карты: стол радиусом в семь карт — около трети метра, весь в кадре при входе, как у пальцевой камеры. */
const UNIT = 0.022;
/** Нет датчика (компьютер): телефон как бы смотрит вперёд и вниз на столько градусов. */
const STILL_BETA = 55;
/** Сколько ждать датчик, прежде чем попросить разрешение кнопкой. */
const SILENT_MS = 700;
/** Радиус джойстика, px: натяжка меряется в них, перетянуть можно (`WALK.PULL_MAX`). */
const STICK_R = 56;
/** На предмете мир меряется ширинами метки: стол радиусом в 0.6 ширины — чуть шире картины. */
const MARKER_UNIT = 0.6 / (R + RIM);
/** Метку видели не дольше стольких мс назад — «видна»: ходьба ногами, джойстик спит. */
const SEEN_MS = 400;
/** Сколько ждать ответа приложения «где поверхность», мс: дольше — ставим перед собой. */
const SURFACE_WAIT_MS = 800;
/** Сколько вспыхивает место стола после «Выровнять», мс. */
const FLASH_MS = 1200;
/** Сторона серого кадра для оценки годности, px — как у стенда. */
const ASSESS = 160;

interface TelegramOrientation {
  isStarted?: boolean;
  alpha?: number | null;
  beta?: number | null;
  gamma?: number | null;
  start?(params: { refresh_rate?: number; need_absolute?: boolean }, cb?: (ok: boolean) => void): void;
  stop?(cb?: (ok: boolean) => void): void;
}
interface TelegramApp {
  DeviceOrientation?: TelegramOrientation;
  onEvent?(name: string, fn: () => void): void;
  offEvent?(name: string, fn: () => void): void;
}

export interface ArRig {
  /** Линза на этот кадр: поворот и зум — от пальцевой камеры. */
  lens(frame: { w: number; h: number }, turn: number, zoom: number): ArLens;
  /** Поставить стол туда, куда сейчас смотрит телефон. */
  place(): void;
  /** ВЫРОВНЯТЬ: вернуться к своему стулу и поставить стол перед собой. */
  recenter(): void;
  /** Джойстик ходьбы с серединой `from` (компас), палец `id` уже в `at`; живёт, пока палец не поднят. */
  stick(id: number, from: { x: number; y: number }, at: { x: number; y: number }): void;
  /** Палец лёг на пустое сукно — хват: точка стола под пальцем идёт за ним, пока палец не поднят. */
  grab(down: PointerEvent): void;
  /** Компас зажат секунду — прогулка с камерой, пока палец не поднят (`arStride.ts`). */
  stride(on: boolean): void;
  /**
   * ВХОД: 0 — AR ещё не знает, где телефон, и экран держит обычный вид; дальше за `ENTRY_MS` доходит до 1 —
   * стол переезжает из обычного вида в AR (`arBlend.ts`), а не прыгает туда, где его надо искать.
   */
  entry(): number;
  dispose(): void;
}

export function mountAr(stage: HTMLElement, felt: HTMLCanvasElement, changed: () => void, exit: () => void): ArRig {
  let q: Quat = deviceQuat(0, STILL_BETA, 0, 0);
  const gyro = gyroTrack();
  // В ПРИЛОЖЕНИИ (`arNative.ts`) поворот и место телефона — от ARKit, камера — под страницей.
  const shell = nativeShell();
  let native: NativePose | null = null;
  /** Стол перед глазами: куда смотришь, на `DROP` ниже глаза; в приложении — от того места, где стоишь. */
  function gazePlace(): ArPlace {
    const p = placeAtGaze(q, DROP, AHEAD, UNIT);
    const at = native?.pos;
    return at ? { ...p, at: [p.at[0] + at[0], p.at[1] + at[1], p.at[2] + at[2]] } : p;
  }
  let placed: ArPlace = gazePlace();
  let heard = false;
  /** Когда AR впервые узнал, где телефон: с этого мига идёт переезд из обычного вида. */
  let heardAt = 0;
  /** Где стоишь — условные метры от своего стула (метр — радиус стола), `arWalk.ts`. */
  let walk = { x: 0, z: 0 };
  const off: Array<() => void> = [];
  // ── ПОВЕРХНОСТЬ ИЗ ARKIT (`Shell.surface`): луч из середины экрана на найденную плоскость. Стол встаёт на неё
  // серединой, повёрнутый ко мне, как по взгляду. Приложение не ответило или плоскости нет — `null`.
  let surfaceWant: ((at: ArPlace | null) => void) | null = null;
  let surfaceTimer = 0;
  /** Что нашлось в последний раз: «found» — настоящая плоскость, «estimated» — примерная, «none» — ничего. */
  let surfaceSeen = "";
  if (shell?.surface) {
    off.push(hearSurface((at, found) => {
      surfaceSeen = at ? (found ? "found" : "estimated") : "none";
      const done = surfaceWant;
      surfaceWant = null;
      clearTimeout(surfaceTimer);
      done?.(at ? { at, yaw: gazePlace().yaw, unit: UNIT } : null);
    }));
  }
  function askSurface(done: (at: ArPlace | null) => void): void {
    if (!shell?.surface) return done(null);
    surfaceWant = done;
    clearTimeout(surfaceTimer);
    surfaceTimer = window.setTimeout(() => { if (surfaceWant === done) { surfaceWant = null; surfaceSeen = "none"; done(null); } }, SURFACE_WAIT_MS);
    shell.surface();
  }

  const screenAngle = (): number => screen.orientation?.angle ?? (globalThis as { orientation?: number }).orientation ?? 0;
  const place = (): void => {
    placed = gazePlace();
    changed();
  };
  const hear = (alpha: number, beta: number, gamma: number): void => {
    q = deviceQuat(alpha, beta, gamma, screenAngle());
    gyro.push(performance.now(), q);
    if (!heard) {
      heard = true;
      heardAt = performance.now();
      ask.remove();
      placed = gazePlace(); // первое слово датчика — стол встаёт туда, куда смотришь
    }
    changed();
  };

  // ── датчик ─────────────────────────────────────────────────────────────────────────────────────
  const tg = (globalThis as { Telegram?: { WebApp?: TelegramApp } }).Telegram?.WebApp;
  const tgo = tg?.DeviceOrientation;
  if (shell) {
    shell.ar(true);
    off.push(() => shell.ar(false));
    off.push(hearNative((pose) => {
      // Первые кадры ARKit, пока он не поймал комнату, — поворот нулевой и мир ещё не встал на место: стол,
      // поставленный по ним, оказывался сбоку или над горизонтом. Ставим по первому уверенному.
      if (!heard && !pose.tracking) return;
      native = pose;
      q = pose.q;
      if (!heard) {
        heard = true;
        heardAt = performance.now();
        placed = gazePlace();
        // Вошёл в AR — стол сразу ищет поверхность под взглядом; нашлась — встаёт на неё.
        askSurface((at) => { if (at) { placed = at; flashAt = performance.now(); changed(); } });
      }
      changed();
    }));
  }
  if (tgo?.start && tg?.onEvent && !shell) {
    const deg = 180 / Math.PI;
    const read = (): void => {
      if (tgo.beta == null) return;
      hear((tgo.alpha ?? 0) * deg, tgo.beta * deg, (tgo.gamma ?? 0) * deg);
    };
    tg.onEvent("deviceOrientationChanged", read);
    tgo.start({ refresh_rate: 20, need_absolute: false });
    off.push(() => { tg.offEvent?.("deviceOrientationChanged", read); tgo.stop?.(); });
  }
  const onBrowser = (e: DeviceOrientationEvent): void => {
    if (e.beta != null) hear(e.alpha ?? 0, e.beta, e.gamma ?? 0);
  };
  if (!shell) {
    addEventListener("deviceorientation", onBrowser);
    off.push(() => removeEventListener("deviceorientation", onBrowser));
  }

  // Разрешение на iOS — только из жеста. Кнопка появляется, если датчик молчит, и уходит, как заговорит.
  const ask = document.createElement("button");
  ask.textContent = "Включить наклон";
  ask.dataset.arAsk = "";
  Object.assign(ask.style, {
    position: "fixed", left: "50%", top: "38%", transform: "translate(-50%,-50%)", zIndex: "40",
    font: "400 14px/1 Tiny5, monospace", color: "#0b0704", background: "#f2c14e", border: "0",
    borderRadius: "8px", padding: "14px 18px", boxShadow: "inset 0 -3px 0 rgba(0,0,0,.25)",
  });
  ask.onclick = async () => {
    const perm = (globalThis as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent?.requestPermission;
    if (perm) await perm().catch(() => "denied");
    ask.textContent = "Датчик молчит — стол стоит на месте";
    setTimeout(() => ask.remove(), 1800);
  };
  const needsAsk = !shell && typeof (globalThis as { DeviceOrientationEvent?: { requestPermission?: unknown } }).DeviceOrientationEvent?.requestPermission === "function";
  const silent = setTimeout(() => { if (!heard && needsAsk) document.body.append(ask); }, SILENT_MS);
  off.push(() => { clearTimeout(silent); ask.remove(); });

  // ── пол ────────────────────────────────────────────────────────────────────────────────────────
  // Сетка на плоскости стола до горизонта: без неё поворот телефона читается как дрожь картинки, а не
  // как поворот головы. Слой под сукном и над фоном хаба — сукно хаба в AR не видно. Это SVG, а не
  // холст: холст на странице один — стол, и его находят по `querySelector("canvas")`.
  const SVG = "http://www.w3.org/2000/svg";
  const floor = document.createElement("div");
  floor.dataset.arFloor = "";
  floor.style.cssText = "position:absolute;inset:0;pointer-events:none;background:linear-gradient(#07100b,#15261d);";
  const grid = document.createElementNS(SVG, "svg");
  grid.setAttribute("width", "100%");
  grid.setAttribute("height", "100%");
  grid.style.cssText = "position:absolute;inset:0;";
  const lines = document.createElementNS(SVG, "path");
  const axis = document.createElementNS(SVG, "path");
  lines.setAttribute("stroke", "rgba(127,209,185,.10)");
  axis.setAttribute("stroke", "rgba(107,77,44,.55)");
  for (const el of [lines, axis]) { el.setAttribute("fill", "none"); el.setAttribute("stroke-width", "1"); grid.append(el); }
  floor.append(grid);
  stage.insertBefore(floor, felt);
  off.push(() => floor.remove());
  // В приложении под страницей — камера: пол и все фоны страницы прозрачны, пока AR включён.
  if (shell) {
    floor.style.background = "transparent";
    const clear = [document.documentElement, document.body, stage];
    const was = clear.map((el) => el.style.background);
    for (const el of clear) el.style.background = "transparent";
    // Обои экрана (узор и блёстки под столом) — тоже прочь: под столом комната.
    const hide = document.createElement("style");
    hide.textContent = "[data-g=ground],[data-g=sparkle]{display:none!important}";
    document.head.append(hide);
    off.push(() => { hide.remove(); clear.forEach((el, i) => { el.style.background = was[i]!; }); });
  }

  const drawFloor = (l: ArLens): void => {
    const STEP = 4, SPAN = 64, SEG = 32;
    let d = "", d0 = "";
    for (let i = -SPAN; i <= SPAN; i += STEP) {
      for (const [a, b] of [[{ x: i, y: -SPAN }, { x: i, y: SPAN }], [{ x: -SPAN, y: i }, { x: SPAN, y: i }]] as const) {
        let path = "", pen = false;
        for (let k = 0; k <= SEG; k += 1) {
          const q = l.project({ x: a.x + ((b.x - a.x) * k) / SEG, y: a.y + ((b.y - a.y) * k) / SEG });
          if (!q) { pen = false; continue; }
          path += `${pen ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
          pen = true;
        }
        if (i === 0) d0 += path; else d += path;
      }
    }
    lines.setAttribute("d", d);
    axis.setAttribute("d", d0);
  };

  // ── ходьба: джойстик, хват и подсказка ─────────────────────────────────────────────────────────
  // Джойстик — НА КОМПАСЕ (`compass.ts`): повёл палец от компаса — кольцо встаёт вокруг него, ручка идёт
  // за пальцем. Пустое сукно — ХВАТ: взятая точка стола остаётся под пальцем, глаз едет по полу вместо неё.
  // Второй палец — это щипок или поворот: ходьба и хват прекращаются и отдают жест камере.
  const hint = document.createElement("div");
  hint.dataset.arHint = "";
  hint.style.cssText = "position:fixed;left:50%;top:calc(76px + var(--tg-safe-area-inset-top,0px) + var(--tg-content-safe-area-inset-top,0px));"
    + "transform:translateX(-50%);z-index:44;padding:6px 12px;border-radius:8px;background:rgba(11,7,4,.82);color:#f5ead0;"
    + "font:400 12px/1 Tiny5,monospace;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .2s";
  document.body.append(hint);
  off.push(() => hint.remove());

  /** Курс телефона по полу — как у `placeAtGaze`: взгляд плюс верх экрана, чтобы не терять его, глядя вниз. */
  const yawOf = (): number => {
    const t = placeAtGaze(q, DROP, AHEAD, UNIT);
    return t.yaw;
  };
  let walking: { id: number; x0: number; y0: number; x: number; y: number; at: number; ring: HTMLElement; knob: HTMLElement } | null = null;
  const stopWalk = (): void => {
    if (!walking) return;
    walking.ring.remove();
    walking = null;
    hint.style.opacity = "0";
  };
  const stepWalk = (now: number): void => {
    if (!walking) return;
    const dt = Math.min(0.05, (now - walking.at) / 1000);
    walking.at = now;
    const stick = { x: (walking.x - walking.x0) / STICK_R, y: -(walking.y - walking.y0) / STICK_R };
    walk = walkStep(walk, stick, yawOf(), dt);
    const left = leftToGo(Math.hypot(walk.x, walk.z));
    hint.style.opacity = left === null ? "0" : "1";
    if (left !== null) hint.textContent = `дальше можно ещё ${left.toFixed(1)} м`;
    changed();
    requestAnimationFrame(stepWalk);
  };
  const stick = (id: number, from: { x: number; y: number }, at: { x: number; y: number }): void => {
    if (feet()) return;
    stopGlide();
    stopWalk();
    grabbing = null;
    const ring = document.createElement("div");
    ring.dataset.arStick = "";
    const size = STICK_R * 2;
    // Над компасом: ручка стартует из его середины и должна быть видна поверх.
    ring.style.cssText = `position:fixed;left:${from.x - STICK_R}px;top:${from.y - STICK_R}px;width:${size}px;height:${size}px;border-radius:50%;`
      + "z-index:46;pointer-events:none;box-shadow:inset 0 0 0 2px rgba(245,234,208,.45);background:rgba(11,7,4,.18)";
    const knob = document.createElement("div");
    knob.style.cssText = `position:absolute;left:${STICK_R - 22}px;top:${STICK_R - 22}px;width:44px;height:44px;border-radius:50%;`
      + "background:linear-gradient(#f8d885,#b08a26);box-shadow:inset 0 0 0 2px #0b0704";
    ring.append(knob);
    document.body.append(ring);
    walking = { id, x0: from.x, y0: from.y, x: from.x, y: from.y, at: performance.now(), ring, knob };
    moveKnob(at.x, at.y);
    requestAnimationFrame(stepWalk);
  };
  /** Хват: точка стола под пальцем в миг касания; глаз двигается так, чтобы она оставалась под ним. */
  /** Хват: `desk` — точка стола под пальцем; `at` — где палец был, если хват двигает стол (супер-AR). */
  let grabbing: { id: number; desk: { x: number; y: number }; at?: { x: number; y: number } } | null = null;
  /** СУПЕР-AR — стол держится за настоящий мир: ARKit в приложении или пойманная метка. Гироскоп — нет. */
  const superAr = (): boolean => native !== null || (anchor.kind !== "gravity" && fusion.S.locked);
  let seenLens: ArLens | null = null;
  // ВСПЫШКА ВЫБРАННОГО МЕСТА: после «Выровнять» кромка стола вспыхивает и расходится кольцом — видно, куда он встал.
  let flashAt = 0;
  const flashSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  flashSvg.setAttribute("data-ar-flash", "");
  flashSvg.setAttribute("style", "position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:4");
  flashSvg.innerHTML = `<polygon fill="none" stroke="#f2c14e" stroke-linejoin="round"/><polygon fill="rgba(242,193,78,.12)" stroke="none"/>`;
  stage.append(flashSvg);
  off.push(() => flashSvg.remove());
  const drawFlash = (l: ArLens, now: number): void => {
    const t = flashAt ? (now - flashAt) / FLASH_MS : 1;
    const [ring, fill] = [...flashSvg.querySelectorAll("polygon")] as [SVGPolygonElement, SVGPolygonElement];
    flashSvg.dataset.on = t < 1 ? "1" : "0";
    if (t >= 1) { ring.setAttribute("points", ""); fill.setAttribute("points", ""); return; }
    const rim = (r: number) => Array.from({ length: 48 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2, q = l.project({ x: Math.cos(a) * r, y: Math.sin(a) * r }, 0);
      return q ? `${q.x.toFixed(1)},${q.y.toFixed(1)}` : "";
    }).filter(Boolean).join(" ");
    ring.setAttribute("points", rim((R + RIM) * (1 + t * 0.35)));
    ring.setAttribute("stroke-width", (5 * (1 - t) + 1).toFixed(1));
    ring.setAttribute("opacity", (1 - t).toFixed(2));
    fill.setAttribute("points", rim(R + RIM));
    fill.setAttribute("opacity", (1 - t).toFixed(2));
    requestAnimationFrame(() => changed());
  };
  let metre = 1;
  const grab = (down: PointerEvent): void => {
    if (!seenLens) return;
    // СУПЕР-AR (ARKit или пойманная метка): палец ДВИГАЕТ СТОЛ по его плоскости — ходить здесь ногами, а стол
    // ставить рукой. На гироскопе палец по-прежнему шагает глазом.
    const table = superAr();
    if (!table && feet()) return;
    stopGlide();
    stopWalk();
    grabbing = { id: down.pointerId, desk: seenLens.toDesk({ x: down.clientX, y: down.clientY }), ...(table ? { at: { x: down.clientX, y: down.clientY } } : {}) };
  };
  const dragGrab = (e: PointerEvent): void => {
    if (!grabbing || !seenLens || e.pointerId !== grabbing.id) return;
    if (grabbing.at) {
      seat = moveSeat(seat, seenLens, grabbing.at, { x: e.clientX, y: e.clientY }, lastTurn, lastZoom);
      grabbing.at = { x: e.clientX, y: e.clientY };
      showHud();
      changed();
      return;
    }
    const want = seenLens.toWorld(grabbing.desk), got = seenLens.toWorld(seenLens.toDesk({ x: e.clientX, y: e.clientY }));
    let x = walk.x + (want[0] - got[0]) / metre, z = walk.z + (want[2] - got[2]) / metre;
    const d = Math.hypot(x, z);
    if (d > WALK.MAX) { x = (x / d) * WALK.MAX; z = (z / d) * WALK.MAX; }
    walk = { x, z };
    changed();
  };
  const moveKnob = (x: number, y: number): void => {
    if (!walking) return;
    walking.x = x;
    walking.y = y;
    const dx = x - walking.x0, dy = y - walking.y0, len = Math.hypot(dx, dy), k = len > STICK_R ? STICK_R / len : 1;
    walking.knob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
  };
  const onMove = (e: PointerEvent): void => {
    if (walking && e.pointerId === walking.id) moveKnob(e.clientX, e.clientY);
    dragGrab(e);
  };
  const onUp = (e: PointerEvent): void => {
    if (walking && e.pointerId === walking.id) stopWalk();
    if (grabbing && e.pointerId === grabbing.id) grabbing = null;
  };
  const onSecond = (e: PointerEvent): void => {
    if (walking && e.pointerId !== walking.id) stopWalk();
    if (grabbing && e.pointerId !== grabbing.id) grabbing = null;
    touching.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  // НАКЛОН В СУПЕР-AR — два пальца вместе вверх-вниз. Жест только подсматривается: щипок и поворот тех же
  // пальцев остаются пальцевой камере (масштаб и поворот стола), а параллельный ход их не меняет.
  const touching = new Map<number, { x: number; y: number }>();
  const onTilt = (e: PointerEvent): void => {
    const was = touching.get(e.pointerId);
    if (!was) return;
    const prev = new Map(touching);
    touching.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touching.size !== 2 || !superAr() || hud.fitting) return;
    const [i, j] = [...touching.keys()] as [number, number];
    seat = superClamp(tiltBy(seat, prev.get(i)!, prev.get(j)!, touching.get(i)!, touching.get(j)!));
    showHud();
    changed();
  };
  const onLift = (e: PointerEvent): void => { touching.delete(e.pointerId); };
  addEventListener("pointermove", onTilt, true);
  addEventListener("pointerup", onLift, true);
  addEventListener("pointercancel", onLift, true);
  off.push(() => {
    removeEventListener("pointermove", onTilt, true);
    removeEventListener("pointerup", onLift, true);
    removeEventListener("pointercancel", onLift, true);
  });
  addEventListener("pointermove", onMove);
  addEventListener("pointerup", onUp);
  addEventListener("pointercancel", onUp);
  addEventListener("pointerdown", onSecond, true);
  off.push(() => {
    stopWalk();
    removeEventListener("pointermove", onMove);
    removeEventListener("pointerup", onUp);
    removeEventListener("pointercancel", onUp);
    removeEventListener("pointerdown", onSecond, true);
  });

  // ── якорь, посадка, камера ─────────────────────────────────────────────────────────────────────
  /** `unit` — ширин метки в единице стола: у предмета своя мерка. */
  type Anchor = { kind: "gravity" } | { kind: "marker"; id: string; unit: number };
  let anchor: Anchor = { kind: "gravity" };
  let seat: ArSeat = readSeat(localStorage, "gravity");
  const seatKey = (): string => (anchor.kind === "marker" ? `marker:${anchor.id}` : anchor.kind);
  /**
   * ПОКОЛЕНИЕ ЯКОРЯ. Привязка к предмету долгая (камера, запуск трекера), а человек за это время может
   * выбрать другое. Каждая смена якоря — новое поколение; привязка, чьё поколение устарело, останавливает
   * свой трекер и ничего не трогает.
   */
  let gen = 0;
  const fusion = createFusion(() => ({ ...FUSE, flat: seat.flat }));
  let backdrop: Backdrop | null = null;
  let untrack: (() => void) | null = null;
  let markers: StoredMarker[] = [];
  let lensAt = performance.now();
  let lastTurn = 0;
  let lastZoom = 1;
  const seenNow = (): HudState["seen"] => {
    if (anchor.kind === "gravity" || !fusion.S.locked) return "search";
    return performance.now() - fusion.S.seenAt < SEEN_MS ? "seen" : "lost";
  };
  /** Сказать сверху (там же, где «дальше можно ещё …»); `null` — убрать. */
  const say = (text: string | null, ms = 0): void => {
    hint.style.opacity = text ? "1" : "0";
    if (text) hint.textContent = text;
    if (text && ms) setTimeout(() => { if (hint.textContent === text && !walking) hint.style.opacity = "0"; }, ms);
  };
  /** Предмет виден — ходишь ногами: джойстик и хват спят, об этом — подсказка. */
  const feet = (): boolean => {
    if (seenNow() !== "seen") return false;
    say("предмет виден — ходи ногами", 1400);
    return true;
  };

  const hud: HudState = { anchor: "gravity", seen: "search", camera: "off", fitting: false, seat, markers: [], active: null, sheet: null, progress: 0 };
  const showHud = (): void => {
    Object.assign(hud, { anchor: anchor.kind, seat, active: anchor.kind === "marker" ? anchor.id : null, markers: markers.map(({ id, name, thumb, points }) => ({ id, name, thumb, points })) });
    stage.dataset.arAnchor = `${anchor.kind}:${hud.seen}`;
    stage.dataset.arSeat = JSON.stringify(seat);
    ui.render(hud);
  };
  const sheet = (s: HudState["sheet"]): void => { hud.sheet = s; showHud(); };

  const stopTrack = (): void => { untrack?.(); untrack = null; fusion.reset(); };
  const stopCamera = (): void => {
    stopTrack();
    backdrop?.stop();
    backdrop = null;
    floor.style.display = "";
    if (hud.camera === "on" || hud.camera === "starting") hud.camera = "off";
  };
  /** Камера под сукном — только для предмета: его надо видеть. Не вышло — почему, видно в окне якоря. */
  const camera = async (): Promise<Backdrop | null> => {
    if (backdrop) return backdrop;
    stride.stop();
    hud.camera = "starting";
    showHud();
    const got = await openCamera(stage, felt);
    if (typeof got === "string") {
      hud.camera = { error: got };
      sheet("menu");
      return null;
    }
    backdrop = got;
    hud.camera = "on";
    void warm(); // трекер грузится и прогревается сейчас, а не когда человек ждёт метку
    floor.style.display = "none";
    showHud();
    changed();
    return backdrop;
  };
  const useSeat = (): void => { seat = readSeat(localStorage, seatKey()); showHud(); changed(); };

  /** Перед собой: стол держит гироскоп, камера не нужна. */
  const gravity = (): void => {
    gen += 1;
    stopCamera();
    anchor = { kind: "gravity" };
    useSeat();
    place();
  };
  /** Стол держится за предмет `m`. */
  const attach = async (m: StoredMarker, next: Anchor & { kind: "marker" }, mine = ++gen): Promise<void> => {
    const cam = await camera();
    if (!cam || mine !== gen) return;
    stopTrack();
    anchor = next;
    hud.sheet = null;
    // Где телефон, теперь говорит предмет: пройденные джойстиком и с камерой шаги к нему не относятся.
    walk = { x: 0, z: 0 };
    lift = 0;
    useSeat();
    const stop = await track(cam.video, m.buf, (pose, grabbedAt) => {
      if (!pose) return;
      const was = seenNow();
      const q0 = gyro.at(grabbedAt - VIDEO_LAG) ?? q;
      // Прошёл джойстиком, пока предмета не было видно, — шаги вливаются в связку до её слова.
      if (was === "lost" && (walk.x || walk.z)) {
        fusion.shift([walk.x * metre, 0, walk.z * metre]);
        walk = { x: 0, z: 0 };
      }
      fusion.measure(q0, pose.t, pose.q, performance.now());
      changed();
    });
    if (mine === gen && anchor === next && backdrop === cam) untrack = stop;
    else stop();
  };
  const use = async (id: string): Promise<void> => {
    const m = markers.find((x) => x.id === id);
    if (m) await attach(m, { kind: "marker", id, unit: MARKER_UNIT });
  };
  const fit = (on: boolean): void => { hud.fitting = on; hud.sheet = null; fingers.clear(); showHud(); };

  const ui = mountHud({
    exit,
    menu: (open) => {
      // Окно якоря открыли — значит, возможно, будут снимать предмет: трекер греется, пока человек читает и
      // целится, и метка потом собирается за доли секунды.
      if (open) void warm();
      if (open) void listMarkers().then((list) => { markers = list; sheet("menu"); });
      else sheet(null);
    },
    fit,
    fitDone: () => { writeSeat(localStorage, seatKey(), seat); fit(false); },
    fitReset: () => { seat = { ...SEAT0, flat: seat.flat }; showHud(); changed(); },
    fitCancel: () => { fit(false); useSeat(); },
    gravity: () => { hud.sheet = null; gravity(); },
    use: (id) => void use(id),
    forget: (id) => void deleteMarker(id).then(listMarkers).then((list) => {
      markers = list;
      if (anchor.kind === "marker" && anchor.id === id) gravity();
      sheet("menu");
    }),
    capture: () => void camera().then((cam) => { if (cam) sheet("capture"); }),
    shoot: () => void (async () => {
      const cam = backdrop;
      if (!cam) return;
      const box = captureBox(innerWidth, innerHeight);
      const a = cam.toVideo(box.x, box.y), b = cam.toVideo(box.x + box.side, box.y + box.side);
      hud.progress = 0;
      sheet("compile");
      try {
        const m = await makeMarker(cam.video, { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }, markers.length, (p) => { hud.progress = p; showHud(); });
        await saveMarker(m);
        markers = await listMarkers();
        await use(m.id);
      } catch (err) {
        hud.camera = { error: `метка не собралась: ${String((err as Error)?.message ?? err)}` };
        sheet("menu");
      }
    })(),
    flat: () => { seat = { ...seat, flat: !seat.flat }; writeSeat(localStorage, seatKey(), seat); fusion.reset(); showHud(); changed(); },
    again: () => { walk = { x: 0, z: 0 }; sheet(null); fusion.reset(); changed(); },
    close: () => {
      // Съёмку бросили — камера была нужна только ей.
      if (hud.sheet === "capture" && anchor.kind === "gravity") stopCamera();
      sheet(null);
    },
  });
  off.push(() => ui.dispose());
  void listMarkers().then((list) => { markers = list; showHud(); });

  // ── «выровнять» — плавно ─────────────────────────────────────────────────────────────────────────
  // Тап по компасу: назад к своему стулу, стол перед собой. Прыжком это читалось как телепорт; теперь стол
  // едет на новое место за то же время, что компас доворачивает поворот (600 мс), с разгоном и торможением.
  // «Меньше анимаций» — прыжком, как раньше. Джойстик, хват или прогулка посреди пути — путь бросается.
  const GLIDE_MS = 600;
  let glide = 0;
  const stopGlide = (): void => { cancelAnimationFrame(glide); glide = 0; };
  function glideHome(target?: ArPlace): void {
    stopGlide();
    const to = target ?? gazePlace();
    // ВЫРОВНЯТЬ — ЭТО ВСЁ: и посадку (сдвиг пальцем, наклон двумя, размер) — к нулю. Иначе стол вставал к
    // взгляду, но уехавшим и накренённым, и компас «ничего не восстанавливал».
    const home: ArSeat = { ...SEAT0, flat: seat.flat };
    writeSeat(localStorage, seatKey(), home);
    flashAt = performance.now();
    if (document.documentElement.dataset.reduceMotion !== undefined) {
      walk = { x: 0, z: 0 };
      lift = 0;
      placed = to;
      seat = home;
      showHud();
      changed();
      return;
    }
    const from = { walk: { ...walk }, lift, placed, seat: { ...seat } }, t0 = performance.now();
    let turn = to.yaw - from.placed.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    const step = (now: number): void => {
      const t = Math.min(1, (now - t0) / GLIDE_MS), k = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      walk = { x: from.walk.x * (1 - k), z: from.walk.z * (1 - k) };
      lift = from.lift * (1 - k);
      seat = { ...home, x: from.seat.x * (1 - k), y: from.seat.y * (1 - k), tilt: from.seat.tilt * (1 - k), zoom: from.seat.zoom + (home.zoom - from.seat.zoom) * k };
      placed = {
        at: [0, 1, 2].map((i) => from.placed.at[i]! + (to.at[i]! - from.placed.at[i]!) * k) as [number, number, number],
        yaw: from.placed.yaw + turn * k,
        unit: to.unit,
      };
      changed();
      glide = t < 1 ? requestAnimationFrame(step) : 0;
      if (t >= 1) showHud();
    };
    glide = requestAnimationFrame(step);
  }
  off.push(stopGlide);

  // ── годность кадра в рамке съёмки ───────────────────────────────────────────────────────────────
  const shot = document.createElement("canvas");
  shot.width = shot.height = ASSESS;
  const shotG = shot.getContext("2d", { willReadFrequently: true })!;
  const look = window.setInterval(() => {
    const cam = backdrop;
    if (!cam || !cam.video.videoWidth || hud.sheet !== "capture") return;
    const box = captureBox(innerWidth, innerHeight);
    const a = cam.toVideo(box.x, box.y), b = cam.toVideo(box.x + box.side, box.y + box.side);
    shotG.drawImage(cam.video, a.x, a.y, b.x - a.x, b.y - a.y, 0, 0, ASSESS, ASSESS);
    ui.quality(assess(greyOf(shotG, ASSESS, ASSESS)), ASSESS);
  }, 250);
  off.push(() => clearInterval(look));

  // ── прогулка с камерой: пока держишь компас ─────────────────────────────────────────────────────
  // Камера невидимо смотрит на пол, пока палец на компасе (`arStride.ts`), и двигает глаз по полу: шаги
  // ногами становятся шагами у стола. Отпустил — камера гаснет, ты там, куда пришёл.
  let lift = 0;
  const stride = (() => {
    let session: { stop(): void } | null = null;
    let want = false;
    return {
      async start(): Promise<void> {
        want = true;
        stopGlide();
        if (session) return;
        if (anchor.kind !== "gravity") { say("держусь за предмет — ходи ногами", 1600); return; }
        say("включаю камеру…");
        const tableQ = (): Quat => { const p = seated(placed, seat); return p.q ?? yawQuat(p.yaw); };
        const got = await startStride({
          stage, felt,
          turnAt: (t) => gyro.at(t) ?? q,
          plane: () => ({ at: seated(placed, seat).at, n: rotate(tableQ(), [0, 1, 0]) }),
          eye: () => [walk.x * metre, lift, walk.z * metre],
          move: ([x, y, z]) => {
            let wx = x / metre, wz = z / metre;
            const d = Math.hypot(wx, wz);
            if (d > WALK.MAX) { wx = (wx / d) * WALK.MAX; wz = (wz / d) * WALK.MAX; }
            walk = { x: wx, z: wz };
            lift = y;
            changed();
          },
          say: (text) => say(text),
        });
        if (typeof got === "string") { say(`камера: ${got}`, 2400); return; }
        if (!want) { got.stop(); return; }
        session = got;
      },
      stop(): void {
        want = false;
        session?.stop();
        session = null;
      },
    };
  })();
  off.push(() => stride.stop());

  // ── подгонка: пальцы по сукну ──────────────────────────────────────────────────────────────────
  // Пока подгонка, стол не играет: касание сукна перехватывается на окне, в захвате, раньше стола. Кнопки
  // HUD, окно якоря и «Настройки» пропускаются как есть — поверх страницы ничего не лежит. Один палец —
  // стол едет за пальцем по плоскости якоря; два — развести (размер), вместе вверх-вниз (наклон).
  const PASS = "[data-over-hud],[data-ar-bar],[data-ar-sheet],[data-ar-strip],[data-settings-layer]";
  const fingers = new Map<number, { x: number; y: number }>();
  let fitTouchedAt = 0;
  const onFitDown = (e: PointerEvent): void => {
    if (!hud.fitting || (e.target as Element | null)?.closest?.(PASS)) return;
    e.stopPropagation();
    e.preventDefault();
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    fitTouchedAt = performance.now();
  };
  const onFitMove = (e: PointerEvent): void => {
    const was = fingers.get(e.pointerId);
    if (!was) return;
    e.stopPropagation();
    if (!seenLens) return;
    const prev = new Map(fingers);
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ids = [...fingers.keys()];
    if (ids.length === 1) {
      seat = moveSeat(seat, seenLens, was, { x: e.clientX, y: e.clientY }, lastTurn, lastZoom);
    } else {
      const [i, j] = ids as [number, number];
      const a0 = prev.get(i)!, b0 = prev.get(j)!, a1 = fingers.get(i)!, b1 = fingers.get(j)!;
      const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y), d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
      seat = tiltBy(clampSeat({ ...seat, zoom: seat.zoom * (d0 > 1 ? d1 / d0 : 1) }), a0, b0, a1, b1);
    }
    showHud();
    changed();
  };
  const onFitUp = (e: PointerEvent): void => {
    if (!fingers.delete(e.pointerId)) return;
    e.stopPropagation();
    fitTouchedAt = performance.now();
  };
  // Клик после касания сукна тоже не столу: иначе тап по стулу открыл бы его окно.
  const onFitClick = (e: MouseEvent): void => {
    if (!hud.fitting || (e.target as Element | null)?.closest?.(PASS) || performance.now() - fitTouchedAt > 600) return;
    e.stopPropagation();
    e.preventDefault();
  };
  addEventListener("pointerdown", onFitDown, true);
  addEventListener("pointermove", onFitMove, true);
  addEventListener("pointerup", onFitUp, true);
  addEventListener("pointercancel", onFitUp, true);
  addEventListener("click", onFitClick, true);
  off.push(() => {
    removeEventListener("pointerdown", onFitDown, true);
    removeEventListener("pointermove", onFitMove, true);
    removeEventListener("pointerup", onFitUp, true);
    removeEventListener("pointercancel", onFitUp, true);
    removeEventListener("click", onFitClick, true);
  });

  return {
    lens(frame, turn, zoom) {
      const now = performance.now();
      const shown = fusion.frame(now - lensAt);
      lensAt = now;
      const z = zoom * seat.zoom;
      const onMarker = anchor.kind !== "gravity" && fusion.S.locked;
      const unit = anchor.kind !== "gravity" && onMarker ? anchor.unit : UNIT;
      // Условный метр — радиус стола в мире при нынешнем зуме: подошёл к большому столу — прошёл больше.
      metre = (R + RIM) * unit * z;
      const stepped: [number, number, number] = [walk.x * metre, onMarker ? 0 : lift, walk.z * metre];
      const pos = onMarker
        ? ([0, 1, 2].map((i) => shown[i]! + stepped[i]!) as [number, number, number])
        : native ? ([0, 1, 2].map((i) => native!.pos[i]! + stepped[i]!) as [number, number, number]) : stepped;
      const base: ArPlace = onMarker ? { at: fusion.S.anchor.pos, yaw: 0, unit, q: tableOnMarker(fusion.S.anchor.q) } : placed;
      // Кадр камеры на экране старше датчика: сцена берёт поворот того мига, иначе стол бежит впереди фона.
      const eye = native ? native.q : backdrop ? (gyro.at(now - VIDEO_LAG) ?? q) : q;
      const l = arLens({ q: eye, fov: native ? native.fov : backdrop ? backdrop.fov(frame.h) : FOV, pos }, seated(base, seat), turn, z, frame);
      if (!backdrop && !shell) drawFloor(l);
      seenLens = l;
      drawFlash(l, now);
      lastTurn = turn;
      lastZoom = z;
      const sees = seenNow();
      if (sees !== hud.seen) { hud.seen = sees; showHud(); }
      return l;
    },
    place,
    recenter() {
      stopWalk();
      grabbing = null;
      // В ПРИЛОЖЕНИИ — заново найти поверхность под взглядом и встать на неё; не нашлась — перед собой.
      if (!shell?.surface) return glideHome();
      askSurface((at) => {
        glideHome(at ?? undefined);
        flashSvg.dataset.surface = surfaceSeen;
        if (!at) say("поверхность не нашлась — стол перед тобой", 1800);
      });
    },
    stick,
    grab,
    entry() {
      if (!heard) return 0;
      if (document.documentElement.dataset.reduceMotion !== undefined) return 1;
      const t = Math.min(1, (performance.now() - heardAt) / ENTRY_MS);
      if (t < 1) requestAnimationFrame(() => changed());
      return ease(t);
    },
    stride(on) {
      // В приложении шаги и так знает ARKit — своя камера для прогулки не нужна.
      if (shell) return;
      if (on) void stride.start();
      else stride.stop();
    },
    dispose() {
      stopCamera();
      for (const fn of off.splice(0)) fn();
    },
  };
}
