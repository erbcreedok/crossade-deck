// РУКА как ДАННЫЕ — нормализатор HandSpec: одно место, где живут дефолты (bottom + вдоль края +
// приватность), чтобы все потребители (дерево борды, экранный HUD, live-сцены) читали ОДИН
// разобранный конфиг, а не повторяли `?? "bottom"` вразнобой. Чистая функция, без Pixi.

import { zoneOf, type HandFlow, type HandPlacement, type HandSide, type HandSpec } from "../core/spec";
import { handKey } from "../core/state";

export interface HandConfig {
  reorder: boolean;
  placement: HandPlacement;
  side: HandSide;
  /** Направление раскладки, уже РАЗРЕШЁННОЕ: дефолт — вдоль края (top/bottom → horizontal,
   *  left/right → vertical); grid — как задано (шаг 4b). */
  flow: HandFlow;
  /** Размер карт: {fit} — адаптив «влезает N вдоль оси», {cell} — фикс-ячейка дизайнера. */
  size: { fit: number } | { cell: { w: number; h: number } };
  /** Значения карт не видны другим. Дефолт true — приватность. Намерение-данные: скрытие — фильтр
   *  порта, сцена лишь отражает (чужая рука рубашками — faceUpInSlot). */
  hidden: boolean;
  /** Чужие не трогают руку. Дефолт true — приватность по умолчанию. */
  locked: boolean;
}

/** ЗАПИРАЕТ ли рука драг этого слота: чужая hand-зона при locked (дефолт — да, приватность).
 *  Своей руки не касается; отпертая (locked:false) рука — общая, чужие карты берутся. */
export function handLocks(cfg: HandConfig | null, slot: string, selfSeat: string): boolean {
  return zoneOf(slot) === "hand" && slot !== handKey(selfSeat) && (cfg?.locked ?? true);
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
    size: typeof spec.size === "number" ? { fit: spec.size } : spec.size ? { cell: spec.size } : { fit: 5 },
    hidden: spec.hidden ?? true,
    locked: spec.locked ?? true,
  };
}
