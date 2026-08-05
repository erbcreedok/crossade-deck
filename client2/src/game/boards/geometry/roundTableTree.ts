// КРУГЛЫЙ СТОЛ (layout kind "seats"): компоновка мест вокруг центра ОТНОСИТЕЛЬНО зрителя,
// бокс-борда в центре посадок, руки/оффборд. Чистая геометрия; зоны строит zoneSubtrees.

import { linear, pile } from "../../slot/layouts";
import { group, leaf, type Size } from "../../slot/types";
import { CARD } from "../../crossade/tree";
import { handKey, OFFBOARD_KEY, type BoardState } from "../core/state";
import { seatZoneId, slotKey, type BoardSpec, type ZoneSpec } from "../core/spec";
import { membersOf, slotGroup, zoneCell, zoneSubtrees } from "./zoneSubtrees";
import { handConfig } from "../hand/handConfig";
import { finish, GAP, MARGIN, SEAT_CELL, SEAT_LABEL_H, SEAT_STACK_DX, type BoardTree, type FreePositions, type Placed } from "./treeShared";

/** Кольцо между центром и внешним кругом — не тоньше трёх ширин карты (правило владельца). */
export const RING_CLEAR = CARD.w * 3;

/** ВНЕШНИЙ КРУГ по фактическому центру: карта, брошенная в кольцо, должна ложиться, не задевая ни
 *  центр, ни край, — отсюда запас RING_CLEAR с каждой стороны. Меряем по ОХВАТУ центра (большая
 *  сторона его габарита): вписанный в габарит круг к боксу ближе не подходит. Круг ровный, значит
 *  бокс квадратный; `cell` зоны из спеки работает как МИНИМУМ. */
export function ringBox(min: Size, centers: readonly Size[]): Size {
  const reach = Math.max(0, ...centers.map((s) => Math.max(s.w, s.h)));
  const side = Math.max(min.w, min.h, reach + RING_CLEAR * 2);
  return { w: side, h: side };
}

/** Угол i-го места вокруг центра. Индекс 0 — свой, «на юге» (перед зрителем); дальше по кругу.
 *  Экран: +y вниз, значит юг = +y. Для 4 мест: свой снизу, сосед слева, напротив сверху, справа. */
function seatAngle(index: number, n: number): number {
  return Math.PI / 2 + (index * 2 * Math.PI) / n;
}

/** КРУГЛЫЙ СТОЛ (layout kind "seats", BOARDS-DESIGN §4): по слоту на место вокруг центра
 *  ОТНОСИТЕЛЬНО selfSeat — свой снизу «перед тобой», остальные крестом. Чужие руки — компактными
 *  стопками рубашек за их слотом; своя рука — строкой снизу; прочие зоны и offboard — колонкой
 *  справа. Слот места — perSeat-экземпляр `id@seat:0`, политику берёт из базовой зоны (reject —
 *  «одна карта от игрока»). */
export function roundTableTree(spec: BoardSpec, state: BoardState, selfSeat: string, seatsZone: ZoneSpec, free?: FreePositions): BoardTree {
  const placed: Placed[] = [];
  const cellRects: Record<string, { x: number; y: number; w: number; h: number }> = {};
  const n = state.seats.length;
  const cell = zoneCell(seatsZone);
  const backCell: Size = { w: 58, h: 83 };

  const selfIdx = Math.max(0, state.seats.findIndex((s) => s.id === selfSeat));
  const ordered = Array.from({ length: n }, (_, k) => state.seats[(selfIdx + k) % n]!);

  // Борда-бокс (free-зона) в ЦЕНТРЕ стола: посадки раздвигаются, чтобы её не накрывать.
  // Прочие зоны при боксе вкладываются в его центр (как в полосной компоновке), без бокса — колонкой справа.
  const tableZones = spec.zones.filter((z) => z.layout.kind !== "seats" && !z.perSeat && z.layout.kind !== "chain");
  const freeZone = tableZones.find((z) => z.layout.kind === "free");
  // Центр меряем ДО бокса: он живой (радиальный круг растёт с числом жителей), а кольцо вокруг него
  // обязано остаться не тоньше трёх карт — значит бокс считается по центру, а не наоборот. Берём
  // УСТОЙЧИВЫЙ габарит центра (envelope): при потолке круга он равен кругу-максимуму, поэтому бокс,
  // посадки и cx/cy не ползут с каждой картой — центр стоит, кольцо растёт симметрично от него.
  const centerSubs = tableZones.filter((z) => z !== freeZone).map((z) => zoneSubtrees(z, state));
  const boxCell = freeZone ? ringBox(zoneCell(freeZone), centerSubs.map((s) => s.envelope ?? s.size)) : null;
  const boxClear = boxCell
    ? (freeZone!.shape === "circle" ? Math.max(boxCell.w, boxCell.h) / 2 : Math.hypot(boxCell.w, boxCell.h) / 2)
    : 0;

  // Радиусы: слот места ближе к центру, стопка рубашек — дальше; квадрат стола вмещает оба.
  const rSlot = Math.max(Math.max(cell.w, cell.h) * 1.5, boxClear + cell.h * 0.6);
  const rBack = rSlot + cell.h * 0.55 + backCell.h * 0.5;
  const reach = rBack + Math.max(SEAT_CELL.w, backCell.w) * 0.5;
  const cx = MARGIN.x + reach;
  const cyTop = MARGIN.y + SEAT_LABEL_H;
  const cy = cyTop + reach;

  ordered.forEach((seat, i) => {
    const ang = seatAngle(i, n);
    const sx = cx + rSlot * Math.cos(ang);
    const sy = cy + rSlot * Math.sin(ang);
    const key = slotKey(seatZoneId(seatsZone.id, seat.id), 0);
    const origin = { x: sx - cell.w / 2, y: sy - cell.h / 2 };
    placed.push({ id: key, origin, slot: slotGroup(key, membersOf(state, key), cell) });
    cellRects[key] = { x: origin.x, y: origin.y, w: cell.w, h: cell.h };

    if (seat.id === selfSeat) return; // своя рука — отдельной строкой снизу
    const bx = cx + rBack * Math.cos(ang);
    const by = cy + rBack * Math.sin(ang);
    const members = membersOf(state, handKey(seat.id));
    const seatKey = `seat:${seat.id}`;
    const stripW = Math.max(0, members.length - 1) * SEAT_STACK_DX + backCell.w;
    placed.push({
      id: seatKey,
      origin: { x: bx - stripW / 2, y: by - backCell.h / 2 },
      slot: group(seatKey, pile({ dx: SEAT_STACK_DX, dy: 0, cell: backCell }), members.map((m) => leaf(m, m, backCell))),
    });
  });

  const rightX = MARGIN.x + reach * 2 + GAP.x;

  const placeSub = (sub: ReturnType<typeof zoneSubtrees>, ox: number, oy: number): void => {
    for (const p of sub.placed) placed.push({ ...p, origin: { x: ox + p.origin.x, y: oy + p.origin.y } });
    // ВСЕ ячейки, не только по слотам: у радиального круга есть декор-ячейки пустых позиций (:phN).
    for (const [ck, c] of Object.entries(sub.cells)) cellRects[ck] = { ...c, x: ox + c.x, y: oy + c.y };
  };

  let colY = cyTop;
  if (freeZone && boxCell) {
    // Бокс-борда по центру круга посадок; остальные зоны — в центр бокса. Габарит боксу даёт кольцо
    // (boxCell), а не спека: зона — данные, подменить ей ячейку дешевле, чем плодить параметры.
    const boxAt = { x: cx - boxCell.w / 2, y: cy - boxCell.h / 2 };
    placeSub(zoneSubtrees({ ...freeZone, cell: boxCell }, state, undefined, free), boxAt.x, boxAt.y);
    for (const sub of centerSubs) placeSub(sub, cx - sub.size.w / 2, cy - sub.size.h / 2);
  } else {
    // Прочие зоны — колонкой справа (белкины шестёрки лежат «рядом»).
    for (const sub of centerSubs) {
      placeSub(sub, rightX, colY);
      colY += sub.size.h + SEAT_LABEL_H + GAP.y;
    }
  }

  const offboard = membersOf(state, OFFBOARD_KEY);
  placed.push({
    id: OFFBOARD_KEY,
    origin: { x: rightX, y: colY },
    slot: group(OFFBOARD_KEY, pile({ dx: 0, dy: 26, cell: backCell }), offboard.map((m) => leaf(m, m, backCell))),
  });

  let handBottom = cy + reach;
  // Рука в дереве — только при placement:"board". «screen» уносит её в экранный HUD (handHud.ts).
  if (handConfig(spec.hand)?.placement === "board") {
    const key = handKey(selfSeat);
    const members = membersOf(state, key);
    const cards = members.map((m) => leaf(m, m, CARD));
    const layout = cards.length ? linear({ axis: "x", gap: GAP.x }) : pile({ dx: 0, dy: 0, cell: CARD });
    const y = cy + reach + GAP.y;
    placed.push({ id: key, origin: { x: MARGIN.x, y }, slot: group(key, layout, cards, { drop: { accept: () => true }, reorder: { enabled: true } }) });
    handBottom = y + CARD.h;
  }

  return finish(placed, cellRects, { w: rightX + backCell.w + MARGIN.x, h: handBottom + MARGIN.y });
}

