// Динамический FLOW-грид: карты пакуются по СВОЕМУ индексу в прямоугольник. Размер грида задаётся
// СИММЕТРИЧНО — границы min/max по ОБЕИМ осям (фикс = min==max) + направление роста. Чистые функции.

export interface FlowGeom {
  cell: { w: number; h: number };
  gap: number;
  origin: { x: number; y: number };
}

export interface Bound {
  min?: number; // нижняя граница (по умолчанию 1)
  max?: number; // верхняя граница (по умолчанию без предела); min==max → фиксированное число
}

export interface GridSpec {
  cols?: Bound; // ограничения по колонкам
  rows?: Bound; // ограничения по строкам
  grow?: "square" | "down" | "right"; // куда растёт при свободе (по умолчанию square — балансируем)
  reserve?: boolean; // держать место под ещё одну карту (пустой слот в конце)
}

// Выбрать число колонок/строк под count карт с учётом границ и направления роста. Политика
// переполнения: если карт больше вместимости (обе оси на максимуме) — max МЯГКИЙ, грид перерастает
// (карту не теряем). Всегда cols*rows ≥ count(+резерв), cols≥1, rows≥1.
export function packGrid(count: number, spec: GridSpec = {}): { cols: number; rows: number } {
  const n = Math.max(1, count + (spec.reserve ? 1 : 0));
  const cMin = spec.cols?.min ?? 1;
  const cMax = spec.cols?.max ?? Infinity;
  const rMin = spec.rows?.min ?? 1;
  const rMax = spec.rows?.max ?? Infinity;
  const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(v, hi));
  const grow = spec.grow ?? "square";

  // Стартовое число колонок по направлению роста: down → минимум (растём вниз), right → максимум
  // строк заполнено (растём вправо), square → квадратно (ceil√n).
  let cols = grow === "down" ? cMin : grow === "right" ? Math.ceil(n / rMin) : Math.ceil(Math.sqrt(n));
  cols = clamp(cols, cMin, cMax);
  let rows = Math.max(rMin, Math.ceil(n / cols));

  // Упор в макс. строк → добираем колонками (в пределах cMax). Если и колонки уперлись в cMax, а карт
  // всё равно больше — rows перерастает rMax (мягкий max), карту не теряем.
  if (rows > rMax) {
    cols = clamp(Math.ceil(n / rMax), cMin, cMax);
    rows = Math.max(rMin, Math.ceil(n / cols));
  }
  return { cols, rows };
}

// Раскладка count карт: центры карт + габарит грида. Число колонок/строк — из packGrid(spec).
export function flowLayout(count: number, g: FlowGeom, spec: GridSpec = {}): { centers: Array<{ x: number; y: number }>; size: { w: number; h: number }; cols: number; rows: number } {
  const { cols, rows } = packGrid(count, spec);
  const centers = Array.from({ length: Math.max(0, count) }, (_, i) => ({
    x: g.origin.x + (i % cols) * (g.cell.w + g.gap) + g.cell.w / 2,
    y: g.origin.y + Math.floor(i / cols) * (g.cell.h + g.gap) + g.cell.h / 2,
  }));
  const size = { w: cols * g.cell.w + (cols - 1) * g.gap, h: rows * g.cell.h + (rows - 1) * g.gap };
  return { centers, size, cols, rows };
}

// Индекс ВСТАВКИ под точкой cp в гриде из cols колонок × rows строк ОТОБРАЖЕНИЯ (с учётом резерва) и
// count карт. Колонка/ряд по позиции, зажаты в сетку; итог — в [0, count] ВКЛЮЧИТЕЛЬНО, т.е. точка за
// последней картой (в резервном слоте) даёт count → вставка В КОНЕЦ (append), а не «между».
export function flowIndexAt(cp: { x: number; y: number }, g: FlowGeom, cols: number, rows: number, count: number): number {
  if (count <= 0) return 0;
  const col = Math.max(0, Math.min(cols - 1, Math.floor((cp.x - g.origin.x) / (g.cell.w + g.gap))));
  const row = Math.max(0, Math.min(Math.max(1, rows) - 1, Math.floor((cp.y - g.origin.y) / (g.cell.h + g.gap))));
  return Math.min(count, row * cols + col);
}
