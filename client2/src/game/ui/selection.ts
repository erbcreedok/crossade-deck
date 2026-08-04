import { Graphics } from "pixi.js";

// ПОДСВЕТКА-АТОМ (выделение элемента/фигуры): АККУРАТНОЕ свечение вместо грубого бордера —
// широкая полупрозрачная кайма в несколько слоёв + тонкая яркая линия. Один атом на все
// применения: лок присутствия (своего и чужого), будущие выделения набора и т.п.
// Стопка выделяется как ОДНА ФИГУРА: габарит считает unionRect по всем её картам (чистая
// функция, тестируется без Pixi), рисуется один контур, а не рамка на каждой карте.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HighlightStyle {
  color: number;
  /** Отступ подсветки от габарита фигуры, px. */
  pad?: number;
  /** Скругление, px. */
  radius?: number;
  /** Общая насыщенность свечения 0..1 (домножает альфы слоёв). */
  strength?: number;
}

/** Габарит ФИГУРЫ: объединение прямоугольников всех её частей (карт стопки). */
export function unionRect(rects: readonly Rect[]): Rect | null {
  if (!rects.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Слои свечения: от широкого прозрачного к тонкому яркому. Данные, не ветки кода. */
const GLOW_LAYERS = [
  { width: 12, alpha: 0.08, spread: 5 },
  { width: 7, alpha: 0.14, spread: 2 },
  { width: 2, alpha: 0.8, spread: 0 },
] as const;

/**
 * СВЕЧЕНИЕ-НА-ЭЛЕМЕНТЕ — тот же приём, что у собственной тени: узел рисуется в ЛОКАЛЬНЫХ
 * координатах элемента (центр 0,0) и добавляется НИЖНИМ ребёнком его root — дальше оно едет,
 * наклоняется и масштабируется ВМЕСТЕ с элементом без пер-кадровой синхронизации. В стопке
 * внутренние края свечений накрыты картами выше — снаружи остаётся общий контур фигуры
 * (ровно как сливаются тени). Есть shadow — есть и glow.
 */
export function makeGlow(w: number, h: number, s: HighlightStyle): Graphics {
  const g = new Graphics();
  paintHighlight(g, { x: -w / 2, y: -h / 2, w, h }, s);
  return g;
}

export function paintHighlight(g: Graphics, r: Rect, s: HighlightStyle): void {
  const pad = s.pad ?? 6;
  const radius = s.radius ?? 12;
  const strength = s.strength ?? 1;
  for (const layer of GLOW_LAYERS) {
    const off = pad + layer.spread;
    g.roundRect(r.x - off, r.y - off, r.w + off * 2, r.h + off * 2, radius + off / 2)
      .stroke({ width: layer.width, color: s.color, alpha: layer.alpha * strength });
  }
}
