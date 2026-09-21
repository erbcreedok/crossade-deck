// ОПТИМИСТИЧНЫЙ СЛОЙ — что стол покажет, НЕ ДОЖИДАЯСЬ СЕРВЕРА.
//
// Палец отпущен, намерение ушло, а ответ придёт через сеть. Экран до тех пор рисует догадку: снимок,
// каким он станет, если сервер согласится. Это единственное место, где клиент ПОВТОРЯЕТ правила стола
// (какой стороной ложится карта, когда стопка из одной карты рушится на сукно), и потому оно обязано
// совпадать с сервером — `optimistic.test.ts` сверяет догадку с настоящим `Table` ход за ходом.
//
// Чистые функции «снимок → снимок»: ни хранилища, ни экрана, ни времени. Кто я — приходит параметром.

import { DEFAULT_SPOT, type Face, type Intent, type Pile, type SeenCard, type Snapshot, type Where } from "../src/table/contract.js";
import { applyPatch } from "../src/table/patch.js";

/** Намерения, которые экран показывает пачкой сразу. */
export type BatchIntent = Extract<Intent, { t: "gather" | "moveMany" | "turnMany" | "pileDrop" }>;

/** На каком стуле сидит этот человек; пока стол его не прислал, пустая строка ни с чем не совпадёт. */
export const seatOf = (s: Snapshot, who: string): string => s.people.find((p) => p.key === who)?.seat ?? "";

export const pileOf = (s: Snapshot, id: string): Pile | undefined => s.piles.find((p) => p.id === id);

export function whereIs(s: Snapshot, id: string): Where | null {
  const pile = s.piles.find((p) => p.cards.some((c) => c.id === id));
  if (pile) return { in: "deck", pile: pile.id };
  const f = s.felt.find((c) => c.id === id);
  if (f) return { in: "felt", x: f.x, y: f.y, up: f.up, angle: f.angle };
  for (const chair of s.chairs) {
    const i = chair.hand.findIndex((c) => c.id === id);
    if (i >= 0) return { in: "hand", chair: chair.id, i };
  }
  return null;
}

/** Сторона карты, где бы она ни лежала. */
export function sideIn(s: Snapshot, id: string): { where: string; up: boolean; face?: Face } | null {
  const felt = s.felt.find((c) => c.id === id);
  if (felt) return { where: "felt", up: felt.up, face: felt.face };
  for (const pile of s.piles) {
    const card = pile.cards.find((c) => c.id === id);
    if (card) return { where: `deck:${pile.id}`, up: card.up === true, face: card.face };
  }
  for (const chair of s.chairs) {
    const card = chair.hand.find((c) => c.id === id);
    if (card) return { where: `hand:${chair.id}`, up: card.up === true, face: card.face };
  }
  return null;
}

/** Сторона, которой карта видна мне сейчас: на сукне и в стопке — как лежит, в руке — лицом, если его видно. */
export const shownUp = (s: Snapshot, id: string): boolean => {
  const side = sideIn(s, id);
  if (!side) return false;
  if (side.where.startsWith("hand:")) return side.face !== undefined && !side.up;
  return side.up;
};

/** Переложить карту на месте догадки: лицо — только если его видно мне и ляжет оно вверх. */
export function relocate(s: Snapshot, id: string, to: Where, up: boolean, me: string): Snapshot {
  const from = whereIs(s, id);
  if (!from) return s;
  const face = sideIn(s, id)?.face;
  const card: SeenCard = to.in === "hand"
    ? (to.chair === seatOf(s, me) && face ? { id, face } : { id })
    : { id, ...(up && face ? { face } : {}), ...(to.in === "deck" && up ? { up: true } : {}) };
  return applyPatch(s, { v: s.v, ops: [{ t: "move", card, from, to: to.in === "felt" ? { ...to, up } : to }] });
}

/** Невечная стопка из одной карты рушится на сукно, пустая — уходит (как `Table.sweepPile`). */
export function collapse(s: Snapshot, pile: string, me: string): Snapshot {
  const one = pileOf(s, pile);
  if (!one || one.forever || one.cards.length > 1) return s;
  const last = one.cards[0];
  if (last) s = relocate(s, last.id, { in: "felt", x: one.x, y: one.y, up: last.up === true, angle: one.angle }, last.up === true, me);
  return { ...s, piles: s.piles.filter((p) => p.id !== pile) };
}

/** Может ли моя рука тронуть карту: не чужая в пальце, не чужое выделение. */
export const touchable = (s: Snapshot, id: string, me: string): boolean => (!s.locks[id] || s.locks[id] === me) && (!s.picks?.[id] || s.picks[id] === me);

export function predict(st: Snapshot, intent: BatchIntent, me: string): Snapshot {
  let s = st;
  if (intent.t === "turnMany") {
    for (const id of intent.ids) if (touchable(s, id, me)) s = flipIn(s, id, !sideIn(s, id)?.up);
    return s;
  }
  if (intent.t === "moveMany") {
    for (const m of intent.moves) if (touchable(s, m.id, me)) s = relocate(s, m.id, m.to, m.to.in === "felt" ? shownUp(s, m.id) : shownUp(s, m.id), me);
    return s;
  }
  if (intent.t === "gather") {
    let pile = "pile" in intent.to ? intent.to.pile : "guess";
    if (!("pile" in intent.to)) {
      const at = intent.to;
      s = { ...s, piles: [...s.piles, { ...DEFAULT_SPOT, id: pile, x: at.x, y: at.y, angle: at.angle, forever: false, below: s.felt.map((c) => c.id), cards: [], shuffles: 0 }] };
    } else if (pileOf(s, pile)?.shut) return st;
    const sources = new Set<string>();
    for (const id of intent.ids) {
      const from = whereIs(s, id);
      if (!from || !touchable(s, id, me) || (from.in === "deck" && (from.pile === pile || pileOf(s, from.pile)?.shut))) continue;
      if (from.in === "deck") sources.add(from.pile);
      const up = intent.side === "up" ? true : intent.side === "down" ? false : shownUp(s, id);
      s = relocate(s, id, { in: "deck", pile }, up, me);
    }
    for (const one of sources) s = collapse(s, one, me);
    return collapse(s, pile, me);
  }
  const source = pileOf(s, intent.pile);
  const into = intent.to.in === "deck" ? pileOf(s, intent.to.pile) : undefined;
  if (!source || source.pin || source.shut || source.seal || into?.shut || into?.seal || !source.cards.every((c) => touchable(s, c.id, me))) return st;
  // В стопку одной стороной — её стороной; вперемешку или пустую — как лежали.
  const pack = into?.cards.map((c) => c.up === true) ?? [];
  const even = pack.length > 0 && pack.every((up) => up === pack[0]) ? pack[0] : undefined;
  let i = intent.to.i;
  for (const c of source.cards) {
    const to: Where = intent.to.in === "hand" ? { in: "hand", chair: intent.to.chair, i: i ?? 0 } : { in: "deck", pile: intent.to.pile, ...(i !== undefined && !into?.lock ? { i } : {}) };
    s = relocate(s, c.id, to, even ?? c.up === true, me);
    if (i !== undefined) i += 1;
  }
  return { ...s, piles: s.piles.filter((p) => p.id !== intent.pile) };
}

/** Карта `id` другой стороной, где бы ни лежала. Лицо, которое уходит от меня, прячется. */
export function flipIn(s: Snapshot, id: string, up: boolean): Snapshot {
  const flip = (c: SeenCard): SeenCard => {
    if (c.id !== id) return c;
    const { up: _was, ...rest } = c;
    return up ? { ...rest, up: true } : rest;
  };
  return {
    ...s,
    felt: s.felt.map((c) => (c.id === id ? { ...c, up } : c)),
    piles: s.piles.map((p) => (p.cards.some((card) => card.id === id) ? { ...p, cards: p.cards.map(flip) } : p)),
    chairs: s.chairs.map((c) => (c.hand.some((card) => card.id === id) ? { ...c, hand: c.hand.map(flip) } : c)),
  };
}
