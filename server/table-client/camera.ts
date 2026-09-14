// КАМЕРА СТОЛА — камера кита, а не своя.
//
// `Camera` (пан, зум, поворот, наклон, инерция) и `wireCamera` (какой палец что делает: один — ведёт
// стол, два — щипок и поворот, два вместе вверх-вниз — наклон) взяты из `game-kit` как есть: пороги
// там выверены под настоящий палец, а вторая копия этого автомата разошлась бы с первой молча.
//
// Кит ждёт `Host` — холст с деревом узлов. У HTML-клиента дерева нет, и камере оно не нужно: она
// спрашивает у хоста только холст, размер кадра и единицу, а дерево — лишь когда ей дали `claims`.
// Кому палец (карте, аватару или камере), решает экран — раньше неё (`screen.ts`), поэтому `claims`
// здесь нет и дерево не читается никогда.

import { Camera, type CameraLimits } from "../../game-kit/src/render/camera/index.js";
import { TILT_PER_PX, wireCamera, type CameraControl } from "../../game-kit/src/render/cameraInput.js";
import type { Host } from "../../game-kit/src/render/host.js";
import { DESK_BOX, R, RIM } from "./felt.js";

/** Те же пределы, что у стола кита (`DESK_ZOOM` в `liveTable.ts`). */
const DESK_ZOOM: CameraLimits = { minZoom: 0.5, maxZoom: 2.5 };

export interface TableCamera {
  readonly camera: Camera;
  readonly control: CameraControl;
  /**
   * Мышь с Ctrl/Cmd или правой кнопкой — поворот и наклон от точки захвата. Экран зовёт это из своего
   * разбора, кому досталось нажатие, и тогда нажатие не доходит ни до карты, ни до камеры кита.
   */
  orbit(e: PointerEvent): void;
}

/** Градусов поворота на пиксель мыши по горизонтали. */
export const TURN_PER_PX = 0.3;
/** Градусов наклона на пиксель мыши по вертикали — тот же отклик, что у двух пальцев в ките. */
export const LEAN_PER_PX = TILT_PER_PX;

/** Нажатие мыши, которое крутит стол, а не ведёт его и не берёт карту. */
export const orbits = (e: PointerEvent): boolean => e.pointerType === "mouse" && (e.button === 2 || (e.button === 0 && (e.ctrlKey || e.metaKey)));

/**
 * `frame` — кадр камеры на стекле: вся ширина и высота над рукой. Спрашивается заново на каждом жесте,
 * потому что рука меняет высоту, а телефон — ориентацию.
 */
export function tableCamera(canvas: HTMLCanvasElement, frame: () => { w: number; h: number }, onView: () => void): TableCamera {
  const camera = new Camera(DESK_ZOOM);
  /** Единица при зуме 1 — весь стол с кромкой в кадре. Дальше масштаб — дело зума. */
  const unit = () => {
    const f = frame();
    return Math.min(f.w, f.h) / 2 / (R + RIM);
  };
  const host: Pick<Host, "view" | "viewport" | "unit" | "hudRoot" | "root"> = {
    view: canvas,
    viewport: () => ({ width: frame().w, height: frame().h, dpr: Math.min(3, globalThis.devicePixelRatio || 1) }),
    unit,
    hudRoot: undefined,
    root: undefined as unknown as Host["root"],
  };
  const control = wireCamera({ host: host as Host, camera, content: () => DESK_BOX, unit, onView });

  // ПОВОРОТ МЫШЬЮ, КАК В 2ГИС. Точка стола под курсором взята в момент нажатия и держится под ним:
  // мышь влево-вправо — стол поворачивается, вверх-вниз — наклоняется, и то и другое сразу.
  // Отпущен Ctrl/Cmd при левой кнопке — тот же захват сразу становится обычным ведением стола.
  const orbit = (down: PointerEvent) => {
    const glass = (e: { clientX: number; clientY: number }) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const start = glass(down);
    const anchor = camera.toContent(start.x, start.y);
    const from = { rotation: camera.rotation, pitch: camera.pitch };
    const right = down.button === 2;
    let mode: "orbit" | "pan" = "orbit";
    let grip = anchor;
    let at = start;
    const move = (e: PointerEvent) => {
      at = glass(e);
      if (mode === "orbit" && !right && !(e.ctrlKey || e.metaKey)) {
        mode = "pan";
        grip = camera.toContent(at.x, at.y);
      }
      if (mode === "orbit") {
        camera.turnTo(from.rotation + (at.x - start.x) * TURN_PER_PX);
        camera.tiltTo(from.pitch - (at.y - start.y) * LEAN_PER_PX);
        camera.holdAt(anchor, start.x, start.y, camera.zoom);
      } else camera.holdAt(grip, at.x, at.y, camera.zoom);
      onView();
    };
    const key = (e: KeyboardEvent) => {
      if (mode !== "orbit" || right || e.ctrlKey || e.metaKey) return;
      mode = "pan";
      grip = camera.toContent(at.x, at.y);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== down.pointerId) return;
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
      removeEventListener("keyup", key);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    addEventListener("keyup", key);
  };
  // Правая кнопка и Ctrl+клик на Mac открыли бы меню браузера поверх стола.
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  return { camera, control, orbit };
}
