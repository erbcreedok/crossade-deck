import type { Burnable, Draggable, Flippable, Peekable, TableElement } from "./element";
import type { ItemCap } from "../ui/tableItem";

// Приведение элемента к ОПЦИОНАЛЬНОЙ способности (ISP). Способности объявлены ДАННЫМИ сборки
// (TableItem.caps: вид решает, что предмет умеет) — у единого класса предмета двери есть у всех,
// и «есть ли метод» больше ничего не говорит. Для чужих элементов (фейки тестов, будущие хосты)
// остаётся прежняя утиная типизация по наличию метода. Один источник правды для драга
// (SingleDrag/GroupDrag) И для агрегата Pile (pileIdentity): правило «Pile умеет X, только если
// ВСЕ члены умеют X» считается ровно этими же предикатами, а не копией.

function capsOf(el: TableElement): ReadonlySet<ItemCap> | null {
  return (el as { caps?: ReadonlySet<ItemCap> }).caps ?? null;
}

function has(el: TableElement, cap: ItemCap, duckMethod: string): boolean {
  const caps = capsOf(el);
  return caps ? caps.has(cap) : duckMethod in el;
}

export function asFlippable(el: TableElement): Flippable | null {
  return has(el, "flip", "requestFlip") ? (el as unknown as Flippable) : null;
}
export function asBurnable(el: TableElement): Burnable | null {
  return "burn" in el ? (el as unknown as Burnable) : null; // сжечь умеет любой предмет стола
}
export function asPeekable(el: TableElement): Peekable | null {
  return has(el, "peek", "peekReveal") ? (el as unknown as Peekable) : null;
}
export function asDraggable(el: TableElement): Draggable | null {
  return "draggable" in el ? (el as unknown as Draggable) : null;
}
