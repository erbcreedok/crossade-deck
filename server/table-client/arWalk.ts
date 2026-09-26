// ХОДЬБА В AR — джойстиком. Гироскоп смотрит, джойстик ходит: стол стоит в мире, человек обходит его.
//
// Меры — УСЛОВНЫЕ МЕТРЫ: один метр — радиус стола, как бы крупно его ни растили. Дом — место у своего
// стула, где стол ставился (`place`); отсюда и меряется «далеко».
//
//   скорость      растёт с натяжкой стика: потянул сильнее — идёшь быстрее (квадратично — у малой
//                 натяжки точность, у большой разгон);
//   сопротивление до `FREE` метров его нет, дальше шаг ОТ стула тяжелеет и к `MAX` сходит на ноль;
//                 шаг К стулу не тормозит никогда — вернуться можно всегда;
//   подсказка     «дальше можно ещё N м» — только когда торможение уже идёт (за `FREE`).
//
// Чистая математика, без браузера: `arWalk.test.ts`.

export const WALK = {
  /** Столько условных метров — свободно. */
  FREE: 0.5,
  /** Дальше этого от стула не уйти. */
  MAX: 3,
  /** Скорость при полной натяжке (стик на радиусе), условных метров в секунду. */
  SPEED: 1.2,
  /** Во сколько раз можно перетянуть стик за его радиус. */
  PULL_MAX: 1.8,
  /** Насколько круто тяжелеет шаг за `FREE`: 1 — ровно, больше — мягко вначале, резко у края. */
  STIFF: 1.6,
  /**
   * Самый тяжёлый шаг перед пределом — доля свободного. Не ноль: кривая, сходящаяся к нулю, подходит к
   * пределу бесконечно, и подсказка висела на «ещё 0.1 м» — это читается как «застрял», а не «дальше нельзя».
   */
  FLOOR: 0.05,
} as const;

type V2 = { x: number; z: number };

/** Во сколько раз шаг от стула легче свободного на расстоянии `d`: 1 до `FREE`, 0 на `MAX`. */
export function ease(d: number): number {
  if (d <= WALK.FREE) return 1;
  if (d >= WALK.MAX) return 0;
  return Math.max(WALK.FLOOR, Math.pow((WALK.MAX - d) / (WALK.MAX - WALK.FREE), WALK.STIFF));
}

/** Сколько ещё можно пройти от стула; `null` — пока не тормозит и говорить нечего. */
export function leftToGo(d: number): number | null {
  return d > WALK.FREE ? Math.max(0, WALK.MAX - d) : null;
}

/**
 * Шаг ходьбы. `stick` — натяжка стика в его радиусах (x — вправо, y — вверх экрана = вперёд), `yaw` —
 * куда смотрит телефон по горизонту, радианы (вперёд = (−sin, −cos)). `pos` — где стоишь, условные метры.
 */
export function walkStep(pos: V2, stick: { x: number; y: number }, yaw: number, dt: number): V2 {
  const len = Math.hypot(stick.x, stick.y);
  if (len < 0.08 || dt <= 0) return pos;
  const pull = Math.min(len, WALK.PULL_MAX);
  const speed = WALK.SPEED * pull * pull;
  const ux = stick.x / len, uy = stick.y / len;
  // Вперёд по взгляду и вправо от него, по полу.
  const fwd = { x: -Math.sin(yaw), z: -Math.cos(yaw) }, right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  let vx = (fwd.x * uy + right.x * ux) * speed, vz = (fwd.z * uy + right.z * ux) * speed;
  // СОПРОТИВЛЕНИЕ — ТОЛЬКО ДЛЯ ШАГА ОТ СТУЛА: радиальная часть скорости наружу гасится по `ease`.
  const d = Math.hypot(pos.x, pos.z);
  if (d > 1e-6) {
    const rx = pos.x / d, rz = pos.z / d;
    const out = vx * rx + vz * rz;
    if (out > 0) {
      const k = ease(d);
      vx -= out * (1 - k) * rx;
      vz -= out * (1 - k) * rz;
    }
  }
  let next = { x: pos.x + vx * dt, z: pos.z + vz * dt };
  const nd = Math.hypot(next.x, next.z);
  if (nd > WALK.MAX) next = { x: (next.x / nd) * WALK.MAX, z: (next.z / nd) * WALK.MAX };
  return next;
}
