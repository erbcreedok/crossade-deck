// ГЕОМЕТРИЯ ОБЛАСТЕЙ СЦЕНЫ — чистые вычисления «что под точкой» и «что светить» (стиль проекта:
// правила отдельно от рисования; сцена только обводит готовую фигуру). Без Pixi и состояния.

import type { Rect } from "./freeBox";
import { freeStackSize, type Size } from "./freeDrop";
import { baseZoneId, slotKey, slotOf, zoneOf, type ZoneSpec } from "./spec";

export type MenuTargetKind = "board" | "table";

/** Цель контекстного меню под точкой: НЕ-free зона (грид-стол) → "table"; free-бокс → "board".
 *  Область зоны — ОБЪЕДИНЕНИЕ её ячеек (у фикс-слотов «стол» — вся рамка, не первая клетка);
 *  самая внутренняя (меньшая) цель побеждает — грид лежит в центре бокса. */
export function menuTargetAt(
  zones: readonly ZoneSpec[],
  cellRects: Readonly<Record<string, Rect>>,
  cp: { x: number; y: number },
): MenuTargetKind | null {
  let best: { kind: MenuTargetKind; area: number } | null = null;
  for (const zone of zones) {
    let r: { x0: number; y0: number; x1: number; y1: number } | null = null;
    for (const [key, cell] of Object.entries(cellRects)) {
      if (baseZoneId(zoneOf(key)) !== zone.id) continue;
      r = r
        ? { x0: Math.min(r.x0, cell.x), y0: Math.min(r.y0, cell.y), x1: Math.max(r.x1, cell.x + cell.w), y1: Math.max(r.y1, cell.y + cell.h) }
        : { x0: cell.x, y0: cell.y, x1: cell.x + cell.w, y1: cell.y + cell.h };
    }
    if (!r || cp.x < r.x0 || cp.x > r.x1 || cp.y < r.y0 || cp.y > r.y1) continue;
    const kind: MenuTargetKind = zone.layout.kind === "free" ? "board" : "table";
    const area = (r.x1 - r.x0) * (r.y1 - r.y0);
    if (!best || area < best.area) best = { kind, area };
  }
  return best?.kind ?? null;
}

/** Фигура подсветки цели дропа: круг или скруглённый прямоугольник (сцена только обводит). */
export type HintShape = { kind: "circle"; cx: number; cy: number; r: number } | { kind: "rect"; x: number; y: number; w: number; h: number };

/**
 * Что светить под пальцем. Приоритет free-зоны: псевдо-слот «zone:box» — весь бокс (круг/квадрат),
 * реальный слот (колода/свободная стопка) — её футпринт; прочие зоны — ячейка формой зоны;
 * слот без ячейки (рука) — карточный прямоугольник у origin.
 */
export function hintShape(args: {
  hotSlot: string;
  zone: ZoneSpec | undefined;
  cellRects: Readonly<Record<string, Rect>>;
  origins: Readonly<Record<string, { x: number; y: number }>>;
  members: number;
  card: Size;
}): HintShape | null {
  const { hotSlot, zone, cellRects, origins, members, card } = args;
  if (zone?.layout.kind === "free") {
    if (slotOf(hotSlot) === "box") {
      const box = cellRects[slotKey(zone.id, 0)];
      if (!box) return null;
      if (zone.shape === "circle") return { kind: "circle", cx: box.x + box.w / 2, cy: box.y + box.h / 2, r: Math.min(box.w, box.h) / 2 + 3 };
      return { kind: "rect", x: box.x - 2, y: box.y - 2, w: box.w + 4, h: box.h + 4 };
    }
    const at = origins[hotSlot];
    if (!at) return null;
    const s = freeStackSize(card, Math.max(1, members));
    return { kind: "rect", x: at.x - 3, y: at.y - 3, w: s.w + 6, h: s.h + 6 };
  }
  const r = cellRects[hotSlot];
  if (r) {
    if (zone?.shape === "circle") return { kind: "circle", cx: r.x + r.w / 2, cy: r.y + r.h / 2, r: Math.min(r.w, r.h) / 2 + 3 };
    return { kind: "rect", x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 };
  }
  const at = origins[hotSlot];
  if (!at) return null;
  return { kind: "rect", x: at.x - 4, y: at.y - 4, w: card.w + 8, h: card.h + 8 };
}
