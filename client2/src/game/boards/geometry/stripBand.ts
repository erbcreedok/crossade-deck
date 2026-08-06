// ЛЕНТА-НА-БОРДЕ — общий сборщик для обоих деревьев (полоса и круглый стол): центрированный ряд
// stripRowLayout во всю ширину борды + ЛЕНТА-ДРОПЗОНА (band) в cellRects — её красят decor (rest)
// и жест (armed/hot) ЕДИНЫМ стилем дока (strip/bandPaint). Своя лента обязана выглядеть одинаково,
// пришвартована она к экрану (док HUD) или лежит на столе. Лент может быть несколько (рука, мешок
// фишек…) — компоновщик кладёт их полосами одну под другой.

import { group, leaf } from "../../slot/types";
import { membersOf } from "./zoneSubtrees";
import { stripConfig, stripKey } from "../strip/config";
import type { ZoneSpec } from "../core/spec";
import type { BoardState } from "../core/state";
import { MARGIN, type Placed } from "./treeShared";
import { stripRowLayout } from "../strip/rowLayout";

/** Дыхание ленты вокруг ряда (стиль дока: band = ряд ± GAP). */
export const STRIP_BAND_PAD = 12;

export interface BoardStripBand {
  placed: Placed;
  /** Лента-дропзона (для cellRects): её красят decor/gesture, по ней же ловится дроп с запасом. */
  band: { x: number; y: number; w: number; h: number };
  bottom: number;
}

/** Собрать ряд СВОЕЙ ленты под низ борды: y — верх ряда, boardW — полная ширина дерева. */
export function boardStripBand(zone: ZoneSpec, state: BoardState, selfSeat: string, y: number, boardW: number): BoardStripBand {
  const cfg = stripConfig(zone);
  const key = stripKey(zone.id, selfSeat);
  const members = membersOf(state, key);
  const width = Math.max(cfg.cell.w, boardW - MARGIN.x * 2);
  const items = members.map((m) => leaf(m, m, cfg.cell));
  const slot = group(key, stripRowLayout(width, cfg.cell), items, {
    drop: { accept: () => true, pad: STRIP_BAND_PAD },
    reorder: { enabled: cfg.reorder !== null },
  });
  return {
    placed: { id: key, origin: { x: MARGIN.x, y }, slot },
    band: { x: MARGIN.x - STRIP_BAND_PAD, y: y - STRIP_BAND_PAD, w: width + STRIP_BAND_PAD * 2, h: cfg.cell.h + STRIP_BAND_PAD * 2 },
    bottom: y + cfg.cell.h + STRIP_BAND_PAD,
  };
}
