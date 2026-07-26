// Динамический FLOW-грид: карты НЕ имеют фиксированных ячеек — они пакуются по СВОЕМУ индексу в
// компактный прямоугольник, растущий под контент (1→1×1, 2→1×2, 3→1×3, 4→2×2, 5-6→2×3, 9→3×3…).
// При добавлении/удалении карты все переезжают по индексу. Чистые функции.

export interface FlowGeom {
  cell: { w: number; h: number };
  gap: number;
  origin: { x: number; y: number };
}

/** Размеры компактной паковки под n карт: rows=floor(√n), cols=ceil(n/rows). */
export function packDims(n: number): { rows: number; cols: number } {
  if (n <= 0) return { rows: 0, cols: 0 };
  const rows = Math.max(1, Math.floor(Math.sqrt(n)));
  const cols = Math.ceil(n / rows);
  return { rows, cols };
}

/** Центр каждой из n карт по её индексу (row-major в паковке). */
export function flowCenters(n: number, g: FlowGeom): Array<{ x: number; y: number }> {
  const { cols } = packDims(n);
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    return { x: g.origin.x + c * (g.cell.w + g.gap) + g.cell.w / 2, y: g.origin.y + r * (g.cell.h + g.gap) + g.cell.h / 2 };
  });
}

/** Габарит грида (для dashed-рамки). Пустой грид — минимум 1×1 (есть куда дропнуть). */
export function flowSize(n: number, g: FlowGeom): { w: number; h: number } {
  const { rows, cols } = packDims(Math.max(1, n));
  return { w: cols * g.cell.w + (cols - 1) * g.gap, h: rows * g.cell.h + (rows - 1) * g.gap };
}
