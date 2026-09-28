// ШЕЯ — КАМЕРА ЭТО ГОЛОВА. Зум и есть высота головы над столом: в покое позы (`baseZoom`) голова на `up` выше
// плеч, дальше покоя — голова не поднимается, ближе — опускается к столу, но не ниже `HEAD.min`: это и есть
// предел зума. Чуть нагнулся (`NECK.free`) — сколько угодно; сильнее — недолго (`holdFor`), потом камера
// сама отъезжает к позе за `backMs`, и шея `restMs` отдыхает: нагнуться снова дальше свободного нельзя.
// Сидя отъехал дальше позы стоя — встал (`risesAt`).
//
// Чистые числа: экран приносит зум, позу и время, шея говорит, какой зум поставить, где голова и сколько
// осталось терпеть.

import { HEAD, NECK, STANCE_ZOOM, holdFor, restHead, type Stance } from "../src/table/bodies.js";

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

/** Зум позы: `home` — зум, при котором сидящий смотрит с головой в покое (у веба — вид со стула). */
export const baseZoom = (stance: Stance, home = 1): number => home * STANCE_ZOOM[stance];

/** Сидя отъехал дальше этого — встал: дальше позы стоя сидя не отодвинуться. */
export const risesAt = (home = 1): number => baseZoom("stand", home);

/** Высота головы над столом при этом зуме: не выше покоя, не ниже `HEAD.min`. */
export function headAt(zoom: number, base: number, stance: Stance): number {
  const rest = restHead(stance);
  return Math.max(HEAD.min, Math.min(rest, (rest * base) / Math.max(1e-6, zoom)));
}

/** Насколько нагнулся при этом зуме: 0 — голова в покое, 1 — на `HEAD.min`. */
export function stretchOf(zoom: number, base: number, stance: Stance): number {
  const rest = restHead(stance);
  return Math.max(0, Math.min(1, (rest - headAt(zoom, base, stance)) / (rest - HEAD.min)));
}

/** Зум при таком нагибе. */
export function zoomAt(stretch: number, base: number, stance: Stance): number {
  const rest = restHead(stance);
  return (rest * base) / (rest - stretch * (rest - HEAD.min));
}

export interface NeckStep {
  neck: Neck;
  /** Поставить камере этот зум; нет — зум как есть. */
  zoom?: number;
  /** Нагиб сейчас. */
  stretch: number;
  /** Сколько вытерплено: 0 — свободно, 1 — сейчас отъедет. */
  worn: number;
  resting: boolean;
}

const ease = (t: number): number => 1 - (1 - t) ** 3;

export function neckStep(was: Neck, now: number, zoom: number, base: number, stance: Stance): NeckStep {
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
    return { neck, zoom: z, stretch: stretchOf(z, base, stance), worn: 1, resting: true };
  }
  const top = now < neck.rest ? zoomAt(NECK.free, base, stance) : zoomAt(1, base, stance);
  const z = Math.min(zoom, top);
  const stretch = stretchOf(z, base, stance);
  if (stretch > NECK.free + 1e-9) {
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
