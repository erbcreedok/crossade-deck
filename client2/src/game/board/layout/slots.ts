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
