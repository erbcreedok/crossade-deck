// НАСТРОЙКИ ПЕСОЧНИЦЫ — данные, которые крутит контекстное меню (long-press/ПКМ): форма борды,
// рассадка стола, слоты, стакинг, посадки. Чистый модуль: строки меню и переключение значений —
// функции без Pixi; смена спеки НЕ теряет карты — migrateState пересыпает жителей в новые слоты.

import { baseZoneId, elementById, slotKey, zoneOf, zoneSlotCount, type BoardSpec } from "./spec";
import type { BoardState } from "./state";
import type { SlotField } from "../slotfield/slotField";

export interface SandboxSettings {
  /** Форма борды-бокса (и круга стола при динамике). */
  shape: "circle" | "rect";
  /** Рассадка карт стола: по радиусу или сеткой. */
  table: "radial" | "grid";
  /** Слоты стола: динамичные или фиксированное число. */
  slots: "dynamic" | number;
  /** Для фикс-слотов: можно ли класть карты друг на друга. */
  stacking: boolean;
  /** Посадочные места вокруг стола. */
  seats: number;
  /** Размер колоды песочницы. Джокеры — позже (лицам карт нужен свой рендер). */
  deck: 36 | 52;
}

export const DEFAULT_SANDBOX_SETTINGS: SandboxSettings = {
  shape: "circle",
  table: "radial",
  slots: "dynamic",
  stacking: true,
  seats: 4,
  deck: 36,
};

/** По какой цели открыто меню: борда целиком (free-бокс) или грид-стол. */
export type MenuTargetKind = "board" | "table";

/** Строка меню — данные: подпись слева, текущее значение справа; тап циклит значение. */
export interface SettingRow {
  key: keyof SandboxSettings;
  label: string;
  value: string;
}

const SLOT_STEPS: readonly (SandboxSettings["slots"])[] = ["dynamic", 4, 6, 8, 12];
const SEAT_STEPS: readonly number[] = [1, 2, 3, 4, 5, 6, 8, 12];

function next<T>(steps: readonly T[], cur: T): T {
  const i = steps.indexOf(cur);
  return steps[(i + 1) % steps.length]!;
}

export function settingRows(target: MenuTargetKind, s: SandboxSettings): SettingRow[] {
  if (target === "board") {
    return [
      { key: "shape", label: "форма", value: s.shape === "circle" ? "круг" : "квадрат" },
      { key: "seats", label: "посадки", value: String(s.seats) },
    ];
  }
  const rows: SettingRow[] = [
    { key: "table", label: "рассадка", value: s.table === "radial" ? "по радиусу" : "сеткой" },
    { key: "slots", label: "слоты", value: s.slots === "dynamic" ? "динамично" : String(s.slots) },
  ];
  // Стакинг имеет смысл только на фикс-слотах: в динамике жители встраиваются, не стопкуются.
  if (s.slots !== "dynamic") rows.push({ key: "stacking", label: "стопки", value: s.stacking ? "можно" : "нельзя" });
  return rows;
}

/** Тап по строке меню: перещёлкнуть ОДНУ настройку на следующее значение. */
export function applySetting(s: SandboxSettings, key: keyof SandboxSettings): SandboxSettings {
  switch (key) {
    case "shape":
      return { ...s, shape: s.shape === "circle" ? "rect" : "circle" };
    case "table":
      return { ...s, table: s.table === "radial" ? "grid" : "radial" };
    case "slots":
      return { ...s, slots: next(SLOT_STEPS, s.slots) };
    case "stacking":
      return { ...s, stacking: !s.stacking };
    case "seats":
      return { ...s, seats: next(SEAT_STEPS, s.seats) };
    case "deck":
      return { ...s, deck: s.deck === 36 ? 52 : 36 };
  }
}

/**
 * Пересыпать жителей старого состояния в слоты НОВОЙ спеки (смена раскладки зоны не должна
 * терять карты). Правила: зона есть в новой спеке → её жители (в порядке слотов) раскладываются
 * заново — динамика в один контейнер, фикс-слоты по кругу (i % n); ключи вне спеки (руки,
 * offboard, посадочные слоты) едут как есть; руки ИСЧЕЗНУВШИХ мест высыпаются в первую зону.
 */
export function migrateState(old: BoardState, spec: BoardSpec, seatsWanted?: number): BoardState {
  const zoneIds = new Set(spec.zones.map((z) => z.id));
  const known = elementById(spec);
  const pools = new Map<string, string[]>();
  const keep: Record<string, { members: string[] }> = {};
  const placed = new Set<string>();

  const n = seatsWanted ?? old.seats.length;
  const liveSeats = new Set(old.seats.slice(0, n).map((s) => s.id));

  for (const [key, cont] of Object.entries(old.field.slots)) {
    // Смена колоды (52 → 36) выкидывает исчезнувшие лица — незнакомых спеке жителей не тащим.
    const members = cont.members.filter((id) => known.has(id));
    members.forEach((id) => placed.add(id));
    if (!members.length) continue;
    const zone = baseZoneId(zoneOf(key));
    if (zoneIds.has(zone)) {
      pools.set(zone, [...(pools.get(zone) ?? []), ...members]);
    } else if (zone === "hand" && !liveSeats.has(key.slice("hand:".length))) {
      // Рука исчезнувшего места — высыпать в первую зону спеки (карты не пропадают).
      const first = spec.zones[0]!.id;
      pools.set(first, [...(pools.get(first) ?? []), ...members]);
    } else {
      keep[key] = { members };
    }
  }

  // Смена колоды (36 → 52): НОВЫЕ лица, которых старое состояние не знало, доезжают в первую зону.
  const fresh = [...known.keys()].filter((id) => !placed.has(id));
  if (fresh.length) {
    const first = spec.zones[0]!.id;
    pools.set(first, [...(pools.get(first) ?? []), ...fresh]);
  }

  const slots: SlotField["slots"] = { ...keep };
  for (const zone of spec.zones) {
    const pool = pools.get(zone.id) ?? [];
    if (!pool.length) continue;
    const count = zoneSlotCount(zone);
    if (count === "dynamic" || count === 1) {
      slots[slotKey(zone.id, 0)] = { members: pool };
      continue;
    }
    const buckets: string[][] = Array.from({ length: count }, () => []);
    pool.forEach((id, i) => buckets[i % count]!.push(id));
    buckets.forEach((members, i) => {
      if (!members.length) return;
      const slot = zone.layout.kind === "grid" ? `r${Math.floor(i / zone.layout.cols)}c${i % zone.layout.cols}` : i;
      slots[slotKey(zone.id, slot)] = { members };
    });
  }

  const seats = Array.from({ length: n }, (_, i) => old.seats[i] ?? { id: `p${i + 1}`, name: `Игрок ${i + 1}`, occupant: `Игрок ${i + 1}` });
  return { ...old, field: { ...old.field, slots }, seats, turn: { at: Math.min(old.turn.at, n - 1), dir: old.turn.dir } };
}
