import { absolute, grid as flowGrid, linear, pile, radial } from "../slot/layouts";
import { dropTarget, figures, homeOf as leafHomeOf, measure } from "../slot/slot";
import { group, leaf, type Group, type Size, type Slot, type Vec } from "../slot/types";
import { ringSlots } from "../slotfield/layout/slots";
import { at as fieldAt } from "../slotfield/slotField";
import { CARD } from "../crossade/tree";
import { handKey, OFFBOARD_KEY, type BoardState } from "./state";
import { seatZoneId, slotKey, type BoardSpec, type ZoneSpec } from "./spec";

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
function zoneSubtrees(zone: ZoneSpec, state: BoardState, instanceId = zone.id): { placed: Placed[]; size: Size; cells: Record<string, { x: number; y: number; w: number; h: number }> } {
  const cell = zoneCell(zone);
  const zid = instanceId;
  const placed: Placed[] = [];
  const cells: Record<string, { x: number; y: number; w: number; h: number }> = {};

  switch (zone.layout.kind) {
    case "grid": {
      const { cols, rows } = zone.layout;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const key = slotKey(zid, `r${r}c${c}`);
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
        const key = slotKey(zid, i); // индекс, не «ring7»: словарь ключей один — SlotKey
        const origin = { x: s.rect.x, y: s.rect.y };
        placed.push({ id: key, origin, slot: slotGroup(key, membersOf(state, key), cell, 2) });
        cells[key] = { ...s.rect };
      }
      return { placed, size: { w: cx * 2, h: cy * 2 }, cells };
    }
    case "pile": {
      const key = slotKey(zid, 0);
      placed.push({ id: key, origin: { x: 0, y: 0 }, slot: slotGroup(key, membersOf(state, key), cell) });
      return { placed, size: cell, cells };
    }
    case "free": {
      // Одна зона — серый БОКС (cell = габарит бокса). Колода-стопка сидит по ЦЕНТРУ бокса и
      // таскается целиком; рамка-бокс (cellRects[key]) стоит на месте, сама стопка уезжает сдвигом,
      // который держит сцена. Дроп разрешён только в пределах этого бокса (см. scene.resolveDrop).
      const key = slotKey(zid, 0);
      // Колода у ВЕРХА бокса (по центру по X), чтобы грид в центре бокса был виден под ней.
      const deckOrigin = { x: (cell.w - CARD.w) / 2, y: 40 };
      placed.push({ id: key, origin: deckOrigin, slot: slotGroup(key, membersOf(state, key), CARD, 0.5) });
      cells[key] = { x: 0, y: 0, w: cell.w, h: cell.h };
      return { placed, size: cell, cells };
    }
    case "flow": {
      // Реордер-грид: ОДИН живой контейнер, колонки/строки пересчитывает раскладка slot/grid
      // (min/max/grow/reserve — параметры ЖИВЫЕ, при явном cell пустой грид держит габарит).
      const key = slotKey(zid, 0);
      const members = membersOf(state, key);
      const fspec = zone.layout;
      const GAP_CELL = 16; // гэп между картами в гриде
      const PAD = GAP_CELL; // внутренние отступы рамки = гэпу
      const layout = flowGrid({ cell, cols: fspec.cols, rows: fspec.rows, grow: fspec.grow, gap: GAP_CELL, reserve: fspec.reserve, center: fspec.center });
      const slot = group(key, layout, members.map((m) => leaf(m, m, cell)), {
        drop: { accept: () => true },
        reorder: { enabled: true },
      });
      // Карты сдвинуты внутрь на PAD; рамка грида (cellRect) — весь бокс с полями PAD со всех сторон
      // (внутренние отступы = гэпу). Рисуется по ВСЕЙ сетке, а не по одной карте.
      placed.push({ id: key, origin: { x: PAD, y: PAD }, slot });
      const { size } = layout.place(members.map(() => cell));
      const inner = { w: Math.max(size.w, cell.w), h: Math.max(size.h, cell.h) };
      const box = { w: inner.w + PAD * 2, h: inner.h + PAD * 2 };
      cells[key] = { x: 0, y: 0, w: box.w, h: box.h };
      return { placed, size: box, cells };
    }
    case "radial": {
      // Динамичная радиальная рассадка: ОДИН живой контейнер (как flow), жители по окружности,
      // радиус растёт с их числом. Рамка (cellRect) — квадрат-габарит; круг рисует сцена по shape.
      const key = slotKey(zid, 0);
      const members = membersOf(state, key);
      const PAD = 16;
      const layout = radial({ cell, gap: 12 });
      const slot = group(key, layout, members.map((m) => leaf(m, m, cell)), {
        drop: { accept: () => true },
        reorder: { enabled: true },
      });
      const { size } = layout.place(members.map(() => cell));
      const inner = { w: Math.max(size.w, cell.w), h: Math.max(size.h, cell.h) };
      const side = Math.max(inner.w, inner.h) + PAD * 2; // рамка квадратная: круг ровный
      placed.push({ id: key, origin: { x: (side - size.w) / 2, y: (side - size.h) / 2 }, slot });
      cells[key] = { x: 0, y: 0, w: side, h: side };
      return { placed, size: { w: side, h: side }, cells };
    }
    case "chain": {
      // Живые слоты 0..k−1 из состояния + ВСЕГДА один пустой в конце («новое звено», как play:new).
      const keys: string[] = [];
      for (let i = 0; ; i++) {
        const key = slotKey(zid, i);
        if (membersOf(state, key).length === 0) break;
        keys.push(key);
      }
      keys.push(slotKey(zid, keys.length));
      const linkGap = 14;
      keys.forEach((key, i) => {
        placed.push({ id: key, origin: { x: i * (cell.w * 0.72 + linkGap), y: 0 }, slot: slotGroup(key, membersOf(state, key), cell, 6) });
      });
      const w = (keys.length - 1) * (cell.w * 0.72 + linkGap) + cell.w;
      return { placed, size: { w, h: cell.h }, cells };
    }
    case "seats":
      // Круглый стол раскладывает buildBoardTree (нужны ВСЕ места и selfSeat); одиночный
      // экземпляр сюда не приходит — заглушка ради полноты switch.
      return { placed, size: cell, cells };
  }
}

/** Хвост сборки: одно дерево (absolute-раскладка по origin'ам) → индекс слотов, габарит, порт
 *  запросов дерева. Общий для обеих компоновок (полосы-строки и круглый стол). */
function finish(placed: Placed[], cellRects: Record<string, { x: number; y: number; w: number; h: number }>, hint: Size): BoardTree {
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
  const size = { w: Math.max(measured.w + MARGIN.x, hint.w), h: Math.max(measured.h + MARGIN.y, hint.h) };
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
function roundTableTree(spec: BoardSpec, state: BoardState, selfSeat: string, seatsZone: ZoneSpec): BoardTree {
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
  const boxCell = freeZone ? zoneCell(freeZone) : null;
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
    for (const p of sub.placed) {
      placed.push({ ...p, origin: { x: ox + p.origin.x, y: oy + p.origin.y } });
      const c = sub.cells[p.id];
      if (c) cellRects[p.id] = { ...c, x: ox + c.x, y: oy + c.y };
    }
  };

  let colY = cyTop;
  if (freeZone && boxCell) {
    // Бокс-борда по центру круга посадок; остальные зоны — в центр бокса.
    const boxAt = { x: cx - boxCell.w / 2, y: cy - boxCell.h / 2 };
    placeSub(zoneSubtrees(freeZone, state), boxAt.x, boxAt.y);
    for (const zone of tableZones) {
      if (zone === freeZone) continue;
      const sub = zoneSubtrees(zone, state);
      placeSub(sub, cx - sub.size.w / 2, cy - sub.size.h / 2);
    }
  } else {
    // Прочие зоны — колонкой справа (белкины шестёрки лежат «рядом»).
    for (const zone of tableZones) {
      const sub = zoneSubtrees(zone, state);
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
  if (spec.hand) {
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

export function buildBoardTree(spec: BoardSpec, state: BoardState, selfSeat: string): BoardTree {
  const seatsZone = spec.zones.find((z) => z.layout.kind === "seats");
  if (seatsZone) return roundTableTree(spec, state, selfSeat, seatsZone);

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
    for (const p of sub.placed) {
      placed.push({ ...p, origin: { x: ox + p.origin.x, y: oy + p.origin.y } });
      const c = sub.cells[p.id];
      if (c) cellRects[p.id] = { ...c, x: ox + c.x, y: oy + c.y };
    }
  };
  let boxRect: { x: number; y: number; w: number; h: number } | null = null;
  for (const zone of rowZones) {
    if (freeZone && zone !== freeZone) continue; // вложим ниже, в центр бокса
    const sub = zoneSubtrees(zone, state);
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
  if (spec.hand) {
    const key = handKey(selfSeat);
    const members = membersOf(state, key);
    const cards = members.map((m) => leaf(m, m, CARD));
    const layout = cards.length ? linear({ axis: "x", gap: GAP.x }) : pile({ dx: 0, dy: 0, cell: CARD });
    placed.push({
      id: key,
      origin: { x: MARGIN.x, y: selfZonesBottom + GAP.y },
      slot: group(key, layout, cards, { drop: { accept: () => true }, reorder: { enabled: true } }),
    });
    handBottom = selfZonesBottom + GAP.y + CARD.h;
  }

  return finish(placed, cellRects, { w: rowX, h: handBottom + MARGIN.y });
}
