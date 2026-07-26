import { coordOf, keyOf, type Rect } from "./layout/grid";
import type { PositionedSlot } from "./layout/slots";

// Динамический грид — растёт в ЛЮБУЮ сторону в зависимости от контента. Занятые ячейки задают
// рамку; ФРОНТИР — пустые ячейки, соседние занятым (куда можно поставить, и грид подрастёт).
// Раскладка ре-центрируется по минимальным r,c (рост влево/вверх сдвигает контент). Чисто.

function neighbors(r: number, c: number): string[] {
  return [keyOf(r - 1, c), keyOf(r + 1, c), keyOf(r, c - 1), keyOf(r, c + 1)];
}

/** Пустые ячейки, соседние занятым (куда можно поставить). Пустой грид → одна старт-ячейка 0,0. */
export function frontierCells(occupied: string[]): string[] {
  if (occupied.length === 0) return [keyOf(0, 0)];
  const occ = new Set(occupied);
  const out = new Set<string>();
  for (const key of occupied) {
    const { r, c } = coordOf(key);
    for (const n of neighbors(r, c)) if (!occ.has(n)) out.add(n);
  }
  return [...out];
}

export interface DynGeom {
  cell: { w: number; h: number };
  gap: number;
  origin: { x: number; y: number };
}

/** Позиции для заданных ячеек, ре-центрированные: минимальные r,c → origin. */
export function dynamicSlots(cells: string[], g: DynGeom): PositionedSlot[] {
  if (cells.length === 0) return [];
  const coords = cells.map((k) => ({ key: k, ...coordOf(k) }));
  const minR = Math.min(...coords.map((c) => c.r));
  const minC = Math.min(...coords.map((c) => c.c));
  return coords.map(({ key, r, c }) => {
    const rect: Rect = { x: g.origin.x + (c - minC) * (g.cell.w + g.gap), y: g.origin.y + (r - minR) * (g.cell.h + g.gap), w: g.cell.w, h: g.cell.h };
    return { key, rect, center: { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 } };
  });
}
