// ГЕОМЕТРИЯ БОРДЫ — ОДНО дерево слотов на рендер и дроп (канон всех сцен), собираемое из
// BoardSpec: каждая зона — поддерево со СВОЕЙ раскладкой; id узлов = SlotKey состояния —
// никакого второго словаря адресов. Композиторы: круглый стол (roundTableTree) и полоса
// (здесь): чужие места сверху → зоны стола → своя рука снизу; за бортом — колонка справа.

import { pile } from "../../slot/layouts";
import { boardStripBand } from "./stripBand";
import { group, leaf } from "../../slot/types";
import { OFFBOARD_KEY, type BoardState } from "../core/state";
import { seatZoneId, slotKey, type BoardSpec } from "../core/spec";
import { stripKey, stripZones } from "../strip/config";
import { membersOf, zoneSubtrees } from "./zoneSubtrees";
import { roundTableTree } from "./roundTableTree";
import { zoneOnBoard } from "../hud/hudLayout";
import { finish, GAP, MARGIN, SEAT_CELL, SEAT_LABEL_H, SEAT_STACK_DX, type BoardTree, type FreePositions, type Placed } from "./treeShared";

/** Ячейка чужой ленты у места: житель ужат к масштабу посадочной полосы (58/83 от карты). */
export const SEAT_SCALE = 0.58;

export type { BoardTree, FreePositions } from "./treeShared";

export function buildBoardTree(spec: BoardSpec, state: BoardState, selfSeat: string, free?: FreePositions): BoardTree {
  const seatsZone = spec.zones.find((z) => z.layout.kind === "seats");
  if (seatsZone) return roundTableTree(spec, state, selfSeat, seatsZone, free);

  const placed: Placed[] = [];
  const cellRects: Record<string, { x: number; y: number; w: number; h: number }> = {};

  // 1. Полоса чужих мест: ленты места (рука, мешок…) рядами рубашек внахлёст, ОДНА ПОД ДРУГОЙ,
  //    с РЕАЛЬНЫМИ ключами («hand:p2») — дроп в отпертую чужую ленту той же дверью, что и всюду.
  const others = state.seats.filter((s) => s.id !== selfSeat);
  const strips = stripZones(spec);
  let x = MARGIN.x;
  let seatZonesH = 0;
  const seatsY = MARGIN.y + SEAT_LABEL_H;
  for (const seat of others) {
    let rowY = seatsY;
    let stripW = SEAT_CELL.w;
    for (const zone of strips) {
      const key = stripKey(zone.id, seat.id);
      const members = membersOf(state, key);
      const cell = { w: (zone.cell?.w ?? 100) * SEAT_SCALE, h: (zone.cell?.h ?? 143) * SEAT_SCALE };
      placed.push({
        id: key,
        origin: { x, y: rowY },
        slot: group(key, pile({ dx: SEAT_STACK_DX, dy: 0, cell }), members.map((m) => leaf(m, m, cell))),
      });
      stripW = Math.max(stripW, (members.length - 1) * SEAT_STACK_DX + cell.w);
      rowY += cell.h + 4;
    }
    // Зоны ЭТОГО места (perSeat, манчкинские «шмотки») — сразу под его лентами.
    let seatZoneW = 0;
    let zx = x;
    for (const zone of spec.zones.filter((z) => z.perSeat && z.layout.kind !== "strip")) {
      const sub = zoneSubtrees(zone, state, seatZoneId(zone.id, seat.id));
      for (const sp of sub.placed) {
        placed.push({ ...sp, origin: { x: zx + sp.origin.x, y: rowY + 4 + sp.origin.y } });
        const c = sub.cells[sp.id];
        if (c) cellRects[sp.id] = { ...c, x: zx + c.x, y: rowY + 4 + c.y };
      }
      zx += sub.size.w + GAP.x;
      seatZoneW += sub.size.w + GAP.x;
      seatZonesH = Math.max(seatZonesH, sub.size.h + 4);
    }
    // Ширина места ЖИВАЯ: ряд рубашек богатой ленты шире номинала, сосед не должен наезжать.
    x += Math.max(stripW, seatZoneW) + GAP.x;
    seatZonesH = Math.max(seatZonesH, rowY - seatsY - SEAT_CELL.h);
  }
  const seatsBottom = seatsY + (others.length ? SEAT_CELL.h + seatZonesH : 0);

  // 2. Зоны стола: chain — своей строкой; свободный бокс — в ряд; ОСТАЛЬНЫЕ зоны при наличии бокса
  //    вкладываются в его ЦЕНТР (грид-стол в центре бокса), иначе идут в ряд.
  let rowX = MARGIN.x;
  let rowBottom = seatsBottom + GAP.y;
  const rowTop = rowBottom;
  const rowZones = spec.zones.filter((z) => z.layout.kind !== "chain" && z.layout.kind !== "strip" && !z.perSeat);
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

  // 3. Свои perSeat-зоны — строкой над лентами, потом сами ленты снизу (если не в HUD).
  let selfZonesBottom = chainBottom;
  {
    let zx = MARGIN.x;
    for (const zone of spec.zones.filter((z) => z.perSeat && z.layout.kind !== "strip")) {
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
  let stripsBottom = selfZonesBottom;
  // Свои ленты в дереве — только те, которых НЕТ в HUD (hudLayout.zoneOnBoard); полосами
  // одна под другой, вид — единый стиль дока.
  for (const zone of strips) {
    if (!zoneOnBoard(spec, zone.id)) continue;
    const band = boardStripBand(zone, state, selfSeat, stripsBottom + GAP.y + 12, rowX);
    placed.push(band.placed);
    cellRects[band.placed.id] = band.band;
    stripsBottom = band.bottom;
  }

  return finish(placed, cellRects, { w: rowX, h: stripsBottom + MARGIN.y });
}
