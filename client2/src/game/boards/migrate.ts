// МИГРАЦИЯ СОСТОЯНИЯ ПРИ СМЕНЕ СПЕКИ — generic-утилита борды: смена раскладки/состава зон
// не должна терять карты. Не знает ни о какой «песочнице»: на вход старое состояние и НОВАЯ
// спека, на выход состояние, пересыпанное в её слоты.

import { baseZoneId, elementById, slotKey, zoneOf, zoneSlotCount, type BoardSpec } from "./spec";
import type { BoardState } from "./state";
import type { SlotField } from "../slotfield/slotField";

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
