// РУКА как ДАННЫЕ — нормализатор HandSpec: одно место, где живут дефолты (row + board), чтобы все
// потребители (дерево борды, экранный HUD, live-сцены) читали ОДИН разобранный конфиг, а не
// повторяли `?? "row"` вразнобой. Чистая функция, без Pixi.

import type { HandLayout, HandPlacement, HandSpec } from "../core/spec";

export interface HandConfig {
  reorder: boolean;
  layout: HandLayout;
  placement: HandPlacement;
}

/** Разобрать HandSpec в конфиг с дефолтами. Нет руки (spec === undefined) — null: рук у стола нет. */
export function handConfig(spec: HandSpec | undefined): HandConfig | null {
  if (!spec) return null;
  return {
    reorder: spec.reorder,
    layout: spec.layout ?? "row",
    placement: spec.placement ?? "board",
  };
}
