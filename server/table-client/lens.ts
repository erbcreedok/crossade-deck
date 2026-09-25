// ЛИНЗА СТОЛА — перспектива поверх камеры кита.
//
// Камера кита наклоняет стол СЖАТИЕМ: высота умножается на `cos(pitch)`, и всё остаётся аффинным.
// Так стол ложится, но не уходит вдаль: дальний край той же ширины, что ближний, и лёгший круг
// читается плоским овалом. Владельцу нужен стол, который уходит от него.
//
// Здесь сжатие заменено настоящим наклоном плоскости: точка стола поворачивается вокруг
// горизонтальной оси через середину стекла и делится на свою глубину. Середина стекла стоит там же,
// где у кита, — пан, зум и поворот остаются камерой кита, линза меняет только то, что делает наклон.
//
// Всё, что на столе мелкое (карта, стул), рисуется ЛОКАЛЬНОЙ матрицей в своей точке: на размере
// карты перспектива неотличима от аффинной. Большое (сукно, кромка, круг хода) — контуром из
// спроецированных точек.

import { apply, invert, type Transform } from "../../game-kit/src/core/transform.js";

type Point = { x: number; y: number };

/**
 * ФОКУС — расстояние от глаза до стекла, в высотах кадра. Меньше — сильнее уходит вдаль; больше —
 * ближе к плоскому сжатию. На 1.6 дальний край стола при наклоне в 45° примерно на треть уже ближнего.
 */
export const FOCAL = 1.6;

export interface Lens {
  /** Точка стола (и её высота над сукном, в единицах) → точка стекла. */
  toGlass(p: Point, height?: number): Point;
  /** Точка стекла → точка на сукне. */
  toDesk(q: Point): Point;
  /** Матрица, которая рядом с этой точкой стола рисует так же, как линза: для карт, стульев, стопок. */
  near(p: Point): Transform;
  /** Пикселей стекла в единице стола в этой точке — дальше мельче. */
  kAt(p: Point): number;
}

/**
 * @param view  матрица камеры кита (со сжатием) — пан, зум, поворот и `cos(pitch)`
 * @param pitch наклон, в градусах
 * @param k     пикселей в единице при нынешнем зуме
 * @param frame кадр: середина наклона и мера фокуса
 */
export function lens(view: Transform, pitch: number, k: number, frame: { w: number; h: number }, fit?: { r: number; depth: number }): Lens {
  const θ = (pitch * Math.PI) / 180;
  const cos = Math.max(0.02, Math.cos(θ));
  const sin = Math.sin(θ);
  const cx = frame.w / 2;
  const cy = frame.h / 2;
  const D = FOCAL * Math.max(1, frame.h);
  const back = invert(view);

  /** Ровный вид сверху: середина стекла — ноль, пиксели; без сжатия кита. */
  const flat = (p: Point): Point => {
    const q = apply(view, p);
    return { x: q.x - cx, y: (q.y - cy) / cos };
  };
  /** Сама перспектива, без вписывания: относительно середины стекла. */
  const raw = (p: Point, height = 0): Point => {
    const { x: u, y: v } = flat(p);
    const h = height * k;
    // Дальний край (над серединой) уходит от глаза, поднятое над сукном — к глазу и вверх экрана.
    const Y = v * cos - h * sin;
    const Z = -v * sin - h * cos;
    const s = D / Math.max(D * 0.05, D + Z);
    return { x: u * s, y: Y * s };
  };
  // ВПИСАТЬ СТОЛ ТАК ЖЕ, КАК ЕГО ВПИСЫВАЕТ КАМЕРА. Ближний край в перспективе шире дальнего и шире
  // того, что камера кита считала столом, — и вылезал за экран. Стол (с торцом) ужимается до ширины,
  // которую камера отвела ему без перспективы, и ставится серединой туда же, где она его держит.
  let f = 1;
  let sx = 0;
  let sy = 0;
  if (fit && sin > 0.001) {
    const n = 48;
    const box = (at: (p: Point, h: number) => Point) => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < n; i += 1) {
        const t = (i / n) * Math.PI * 2;
        for (const h of [0, -fit.depth]) {
          const q = at({ x: Math.cos(t) * fit.r, y: Math.sin(t) * fit.r }, h);
          x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
        }
      }
      return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0 };
    };
    const было = box((p) => { const q = apply(view, p); return { x: q.x - cx, y: q.y - cy }; });
    const стало = box(raw);
    f = Math.min(1, было.w / стало.w);
    sx = было.x - стало.x * f;
    sy = было.y - стало.y * f;
  }
  const toGlass = (p: Point, height = 0): Point => {
    const q = raw(p, height);
    return { x: cx + sx + q.x * f, y: cy + sy + q.y * f };
  };
  const toDesk = (q: Point): Point => {
    const a = (q.x - cx - sx) / f;
    const b = (q.y - cy - sy) / f;
    const v = (b * D) / (cos * D + b * sin);
    const s = D / (D - v * sin);
    const u = a / s;
    return back ? apply(back, { x: cx + u, y: cy + v * cos }) : q;
  };
  const near = (p: Point): Transform => {
    const e = 0.05;
    const o = toGlass(p);
    const dx = toGlass({ x: p.x + e, y: p.y });
    const dy = toGlass({ x: p.x, y: p.y + e });
    const a = (dx.x - o.x) / e;
    const b = (dx.y - o.y) / e;
    const c = (dy.x - o.x) / e;
    const d = (dy.y - o.y) / e;
    return { a, b, c, d, e: o.x - a * p.x - c * p.y, f: o.y - b * p.x - d * p.y };
  };
  const kAt = (p: Point): number => {
    const { y: v } = flat(p);
    return (f * k * D) / Math.max(D * 0.05, D - v * sin);
  };
  return { toGlass, toDesk, near, kAt };
}
