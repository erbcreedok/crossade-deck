// РАСКЛАДКА ЛЕНТЫ-НА-БОРДЕ как Layout слот-дерева: тот же центрированный ряд stripRow, что у
// дока HUD (свободный ряд → ровный нахлёст при переполнении), но живущий В ДЕРЕВЕ — им
// пользуются деревья борд для strip-групп. Благодаря контракту Layout лента бесплатно получает
// весь конвейер дерева: homeOf, dropTarget.indexAt и гэп-превью placeGapped (group.gap).
//
// mirror — ЗЕРКАЛО ВИЗАВИ для чужой ленты: первый житель владельца справа (как его рука видна
// через стол). indexAt при зеркале переводит точку в индекс ПОРЯДКА ВЛАДЕЛЬЦА.

import type { Layout, Size, Vec } from "../../slot/types";
import { stripRow } from "./row";

/** Ряд ленты шириной `width` (борда минус поля): жители центрированы, при переполнении — нахлёст.
 *  Пустая лента держит бокс высотой fallback-ячейки — дропзона не схлопывается в ноль. */
export function stripRowLayout(width: number, cell: Size, gap = 12, mirror = false): Layout {
  const poses = (sizes: Size[]): Vec[] =>
    stripRow(sizes.length, sizes[0] ?? cell, width, gap).map((p) => ({ x: p.x, y: p.y }));
  return {
    place(sizes) {
      const c = sizes[0] ?? cell;
      const row = poses(sizes);
      const at = sizes.map((_, i) => {
        const p = row[mirror ? sizes.length - 1 - i : i]!;
        return { x: p.x - c.w / 2, y: 0 };
      });
      return { at, size: { w: width, h: c.h } };
    },
    indexAt(cp, sizes) {
      // Индекс-щель: сколько центров ряда левее точки; при зеркале — перевод в порядок владельца.
      const leftOf = poses(sizes).filter((p) => p.x < cp.x).length;
      return mirror ? sizes.length - leftOf : leftOf;
    },
  };
}
