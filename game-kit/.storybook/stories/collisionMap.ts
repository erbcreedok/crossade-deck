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
  node,
  rect,
  Surfaced,
  Transformable,
  type Node,
} from "../../src/index.js";
import { cards as crossadeCards } from "@game-presets/cards";
import { die } from "@game-presets/dice";
import { installMapArt, MAP, warmingNodes } from "./gestureMap.js";
import { installMergeArt, mergeChip } from "./mergeMap.js";

/** A piece put down on this desk stays where it was put — nothing here accepts a drop. */
const PUT_DOWN = Draggable({ onReject: "stay" });

/** What is on this desk: a handful of dice to throw, and pieces that are meant to stack, for contrast. */
export const CROWD = { dice: 6, chips: 5, cards: 2 };

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
export function collisionMap(): Node {
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
    add(desk, d6);
  }
  for (let i = 0; i < CROWD.chips; i++) {
    add(desk, mergeChip(`chip ${i}`, CHIP_VALUE, { x: -1.24 + i * 0.62, y: 1.05 }));
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
