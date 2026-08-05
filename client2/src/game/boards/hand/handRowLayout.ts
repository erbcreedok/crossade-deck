// РАСКЛАДКА РУКИ-НА-БОРДЕ как Layout слот-дерева: тот же центрированный ряд handStrip, что у
// экранного дока (свободный ряд → ровный нахлёст при переполнении), но живущий В ДЕРЕВЕ — им
// пользуются деревья борд для hand-группы. Благодаря контракту Layout рука бесплатно получает
// весь конвейер дерева: homeOf, dropTarget.indexAt и гэп-превью placeGapped (group.gap).

import type { Layout, Size, Vec } from "../../slot/types";
import { handStrip } from "./handStrip";

/** Ряд руки шириной `width` (борда минус поля): карты центрированы, при переполнении — нахлёст.
 *  Пустая рука держит бокс высотой fallback-ячейки — дропзона не схлопывается в ноль. */
export function handRowLayout(width: number, cell: Size, gap = 12): Layout {
  const poses = (sizes: Size[]): Vec[] =>
    handStrip(sizes.length, sizes[0] ?? cell, width, gap).map((p) => ({ x: p.x, y: p.y }));
  return {
    place(sizes) {
      const c = sizes[0] ?? cell;
      const at = poses(sizes).map((p) => ({ x: p.x - c.w / 2, y: 0 }));
      return { at, size: { w: width, h: c.h } };
    },
    indexAt(cp, sizes) {
      // Индекс-щель: сколько центров ряда левее точки (та же конвенция, что у экранного дока).
      return poses(sizes).filter((p) => p.x < cp.x).length;
    },
  };
}
