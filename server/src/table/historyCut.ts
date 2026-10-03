// ИСТОРИЯ ДЛЯ ИГРОКА: журнал на диске — это ПРАВДА стола (лица всех карт), а игроку её отдавать нельзя. Режется так: лицо карты остаётся, только если игрок видит эту карту
// и СЕЙЧАС (иначе, пересмотрев партию, он запомнил бы, что у кого лежало). У остальных лиц нет вовсе; рубашки и подставные лица для них рисует сам экран.
//
// Чистые функции: журнал и «что игрок видит сейчас» приходят снаружи.

import type { History, HistoryEvent, Op, SeenCard, Snapshot } from "./contract.js";
import type { Told } from "../db/eventsRepo.js";
import { applyOpsInPlace } from "./patch.js";

/** Сколько событий в одной порции истории и за какое время (что наступит раньше). */
export const PAGE_ROWS = 400;
export const PAGE_MS = 20 * 60 * 1000;

const bare = <T extends SeenCard>(c: T, shown: ReadonlySet<string>): T => {
  if (c.face === undefined || shown.has(c.id)) return c;
  const { face: _drop, ...rest } = c;
  return rest as T;
};

/** Какие карты игрок видит в лицо СЕЙЧАС — по столу, каким его видит он. */
export function shownFaces(seenBy: Snapshot): Set<string> {
  const out = new Set<string>();
  for (const c of [...seenBy.chairs.flatMap((one) => one.hand), ...seenBy.piles.flatMap((p) => p.cards), ...seenBy.felt]) if (c.face !== undefined) out.add(c.id);
  return out;
}

/** Стол без лиц, которых игрок сейчас не видит. Возвращается копия. */
export function cutSnapshot(state: Snapshot, shown: ReadonlySet<string>): Snapshot {
  const s = structuredClone(state);
  for (const chair of s.chairs) chair.hand = chair.hand.map((c) => bare(c, shown));
  for (const pile of s.piles) pile.cards = pile.cards.map((c) => bare(c, shown));
  s.felt = s.felt.map((c) => bare(c, shown));
  return s;
}

/** Операция без лиц, которых игрок сейчас не видит. */
export function cutOp(op: Op, shown: ReadonlySet<string>): Op {
  switch (op.t) {
    case "move": return { ...op, card: bare(op.card, shown) };
    case "turn": return { ...op, card: bare(op.card, shown) };
    case "chair": return { ...op, chair: { ...op.chair, hand: op.chair.hand.map((c) => bare(c, shown)) } };
    case "deck": return { ...op, cards: op.cards.map((c) => bare(c, shown)) };
    case "unchair": return { ...op, felt: op.felt.map((c) => bare(c, shown)) };
    default: return op;
  }
}

const opsOf = (d: Told): Op[] => {
  const ops = (d.what as { ops?: unknown } | undefined)?.ops;
  return Array.isArray(ops) ? (ops as Op[]) : [];
};

/**
 * Порция истории до `before`.
 *
 * @param rows  строки журнала комнаты по порядку: `table.first`, `patch`, `carry.path` (другие не нужны)
 * @param shown карты, лица которых игрок видит сейчас
 * @returns `null` — истории нет (нет первого кадра или раньше `before` ничего не было)
 */
export function historyPage(rows: readonly Told[], before: number, shown: ReadonlySet<string>, pageRows: number = PAGE_ROWS, pageMs: number = PAGE_MS): History | null {
  let first = -1;
  for (let i = 0; i < rows.length; i++) if (rows[i]!.kind === "table.first" && rows[i]!.at <= before) first = i;
  if (first < 0) return null;
  const frame = (rows[first]!.what as { snapshot?: Snapshot } | undefined)?.snapshot;
  if (!frame) return null;
  const body = rows.slice(first + 1).filter((d) => (d.kind === "patch" || d.kind === "carry.path") && d.at < before);
  if (body.length === 0) return null;
  // Порция — последние события до `before`, но не больше `pageRows` и не глубже `pageMs` от последнего.
  const lastAt = body.at(-1)!.at;
  let cut = body.length;
  while (cut > 0 && body.length - cut < pageRows && (body.length - cut === 0 || body[cut - 1]!.at >= lastAt - pageMs)) cut--;
  // Свёртка всего, что раньше порции, — на месте, одной копией.
  const start = structuredClone(frame);
  for (const d of body.slice(0, cut)) if (d.kind === "patch") { const ops = opsOf(d); if (ops.length) applyOpsInPlace(start, ops, (d.what as { v?: number }).v); }
  const events: HistoryEvent[] = [];
  for (const d of body.slice(cut)) {
    if (d.kind === "patch") {
      const ops = opsOf(d);
      if (ops.length) events.push({ at: d.at, ops: ops.map((op) => cutOp(op, shown)) });
    } else {
      const w = d.what as { by?: string; id?: string; t0?: number; pts?: { dt: number; over: History["events"] extends never ? never : unknown }[] } | undefined;
      if (w?.by && w.id && Array.isArray(w.pts)) events.push({ at: w.t0 ?? d.at, path: { by: w.by, id: w.id, pts: w.pts as never } });
    }
  }
  if (events.length === 0) return null;
  events.sort((a, b) => a.at - b.at);
  return { before, start: cutSnapshot(start, shown), from: events[0]!.at, events, more: cut > 0 };
}
