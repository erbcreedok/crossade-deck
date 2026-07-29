import type { Burnable, Draggable, Flippable, Peekable, TableElement } from "./element";

// Приведение элемента к ОПЦИОНАЛЬНОЙ способности (ISP): духом-типизацией по наличию метода. Один
// источник правды для драга (SingleDrag/GroupDrag) И для агрегата Pile (pileIdentity) — правило
// «Pile умеет X, только если ВСЕ члены умеют X» считается ровно этими же предикатами, а не копией.

export function asFlippable(el: TableElement): Flippable | null {
  return "requestFlip" in el ? (el as unknown as Flippable) : null;
}
export function asBurnable(el: TableElement): Burnable | null {
  return "burn" in el ? (el as unknown as Burnable) : null;
}
export function asPeekable(el: TableElement): Peekable | null {
  return "peekReveal" in el ? (el as unknown as Peekable) : null;
}
export function asDraggable(el: TableElement): Draggable | null {
  return "draggable" in el ? (el as unknown as Draggable) : null;
}
