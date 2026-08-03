import { absolute, linear, pile } from "../slot/layouts";
import { dropTarget, figures, homeOf as leafHomeOf, measure } from "../slot/slot";
import { group, leaf, type Group, type Size, type Slot, type Vec } from "../slot/types";
import { ringSlots } from "../slotfield/layout/slots";
import { at as fieldAt } from "../slotfield/slotField";
import { CARD } from "../crossade/tree";
import { handKey, OFFBOARD_KEY, type BoardState } from "./state";
import { slotKey, type BoardSpec, type ZoneSpec } from "./spec";

// ГЕОМЕТРИЯ БОРДЫ — ОДНО дерево слотов на рендер и дроп (канон всех сцен), собираемое из
// BoardSpec: каждая зона — поддерево со СВОЕЙ раскладкой; id узлов = SlotKey состояния
// («grid:r0c0», «chain:2», «hand:p1») — никакого второго словаря адресов. Ring-раскладка
// подключается стратегией absolute-координат (slotfield/layout/slots#ringSlots) — так две
// системы раскладки сливаются, а не соперничают (BOARDS-DESIGN §4).
//
// Компоновка v1: полоса чужих мест сверху → зоны стола (chain — своей строкой, остальные в
// ряд) → своя рука снизу. За бортом (offboard) — колонка справа: съеденные фигуры видны.

const GAP = { x: 24, y: 30 };
const MARGIN = { x: 40, y: 30 };
const SEAT_LABEL_H = 22;

/** Ячейка чужого места: ряд рубашек/фишек внахлёст. */
const SEAT_CELL: Size = { w: 200, h: 84 };
const SEAT_STACK_DX = 24;

export interface BoardTree {
  readonly root: Group;
  readonly size: Size;
  readonly origins: Readonly<Record<string, Vec>>;
  /** Прямоугольники клеток зон с фоном (шахматная раскраска) — рисует сцена. */
  readonly cellRects: Readonly<Record<string, { x: number; y: number; w: number; h: number }>>;
  homeOf(cardId: string): Vec | null;
  slotOf(cardId: string): string | null;
  slotAt(cp: Vec): string | null;
}

interface Placed {
  id: string;
  origin: Vec;
  slot: Slot;
}

function zoneCell(zone: ZoneSpec): Size {
  return zone.cell ?? CARD;
}

function membersOf(state: BoardState, key: string): readonly string[] {
  return fieldAt(state.field, key)?.members ?? [];
}

function slotGroup(key: string, members: readonly string[], cell: Size, stagger = 0.45): Slot {
  return group(key, pile({ dx: stagger, dy: stagger, cell }), members.map((m) => leaf(m, m, cell)), {
    drop: { accept: () => true },
  });
}

/** Поддерево зоны + её габарит. origin выдаёт компоновщик, здесь — локальные координаты. */
function zoneSubtrees(zone: ZoneSpec, state: BoardState): { placed: Placed[]; size: Size; cells: Record<string, { x: number; y: number; w: number; h: number }> } {
  const cell = zoneCell(zone);
  const placed: Placed[] = [];
  const cells: Record<string, { x: number; y: number; w: number; h: number }> = {};

  switch (zone.layout.kind) {
    case "grid": {
      const { cols, rows } = zone.layout;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const key = slotKey(zone.id, `r${r}c${c}`);
          const origin = { x: c * cell.w, y: r * cell.h };
          placed.push({ id: key, origin, slot: slotGroup(key, membersOf(state, key), cell, 0) });
          cells[key] = { x: origin.x, y: origin.y, w: cell.w, h: cell.h };
        }
      }
      return { placed, size: { w: zone.layout.cols * cell.w, h: zone.layout.rows * cell.h }, cells };
    }
    case "ring": {
      const n = zone.layout.count;
      const radius = Math.max(cell.w, cell.h) * n * 0.19;
      const cx = radius + cell.w / 2;
      const cy = radius + cell.h / 2;
      const slots = ringSlots(n, { cx, cy, radius, cell });
      for (const [i, s] of slots.entries()) {
        const key = slotKey(zone.id, i); // индекс, не «ring7»: словарь ключей один — SlotKey
        const origin = { x: s.rect.x, y: s.rect.y };
        placed.push({ id: key, origin, slot: slotGroup(key, membersOf(state, key), cell, 2) });
        cells[key] = { ...s.rect };
      }
      return { placed, size: { w: cx * 2, h: cy * 2 }, cells };
    }
    case "pile": {
      const key = slotKey(zone.id, 0);
      placed.push({ id: key, origin: { x: 0, y: 0 }, slot: slotGroup(key, membersOf(state, key), cell) });
      return { placed, size: cell, cells };
    }
    case "chain": {
      // Живые слоты 0..k−1 из состояния + ВСЕГДА один пустой в конце («новое звено», как play:new).
      const keys: string[] = [];
      for (let i = 0; ; i++) {
        const key = slotKey(zone.id, i);
        if (membersOf(state, key).length === 0) break;
        keys.push(key);
      }
      keys.push(slotKey(zone.id, keys.length));
      const linkGap = 14;
      keys.forEach((key, i) => {
        placed.push({ id: key, origin: { x: i * (cell.w * 0.72 + linkGap), y: 0 }, slot: slotGroup(key, membersOf(state, key), cell, 6) });
      });
      const w = (keys.length - 1) * (cell.w * 0.72 + linkGap) + cell.w;
      return { placed, size: { w, h: cell.h }, cells };
    }
  }
}

export function buildBoardTree(spec: BoardSpec, state: BoardState, selfSeat: string): BoardTree {
  const placed: Placed[] = [];
  const cellRects: Record<string, { x: number; y: number; w: number; h: number }> = {};

  // 1. Полоса чужих мест: ряд рубашек/фишек их руки внахлёст + резерв под подпись.
  const others = state.seats.filter((s) => s.id !== selfSeat);
  let x = MARGIN.x;
  const seatsY = MARGIN.y + SEAT_LABEL_H;
  for (const seat of others) {
    const key = `seat:${seat.id}`;
    const members = membersOf(state, handKey(seat.id));
    placed.push({
      id: key,
      origin: { x, y: seatsY },
      slot: group(key, pile({ dx: SEAT_STACK_DX, dy: 0, cell: { w: 58, h: 83 } }), members.map((m) => leaf(m, m, { w: 58, h: 83 }))),
    });
    // Ширина места ЖИВАЯ: ряд рубашек богатой руки шире номинала, сосед не должен наезжать.
    const stripW = Math.max(SEAT_CELL.w, (members.length - 1) * SEAT_STACK_DX + 58);
    x += stripW + GAP.x;
  }
  const seatsBottom = seatsY + (others.length ? SEAT_CELL.h : 0);

  // 2. Зоны стола: chain — своей строкой во всю ширину, остальные — в ряд. Правая колонка — offboard.
  let rowX = MARGIN.x;
  let rowBottom = seatsBottom + GAP.y;
  const rowTop = rowBottom;
  for (const zone of spec.zones.filter((z) => z.layout.kind !== "chain")) {
    const sub = zoneSubtrees(zone, state);
    for (const p of sub.placed) {
      placed.push({ ...p, origin: { x: rowX + p.origin.x, y: rowTop + p.origin.y } });
      const c = sub.cells[p.id];
      if (c) cellRects[p.id] = { ...c, x: rowX + c.x, y: rowTop + c.y };
    }
    rowX += sub.size.w + GAP.x * 2;
    rowBottom = Math.max(rowBottom, rowTop + sub.size.h);
  }
  let chainBottom = rowBottom;
  for (const zone of spec.zones.filter((z) => z.layout.kind === "chain")) {
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

  // 3. Своя рука снизу (если у борды есть руки).
  let handBottom = chainBottom;
  if (spec.hand) {
    const key = handKey(selfSeat);
    const members = membersOf(state, key);
    const cards = members.map((m) => leaf(m, m, CARD));
    const layout = cards.length ? linear({ axis: "x", gap: GAP.x }) : pile({ dx: 0, dy: 0, cell: CARD });
    placed.push({
      id: key,
      origin: { x: MARGIN.x, y: chainBottom + GAP.y },
      slot: group(key, layout, cards, { drop: { accept: () => true }, reorder: { enabled: true } }),
    });
    handBottom = chainBottom + GAP.y + CARD.h;
  }

  const root = group(
    "board-root",
    absolute(placed.map((p) => p.origin)),
    placed.map((p) => p.slot),
  );

  const origins: Record<string, Vec> = {};
  const slotIndex = new Map<string, string>();
  placed.forEach((p) => {
    origins[p.id] = p.origin;
    figures(p.slot).forEach((id) => slotIndex.set(id, p.id));
  });

  const measured = measure(root);
  const size = { w: Math.max(measured.w + MARGIN.x, rowX), h: Math.max(measured.h + MARGIN.y, handBottom + MARGIN.y) };

  return {
    root,
    size,
    origins,
    cellRects,
    homeOf: (id) => leafHomeOf(root, id),
    slotOf: (id) => slotIndex.get(id) ?? null,
    slotAt: (cp) => dropTarget(root, cp)?.group.id ?? null,
  };
}
