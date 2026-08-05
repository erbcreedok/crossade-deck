// ОБЩЕЕ ДЕРЕВА БОРДЫ: типы, константы компоновки и хвост сборки (finish) — делят композиторы
// (zoneSubtrees, roundTableTree, полосная компоновка boardTree). Чистая геометрия, без Pixi.

import { absolute } from "../../slot/layouts";
import { dropTarget, figures, homeOf as leafHomeOf, measure } from "../../slot/slot";
import { group, type Group, type Size, type Slot, type Vec } from "../../slot/types";

export const GAP = { x: 24, y: 30 };
export const MARGIN = { x: 40, y: 30 };
export const SEAT_LABEL_H = 22;

/** Ячейка чужого места: ряд рубашек/фишек внахлёст. */
export const SEAT_CELL: Size = { w: 200, h: 84 };
export const SEAT_STACK_DX = 24;

/** Локальные позиции свободных зон (держит СЦЕНА, дерево лишь читает): сдвиг колоды-блока по
 *  зоне + центры свободных стопок по слотам (бокс-локальные координаты). Позиции — визуал этого
 *  клиента (как cardFx); чужой клиент без них увидит стопку в центре бокса. */
export interface FreePositions {
  readonly offset: Readonly<Record<string, Vec>>;
  readonly loose: Readonly<Record<string, Vec>>;
}

export interface BoardTree {
  readonly root: Group;
  readonly size: Size;
  readonly origins: Readonly<Record<string, Vec>>;
  /** Прямоугольники клеток зон с фоном (шахматная раскраска) — рисует сцена. */
  readonly cellRects: Readonly<Record<string, { x: number; y: number; w: number; h: number }>>;
  homeOf(cardId: string): Vec | null;
  slotOf(cardId: string): string | null;
  slotAt(cp: Vec): string | null;
}

export interface Placed {
  id: string;
  origin: Vec;
  slot: Slot;
}

/** Хвост сборки: одно дерево (absolute-раскладка по origin'ам) → индекс слотов, габарит, порт
 *  запросов дерева. Общий для обеих компоновок (полосы-строки и круглый стол). */
export function finish(placed: Placed[], cellRects: Record<string, { x: number; y: number; w: number; h: number }>, hint: Size): BoardTree {
  const root = group(
    "board-root",
    absolute(placed.map((p) => p.origin)),
    placed.map((p) => p.slot),
  );
  const origins: Record<string, Vec> = {};
  const slotIndex = new Map<string, string>();
  placed.forEach((p) => {
    origins[p.id] = p.origin;
    figures(p.slot).forEach((id) => slotIndex.set(id, p.id));
  });
  const measured = measure(root);
  const size = { w: Math.max(measured.w + MARGIN.x, hint.w), h: Math.max(measured.h + MARGIN.y, hint.h) };
  return {
    root,
    size,
    origins,
    cellRects,
    homeOf: (id) => leafHomeOf(root, id),
    slotOf: (id) => slotIndex.get(id) ?? null,
    slotAt: (cp) => dropTarget(root, cp)?.group.id ?? null,
  };
}

