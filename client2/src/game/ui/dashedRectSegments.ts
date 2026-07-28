// Геометрия пунктирной рамки прямоугольника — независимые отрезки по периметру. Pixi v8 Graphics
// не умеет dash-паттерн сам (см. DropZone.draw) — считаем отрезки чистой функцией, рисующий код
// просто идёт moveTo/lineTo по каждому. Углы НЕ скругляем (в отличие от сплошной hot-рамки) —
// дешёвый пунктир на невысокой кнопке-зоне важнее скруглений.

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function dashedRectSegments(x: number, y: number, w: number, h: number, dash: number, gap: number): Segment[] {
  const sides: [number, number, number, number][] = [
    [x, y, x + w, y],
    [x + w, y, x + w, y + h],
    [x + w, y + h, x, y + h],
    [x, y + h, x, y],
  ];
  const step = dash + gap;
  const out: Segment[] = [];
  for (const [x1, y1, x2, y2] of sides) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len <= 0 || step <= 0) continue;
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    for (let s = 0; s < len; s += step) {
      const e = Math.min(s + dash, len);
      out.push({ x1: x1 + ux * s, y1: y1 + uy * s, x2: x1 + ux * e, y2: y1 + uy * e });
    }
  }
  return out;
}
