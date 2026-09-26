// AR-СТОЛ НА ЭКРАНЕ — датчик наклона, место стола в мире и пол под ним. Камеры здесь нет: стол держится
// только за то, как повёрнут телефон.
//
// Включает его сам человек — долгим нажатием на компас (`compass.ts`), выход — удержанием его же; стол
// всегда открывается обычным. Экран
// (`screen.ts`) спрашивает отсюда линзу (`arLens.ts`) вместо линзы пальцевой камеры — и больше ничего не знает. От пальцевой камеры AR берёт только поворот и зум: два пальца крутят и растят стол,
// а свой стул ставит ко мне тот же компас (`compass.ts`). Сдвиг и наклон — дело самого телефона.
//
// Датчик — Telegram (`WebApp.DeviceOrientation`, радианы), если мини-апп его даёт, иначе браузерный
// `deviceorientation` (градусы). iOS даёт браузерный только после разрешения из жеста — поэтому, пока
// датчик молчит, поверх стола висит кнопка «Включить наклон».

import { arLens, deviceQuat, placeAtGaze, type ArLens, type ArPlace, type Quat } from "./arLens.js";
import { leftToGo, walkStep } from "./arWalk.js";
import { R, RIM } from "./felt.js";

/** Вертикальный обзор: телефонный экран в портрете. */
const FOV = 62;
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
  /** Палец лёг на пустое сукно — джойстик ходьбы под ним, пока палец не поднят. */
  stick(down: PointerEvent): void;
  dispose(): void;
}

export function mountAr(stage: HTMLElement, felt: HTMLCanvasElement, changed: () => void): ArRig {
  let q: Quat = deviceQuat(0, STILL_BETA, 0, 0);
  let placed: ArPlace = placeAtGaze(q, DROP, AHEAD, UNIT);
  let heard = false;
  /** Где стоишь — условные метры от своего стула (метр — радиус стола), `arWalk.ts`. */
  let walk = { x: 0, z: 0 };
  const off: Array<() => void> = [];

  const screenAngle = (): number => screen.orientation?.angle ?? (globalThis as { orientation?: number }).orientation ?? 0;
  const place = (): void => {
    placed = placeAtGaze(q, DROP, AHEAD, UNIT);
    changed();
  };
  const hear = (alpha: number, beta: number, gamma: number): void => {
    q = deviceQuat(alpha, beta, gamma, screenAngle());
    if (!heard) {
      heard = true;
      ask.remove();
      placed = placeAtGaze(q, DROP, AHEAD, UNIT); // первое слово датчика — стол встаёт туда, куда смотришь
    }
    changed();
  };

  // ── датчик ─────────────────────────────────────────────────────────────────────────────────────
  const tg = (globalThis as { Telegram?: { WebApp?: TelegramApp } }).Telegram?.WebApp;
  const tgo = tg?.DeviceOrientation;
  if (tgo?.start && tg?.onEvent) {
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
  addEventListener("deviceorientation", onBrowser);
  off.push(() => removeEventListener("deviceorientation", onBrowser));

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
  const needsAsk = typeof (globalThis as { DeviceOrientationEvent?: { requestPermission?: unknown } }).DeviceOrientationEvent?.requestPermission === "function";
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

  // ── ходьба: джойстик и подсказка ───────────────────────────────────────────────────────────────
  // Джойстик ПЛАВАЮЩИЙ: появляется там, где палец лёг на пустое сукно, и уходит с пальцем — постоянного
  // кружка на экране нет. Второй палец — это щипок или поворот: ходьба прекращается и отдаёт жест камере.
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
  const stick = (down: PointerEvent): void => {
    stopWalk();
    const ring = document.createElement("div");
    ring.dataset.arStick = "";
    const size = STICK_R * 2;
    ring.style.cssText = `position:fixed;left:${down.clientX - STICK_R}px;top:${down.clientY - STICK_R}px;width:${size}px;height:${size}px;border-radius:50%;`
      + "z-index:43;pointer-events:none;box-shadow:inset 0 0 0 2px rgba(245,234,208,.45);background:rgba(11,7,4,.18)";
    const knob = document.createElement("div");
    knob.style.cssText = `position:absolute;left:${STICK_R - 22}px;top:${STICK_R - 22}px;width:44px;height:44px;border-radius:50%;`
      + "background:linear-gradient(#f8d885,#b08a26);box-shadow:inset 0 0 0 2px #0b0704";
    ring.append(knob);
    document.body.append(ring);
    walking = { id: down.pointerId, x0: down.clientX, y0: down.clientY, x: down.clientX, y: down.clientY, at: performance.now(), ring, knob };
    requestAnimationFrame(stepWalk);
  };
  const onMove = (e: PointerEvent): void => {
    if (!walking || e.pointerId !== walking.id) return;
    walking.x = e.clientX;
    walking.y = e.clientY;
    const dx = e.clientX - walking.x0, dy = e.clientY - walking.y0, len = Math.hypot(dx, dy), k = len > STICK_R ? STICK_R / len : 1;
    walking.knob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
  };
  const onUp = (e: PointerEvent): void => { if (walking && e.pointerId === walking.id) stopWalk(); };
  const onSecond = (e: PointerEvent): void => { if (walking && e.pointerId !== walking.id) stopWalk(); };
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

  return {
    lens(frame, turn, zoom) {
      // Условный метр — радиус стола в мире при нынешнем зуме: подошёл к большому столу — прошёл больше.
      const metre = (R + RIM) * UNIT * zoom;
      const l = arLens({ q, fov: FOV, pos: [walk.x * metre, 0, walk.z * metre] }, placed, turn, zoom, frame);
      drawFloor(l);
      return l;
    },
    place,
    recenter() {
      stopWalk();
      walk = { x: 0, z: 0 };
      place();
    },
    stick,
    dispose() { for (const fn of off.splice(0)) fn(); },
  };
}
