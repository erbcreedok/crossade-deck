// Пунктир по ОКРУЖНОСТИ: Pixi v8 сам dash не умеет (как и для прямоугольника —
// dashedRectSegments), поэтому дуги считает чистая функция, а сцена лишь обводит их.
// Штрих/зазор заданы в ПИКСЕЛЯХ длины дуги и пересчитываются в углы через радиус;
// целое число штрихов подгоняется под круг, чтобы пунктир замыкался без обрубка.

export interface Arc {
  start: number; // радианы
  end: number;
}

export function dashedCircleArcs(radius: number, dash = 12, gap = 9): Arc[] {
  if (radius <= 0 || dash <= 0) return [];
  const circumference = 2 * Math.PI * radius;
  const period = dash + gap;
  const count = Math.max(1, Math.round(circumference / period));
  const dashAngle = (dash / period) * ((2 * Math.PI) / count);
  const out: Arc[] = [];
  for (let i = 0; i < count; i++) {
    const start = (i / count) * 2 * Math.PI;
    out.push({ start, end: start + dashAngle });
  }
  return out;
}
