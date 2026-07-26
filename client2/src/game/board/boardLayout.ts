import { gridSlots, ringSlots, type PositionedSlot } from "./layout/slots";
import type { Rect } from "./layout/grid";
import type { BoardPreset } from "./boardPresets";

// Чистая геометрия борда из пресета: стратегия раскладки (grid/ring) → позиционированные слоты +
// рамка контейнера. Вынесено из движка (шаг к BoardFactory) — тестируется без Pixi.
export interface BoardLayoutOpts {
  left: number;
  top: number; // верх заголовка; слоты начинаются ниже (gy)
  cardW: number;
  cardH: number;
}

export function layoutForPreset(preset: BoardPreset, o: BoardLayoutOpts): { positioned: PositionedSlot[]; bounds: Rect } {
  const gap = 8;
  const gy = o.top + 22;
  if (preset.layout === "ring") {
    const cell = { w: o.cardW * 0.82, h: o.cardH * 0.82 };
    const radius = o.cardH * 1.35;
    const cx = o.left + radius + cell.w / 2;
    const cy = gy + radius + cell.h / 2;
    const positioned = ringSlots(preset.ringCount ?? 8, { cx, cy, radius, cell });
    const d = 2 * radius + cell.w;
    return { positioned, bounds: { x: o.left, y: gy, w: d, h: d } };
  }
  const cell = { w: o.cardW * 1.15, h: o.cardH * 1.02 };
  const positioned = gridSlots({ cols: preset.cols, cell, gap, origin: { x: o.left, y: gy } }, preset.rows);
  const bounds = { x: o.left, y: gy, w: preset.cols * cell.w + (preset.cols - 1) * gap, h: preset.rows * cell.h + (preset.rows - 1) * gap };
  return { positioned, bounds };
}
