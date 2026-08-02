import { cellCenter, cellRect, keyOf, type GridSpec, type Rect } from "./grid";

// Позиционированный слот — ЕДИНЫЙ результат любой стратегии раскладки (grid/ring/points/seats).
// BoardZone потребляет список таких слотов, не зная стратегии — раскладка стала подключаемой.
export interface PositionedSlot {
  key: string;
  rect: Rect;
  center: { x: number; y: number };
}

/** Раскладка GRID: rows×cols прямоугольных слотов. */
export function gridSlots(spec: GridSpec, rows: number): PositionedSlot[] {
  const out: PositionedSlot[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < spec.cols; c++) out.push({ key: keyOf(r, c), rect: cellRect(spec, r, c), center: cellCenter(spec, r, c) });
  }
  return out;
}

/** Раскладка RING (монополия/круговой ход): n слотов по окружности, старт сверху (угол -90°). */
export function ringSlots(count: number, o: { cx: number; cy: number; radius: number; cell: { w: number; h: number } }): PositionedSlot[] {
  const out: PositionedSlot[] = [];
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i / count) * Math.PI * 2;
    const center = { x: o.cx + o.radius * Math.cos(a), y: o.cy + o.radius * Math.sin(a) };
    out.push({ key: `ring${i}`, rect: { x: center.x - o.cell.w / 2, y: center.y - o.cell.h / 2, w: o.cell.w, h: o.cell.h }, center });
  }
  return out;
}

/**
 * Раскладка HEX (соты): ряды со сдвигом на полклетки, чётные ряды короче на один.
 *
 * Третья стратегия нужна не для красоты: сетка и кольцо — это «клетки в решётке» и «клетки по
 * кругу», а соты — «у клетки шесть соседей», и именно на них видно, что зона про раскладку ничего
 * не знает. Ей приходит готовый список слотов, и правила приёма от формы поля не зависят.
 *
 * Шаг по вертикали — 3/4 высоты клетки: у сот ряды заходят друг под друга, иначе между ними
 * остаётся полоса пустого поля и «соты» читаются как обычная сетка со сдвигом.
 */
export function hexSlots(cols: number, rows: number, o: { cell: { w: number; h: number }; origin: { x: number; y: number }; gap?: number }): PositionedSlot[] {
  const gap = o.gap ?? 0;
  const stepX = o.cell.w + gap;
  const stepY = (o.cell.h + gap) * 0.75;
  const out: PositionedSlot[] = [];
  for (let r = 0; r < rows; r++) {
    const odd = r % 2 === 1;
    const n = odd ? Math.max(1, cols - 1) : cols;
    for (let c = 0; c < n; c++) {
      const x = o.origin.x + c * stepX + (odd ? stepX / 2 : 0);
      const y = o.origin.y + r * stepY;
      out.push({ key: keyOf(r, c), rect: { x, y, w: o.cell.w, h: o.cell.h }, center: { x: x + o.cell.w / 2, y: y + o.cell.h / 2 } });
    }
  }
  return out;
}
