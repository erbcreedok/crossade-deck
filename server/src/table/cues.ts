// ЗВУКОВЫЕ ПОВОДЫ — что случилось между двумя кадрами стола, одним списком. Кадр — то, что нарисовано (со
// своими догадками), поэтому свой бросок звучит сразу, а ответ сервера, ничего не поменявший, — тишина.
//
// Звук ставится по месту: сукно — точка, стопка — её id, рука — id стула. Одинаковый повод в одном месте за
// кадр звучит один раз: собрали двадцать карт — один стук, а не двадцать.

import type { Snapshot } from "./contract.js";

/** `out` — карта из руки на сукно, `sort` — карту переставили внутри своей же руки. */
export const CUE_KINDS = ["drop", "hand", "out", "turn", "gather", "merge", "shuffle", "sort"] as const;
export type CueKind = (typeof CUE_KINDS)[number];

export type CueAt = { felt: { x: number; y: number } } | { pile: string } | { chair: string };

export interface Cue {
  kind: CueKind;
  at: CueAt;
}

/** Больше звуков за кадр не играет — синк после переподключения не должен греметь. */
export const CUES_PER_FRAME = 4;

export type Spot = { in: "felt"; x: number; y: number; up: boolean } | { in: "pile"; pile: string; up: boolean } | { in: "chair"; chair: string; up: boolean };

export function spots(s: Snapshot): Map<string, Spot> {
  const out = new Map<string, Spot>();
  for (const f of s.felt) out.set(f.id, { in: "felt", x: f.x, y: f.y, up: f.up });
  for (const p of s.piles) for (const c of p.cards) out.set(c.id, { in: "pile", pile: p.id, up: c.up === true });
  for (const ch of s.chairs) for (const c of ch.hand) out.set(c.id, { in: "chair", chair: ch.id, up: c.up === true });
  return out;
}

const place = (s: Spot): string => (s.in === "felt" ? "felt" : s.in === "pile" ? `pile:${s.pile}` : `chair:${s.chair}`);

/**
 * `known` — где карта была видна последний раз, даже если в прошлом кадре её не было: карту, которую только
 * нажали и отпустили на месте, из кадра вынимали, но она никуда не ездила — это тишина, а не стук.
 */
export function cuesBetween(prev: Snapshot, next: Snapshot, known: ReadonlyMap<string, Spot> = new Map()): Cue[] {
  const was = new Map([...known, ...spots(prev)]);
  const now = spots(next);
  const out: Cue[] = [];
  const said = new Set<string>();
  const say = (kind: CueKind, at: CueAt) => {
    const key = `${kind}:${JSON.stringify(at)}`;
    if (said.has(key)) return;
    said.add(key);
    out.push({ kind, at });
  };

  // ПРИШЛО В СТОПКУ — откуда: из другой стопки (мерж), с сукна двумя и больше (сборка), иначе — просто положили.
  const intoPile = new Map<string, { fromPiles: number; fromFelt: number; other: number }>();
  for (const [id, n] of now) {
    // Не было в прошлом кадре — карту несли в воздухе (из кадра она вынута) и положили.
    const w = was.get(id);
    if (w && place(w) === place(n)) {
      if (n.in === "felt" && w.in === "felt" && (w.x !== n.x || w.y !== n.y)) say("drop", { felt: { x: n.x, y: n.y } });
      else if (w.up !== n.up && n.in !== "chair") say("turn", n.in === "felt" ? { felt: { x: n.x, y: n.y } } : { pile: (n as { pile: string }).pile });
      else if (w.up !== n.up && n.in === "chair") say("turn", { chair: n.chair });
      continue;
    }
    if (n.in === "felt") say(w?.in === "chair" ? "out" : "drop", { felt: { x: n.x, y: n.y } });
    else if (n.in === "chair") say("hand", { chair: n.chair });
    else {
      const tally = intoPile.get(n.pile) ?? { fromPiles: 0, fromFelt: 0, other: 0 };
      if (w?.in === "pile") tally.fromPiles += 1;
      else if (w?.in === "felt") tally.fromFelt += 1;
      else tally.other += 1;
      intoPile.set(n.pile, tally);
    }
  }
  for (const [pile, t] of intoPile) {
    if (t.fromPiles >= 2) say("merge", { pile });
    else if (t.fromFelt + t.fromPiles >= 2) say("gather", { pile });
    else say("drop", { pile });
  }

  // СТОПКУ ПЕРЕНЕСЛИ ПО СТОЛУ — стук, как у карты.
  const placed = new Map(prev.piles.map((p) => [p.id, p]));
  for (const p of next.piles) {
    const before = placed.get(p.id);
    if (before && (before.x !== p.x || before.y !== p.y)) say("drop", { pile: p.id });
  }

  // КАРТУ ПЕРЕСТАВИЛИ ВНУТРИ РУКИ — состав тот же, порядок другой. Ушла карта или пришла — это уже сказано
  // выше («в руку» или «на сукно»), и второй раз рука не звучит.
  const hands = new Map(prev.chairs.map((c) => [c.id, c.hand.map((k) => k.id)]));
  for (const ch of next.chairs) {
    const before = hands.get(ch.id);
    const after = ch.hand.map((k) => k.id);
    if (!before || before.length !== after.length) continue;
    const same = [...before].sort().join() === [...after].sort().join();
    if (same && before.join() !== after.join()) say("sort", { chair: ch.id });
  }

  const shuffles = new Map(prev.piles.map((p) => [p.id, p.shuffles]));
  for (const p of next.piles) {
    const before = shuffles.get(p.id);
    if (before !== undefined && before !== p.shuffles) say("shuffle", { pile: p.id });
  }
  return out.slice(0, CUES_PER_FRAME);
}
