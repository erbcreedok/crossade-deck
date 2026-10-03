// ПОДСТАВНЫЕ ЛИЦА В РЕПЛЕЕ. Прошлое показывает карту лицом, только если игрок видит это лицо и СЕЙЧАС: пересмотрев партию, он не должен узнать, что лежало у соседа в закрытой руке.
// У остальных карт вместо настоящего лица рисуется подставное — одно и то же для одной карты (оно считается от её номера), так что карта не «мигает» лицами, но по нему ничего не узнать.
//
// Чистые функции.

import type { Face, SeenCard, Snapshot, Suit } from "../src/table/contract.js";

const RANKS = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"] as const;
const SUITS: readonly Suit[] = ["s", "h", "d", "c"];

/** Подставное лицо карты `id`: всегда одно и то же. */
export function fakeFace(id: string): Face {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return { rank: RANKS[h % RANKS.length]!, suit: SUITS[(h >>> 8) % SUITS.length]! };
}

/** Какие карты игрок видит в лицо сейчас. */
export function shownNow(now: Snapshot): Set<string> {
  const out = new Set<string>();
  for (const c of [...now.chairs.flatMap((one) => one.hand), ...now.piles.flatMap((p) => p.cards), ...now.felt]) if (c.face !== undefined) out.add(c.id);
  return out;
}

/** Прошлый стол с подставными лицами вместо тех, что игрок сейчас не видит. Возвращается копия; сами карты и их места не меняются. */
export function maskFaces(past: Snapshot, shown: ReadonlySet<string>): Snapshot {
  const fix = <T extends SeenCard>(c: T): T => {
    if (shown.has(c.id)) return c;
    // Было лицо — теперь оно закрыто; лежит лицом вверх, а лица нет (история без лиц) — тоже подставное.
    if (c.face !== undefined || c.up === true) return { ...c, face: fakeFace(c.id) };
    return c;
  };
  const s = structuredClone(past);
  for (const chair of s.chairs) chair.hand = chair.hand.map((c) => (c.face !== undefined && !shown.has(c.id) ? { ...c, face: fakeFace(c.id) } : c));
  for (const pile of s.piles) pile.cards = pile.cards.map(fix);
  s.felt = s.felt.map(fix);
  return s;
}
