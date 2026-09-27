// ПОСАДКА AR-СТОЛА — как стол сидит на своём якоре. Стол = якорь + посадка.
//
// ЯКОРЬ — то, за что стол держится в мире: гравитация перед тобой (стол ставится туда, куда смотришь)
// или предмет с меткой — картина, доска (`arFuse.ts`). Предмет даёт свою плоскость: картина на стене —
// стол на стене, доска на столе — стол лёжа; «плашмя» кладёт стол по гравитации с курсом предмета.
//
// ПОСАДКА — поправка поверх якоря, человек её подгоняет сам:
//   x, y    сдвиг по плоскости якоря: вправо и вглубь стола, в единицах стола при зуме 1;
//   tilt    наклон вокруг поперечной оси, градусы; + — дальний край поднимается к тебе;
//   zoom    размер поверх зума пальцевой камеры (поворот стола — у камеры и компаса, не здесь);
//   flat    для предмета: стол плашмя по гравитации, а не в плоскости предмета.
//
// Посадка своя у каждого якоря и живёт на устройстве. Чистая математика: `arSeat.test.ts`.

import { yawQuat, type ArPlace, type Quat } from "./arLens.js";

export interface ArSeat {
  x: number;
  y: number;
  tilt: number;
  zoom: number;
  flat: boolean;
}

export const SEAT0: Readonly<ArSeat> = Object.freeze({ x: 0, y: 0, tilt: 0, zoom: 1, flat: false });

export const SEAT_LIMITS = { tilt: 85, zoomMin: 0.2, zoomMax: 10 } as const;

type Vec = [number, number, number];

/** Место стола с посадкой: сдвиг по плоскости якоря и наклон вокруг его поперечной оси. */
export function seated(place: ArPlace, seat: ArSeat): ArPlace {
  const q = place.q ?? yawQuat(place.yaw);
  const right = rot(q, [1, 0, 0]), toMe = rot(q, [0, 0, 1]);
  const at = [0, 1, 2].map((i) => place.at[i]! + (right[i]! * seat.x - toMe[i]! * seat.y) * place.unit) as Vec;
  const h = (seat.tilt * Math.PI) / 360;
  return { ...place, at, q: mul(q, [Math.sin(h), 0, 0, Math.cos(h)]) };
}

export function clampSeat(seat: ArSeat): ArSeat {
  return {
    ...seat,
    tilt: Math.max(-SEAT_LIMITS.tilt, Math.min(SEAT_LIMITS.tilt, seat.tilt)),
    zoom: Math.max(SEAT_LIMITS.zoomMin, Math.min(SEAT_LIMITS.zoomMax, seat.zoom)),
  };
}

/** Два пальца между двумя кадрами: насколько середина ушла по вертикали, px (вниз +). Вверх — стол от тебя. */
export function tiltBy(seat: ArSeat, a0: { y: number }, b0: { y: number }, a1: { y: number }, b1: { y: number }, perPx = 0.3): ArSeat {
  return clampSeat({ ...seat, tilt: seat.tilt + ((a1.y + b1.y - a0.y - b0.y) / 2) * perPx });
}

/**
 * Предмет → стол. У метки X — вправо, Y — вверх по картинке, Z — из неё к тебе; у стола Y — нормаль,
 * Z — «ко мне». Нормаль стола — нормаль предмета, «ко мне» — к нижнему краю картинки.
 */
export function tableOnMarker(marker: Quat): Quat {
  return mul(marker, [Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
}

/** Предмет → стол плашмя: лёжа по гравитации, правый край — вдоль правого края предмета. */
export function tableFlatBy(marker: Quat): Quat {
  const r = rot(marker, [1, 0, 0]);
  return yawQuat(Math.atan2(-r[2], r[0]));
}

// ─── память ───────────────────────────────────────────────────────────────────────────────────────
export const SEATS_KEY = "crossade.table.ar.seats";

interface Shelf { getItem(key: string): string | null; setItem(key: string, value: string): void }

export function readSeat(shelf: Shelf, anchor: string): ArSeat {
  try {
    const all = JSON.parse(shelf.getItem(SEATS_KEY) || "{}") as Record<string, Partial<ArSeat>>;
    return { ...SEAT0, ...(all[anchor] ?? {}) };
  } catch {
    return { ...SEAT0 };
  }
}

export function writeSeat(shelf: Shelf, anchor: string, seat: ArSeat): void {
  try {
    const all = JSON.parse(shelf.getItem(SEATS_KEY) || "{}") as Record<string, ArSeat>;
    all[anchor] = seat;
    shelf.setItem(SEATS_KEY, JSON.stringify(all));
  } catch {
    // Без памяти посадка живёт до выхода из AR.
  }
}

function mul([ax, ay, az, aw]: Quat, [bx, by, bz, bw]: Quat): Quat {
  return [ax * bw + aw * bx + ay * bz - az * by, ay * bw + aw * by + az * bx - ax * bz, az * bw + aw * bz + ax * by - ay * bx, aw * bw - ax * bx - ay * by - az * bz];
}
function rot([qx, qy, qz, qw]: Quat, [x, y, z]: Vec): Vec {
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + (qy * tz - qz * ty), y + qw * ty + (qz * tx - qx * tz), z + qw * tz + (qx * ty - qy * tx)];
}
