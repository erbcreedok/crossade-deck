// РУКА-НА-БОРДЕ — общий сборщик для обоих деревьев (полоса и круглый стол): центрированный ряд
// handRowLayout во всю ширину борды + ЛЕНТА-ДРОПЗОНА (band) в cellRects — её красят decor (rest)
// и жест (armed/hot) ЕДИНЫМ стилем дока (hand/handBandPaint). Прежний вид «голый линейный ряд от
// левого поля» — снят: рука обязана выглядеть одинаково, прибита она к экрану или лежит на столе.

import { group, leaf } from "../../slot/types";
import { CARD } from "../../crossade/tree";
import { handKey, type BoardState } from "../core/state";
import { membersOf } from "./zoneSubtrees";
import { MARGIN, type Placed } from "./treeShared";

/** Дыхание ленты вокруг ряда карт (стиль дока: band = ряд ± GAP). */
export const HAND_BAND_PAD = 12;

import { handRowLayout } from "../hand/handRowLayout";

export interface BoardHandRow {
  placed: Placed;
  /** Лента-дропзона (для cellRects): её красят decor/gesture, по ней же ловится дроп с запасом. */
  band: { x: number; y: number; w: number; h: number };
  bottom: number;
}

/** Собрать ряд руки под низ борды: y — верх карт, boardW — полная ширина дерева. */
export function boardHandRow(state: BoardState, selfSeat: string, y: number, boardW: number): BoardHandRow {
  const key = handKey(selfSeat);
  const members = membersOf(state, key);
  const width = Math.max(CARD.w, boardW - MARGIN.x * 2);
  const cards = members.map((m) => leaf(m, m, CARD));
  const slot = group(key, handRowLayout(width, CARD), cards, {
    drop: { accept: () => true, pad: HAND_BAND_PAD },
    reorder: { enabled: true },
  });
  return {
    placed: { id: key, origin: { x: MARGIN.x, y }, slot },
    band: { x: MARGIN.x - HAND_BAND_PAD, y: y - HAND_BAND_PAD, w: width + HAND_BAND_PAD * 2, h: CARD.h + HAND_BAND_PAD * 2 },
    bottom: y + CARD.h + HAND_BAND_PAD,
  };
}
