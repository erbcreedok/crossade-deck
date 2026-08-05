// РУКА как ДАННЫЕ — нормализатор HandSpec: одно место, где живут дефолты (bottom + вдоль края +
// приватность), чтобы все потребители (дерево борды, экранный HUD, live-сцены) читали ОДИН
// разобранный конфиг, а не повторяли `?? "bottom"` вразнобой. Чистая функция, без Pixi.

import type { HandFlow, HandPlacement, HandSide, HandSpec } from "../core/spec";

export interface HandConfig {
  reorder: boolean;
  placement: HandPlacement;
  side: HandSide;
  /** Направление раскладки, уже РАЗРЕШЁННОЕ: дефолт — вдоль края (top/bottom → horizontal,
   *  left/right → vertical); grid — как задано (шаг 4b). */
  flow: HandFlow;
  /** Значения карт не видны другим. Намерение-данные: скрытие — фильтр порта, сцена лишь отражает. */
  hidden: boolean;
  /** Чужие не трогают руку. Дефолт true — приватность по умолчанию. */
  locked: boolean;
}

/** Направление вдоль края: док лежит ВДОЛЬ своего края экрана, а не поперёк. */
export function flowAlong(side: HandSide): HandFlow {
  return side === "left" || side === "right" ? "vertical" : "horizontal";
}

/** Разобрать HandSpec в конфиг с дефолтами. Нет руки (spec === undefined) — null: рук у стола нет. */
export function handConfig(spec: HandSpec | undefined): HandConfig | null {
  if (!spec) return null;
  const side = spec.side ?? "bottom";
  return {
    reorder: spec.reorder,
    placement: spec.placement ?? "board",
    side,
    flow: spec.flow ?? flowAlong(side),
    hidden: spec.hidden ?? false,
    locked: spec.locked ?? true,
  };
}
