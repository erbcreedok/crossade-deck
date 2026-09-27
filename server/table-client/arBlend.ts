// ВХОД В AR — ПЛАВНО: стол не прыгает из обычного вида в AR, а переезжает.
//
// Экран рисует стол одним набором — матрица вида, масштаб, сжатие, поворот, высота стопок и линза, по которой
// читаются пальцы. Обычный вид и AR дают этот набор одинаково, и на входе он смешивается: `t` = 0 — обычный
// вид как был, 1 — AR. Пока AR не знает, где телефон, `t` = 0 — стол стоит, где стоял, и искать его не надо.

import type { Transform } from "../../game-kit/src/core/transform.js";
import type { Lens } from "./lens.js";

type Point = { x: number; y: number };

export interface Look {
  view: Transform;
  k: number;
  squash: number;
  rotation: number;
  rise: number;
  lens: Lens;
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const mixT = (a: Transform, b: Transform, t: number): Transform => ({ a: mix(a.a, b.a, t), b: mix(a.b, b.b, t), c: mix(a.c, b.c, t), d: mix(a.d, b.d, t), e: mix(a.e, b.e, t), f: mix(a.f, b.f, t) });
const mixP = (a: Point, b: Point, t: number): Point => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) });
/** Поворот — кратчайшей дугой: из 350° в 10° через 0, а не через 180. */
const mixTurn = (a: number, b: number, t: number): number => a + ((((b - a) % 360) + 540) % 360 - 180) * t;

/** Кубическое ускорение и торможение — как у «Выровнять». */
export const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Смесь двух видов. Концы — сами виды как есть (AR-линза со всем своим: проекцией, миром); середина —
 * смесь. Палец в середине пути читается по смешанной линзе приблизительно: переезд короткий.
 */
export function blendLook<A extends Look>(flat: Look, ar: A, t: number): Look | A {
  if (t >= 1) return ar;
  if (t <= 0) return flat;
  const lens: Lens = {
    toGlass: (p, h) => mixP(flat.lens.toGlass(p, h), ar.lens.toGlass(p, h), t),
    toDesk: (q) => (t < 0.5 ? flat.lens.toDesk(q) : ar.lens.toDesk(q)),
    near: (p) => mixT(flat.lens.near(p), ar.lens.near(p), t),
    kAt: (p) => mix(flat.lens.kAt(p), ar.lens.kAt(p), t),
  };
  return {
    view: mixT(flat.view, ar.view, t),
    k: mix(flat.k, ar.k, t),
    squash: mix(flat.squash, ar.squash, t),
    rotation: mixTurn(flat.rotation, ar.rotation, t),
    rise: mix(flat.rise, ar.rise, t),
    lens,
  };
}
