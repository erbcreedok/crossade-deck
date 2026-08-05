// ГЕОМЕТРИЯ БОРДЫ — ОДНО дерево слотов на рендер и дроп (канон всех сцен), собираемое из
// BoardSpec: каждая зона — поддерево со СВОЕЙ раскладкой; id узлов = SlotKey состояния —
// никакого второго словаря адресов. Композиторы: круглый стол (roundTableTree) и полоса
// (здесь): чужие места сверху → зоны стола → своя рука снизу; за бортом — колонка справа.

import { linear, pile } from "../../slot/layouts";
import { boardHandRow } from "./handRow";
import { group, leaf } from "../../slot/types";
import { CARD } from "../../crossade/tree";
import { handKey, OFFBOARD_KEY, type BoardState } from "../core/state";
import { seatZoneId, slotKey, type BoardSpec } from "../core/spec";
import { membersOf, zoneSubtrees } from "./zoneSubtrees";
import { roundTableTree } from "./roundTableTree";
import { handConfig } from "../hand/handConfig";
import { finish, GAP, MARGIN, SEAT_CELL, SEAT_LABEL_H, SEAT_STACK_DX, type BoardTree, type FreePositions, type Placed } from "./treeShared";

export type { BoardTree, FreePositions } from "./treeShared";

export function buildBoardTree(spec: BoardSpec, state: BoardState, selfSeat: string, free?: FreePositions): BoardTree {
  const seatsZone = spec.zones.find((z) => z.layout.kind === "seats");
  if (seatsZone) return roundTableTree(spec, state, selfSeat, seatsZone, free);

  const placed: Placed[] = [];
  const cellRects: Record<string, { x: number; y: number; w: number; h: number }> = {};

  // 1. Полоса чужих мест: ряд рубашек/фишек их руки внахлёст + резерв под подпись.
  const others = state.seats.filter((s) => s.id !== selfSeat);
  let x = MARGIN.x;
  let seatZonesH = 0;
  const seatsY = MARGIN.y + SEAT_LABEL_H;
  for (const seat of others) {
    const key = `seat:${seat.id}`;
    const members = membersOf(state, handKey(seat.id));
    placed.push({
      id: key,
      origin: { x, y: seatsY },
      slot: group(key, pile({ dx: SEAT_STACK_DX, dy: 0, cell: { w: 58, h: 83 } }), members.map((m) => leaf(m, m, { w: 58, h: 83 }))),
    });
    // Зоны ЭТОГО места (perSeat, манчкинские «шмотки») — сразу под его стрипом.
    let seatZoneW = 0;
    let zx = x;
    for (const zone of spec.zones.filter((z) => z.perSeat)) {
      const sub = zoneSubtrees(zone, state, seatZoneId(zone.id, seat.id));
      for (const sp of sub.placed) {
        placed.push({ ...sp, origin: { x: zx + sp.origin.x, y: seatsY + SEAT_CELL.h + 4 + sp.origin.y } });
        const c = sub.cells[sp.id];
        if (c) cellRects[sp.id] = { ...c, x: zx + c.x, y: seatsY + SEAT_CELL.h + 4 + c.y };
      }
      zx += sub.size.w + GAP.x;
      seatZoneW += sub.size.w + GAP.x;
      seatZonesH = Math.max(seatZonesH, sub.size.h + 4);
    }
    // Ширина места ЖИВАЯ: ряд рубашек богатой руки шире номинала, сосед не должен наезжать.
    const stripW = Math.max(SEAT_CELL.w, (members.length - 1) * SEAT_STACK_DX + 58, seatZoneW);
    x += stripW + GAP.x;
  }
  const seatsBottom = seatsY + (others.length ? SEAT_CELL.h + seatZonesH : 0);

  // 2. Зоны стола: chain — своей строкой; свободный бокс — в ряд; ОСТАЛЬНЫЕ зоны при наличии бокса
  //    вкладываются в его ЦЕНТР (грид-стол в центре бокса), иначе идут в ряд.
  let rowX = MARGIN.x;
  let rowBottom = seatsBottom + GAP.y;
  const rowTop = rowBottom;
  const rowZones = spec.zones.filter((z) => z.layout.kind !== "chain" && !z.perSeat);
  const freeZone = rowZones.find((z) => z.layout.kind === "free");
  const placeSub = (sub: ReturnType<typeof zoneSubtrees>, ox: number, oy: number): void => {
    for (const p of sub.placed) placed.push({ ...p, origin: { x: ox + p.origin.x, y: oy + p.origin.y } });
    // ВСЕ ячейки, не только по слотам: у радиального круга есть декор-ячейки пустых позиций (:phN).
    for (const [ck, c] of Object.entries(sub.cells)) cellRects[ck] = { ...c, x: ox + c.x, y: oy + c.y };
  };
  let boxRect: { x: number; y: number; w: number; h: number } | null = null;
  for (const zone of rowZones) {
    if (freeZone && zone !== freeZone) continue; // вложим ниже, в центр бокса
    const sub = zoneSubtrees(zone, state, undefined, free);
    placeSub(sub, rowX, rowTop);
    if (zone === freeZone) boxRect = cellRects[slotKey(zone.id, 0)] ?? { x: rowX, y: rowTop, w: sub.size.w, h: sub.size.h };
    rowX += sub.size.w + GAP.x * 2;
    rowBottom = Math.max(rowBottom, rowTop + sub.size.h);
  }
  if (freeZone && boxRect) {
    for (const zone of rowZones) {
      if (zone === freeZone) continue;
      const sub = zoneSubtrees(zone, state);
      placeSub(sub, boxRect.x + (boxRect.w - sub.size.w) / 2, boxRect.y + (boxRect.h - sub.size.h) / 2);
    }
  }
  let chainBottom = rowBottom;
  for (const zone of spec.zones.filter((z) => z.layout.kind === "chain" && !z.perSeat)) {
    const sub = zoneSubtrees(zone, state);
    const y = rowBottom + GAP.y;
    for (const p of sub.placed) placed.push({ ...p, origin: { x: MARGIN.x + p.origin.x, y: y + p.origin.y } });
    chainBottom = Math.max(chainBottom, y + sub.size.h);
  }

  // За бортом: съеденное видно колонкой справа от зон.
  const offboard = membersOf(state, OFFBOARD_KEY);
  placed.push({
    id: OFFBOARD_KEY,
    origin: { x: rowX, y: rowTop },
    slot: group(OFFBOARD_KEY, pile({ dx: 0, dy: 26, cell: { w: 58, h: 83 } }), offboard.map((m) => leaf(m, m, { w: 58, h: 83 }))),
  });

  // 3. Свои perSeat-зоны — строкой над рукой, потом сама рука снизу (если руки есть).
  let selfZonesBottom = chainBottom;
  {
    let zx = MARGIN.x;
    for (const zone of spec.zones.filter((z) => z.perSeat)) {
      const sub = zoneSubtrees(zone, state, seatZoneId(zone.id, selfSeat));
      const y = chainBottom + GAP.y;
      for (const sp of sub.placed) {
        placed.push({ ...sp, origin: { x: zx + sp.origin.x, y: y + sp.origin.y } });
        const c = sub.cells[sp.id];
        if (c) cellRects[sp.id] = { ...c, x: zx + c.x, y: y + c.y };
      }
      zx += sub.size.w + GAP.x * 2;
      selfZonesBottom = Math.max(selfZonesBottom, y + sub.size.h);
    }
  }
  let handBottom = selfZonesBottom;
  // Рука в дереве — только при placement:"board"; «screen» уносит её в экранный HUD (handHud.ts).
  // Вид — ЕДИНЫЙ стиль дока: центрированный ряд + лента-дропзона (geometry/handRow).
  if (handConfig(spec.hand)?.placement === "board") {
    const hand = boardHandRow(state, selfSeat, selfZonesBottom + GAP.y + 12, rowX);
    placed.push(hand.placed);
    cellRects[hand.placed.id] = hand.band;
    handBottom = hand.bottom;
  }

  return finish(placed, cellRects, { w: rowX, h: handBottom + MARGIN.y });
}
