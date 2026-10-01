// МОДЕЛИ КАМЕРЫ — как игрок смотрит на стол. Ввод (мышь, клавиши, палец, потом гироскоп) превращается в четыре
// намерения — повернуть взгляд, приблизить, вернуть домой и повернуть стол (компас); всё остальное знает только состояние.
//
//   orbit  камера летает по сфере вокруг середины стола (`OrbitControls`) — как было;
//   head   камера — голова (по умолчанию): сидит у плеч стула, взгляд крутится на месте (yaw, pitch), приближение — наклон
//          к столу (шея тянется, держать долго нельзя: `NECK`), поэтому стоя голова выше, а приблизить можно ненадолго.
//          Отдельно — оптика: поле зрения уже, тело не двигается (платная, для сильных экранов);
//   top    вид сверху, как у 2D-стола: камера над серединой, поворот — повернуть стол, приближение — ниже к столу. Та же
//          шея: стоя камера выше, приблизить можно ненадолго (`NECK`), и остальные видят тело так же, как в `head`.

import { HEAD, NECK, NECK_LEN, type Point3 } from "../../server/src/table/bodies.js";

export type CamMode = "head" | "top" | "orbit";
export const CAM_MODES: readonly CamMode[] = ["head", "top", "orbit"];
export const CAM_LABEL: Record<CamMode, string> = { head: "голова", top: "сверху", orbit: "орбита" };

export const CAM = {
  /** Предел взгляда вверх-вниз, градусы (вниз — минус). */
  pitch: { min: -85, max: 15 },
  /** Поле зрения по вертикали: обычное, самое узкое (оптический зум) и в каких пределах игрок выбирает обычное в настройках. */
  fov: { base: 75, min: 20, view: { min: 65, max: 85 } },
  /** Градусов взгляда на пиксель пальца или мыши. */
  look: 0.25,
  /** Шаг стрелок на клавиатуре, градусы. */
  key: 4,
  /** Насколько колесо и щипок приближают. */
  wheel: 0.0015,
  scroll: 0.004,
} as const;

/** Угол к диапазону `-180…180`. */
export const wrap = (a: number): number => ((((a + 180) % 360) + 360) % 360) - 180;

/** Где голова, когда шея наклонена на `lean` (0 — в покое, 1 — на пределе): от плеч к середине стола и ниже. */
export function headAt(sh: Point3, lean: number): Point3 {
  const r = Math.hypot(sh.x, sh.y) || 1, inward = { x: -sh.x / r, y: -sh.y / r };
  const t = Math.max(0, Math.min(1, lean));
  const h = sh.h + NECK_LEN.up + (HEAD.min - (sh.h + NECK_LEN.up)) * t, len = NECK_LEN.rest + NECK_LEN.reach * t, up = h - sh.h;
  const d = Math.sqrt(Math.max(0, len * len - up * up));
  return { x: sh.x + inward.x * d, y: sh.y + inward.y * d, h };
}

/** Взгляд из `from` в середину стола: угол вниз, градусы. */
export const pitchToCentre = (from: Point3): number => (-Math.atan2(from.h, Math.hypot(from.x, from.y) || 1) * 180) / Math.PI;

/** Шея: сколько держится натяг, сколько камера ещё возвращается и сколько шея отдыхает, мс. */
export interface Neck {
  held: number;
  back: number;
  rest: number;
}
export const neckNew = (): Neck => ({ held: 0, back: 0, rest: 0 });

/**
 * Шаг шеи за `dt` мс. Натяг дольше `NECK.free` держится `NECK.holdMs`, потом камера сама возвращается за `NECK.backMs`,
 * и `NECK.restMs` шея отдыхает: снова натянуть её нельзя. Возвращает новый наклон.
 */
export function neckStep(n: Neck, lean: number, dt: number): number {
  if (n.rest > 0) {
    n.rest = Math.max(0, n.rest - dt);
    return Math.min(lean, NECK.free);
  }
  if (n.back > 0) {
    n.back = Math.max(0, n.back - dt);
    const next = Math.max(0, lean - (dt / NECK.backMs));
    if (next <= NECK.free || n.back === 0) { n.back = 0; n.held = 0; n.rest = NECK.restMs; return Math.min(next, NECK.free); }
    return next;
  }
  if (lean <= NECK.free) { n.held = 0; return lean; }
  n.held += dt;
  if (n.held >= NECK.holdMs) n.back = NECK.backMs;
  return lean;
}

/** Насколько поле зрения сверху берёт стол, единиц стола от середины до края кадра по короткой стороне. */
export const TOP = { reach: 7.6, fov: 50 } as const;

/** Высота камеры сверху в покое: стол с кромкой влезает по короткой стороне кадра (`aspect` — ширина к высоте). */
export function topHeight(aspect: number, fovDeg: number, restScale: number): number {
  const half = Math.tan((fovDeg * Math.PI) / 360) * Math.min(1, Math.max(0.2, aspect));
  return (TOP.reach / half) * restScale;
}
