// ДРОП НА СВОБОДНОЕ ПОЛЕ (zone.layout.kind === "free") — чистые правила, без Pixi и состояния:
// куда ложится свободная стопка, какой ключ ей выдать и какой СТОРОНОЙ ложится карта.
// Владелец: карта, брошенная в круг стола, остаётся ГДЕ и КАК положили; в колоду из руки/центра —
// по направлению колоды, из стола — той стороной, которой лежала (одна перевёрнутая в колоде — ок).

import type { Rect, Vec } from "./freeBox";
import { slotKey, slotOf, zoneOf } from "../core/spec";

export interface Size {
  w: number;
  h: number;
}

/** Разбег стаггера свободной стопки (px на карту) — общий для дерева, сцены и подсветки. */
export const FREE_STAGGER = 0.5;

/** Футпринт свободной стопки из n карт (карта + разбег стаггера). */
export function freeStackSize(card: Size, count: number): Size {
  const spread = FREE_STAGGER * Math.max(0, count - 1);
  return { w: card.w + spread, h: card.h + spread };
}

/** Точка внутри бокса зоны с учётом ФОРМЫ: у круга считается вписанный круг, не квадрат. */
export function insideBox(box: Rect, shape: "rect" | "circle" | undefined, p: Vec): boolean {
  if (p.x < box.x || p.x > box.x + box.w || p.y < box.y || p.y > box.y + box.h) return false;
  if (shape !== "circle") return true;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const r = Math.min(box.w, box.h) / 2;
  return (p.x - cx) ** 2 + (p.y - cy) ** 2 <= r * r;
}

/** Ключ под НОВУЮ свободную стопку: минимальный индекс ≥ 1 (0 — колода), не занятый в поле. */
export function nextLooseKey(zone: string, taken: readonly string[]): string {
  const used = new Set(taken.filter((k) => zoneOf(k) === zone).map((k) => Number(slotOf(k))));
  let i = 1;
  while (used.has(i)) i++;
  return slotKey(zone, i);
}

/** Верхний-левый угол стопки по точке дропа (её центру); стопка целиком в боксе (координаты бокса). */
export function looseOrigin(box: Size, center: Vec, stack: Size): Vec {
  const clamp = (v: number, lo: number, hi: number): number => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  return {
    x: clamp(center.x - stack.w / 2, 0, box.w - stack.w),
    y: clamp(center.y - stack.h / 2, 0, box.h - stack.h),
  };
}

/**
 * Сторона карты после дропа. null — сторону диктует ЗОНА (рука/центр — лицом, колода — как колода);
 * boolean — принудительная сторона (та, которой несли).
 */
export function faceAfterDrop(o: { fromFree: boolean; toFree: boolean; toDeck: boolean; carried: boolean }): boolean | null {
  if (!o.toFree) return null; // центр/рука/посадка: правило зоны
  if (o.toDeck && !o.fromFree) return null; // в колоду из руки/центра: по направлению колоды
  return o.carried; // на стол, либо в колоду со стола: той же стороной
}
