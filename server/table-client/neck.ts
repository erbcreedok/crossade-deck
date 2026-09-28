// ШЕЯ — приближение камеры ближе позы тела. Сидя стол ближе, стоя дальше (`STANCE_ZOOM`); приблизил сильнее
// позы — голова потянулась к столу, шея натянулась (`stretch` 0…1). Небольшой натяг (`NECK.free`) держится
// сколько угодно; сильнее — недолго (`holdFor`), потом камера сама отъезжает к позе за `backMs`, и шея
// `restMs` отдыхает: натянуть её снова выше свободного нельзя. Отдалять — всегда свободно.
//
// Чистые числа: экран приносит зум и время, шея говорит, какой зум поставить и сколько осталось терпеть.

import { NECK, STANCE_ZOOM, holdFor, type Stance } from "../src/table/bodies.js";

export interface Neck {
  /** Сколько уже терпит натяг, мс. */
  strain: number;
  /** Камера возвращается к позе: откуда, куда и с какого мига. */
  back: { from: number; to: number; t0: number } | null;
  /** До какого мига шея отдыхает. */
  rest: number;
  /** Прошлый шаг — от него считается, сколько прошло. */
  at: number;
}

export const freshNeck = (now = 0): Neck => ({ strain: 0, back: null, rest: 0, at: now });

/** Зум позы: `home` — зум, с которого стол виден целиком (у веба — 1). */
export const baseZoom = (stance: Stance, home = 1): number => home * STANCE_ZOOM[stance];

/** Насколько натянута шея при этом зуме: 0 — не ближе позы, 1 — на пределе. */
export const stretchOf = (zoom: number, base: number): number => Math.max(0, Math.min(1, (zoom / base - 1) / (NECK.zoom - 1)));

/** Зум при таком натяге. */
const zoomAt = (stretch: number, base: number): number => base * (1 + stretch * (NECK.zoom - 1));

export interface NeckStep {
  neck: Neck;
  /** Поставить камере этот зум; нет — зум как есть. */
  zoom?: number;
  /** Натяг сейчас. */
  stretch: number;
  /** Сколько вытерплено: 0 — свободно, 1 — сейчас отъедет. */
  worn: number;
  resting: boolean;
}

const ease = (t: number): number => 1 - (1 - t) ** 3;

export function neckStep(was: Neck, now: number, zoom: number, base: number): NeckStep {
  const neck: Neck = { ...was, at: now };
  const dt = Math.max(0, Math.min(250, now - was.at));
  // ВОЗВРАТ — камера едет к позе, жест над ней не властен.
  if (neck.back) {
    const t = Math.min(1, (now - neck.back.t0) / NECK.backMs);
    const z = neck.back.from + (neck.back.to - neck.back.from) * ease(t);
    if (t >= 1) {
      neck.back = null;
      neck.rest = now + NECK.restMs;
      neck.strain = 0;
    }
    return { neck, zoom: z, stretch: stretchOf(z, base), worn: 1, resting: true };
  }
  const top = now < neck.rest ? zoomAt(NECK.free, base) : zoomAt(1, base);
  const z = Math.min(zoom, top);
  const stretch = stretchOf(z, base);
  if (stretch > NECK.free) {
    neck.strain += dt;
    const hold = holdFor(stretch);
    if (neck.strain >= hold) {
      neck.back = { from: z, to: base, t0: now };
      return { neck, zoom: z, stretch, worn: 1, resting: true };
    }
    return { neck, zoom: z === zoom ? undefined : z, stretch, worn: neck.strain / hold, resting: false };
  }
  // Шея отходит вдвое быстрее, чем устаёт.
  neck.strain = Math.max(0, neck.strain - dt * 2);
  return { neck, zoom: z === zoom ? undefined : z, stretch, worn: 0, resting: now < neck.rest };
}
