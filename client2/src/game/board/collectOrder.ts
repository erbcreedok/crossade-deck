import { rankOf } from "./cardFace";

// Порядок сборки выделенного набора в ряд (issue #56). ОСЬ №1 (какая последовательность), чистая
// и расширяемая ДАННЫМИ: новая стратегия = запись в COMPARATORS, а не ветка у места вызова. Ось №2
// (геометрия ряда) — отдельно (rowAssembly). Ранговый тумблер контейнера ортогонален: движок сам
// решает `sortByRank ? "rank" : collectOrder` и передаёт сюда ОДНУ стратегию.

// «Ручные» стратегии сборки (когда ранговый тумблер выкл) — их выбирает контейнер/UI.
export type ManualOrder = "press" | "spatial" | "suit";
// Плюс "rank" (ортогональный тумблер) — итоговая стратегия, что уходит в orderSelection.
export type CollectOrder = ManualOrder | "rank";

export interface CollectItem {
  id: string;
  press: number; // индекс нажатия (порядок добавления в набор)
  x: number; // позиция на столе (для spatial)
  y: number;
  face: string; // лицо карты (для rank/suit)
}

/** Масть = последний символ лица. */
export function suitOf(face: string): string {
  return face.slice(-1);
}

// Порядок мастей для сорта «по масти»: ♣ < ♦ < ♥ < ♠ (привычный бриджевый порядок).
const SUIT_RANK: Record<string, number> = { "♣": 0, "♦": 1, "♥": 2, "♠": 3 };

// Ключ сравнения на стратегию. press — сам индекс нажатия (он же tie-break для всех прочих).
// spatial даёт reading-order: сначала строка (y), потом столбец (x) — вес y кратно больше типичного
// разброса x, так что «сверху-вниз, затем слева-направо».
const COMPARATORS: Record<CollectOrder, (a: CollectItem, b: CollectItem) => number> = {
  press: (a, b) => a.press - b.press,
  rank: (a, b) => rankOf(a.face) - rankOf(b.face),
  suit: (a, b) => (SUIT_RANK[suitOf(a.face)] ?? 99) - (SUIT_RANK[suitOf(b.face)] ?? 99),
  spatial: (a, b) => a.y - b.y || a.x - b.x,
};

/** Упорядочить набор по стратегии. Не мутирует вход; при равенстве ключей — устойчиво по press. */
export function orderSelection(items: readonly CollectItem[], order: CollectOrder): string[] {
  const cmp = COMPARATORS[order];
  return [...items].sort((a, b) => cmp(a, b) || a.press - b.press).map((i) => i.id);
}
