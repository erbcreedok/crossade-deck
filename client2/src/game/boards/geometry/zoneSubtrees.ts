// ПОДДЕРЕВЬЯ ЗОН: раскладка ОДНОЙ зоны BoardSpec в слоты (grid/ring/pile/free/flow/radial/chain).
// Композиторы (полоса, круглый стол) зовут её и расставляют результат. Чистая геометрия.

import { grid as flowGrid, pile, radial, radialPositions } from "../../slot/layouts";
import { group, leaf, type Size, type Slot } from "../../slot/types";
import type { DropPolicy } from "../../slot/dropPolicy";
import { ringSlots } from "../../slotfield/layout/slots";
import { at as fieldAt } from "../../slotfield/slotField";
import { CARD } from "../../crossade/tree";
import type { BoardState } from "../core/state";
import { freeStackSize, FREE_STAGGER, looseOrigin } from "./freeDrop";
import { slotKey, zoneOf, type ZoneSpec } from "../core/spec";
import type { FreePositions, Placed } from "./treeShared";

export function zoneCell(zone: ZoneSpec): Size {
  return zone.cell ?? CARD;
}

export function membersOf(state: BoardState, key: string): readonly string[] {
  return fieldAt(state.field, key)?.members ?? [];
}

export function slotGroup(key: string, members: readonly string[], cell: Size, stagger = 0.45, policy?: DropPolicy): Slot {
  return group(key, pile({ dx: stagger, dy: stagger, cell }), members.map((m) => leaf(m, m, cell)), {
    drop: { accept: () => true, ...(policy ? { policy } : {}) },
  });
}

/** Поддерево зоны + её габарит. origin выдаёт компоновщик, здесь — локальные координаты. */
export function zoneSubtrees(zone: ZoneSpec, state: BoardState, instanceId = zone.id, free?: FreePositions): { placed: Placed[]; size: Size; cells: Record<string, { x: number; y: number; w: number; h: number }> } {
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
      // Одна зона — серый БОКС (cell = габарит бокса). Слот 0 — колода: сидит у верха бокса и
      // таскается целиком; её сдвиг (free.offset) — часть геометрии, чтобы хит-тест и подсветка
      // совпадали с визуалом. Остальные слоты зоны — СВОБОДНЫЕ стопки: карта, брошенная в бокс,
      // лежит ГДЕ положили (free.loose, центр стопки); рамка-бокс (cellRects) стоит на месте.
      const key = slotKey(zid, 0);
      const off = free?.offset[zid] ?? { x: 0, y: 0 };
      // Колода у ВЕРХА бокса (по центру по X), чтобы грид в центре бокса был виден под ней.
      // Политика зоны (drop) достаётся ЕЙ: снеп по нахлёсту, вид груза, наклон, магнит.
      const deckOrigin = { x: (cell.w - CARD.w) / 2 + off.x, y: 40 + off.y };
      placed.push({ id: key, origin: deckOrigin, slot: slotGroup(key, membersOf(state, key), CARD, FREE_STAGGER, zone.drop) });
      cells[key] = { x: 0, y: 0, w: cell.w, h: cell.h };
      for (const k of Object.keys(state.field.slots)) {
        if (zoneOf(k) !== zid || k === key) continue;
        const members = membersOf(state, k);
        if (!members.length) continue;
        const stack = freeStackSize(CARD, members.length);
        const center = free?.loose[k] ?? { x: cell.w / 2, y: cell.h / 2 };
        // Свободные стопки ловят ПАЛЬЦЕМ (как до снепа): карта в круге ложится где и как положили,
        // случайный нахлёст соседней стопки не должен утаскивать в неё дроп.
        placed.push({ id: k, origin: looseOrigin(cell, center, stack), slot: slotGroup(k, members, CARD, FREE_STAGGER, { hit: "finger" }) });
      }
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
        drop: { accept: () => true, ...(zone.drop ? { policy: zone.drop } : {}) },
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
      // радиус растёт с их числом, но круг размечен МИНИМУМ на min позиций (место каждому игроку):
      // min держит РАЗМЕР круга — пустой стол сразу очерчен под всех, без прыжков на первых картах.
      // Никаких заготовок-«шариков» по позициям — размечен только сам круг (рамка зоны).
      const key = slotKey(zid, 0);
      const members = membersOf(state, key);
      const min = zone.layout.min ?? 0;
      const PAD = 16;
      const layout = radial({ cell, gap: 12, slots: min });
      const slot = group(key, layout, members.map((m) => leaf(m, m, cell)), {
        drop: { accept: () => true, ...(zone.drop ? { policy: zone.drop } : {}) },
        reorder: { enabled: true },
      });
      const count = Math.max(members.length, min);
      const pos = radialPositions(count, cell, 12);
      const inner = { w: Math.max(pos.size.w, cell.w), h: Math.max(pos.size.h, cell.h) };
      const side = Math.max(inner.w, inner.h) + PAD * 2; // рамка квадратная: круг ровный
      placed.push({ id: key, origin: { x: (side - pos.size.w) / 2, y: (side - pos.size.h) / 2 }, slot });
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

