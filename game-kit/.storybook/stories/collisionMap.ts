// MECHANICS / COLLISION — the desk where nothing ends up on top of anything that did not mean it to.
//
// A desk is a place where things land on each other: that is what a pile IS, and every page on the
// gesture shelf is built on it. It is also, for one kind of piece, exactly wrong. A die is READ. Two
// of them one over the other is not a pile of dice — it is one die with a shadow, and the second
// result is gone. Thrown by the same hand at the same instant they arrive that way every time, and
// no amount of friction or bounce fixes it, because nothing in a one-body physics has an opinion
// about where the other body is.
//
// So a piece may say how much room it takes (`SlideOptions.girth`), and any two that both said so
// are kept out of each other's way for the whole of their travel — pushed apart, trading speeds
// along the line between them, and NOT put down while another one can still reach them. A piece
// that says nothing takes no room and is left alone, which is why the cards and chips on this desk
// still land on each other exactly as they always did.
//
// The pair on the desk is the lesson. Dice that cannot cover each other and chips that can, under
// one throw, at one moment, on one felt — a reader who sees only the dice cannot tell a law from a
// side effect of being a die.

import {
  add,
  Bounded,
  compose,
  Container,
  Draggable,
  Heaping,
  Reaching,
  node,
  rect,
  Surfaced,
  Transformable,
  type Node,
} from "../../src/index.js";
import { cards as crossadeCards } from "@game-presets/cards";
import { die } from "@game-presets/dice";
import { installMapArt, kindOf, MAP, roomBy, warmingNodes, type Bump } from "./gestureMap.js";
import { installMergeArt, mergeChip, MERGE_REACH } from "./mergeMap.js";

/** A piece put down on this desk stays where it was put — nothing here accepts a drop. */
const PUT_DOWN = Draggable({ onReject: "stay" });

/** What is on this desk: a handful of dice to throw, and pieces that are meant to stack, for contrast. */
export const CROWD = { dice: 6, chips: 5, cards: 2 };

/**
 * THE TWO WORLDS ON THIS DESK, and which piece is solid in which.
 *
 * Everything that is a THING knocks about with everything else that is: a die off a die, a die off a
 * chip, a chip off a chip. That is one world, and it is the bigger one.
 *
 * Cards are the other. A card is solid to a card — deal a hand and no card buries another — and thin
 * air to everything else, because a card is a thing you put things ON. A card that bounced off a die
 * could never be dealt onto one, and a chip that could not be set down on a card would make half the
 * games anybody plays impossible.
 *
 * The names are compared and never read: what matters is that the two are different words.
 */
const HARD = "hard";
const PAPER = "paper";

/**
 * WHAT TAKES UP ROOM HERE — read off what the piece IS, never off its name (`guard.id-is-opaque`).
 *
 * `room` is the panel's factor, not a length: three sizes of piece on one desk, and a single number
 * could only ever be right for one of them (`roomBy`).
 */
export function roomOn(room: number): Bump["roomFor"] {
  return (piece) => {
    const kind = kindOf(piece);
    if (kind === "card") return { girth: roomBy(piece, room), solid: PAPER };
    if (kind === "die" || kind === "chip") return { girth: roomBy(piece, room), solid: HARD };
    // A handle is not a thing on the desk and never flies; anything else here takes no room, which
    // is what every piece on every other desk says.
    return undefined;
  };
}

/** The pile the dice belong to — the merging desk's own word for it, and the same rule reads both. */
export const DIE_HEAP = "die";

/** The denomination the chips are all of — one, because what they teach here is that they DO pile up. */
const CHIP_VALUE = 25;

/**
 * A HANDFUL, and it starts as one — six dice overlapping just enough to be a heap, with a handle
 * already under them.
 *
 * Because the page is about the THROW. A desk that opened with them neatly spaced would make the
 * reader assemble the handful before anything could be shown, and the assembling is another page's
 * subject (`Mechanics/Stack merging`). Here they are picked up as one and let go of as six.
 *
 * They can be pushed into each other by hand, and that is not a hole: a carried piece is not a body,
 * it is where the finger is. Collision is what happens to things TRAVELLING — thrown, dropped, or
 * knocked by something that was.
 */
export function collisionMap(reach = MERGE_REACH): Node {
  installMapArt();
  installMergeArt();
  const desk = node(
    "map",
    Bounded({ bounds: rect(MAP.w, MAP.h) }),
    Container({ layout: "merge.free" }),
    Surfaced({ surface: "gesture.map" }),
  );
  for (let i = 0; i < CROWD.dice; i++) {
    const d6 = die(`die ${i}`, {
      kind: "d6",
      at: { x: -0.75 + (i % 3) * 0.75, y: -1.6 + Math.floor(i / 3) * 0.75 },
      face: (i % 6) + 1,
    });
    compose(d6, PUT_DOWN);
    // A die heaps with a die and with nothing else — the same word the merging desk uses, because
    // it is the same claim: what may be picked up together is what says the same pile.
    compose(d6, Heaping({ heap: DIE_HEAP }));
    compose(d6, Reaching({ reach }));
    add(desk, d6);
  }
  for (let i = 0; i < CROWD.chips; i++) {
    add(desk, mergeChip(`chip ${i}`, CHIP_VALUE, { x: -1.24 + i * 0.62, y: 1.05 }, undefined, reach));
  }
  crossadeCards()
    .slice(0, CROWD.cards)
    .forEach((card, i) => {
      compose(card, Transformable({ at: { x: -0.75 + i * 1.5, y: 2.5 } }));
      compose(card, PUT_DOWN);
      add(desk, card);
    });
  for (const warm of warmingNodes()) add(desk, warm);
  return desk;
}


/** How many chips lie on the felt for the landing desk, and how many dice come down onto them. */
export const LANDING = { chips: 12, dice: 5, cards: 2 };

/**
 * THE LANDING DESK — a block of chips lying on the felt, and a handful of dice held above them.
 *
 * The same two worlds and the same rules as `collisionMap`; what it is arranged FOR is different.
 * Here the chips are the subject: a tidy block of them, laid out on purpose, so that a reader can
 * see whether they are still where they were put. Drop the dice straight onto them and nothing of
 * the block stirs — the dice find room between them and settle. Throw the dice into them instead,
 * and the block goes everywhere.
 *
 * A neat block rather than a scatter, because "nothing moved" is a claim about a picture, and a
 * picture only makes it if it was tidy to begin with. Chips knocked out of a row read at a glance;
 * chips knocked out of a heap read as nothing at all.
 */
export function landingMap(reach = MERGE_REACH): Node {
  installMapArt();
  installMergeArt();
  const desk = node(
    "map",
    Bounded({ bounds: rect(MAP.w, MAP.h) }),
    Container({ layout: "merge.free" }),
    Surfaced({ surface: "gesture.map" }),
  );
  for (let i = 0; i < LANDING.chips; i++) {
    add(desk, mergeChip(`chip ${i}`, CHIP_VALUE, { x: -1.24 + (i % 4) * 0.82, y: 0.3 + Math.floor(i / 4) * 0.82 }, undefined, reach));
  }
  for (let i = 0; i < LANDING.dice; i++) {
    const d6 = die(`die ${i}`, { kind: "d6", at: { x: -0.75 + (i % 3) * 0.75, y: -2.3 + Math.floor(i / 3) * 0.75 }, face: (i % 6) + 1 });
    compose(d6, PUT_DOWN);
    compose(d6, Heaping({ heap: DIE_HEAP }));
    compose(d6, Reaching({ reach }));
    add(desk, d6);
  }
  crossadeCards()
    .slice(0, LANDING.cards)
    .forEach((card, i) => {
      compose(card, Transformable({ at: { x: -0.75 + i * 1.5, y: 2.9 } }));
      compose(card, PUT_DOWN);
      add(desk, card);
    });
  for (const warm of warmingNodes()) add(desk, warm);
  return desk;
}
