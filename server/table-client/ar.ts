// AR-СТОЛ НА ЭКРАНЕ — датчик наклона, место стола в мире и пол под ним. Камеры здесь нет: стол держится
// только за то, как повёрнут телефон.
//
// Экран (`screen.ts`) спрашивает отсюда линзу (`arLens.ts`) вместо линзы пальцевой камеры — и больше
// ничего не знает. От пальцевой камеры AR берёт только поворот и зум: два пальца крутят и растят стол,
// а свой стул ставит ко мне тот же компас (`compass.ts`). Сдвиг и наклон — дело самого телефона.
//
// Датчик — Telegram (`WebApp.DeviceOrientation`, радианы), если мини-апп его даёт, иначе браузерный
// `deviceorientation` (градусы). iOS даёт браузерный только после разрешения из жеста — поэтому, пока
// датчик молчит, поверх стола висит кнопка «Включить наклон».

import { arLens, deviceQuat, placeAtGaze, type ArLens, type ArPlace, type Quat } from "./arLens.js";

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
  dispose(): void;
}

export function mountAr(stage: HTMLElement, felt: HTMLCanvasElement, changed: () => void): ArRig {
  let q: Quat = deviceQuat(0, STILL_BETA, 0, 0);
  let placed: ArPlace = placeAtGaze(q, DROP, AHEAD, UNIT);
  let heard = false;
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

  return {
    lens(frame, turn, zoom) {
      const l = arLens({ q, fov: FOV }, placed, turn, zoom, frame);
      drawFloor(l);
      return l;
    },
    place,
    dispose() { for (const fn of off.splice(0)) fn(); },
  };
}
