// KLONDIKE RULES — the one thing the engine's data-`Acceptor` cannot express: rank ADJACENCY
// (exactly one up or down). The engine gives structure, grab-a-run, the move plan, the flip and
// the render; these ~40 lines are the game's own law, which the canon says lives at the consumer.
//
// A card is read through its `Valued` fields — `{ suit, rank, colour }` — the same data the set
// declared. Nothing here reaches into a node's id.

export interface CardValue {
  readonly suit: string;
  readonly rank: string;
  readonly colour: string;
}

const RANK_ORDER = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;

/** 1 (Ace) … 13 (King). -1 for a rank the set does not use (a joker), so it never stacks. */
export function rankNum(rank: string): number {
  const i = (RANK_ORDER as readonly string[]).indexOf(rank);
  return i < 0 ? -1 : i + 1;
}

/** Read a card's Klondike-relevant values, or undefined when a node carries none (not a pip). */
export function valueOf(values: Readonly<Record<string, unknown>> | undefined): CardValue | undefined {
  if (!values) return undefined;
  const { suit, rank, colour } = values as Record<string, unknown>;
  if (typeof suit !== "string" || typeof rank !== "string" || typeof colour !== "string") return undefined;
  return { suit, rank, colour };
}

/**
 * May `mover` land on a TABLEAU column whose current top is `top` (undefined = empty column)?
 * Empty takes a King; otherwise a descending rank of the opposite colour — the classic rule.
 */
export function canOnTableau(mover: CardValue, top: CardValue | undefined): boolean {
  if (!top) return rankNum(mover.rank) === 13;
  return mover.colour !== top.colour && rankNum(mover.rank) === rankNum(top.rank) - 1;
}

/**
 * May `mover` land on a FOUNDATION whose current top is `top` (undefined = empty foundation)?
 * Empty takes an Ace; otherwise the same suit ascending by one — Ace, 2, 3 … up to King.
 */
export function canOnFoundation(mover: CardValue, top: CardValue | undefined): boolean {
  if (!top) return rankNum(mover.rank) === 1;
  return mover.suit === top.suit && rankNum(mover.rank) === rankNum(top.rank) + 1;
}

/** A run being carried is legal only if it is itself a descending alternating-colour sequence. */
export function isRunOrdered(run: readonly CardValue[]): boolean {
  for (let i = 1; i < run.length; i++) {
    const above = run[i]!;
    const below = run[i - 1]!;
    if (above.colour === below.colour || rankNum(above.rank) !== rankNum(below.rank) - 1) return false;
  }
  return true;
}
