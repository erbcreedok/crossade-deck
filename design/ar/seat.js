// ПОСАДКА — как стол сидит на своём якоре. Стол = якорь + посадка.
//
// Якорь — то, за что стол держится в мире: гравитация перед тобой (ГИРО) или предмет с меткой
// (картина, доска). Посадка — поправка поверх него, её человек подгоняет сам в режиме «подогнать»:
//
//   x, y   сдвиг в плоскости якоря, в его единицах (ширина метки);
//   yaw    поворот вокруг нормали якоря, градусы;
//   tilt   наклон вокруг поперечной оси стола (уже повёрнутого на `yaw`), градусы; + — верх к тебе;
//   scale  масштаб поверх `tableScale`;
//   flat   для метки: стол ложится плашмя по гравитации, а не в плоскость предмета.
//
// Посадка своя у каждого якоря и живёт на устройстве. Чистая математика, без three.

export const SEAT0 = Object.freeze({ x: 0, y: 0, yaw: 0, tilt: 0, scale: 1, flat: false });

export const SEAT_LIMITS = { tilt: 85, scaleMin: 0.2, scaleMax: 10 };

const D = Math.PI / 180;

/** Посадка → матрица в координатах якоря (column-major): T(x, y, 0) · Rz(yaw) · Rx(tilt) · S(scale). */
export function seatLocal(seat) {
  const a = seat.yaw * D, b = seat.tilt * D, s = seat.scale;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  // Rz·Rx по столбцам: X = (ca, sa, 0), Y = (−sa·cb, ca·cb, sb), Z = (sa·sb, −ca·sb, cb)
  return [
    ca * s, sa * s, 0, 0,
    -sa * cb * s, ca * cb * s, sb * s, 0,
    sa * sb * s, -ca * sb * s, cb * s, 0,
    seat.x, seat.y, 0, 1,
  ];
}

export function clampSeat(seat) {
  return {
    ...seat,
    tilt: Math.max(-SEAT_LIMITS.tilt, Math.min(SEAT_LIMITS.tilt, seat.tilt)),
    scale: Math.max(SEAT_LIMITS.scaleMin, Math.min(SEAT_LIMITS.scaleMax, seat.scale)),
    yaw: ((((seat.yaw + 180) % 360) + 360) % 360) - 180,
  };
}

/**
 * Два пальца между двумя кадрами: поворот (радианы, экран y вниз — по часовой +), во сколько раз
 * разошлись и насколько середина ушла по вертикали (px, вниз +).
 */
export function twoFinger(a0, b0, a1, b1) {
  const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  let turn = ang(a1, b1) - ang(a0, b0);
  turn = Math.atan2(Math.sin(turn), Math.cos(turn));
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y), d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
  return { turn, ratio: d0 > 1 ? d1 / d0 : 1, dy: (a1.y + b1.y - a0.y - b0.y) / 2 };
}

/**
 * Жест двумя пальцами → новая посадка. `facing` — якорь смотрит на камеру лицом: тогда поворот
 * пальцев по часовой крутит стол по часовой на экране (вокруг нормали это «−»).
 * Пальцы вверх — стол наклоняется от тебя.
 */
export function applyTwo(seat, g, facing, tiltPerPx = 0.3) {
  return clampSeat({
    ...seat,
    yaw: seat.yaw + (facing ? -1 : 1) * (g.turn / D),
    scale: seat.scale * g.ratio,
    tilt: seat.tilt + g.dy * tiltPerPx,
  });
}

/**
 * Луч из камеры → точка в плоскости якоря (z = 0 в его координатах). `inv` — обратная матрица якоря
 * (column-major), `o` и `d` — начало и направление луча в мире. `null` — луч вдоль плоскости или от неё.
 */
export function planeHit(inv, o, d) {
  const apply = (p, w) => [0, 1, 2].map((r) => inv[r] * p[0] + inv[4 + r] * p[1] + inv[8 + r] * p[2] + inv[12 + r] * w);
  const lo = apply(o, 1), ld = apply(d, 0);
  if (Math.abs(ld[2]) < 1e-9) return null;
  const t = -lo[2] / ld[2];
  if (t <= 0) return null;
  return [lo[0] + ld[0] * t, lo[1] + ld[1] * t];
}

// ─── память ───────────────────────────────────────────────────────────────────────────────────────
export const SEATS_KEY = "ar-stand-seats";

export function readSeat(storage, key) {
  try {
    const all = JSON.parse(storage.getItem(SEATS_KEY) || "{}");
    return all[key] ? { ...SEAT0, ...all[key] } : { ...SEAT0 };
  } catch {
    return { ...SEAT0 };
  }
}

export function writeSeat(storage, key, seat) {
  try {
    const all = JSON.parse(storage.getItem(SEATS_KEY) || "{}");
    all[key] = seat;
    storage.setItem(SEATS_KEY, JSON.stringify(all));
  } catch {
    // Без памяти посадка живёт до перезагрузки.
  }
}
