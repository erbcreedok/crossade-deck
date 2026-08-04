// СОСТОЯНИЕ борды — по канону Косынки (BOARDS-DESIGN §2 п.2): чистые данные на SlotField
// (Record<SlotKey, Container>, иммутабельные переходы), геометрию рисует дерево (boardTree.ts).
// ЕДИНЫЙ словарь адресов: зоны стола, руки («hand:p1») и выход за борт («offboard:0») — слоты
// одного поля; move между ними — одна операция, без спецслучаев.

import type { SlotField } from "../slotfield/slotField";
import { at, place } from "../slotfield/slotField";
import { elementById, slotKey, type BoardSpec } from "./spec";

export interface SeatState {
  id: string; // "p1"…
  name: string;
  /** Кто сидит (identity наблюдателя/юзера) или null — свободный стул. В мок-режиме люди —
   *  фантомы: occupant заполняется мок-именами. */
  occupant: string | null;
}

export interface TurnState {
  /** Чей ход — индекс в кругу мест. Индикация, не запрет (смарт-мок, BOARDS-DESIGN §3). */
  at: number;
  dir: 1 | -1;
}

export interface Vec {
  x: number;
  y: number;
}

/** Позиции free-зон — ЧАСТЬ СОСТОЯНИЯ (стол у всех одинаковый): сдвиг колоды-блока по зоне и
 *  центры свободных стопок по слотам (координаты локальны боксу зоны). */
export interface FreeVisual {
  offset: Record<string, Vec>;
  loose: Record<string, Vec>;
}

/** Оверрайд визуала карты (меню/дроп): поворот и принудительное лицо/рубашка. Тоже состояние —
 *  перевёрнутая в колоде карта обязана быть перевёрнутой у ВСЕХ. */
export interface CardFx {
  rot?: number;
  face?: boolean;
}

export interface BoardState {
  field: SlotField;
  seats: SeatState[];
  /** id места раздающего (у deal «all-even-dealer-last» ему достаётся последним и меньше). */
  dealer: string;
  turn: TurnState;
  /** Последний бросок кубиков ([] — не бросали). */
  dice: number[];
  free: FreeVisual;
  fx: Record<string, CardFx>;
}

/** Донормировать снимок из сети/архива: старый формат без free/fx получает пустые поля. */
export function ensureVisuals(s: BoardState): BoardState {
  if (s.free && s.fx) return s;
  return { ...s, free: s.free ?? { offset: {}, loose: {} }, fx: s.fx ?? {} };
}

/** Ключ руки места. Рука — обычная зона поля (см. заголовок). */
export function handKey(seatId: string): string {
  return slotKey("hand", seatId);
}

export const OFFBOARD_KEY = slotKey("offboard", 0);

export function handOf(state: BoardState, seatId: string): readonly string[] {
  return at(state.field, handKey(seatId))?.members ?? [];
}

export function seatCount(spec: BoardSpec, wanted?: number): number {
  const c = spec.seats.count;
  if ("fixed" in c) return c.fixed;
  return Math.min(c.max, Math.max(c.min, wanted ?? c.min));
}

/** Начальное состояние: слоты из setup-зон, места-фантомы, всё остальное пусто. Раздачу
 *  (mock.deal) выполняет команда reset/deal (mock.ts) — фабрика состояния про команды не знает.
 *  occupants — рассадка от КОМНАТЫ (room.ts): имя на стуле или null (свободен); без неё места
 *  занимают фантомы «Игрок N» (standalone-режим). */
export function initialState(spec: BoardSpec, seatsWanted?: number, occupants?: readonly (string | null)[]): BoardState {
  let field: SlotField = { slots: {}, onEmpty: "keep" };
  for (const zone of spec.zones) {
    for (const [slot, members] of Object.entries(zone.setup ?? {})) {
      field = place(field, slotKey(zone.id, slot), { members: [...members] });
    }
  }
  const n = seatCount(spec, seatsWanted);
  const seats: SeatState[] = Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Игрок ${i + 1}`,
    occupant: occupants ? (occupants[i] ?? null) : `Игрок ${i + 1}`,
  }));
  const known = elementById(spec);
  // Санити на спеку: setup не должен селить неизвестные id (ловим опечатку данных сразу).
  for (const key of Object.keys(field.slots)) {
    for (const id of field.slots[key]!.members) {
      if (!known.has(id)) throw new Error(`setup: неизвестный элемент "${id}" в ${key}`);
    }
  }
  return { field, seats, dealer: "p1", turn: { at: 0, dir: 1 }, dice: [], free: { offset: {}, loose: {} }, fx: {} };
}
