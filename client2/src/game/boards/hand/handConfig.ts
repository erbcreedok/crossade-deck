// РУКА как ДАННЫЕ — нормализатор HandSpec: одно место, где живут дефолты (bottom + вдоль края +
// приватность), чтобы все потребители (дерево борды, экранный HUD, live-сцены) читали ОДИН
// разобранный конфиг, а не повторяли `?? "bottom"` вразнобой. Чистая функция, без Pixi.

import { zoneOf, type HandFlow, type HandSpec, type HudSide } from "../core/spec";
import { handKey } from "../core/state";

export interface HandConfig {
  reorder: boolean;
  /** Направление раскладки; нет поля — вдоль края ТОГО дока, куда рука пришвартована (flowAlong).
   *  ГДЕ рука живёт, решает spec.hud (hudLayout.handOnBoard), не рука. */
  flow: HandFlow | null;
  /** Размер карт: {fit} — адаптив «влезает N вдоль оси», {cell} — фикс-ячейка дизайнера. */
  size: { fit: number } | { cell: { w: number; h: number } };
  /** Значения карт не видны другим. Дефолт true — приватность. Намерение-данные: скрытие — фильтр
   *  порта, сцена лишь отражает (чужая рука рубашками — faceUpInSlot). */
  hidden: boolean;
  /** Чужие не трогают руку. Дефолт true — приватность по умолчанию. */
  locked: boolean;
  /** Smart reorder (гэп-превью вставки). Дефолт true. */
  preview: boolean;
}

/** ЗАПИРАЕТ ли рука драг этого слота: чужая hand-зона при locked (дефолт — да, приватность).
 *  Своей руки не касается; отпертая (locked:false) рука — общая, чужие карты берутся. */
export function handLocks(cfg: HandConfig | null, slot: string, selfSeat: string): boolean {
  return zoneOf(slot) === "hand" && slot !== handKey(selfSeat) && (cfg?.locked ?? true);
}

/** Направление вдоль края: док лежит ВДОЛЬ своего края экрана, а не поперёк. */
export function flowAlong(side: HudSide): HandFlow {
  return side === "left" || side === "right" ? "vertical" : "horizontal";
}

/** Разобрать HandSpec в конфиг с дефолтами. Нет руки (spec === undefined) — null: рук у стола нет. */
export function handConfig(spec: HandSpec | undefined): HandConfig | null {
  if (!spec) return null;
  return {
    reorder: spec.reorder,
    flow: spec.flow ?? null,
    size: typeof spec.size === "number" ? { fit: spec.size } : spec.size ? { cell: spec.size } : { fit: 5 },
    hidden: spec.hidden ?? true,
    locked: spec.locked ?? true,
    preview: spec.preview ?? true,
  };
}
