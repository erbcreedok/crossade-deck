// Динамический FLOW-грид: карты пакуются по СВОЕМУ индексу в прямоугольник. Минимум колонок и
// РЕЗЕРВ места под следующую карту — параметры. Чистые функции.

export interface FlowGeom {
  cell: { w: number; h: number };
  gap: number;
  origin: { x: number; y: number };
}

export interface FlowOpts {
  minCols?: number; // минимум колонок (грид не уже этого)
  reserve?: boolean; // всегда держать место под ещё одну карту (визуально пустой слот в конце)
}

// Раскладка count карт: центры карт + габарит грида (с учётом minCols и резерва). Число колонок
// считается по «отображаемому» количеству (count + резерв), но не меньше minCols; строки — под него.
export function flowLayout(count: number, g: FlowGeom, o: FlowOpts = {}): { centers: Array<{ x: number; y: number }>; size: { w: number; h: number }; cols: number; rows: number } {
  const displayN = Math.max(1, count + (o.reserve ? 1 : 0));
  const cols = Math.max(o.minCols ?? 1, Math.ceil(Math.sqrt(displayN)));
  const rows = Math.ceil(displayN / cols);
  const centers = Array.from({ length: Math.max(0, count) }, (_, i) => ({
    x: g.origin.x + (i % cols) * (g.cell.w + g.gap) + g.cell.w / 2,
    y: g.origin.y + Math.floor(i / cols) * (g.cell.h + g.gap) + g.cell.h / 2,
  }));
  const size = { w: cols * g.cell.w + (cols - 1) * g.gap, h: rows * g.cell.h + (rows - 1) * g.gap };
  return { centers, size, cols, rows };
}
