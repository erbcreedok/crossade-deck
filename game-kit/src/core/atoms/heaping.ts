// HEAPING — which pile a piece may join, as a name it carries rather than a rule somebody wrote.
//
// Every desk that lets things be pushed together has to answer "may these two become one thing",
// and the answer is never geometry alone: a card lands on a chip all the time and nobody means a
// stack by it. Left to the desk, that answer becomes a chain of tests about what each piece happens
// to be — has it faces, has it a back, what is its value — which is a list somebody has to remember
// to extend on the day a fourth kind of piece arrives.
//
// So a piece says it itself. Two pieces may heap when they name the same heap and not otherwise;
// what a name MEANS is the game's business and the kit never looks inside it. A chip's denomination
// belongs in the name (`chip:25` and `chip:100` are different piles); a card's face does not, and
// that is deliberate — which faces may lie together is a rule about the MOMENT, not about the piece,
// and a rule about a moment cannot live on a node.
//
// `own`, never inherited: a tray full of cards is not itself a card, and a piece in somebody's hand
// belongs to the same pile it belonged to on the felt.

import { defineAtom } from "../atom.js";
import { fieldsOf, type Node } from "../node.js";

export interface HeapingFields {
  /** The pile this piece belongs to. Empty — the default — is a piece that heaps with nothing. */
  readonly heap: string;
  /**
   * HOW FAR FROM ITSELF ANOTHER OF ITS PILE STILL COUNTS AS NEXT TO IT, root units.
   *
   * Because "together" is not one thing on a desk. Cards have to be ON each other — a hand is a
   * hand because the cards overlap, and two cards lying a finger apart are two cards. Chips and dice
   * are not like that at all: a pile of chips beside another pile of chips is one pot, and dice
   * thrown together are one roll however they scattered. Nobody stacks dice; they are gathered.
   *
   * `0` — the default — is the strict answer, and it is not "touching": a piece with no reach has to
   * be COVERED to belong, which is what a card means by a pile. Anything above zero is a
   * neighbourhood, measured out from the piece's own outline.
   */
  readonly reach: number;
}

export const Heaping = defineAtom<HeapingFields>({
  name: "Heaping",
  requires: [],
  defaults: { heap: "", reach: 0 },
  classes: { heap: "own", reach: "own" },
});

/** The pile this piece belongs to, or `undefined` for one that joins none. */
export function heapOf(n: Node): string | undefined {
  const name = fieldsOf<HeapingFields>(n, "Heaping")?.heap;
  return name ? name : undefined;
}

/** How far out this piece looks for its own kind, root units — `0` for one that must be covered. */
export function reachOf(n: Node): number {
  return fieldsOf<HeapingFields>(n, "Heaping")?.reach ?? 0;
}

/** May these two become one thing? The same name, and neither of them nameless. */
export function heapsTogether(a: Node, b: Node): boolean {
  const one = heapOf(a);
  return one !== undefined && one === heapOf(b);
}
