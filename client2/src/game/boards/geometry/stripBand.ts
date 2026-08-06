// ЛЕНТЫ-НА-БОРДЕ — общий сборщик для обоих деревьев (полоса и круглый стол). Три вида одной
// механики (единый стиль дока, strip/bandPaint):
//   • СВОЯ лента — полоса во всю ширину у низа борды (boardStripBand);
//   • ЧУЖАЯ лента-на-борде — ТА ЖЕ полноценная полоса у места владельца, но ужатая
//     (FOREIGN_SCALE): стол один для всех, отличается только приватность (рубашки);
//   • чужая лента, которую владелец держит В HUD, — МИНИ-ВИЗАВИ у его аватара (MINI_SCALE,
//     зеркальный порядок — как его рука видна через стол; где именно — ZoneSpec.atSeat).
// Ключи РЕАЛЬНЫЕ («hand:p2») — дроп в чужую открытую ленту той же дверью, что и всюду.

import { group, leaf } from "../../slot/types";
import { membersOf } from "./zoneSubtrees";
import { STRIP_FOREIGN_SCALE, STRIP_MINI_SCALE, stripConfig, stripKey, stripZones } from "../strip/config";
import { zoneOnBoard } from "../hud/hudLayout";
import type { BoardSpec, ZoneSpec } from "../core/spec";
import type { BoardState } from "../core/state";
import { MARGIN, type Placed } from "./treeShared";
import { stripRowLayout } from "../strip/rowLayout";

/** Дыхание ленты вокруг ряда (стиль дока: band = ряд ± GAP); у ужатых лент дышит меньше. */
export const STRIP_BAND_PAD = 12;
const GAP_Y = 6;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardStripBand {
  placed: Placed;
  /** Лента-дропзона (для cellRects): её красят decor/gesture, по ней же ловится дроп с запасом. */
  band: Rect;
  bottom: number;
}

interface BandOpts {
  x: number;
  y: number;
  width: number;
  scale?: number;
  mirror?: boolean;
}

/** Полоса одной ленты: ряд stripRowLayout + band. Масштаб ужимает ячейку и дыхание. */
export function stripBandAt(zone: ZoneSpec, state: BoardState, seatId: string, o: BandOpts): BoardStripBand {
  const cfg = stripConfig(zone);
  const s = o.scale ?? 1;
  // Целые пиксели: дробная ячейка тащит float-дрейф во всю геометрию ниже по дереву.
  const cell = { w: Math.round(cfg.cell.w * s), h: Math.round(cfg.cell.h * s) };
  const pad = Math.round(STRIP_BAND_PAD * (s < 1 ? 0.6 : 1));
  const key = stripKey(zone.id, seatId);
  const members = membersOf(state, key);
  // Ужатая/мини лента ловит по ПАЛЬЦУ: полноразмерный груз накрывает соседние band целиком,
  // и «по перекрытию» дроп уезжал бы в чужую ленту стопки; палец точен.
  const slot = group(key, stripRowLayout(o.width, cell, 12 * s, o.mirror), members.map((m) => leaf(m, m, cell)), {
    drop: { accept: () => true, pad, ...(s < 1 ? { policy: { hit: "finger" as const } } : {}) },
    reorder: { enabled: cfg.reorder !== null },
  });
  return {
    placed: { id: key, origin: { x: o.x, y: o.y }, slot },
    band: { x: o.x - pad, y: o.y - pad, w: o.width + pad * 2, h: cell.h + pad * 2 },
    bottom: o.y + cell.h + pad,
  };
}

/** СВОЯ лента под низом борды: y — верх ряда, boardW — полная ширина дерева. */
export function boardStripBand(zone: ZoneSpec, state: BoardState, selfSeat: string, y: number, boardW: number): BoardStripBand {
  const width = Math.max(stripConfig(zone).cell.w, boardW - MARGIN.x * 2);
  return stripBandAt(zone, state, selfSeat, { x: MARGIN.x, y, width });
}

export interface SeatStripBlock {
  placed: Placed[];
  /** band-прямоугольники по ключам лент — в cellRects (rest красит decor, armed/hot — жест). */
  bands: Record<string, Rect>;
  size: { w: number; h: number };
}

/** Ширина ужатого ряда: до четырёх жителей свободно, дальше — нахлёст в тот же габарит. */
function foreignWidth(cellW: number, n: number): number {
  return Math.max(cellW, Math.min(Math.max(n, 1), 4) * (cellW + 10) - 10);
}

/**
 * Блок ЧУЖИХ лент одного места вокруг якоря. mode "stack" (полоса): вертикальная стопка вниз от
 * якоря — atSeat above первыми, ниже below; left/right — сбоку от стопки. mode "around" (круглый
 * стол): above — вверх от якоря, below — вниз, left/right — по бокам (якорь — центр аватара).
 */
export function seatStripBlock(
  spec: BoardSpec,
  state: BoardState,
  seatId: string,
  anchor: { x: number; y: number },
  mode: "stack" | "around",
): SeatStripBlock {
  const placed: Placed[] = [];
  const bands: Record<string, Rect> = {};
  const center = mode === "around";
  let up = anchor.y;
  let down = anchor.y;
  let sideX = anchor.x; // куда прирастают боковые ленты
  let maxW = 0;

  const bandOf = (zone: ZoneSpec): { width: number; scale: number; mirror: boolean; h: number; pad: number } => {
    const pinned = zoneOnBoard(spec, zone.id);
    const scale = pinned ? STRIP_FOREIGN_SCALE : STRIP_MINI_SCALE;
    const cfg = stripConfig(zone);
    const n = membersOf(state, stripKey(zone.id, seatId)).length;
    const pad = Math.round(STRIP_BAND_PAD * 0.6);
    return { width: foreignWidth(Math.round(cfg.cell.w * scale), n), scale, mirror: !pinned, h: Math.round(cfg.cell.h * scale), pad };
  };
  const put = (zone: ZoneSpec, x: number, y: number): void => {
    const b = bandOf(zone);
    const made = stripBandAt(zone, state, seatId, { x, y, width: b.width, scale: b.scale, mirror: b.mirror });
    placed.push(made.placed);
    bands[made.placed.id] = made.band;
    maxW = Math.max(maxW, x - anchor.x + b.width);
  };

  const at = (z: ZoneSpec): string => z.atSeat ?? "below";
  const strips = stripZones(spec);
  const stacked = center ? strips.filter((z) => at(z) === "above" || at(z) === "below") : strips.filter((z) => at(z) !== "left" && at(z) !== "right");
  // Шаг стопки — ПОЛНЫЙ габарит band (ряд + дыхание pad с обеих сторон): ленты не перекрываются,
  // дроп между соседними band однозначен.
  for (const zone of stacked) {
    const b = bandOf(zone);
    const x = center ? anchor.x - b.width / 2 : anchor.x;
    if (center && at(zone) === "above") {
      up -= b.h + b.pad * 2 + GAP_Y;
      put(zone, x, up + b.pad);
    } else {
      put(zone, x, down + b.pad);
      down += b.h + b.pad * 2 + GAP_Y;
    }
  }
  for (const zone of strips.filter((z) => at(z) === "left" || at(z) === "right")) {
    const b = bandOf(zone);
    const y = center ? anchor.y - b.h / 2 : anchor.y + b.pad;
    const x = at(zone) === "left" && center ? sideX - b.width - 16 : Math.max(sideX, anchor.x + maxW) + 16;
    put(zone, x, y);
    sideX = x + (at(zone) === "left" && center ? 0 : b.width);
    down = Math.max(down, y + b.h + b.pad + GAP_Y);
  }
  return { placed, bands, size: { w: Math.max(maxW, 1), h: Math.max(down - up, 1) } };
}
