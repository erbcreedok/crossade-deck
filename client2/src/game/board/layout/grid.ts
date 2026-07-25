// Стратегия раскладки GRID — чистая геометрия сетки слотов. Одна из layout-стратегий поля слотов
// (grid/ring/points/seats, см. GRID-DESIGN.md). Ключ слота стабилен ("r,c"). Динамический подбор
// числа колонок (playGrid-порт) — отдельный модуль; здесь фиксированная геометрия по (r,c).

export interface GridSpec {
  cols: number;
  cell: { w: number; h: number };
  gap: number;
  origin: { x: number; y: number }; // левый-верх сетки (координаты контента)
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Стабильный ключ слота из координаты. */
export function keyOf(r: number, c: number): string {
  return `${r},${c}`;
}

export function coordOf(key: string): { r: number; c: number } {
  const [r, c] = key.split(",").map(Number);
  return { r: r!, c: c! };
}

/** Прямоугольник слота (левый-верх + размер): origin + шаг (cell+gap) по колонке/строке. */
export function cellRect(spec: GridSpec, r: number, c: number): Rect {
  return {
    x: spec.origin.x + c * (spec.cell.w + spec.gap),
    y: spec.origin.y + r * (spec.cell.h + spec.gap),
    w: spec.cell.w,
    h: spec.cell.h,
  };
}

/** Центр слота — движок позиционирует тела по центру. */
export function cellCenter(spec: GridSpec, r: number, c: number): { x: number; y: number } {
  const rect = cellRect(spec, r, c);
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

/** Плоский индекс → координата (row-major по cols). */
export function indexToCoord(spec: GridSpec, i: number): { r: number; c: number } {
  return { r: Math.floor(i / spec.cols), c: i % spec.cols };
}

export function coordToIndex(spec: GridSpec, r: number, c: number): number {
  return r * spec.cols + c;
}

/** Общий пиксельный размер сетки под заданное число строк. */
export function gridPixelSize(spec: GridSpec, rows: number): { w: number; h: number } {
  return {
    w: spec.cols * spec.cell.w + Math.max(0, spec.cols - 1) * spec.gap,
    h: rows * spec.cell.h + Math.max(0, rows - 1) * spec.gap,
  };
}
