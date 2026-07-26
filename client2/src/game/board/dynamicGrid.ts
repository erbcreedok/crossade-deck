// Динамический FLOW-грид: карты пакуются по СВОЕМУ индексу в прямоугольник. Минимум колонок и
// РЕЗЕРВ места под следующую карту — параметры. Чистые функции.

export interface FlowGeom {
  cell: { w: number; h: number };
  gap: number;
  origin: { x: number; y: number };
}

export interface FlowOpts {
  minCols?: number; // минимум колонок (грид не уже этого)
  maxRows?: number; // максимум строк — при упоре грид растёт КОЛОНКАМИ, а не вниз
  reserve?: boolean; // всегда держать место под ещё одну карту (визуально пустой слот в конце)
}

// Раскладка count карт: центры карт + габарит грида (с учётом minCols/maxRows и резерва). Число
// колонок — по «отображаемому» количеству (count + резерв), не меньше minCols; при упоре в maxRows
// колонок добавляем (растём вширь, а не вниз).
export function flowLayout(count: number, g: FlowGeom, o: FlowOpts = {}): { centers: Array<{ x: number; y: number }>; size: { w: number; h: number }; cols: number; rows: number } {
  const displayN = Math.max(1, count + (o.reserve ? 1 : 0));
  let cols = Math.max(o.minCols ?? 1, Math.ceil(Math.sqrt(displayN)));
  let rows = Math.ceil(displayN / cols);
  if (o.maxRows && rows > o.maxRows) {
    cols = Math.max(o.minCols ?? 1, Math.ceil(displayN / o.maxRows)); // упор в строки → шире
    rows = Math.ceil(displayN / cols);
  }
  const centers = Array.from({ length: Math.max(0, count) }, (_, i) => ({
    x: g.origin.x + (i % cols) * (g.cell.w + g.gap) + g.cell.w / 2,
    y: g.origin.y + Math.floor(i / cols) * (g.cell.h + g.gap) + g.cell.h / 2,
  }));
  const size = { w: cols * g.cell.w + (cols - 1) * g.gap, h: rows * g.cell.h + (rows - 1) * g.gap };
  return { centers, size, cols, rows };
}

// Индекс ячейки под точкой cp в гриде из cols колонок и count карт (для реордера: куда встанет
// перетаскиваемая). Колонка/ряд по позиции, зажаты в границы; итог зажат в [0, count-1].
export function flowIndexAt(cp: { x: number; y: number }, g: FlowGeom, cols: number, count: number): number {
  if (count <= 0) return 0;
  const col = Math.max(0, Math.min(cols - 1, Math.floor((cp.x - g.origin.x) / (g.cell.w + g.gap))));
  const rows = Math.max(1, Math.ceil(count / cols));
  const row = Math.max(0, Math.min(rows - 1, Math.floor((cp.y - g.origin.y) / (g.cell.h + g.gap))));
  return Math.min(count - 1, row * cols + col);
}
