// MECHANICS / STACK MERGING — the desk where a heap is a RULE and not an accident of geometry.
//
// Every stacking page on the gesture shelf answers "are these one pile" with "do they touch". That
// is the honest floor of the mechanic and it is not enough to deal a hand on: cards thrown across a
// desk land where they land, and one that stops with a corner over two different deals joins both
// of them — pick either up and it comes along, out of a hand it was never in. The complaint that
// built this page was exactly that, and it is not a bug in the touching: touching is a true answer
// to the wrong question.
//
// So this desk asks three questions where the shelf asked one, and they are three because they are
// about three different things:
//
//   WHAT IT IS      — a card heaps with a card, a chip with a chip OF ITS OWN DENOMINATION, a die
//                     with a die. Carried by the piece (`Heaping`) rather than worked out from what
//                     it happens to have, so a fourth kind added tomorrow says its own answer
//                     instead of waiting for somebody to extend a list.
//   HOW MUCH        — an overlap, as a share of a piece's own area, against a number on the panel.
//                     The same measure the tap ladder uses on the `Flip` page and deliberately NOT
//                     the same number: "enough of me shows to take a finger" and "enough of us
//                     overlap to be one pile" are two thresholds, and fused into one they would
//                     fight — a pile tight enough to hide its lower cards is one no card could be
//                     added to.
//   WHICH WAY UP    — and this one is not about the pieces at all but about the MOMENT, which is
//                     why it cannot be a field on a node. See `admits`.

import {
  add,
  Bounded,
  circle,
  compose,
  Container,
  Draggable,
  facing,
  freeLayout,
  Heaping,
  heapOf,
  heapsTogether,
  node,
  overlapFraction,
  rect,
  registerAsset,
  registerLayout,
  registerSurface,
  setFacing,
  Surfaced,
  Transformable,
  Valued,
  type Node,
  type Vec,
} from "../../src/index.js";
import { cards as crossadeCards } from "@game-presets/cards";
import { die } from "@game-presets/dice";
import { installMapArt, MAP, stackSeats, warmingNodes, type HeapRule } from "./gestureMap.js";
import { svg } from "./stockAssets.js";

/** How much of one piece must lie under another before the two are one pile, 0..1. */
export const MERGE_SHARE = 0.1;

/** What is on this desk: a closed deck, one card face up beside it, three colours of chip, two dice. */
export const MERGE = { cards: 36, open: 1, chips: 10, dice: 2 };

const CHIP = 0.5;
const CHIP_LAYOUT = "merge.free";

/**
 * THREE DENOMINATIONS, so "a chip heaps with a chip" is a claim that can be WRONG on the page.
 *
 * One colour and the rule is unfalsifiable: every pair a reader can make is a legal one, and a desk
 * that cannot be made to refuse teaches nothing about what it refuses. Ten of each, because a rule
 * about piles wants a pile — two chips prove the pair and not the run.
 */
const CHIPS = [
  { value: 5, ink: "firebrick" },
  { value: 25, ink: "seagreen" },
  { value: 100, ink: "steelblue" },
] as const;

const chipSurface = (value: number): string => `merge.chip.${value}`;

/** The same chip the stacking desk draws, with its colour and its number as arguments. */
const chipArt = (value: number, ink: string): string =>
  svg(
    100,
    100,
    [
      `<circle cx="50" cy="50" r="48" fill="${ink}" stroke="whitesmoke" stroke-width="3"/>`,
      '<circle cx="50" cy="50" r="44" fill="none" stroke="whitesmoke" stroke-width="11" stroke-dasharray="14 9.05"/>',
      `<circle cx="50" cy="50" r="33" fill="${ink}" stroke="whitesmoke" stroke-width="2"/>`,
      `<text x="50" y="50" fill="whitesmoke" font-family="Georgia,serif" font-size="${value > 99 ? 26 : 30}" font-weight="bold" text-anchor="middle" dominant-baseline="central">${value}</text>`,
    ].join(""),
  );

/** The denominations this desk deals in — the `Atoms/Heaping` page borrows them for its own pair. */
export const CHIP_VALUES = CHIPS.map(({ value }) => value);

/**
 * ONE CHIP, and the pile it says it belongs to is an argument.
 *
 * Normally that is its denomination and nothing else — which is the rule, stated once, on the piece.
 * The atom's own page hands a different name in on purpose: a chip that claims another pile's name
 * heaps with THAT pile, and a reader who can do that has understood what the field is for.
 */
export function mergeChip(id: string, value: number, at: Vec, heap = chipHeap(value)): Node {
  installMergeArt();
  return node(
    id,
    Bounded({ bounds: circle(CHIP / 2) }),
    Surfaced({ surface: chipSurface(value) }),
    Transformable({ at }),
    Valued({ values: { chip: value } }),
    Heaping({ heap }),
    PUT_DOWN,
  );
}

export function installMergeArt(): void {
  // THE MAP'S OWN FURNITURE FIRST — the felt this desk stands on and, more to the point, the HANDLE.
  // A surface nobody registered is not an error anywhere: an unregistered name is skipped in
  // silence, so the tab is simply drawn into nothing and the page looks exactly as though stacking
  // had been switched off. Which is how this desk shipped its first screenshot.
  installMapArt();
  registerLayout(CHIP_LAYOUT, freeLayout);
  for (const { value, ink } of CHIPS) {
    registerAsset(chipSurface(value), { src: chipArt(value, ink), w: CHIP, h: CHIP });
    registerSurface(chipSurface(value), { layers: [{ image: chipSurface(value), fit: "contain" }] });
  }
}

/** A piece put down on this desk stays where it was put — nothing here accepts a drop. */
const PUT_DOWN = Draggable({ onReject: "stay" });

/**
 * THE PILE A PIECE BELONGS TO, as a name.
 *
 * A chip's denomination is IN the name, and that is the point of the atom: `chip:5` and `chip:100`
 * are two different piles the way a card and a die are, and neither the kit nor this file has to
 * hold a rule saying so — the two chips simply do not answer to the same word.
 */
const cardHeap = "card";
const dieHeap = "die";
const chipHeap = (value: number): string => `chip:${value}`;

/**
 * WHICH WAY UP, and why it is a rule about the MOMENT rather than a field on a card.
 *
 * The thing a player means by "these are one pile" has a history in it. Drop a face-down deck onto
 * cards lying face up and the face-up ones are not swallowed — they were there first, the deck came
 * down ON them, and they keep their own business. Drop one face-up card ONTO a face-down pile and it
 * joins — it landed on the pile, it was never under it. Both arrangements have the same two facings
 * touching in the same place, and only the order they arrived in tells them apart.
 *
 * That order is already written down: the desk draws the last thing put down on top of everything
 * under it, so paint order IS arrival order and nothing else has to be remembered. So the rule is
 * one sentence — A MISMATCH IS FORGIVEN EXACTLY ONCE, AT THE TOP. The heap's own facing is the one
 * under its topmost piece; the top comes along whatever way up it is lying, and everything else has
 * to agree.
 *
 * Read out on the four cases that asked for it:
 *
 *   a face-down deck onto face-up cards   → the top is a deck card, the heap's facing is down, the
 *                                           face-up cards below disagree and stay behind.
 *   a face-up stack onto face-down cards  → the same sentence, mirrored.
 *   a face-up card onto a face-down pile  → the top is the card, the facing under it is down, and
 *                                           the pile agrees with itself: everything comes.
 *   a face-down card onto a face-up pile  → mirrored again.
 *
 * A one-card "deck" dropped onto a face-up card is then the same tree as a face-down card dropped
 * onto one, and merges. That is not a hole in the rule, it is the rule: with one card there is no
 * difference between putting a deck down and putting a card down, and a desk that claimed there was
 * would be remembering something the player cannot see.
 *
 * Pieces with no side to lie on — a chip, a die — are never cut: `facing` is a card's question, and
 * asked of a chip it has no answer to disagree with.
 */
function admits(group: readonly Node[]): readonly Node[] {
  const top = group[group.length - 1];
  if (!top) return group;
  const sides = group.map(facing);
  const up = sides[sides.length - 1];
  if (up === undefined) return group;
  // The heap's own facing: what lies under the top, unless the top agrees with it already.
  const under = sides[sides.length - 2];
  const heap = under === undefined || under === up ? up : under;
  return group.filter((n, i) => i === group.length - 1 || sides[i] === heap);
}

/**
 * The rule this desk plays by. `share` is the panel's number, so a reader can watch the same two
 * cards be one pile and two piles by turning it.
 */
export function mergeRule(share: number): HeapRule {
  return {
    joins: heapsTogether,
    // EITHER WAY ROUND. The measure is a share of one piece's own area and so is not symmetric — a
    // chip half under a card is half the chip and a tenth of the card. Two pieces are one pile when
    // either of them is that far into the other, which is what "10% touching" means to a hand: the
    // small piece being mostly covered is the obvious case, and demanding it of the big one too
    // would mean a chip could never join anything larger than itself.
    meets: (a, b) => Math.max(overlapFraction(a, b), overlapFraction(b, a)) >= share,
    admits,
    seats: mergeSeats,
  };
}

/**
 * HOW A LIFTED HEAP STANDS, and it is not one answer.
 *
 * A deck's thickness is its edge — a hair per card, and thirty of them still a deck. A chip stack is
 * a COLUMN: chips are discs and what you read off a stack of them is the striped side, so the step
 * is straight up and large enough to see, with nothing sideways in it. Two dice are neither — they
 * go nearly on top of each other with a real gap, because two dice in a hand are two things and a
 * pile of two that looked like one would be a die with a shadow.
 */
export function mergeSeats(group: readonly Node[], gripW: number): Vec[] {
  const heap = group[0] ? heapOf(group[0]) : undefined;
  // Looked up whole, never picked apart. A heap name is a NAME: `chip:25` says which pile, not
  // "a chip" plus "25" for somebody to read the halves of — the moment a `startsWith` decides
  // behaviour, the name has become a sentence and every new one has to be phrased for the parser.
  const own = heap === undefined ? undefined : STEPS.get(heap);
  return own ? stackSeats(group, gripW, own.step, own.thick) : stackSeats(group, gripW);
}

/**
 * A CHIP STACK IS A COLUMN: straight up, far enough apart that the stripes read, and the ceiling is
 * generous — ten chips standing a chip and a half tall is a stack of chips, where ten cards standing
 * that proud would be a fan.
 */
const COLUMN = { step: { x: 0, y: -0.05 }, thick: 0.7 };
/** Two dice sit nearly on each other, with a gap that says there are two of them and not one. */
const DIE = { step: { x: 0.06, y: -0.3 }, thick: 0.35 };

/** How each pile on this desk stands, by the pile's own name. A card's is the shelf's and unnamed. */
const STEPS = new Map<string, { readonly step: Vec; readonly thick: number }>([
  [dieHeap, DIE],
  ...CHIPS.map(({ value }) => [chipHeap(value), COLUMN] as const),
]);

/**
 * THE DESK. A closed deck, one card face up beside it, thirty chips in three denominations and two
 * dice — laid out so that nothing starts out touching anything, because a page that opens on a heap
 * teaches the heap and not how one comes about.
 */
export function mergeMap(): Node {
  installMergeArt();
  const desk = node(
    "map",
    Bounded({ bounds: rect(MAP.w, MAP.h) }),
    Container({ layout: CHIP_LAYOUT }),
    Surfaced({ surface: "gesture.map" }),
  );
  const all = crossadeCards().slice(0, MERGE.cards);
  all.forEach((card, i) => {
    const open = i < MERGE.open;
    const nth = i - MERGE.open;
    const at = open ? { x: -1.1, y: -2.5 } : { x: 0.95 + nth * 0.004, y: -2.5 - nth * 0.012 };
    compose(card, Transformable({ at }));
    compose(card, PUT_DOWN);
    compose(card, Heaping({ heap: cardHeap }));
    setFacing(card, open ? "up" : "down");
    add(desk, card);
  });
  CHIPS.forEach(({ value }, c) => {
    for (let i = 0; i < MERGE.chips; i++) {
      // Five across and two deep per denomination, and the blocks a clear gap apart: a desk that
      // opened with two colours already overlapping would be answering the page's own question
      // before the reader had touched anything.
      const at = { x: -1.24 + (i % 5) * 0.62, y: -1.15 + c * 1.3 + Math.floor(i / 5) * 0.62 };
      add(desk, mergeChip(`chip ${value}.${i}`, value, at));
    }
  });
  for (let i = 0; i < MERGE.dice; i++) {
    const d6 = die(`die ${i}`, { kind: "d6", at: { x: -0.8 + i * 1.6, y: 2.75 }, face: i === 0 ? 5 : 2 });
    compose(d6, PUT_DOWN);
    compose(d6, Heaping({ heap: dieHeap }));
    add(desk, d6);
  }
  for (const warm of warmingNodes()) add(desk, warm);
  return desk;
}
