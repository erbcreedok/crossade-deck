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
import { wireCamera, type CameraControl } from "../../game-kit/src/render/cameraInput.js";
import type { Host } from "../../game-kit/src/render/host.js";
import { DESK_BOX, R, RIM } from "./felt.js";

/** Те же пределы, что у стола кита (`DESK_ZOOM` в `liveTable.ts`). */
const DESK_ZOOM: CameraLimits = { minZoom: 0.5, maxZoom: 2.5 };

export interface TableCamera {
  readonly camera: Camera;
  readonly control: CameraControl;
}

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
  return { camera, control };
}
