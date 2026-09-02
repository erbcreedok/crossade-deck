import type { Meta, StoryObj } from "@storybook/html";
import { installStockCarries, installStockFlips } from "../../src/index.js";
import { grabScene } from "./gestureScene.js";
import { CARD_SHARE, HELD_SHARE, magnetMap, PULL, zoneHolds, zoneNear } from "./magnetMap.js";
import { mergeRule } from "./mergeMap.js";
import { STACK_ARGS, STACK_KNOBS, type StackArgs } from "./gestureKnobs.js";
import { documented } from "./surfaceControls.js";

installStockCarries();
installStockFlips();

const meta: Meta = {
  title: "Mechanics/Magnetism",
  parameters: {
    gkDoc: "magnetism.component",
    // The atom's own page: `Reaching` is one field, and this is the scene that makes it visible —
    // a number you can watch decide, on a desk where getting it wrong is a move that did not happen.
    gkAtom: "Reaching",
    gkFields: { reach: ["pull"] },
  },
};
export default meta;

interface MagnetArgs extends StackArgs {
  /** How far the zone reaches past its own border, root units. `0` and only a release ON it counts. */
  pull: number;
  /** How much two CARDS must overlap before they are one heap with a handle, 0..1. */
  cardShare: number;
  /** How much of a card must lie inside the zone before the zone counts it as its own, 0..1. */
  heldShare: number;
}

/**
 * ITS OWN NUMBER, in units, and turn on `bounds` to see it: the zone's border swept by a disc of
 * that radius is drawn around it, so what the reader is changing is on the glass and not in a rule.
 */
const PULL_KNOB = documented("arg.pull", { control: { type: "number", min: 0, step: 0.05 } }, "magnetism");

/**
 * TWO SHARES, and they answer two different questions. `cardShare` is about a HEAP — how much two
 * cards must overlap before they are one thing with one handle, which is the ordinary rule of every
 * stacking desk on the shelf. `heldShare` is about a PLACE — how much of a card must be inside the
 * zone before the zone calls it its own, which nothing else on the shelf asks at all.
 */
const CARD_KNOB = documented("arg.cardShare", { control: { type: "number", min: 0, max: 1, step: 0.05 } }, "magnetism");
const HELD_KNOB = documented("arg.heldShare", { control: { type: "number", min: 0, max: 1, step: 0.05 } }, "magnetism");

/**
 * MAGNETISM — a zone takes a card let go of NEAR it, not only ON it.
 *
 * Thirty-six cards in a deck and one bordered zone across the felt. Drag a card over and let go
 * short of the border: it goes in anyway, and squares up with whatever is already there. Let go
 * further out and it stays where it was put.
 *
 * A drop is otherwise decided by a POINT — the finger comes up somewhere and whatever container is
 * under that somewhere gets the card. Exact, and the wrong kind of exact: a player aiming at their
 * own area is not aiming at a pixel, they move the card over there and let go, and "over there" is
 * a place with a size. Miss by the width of the card's own border and the card stays on the felt,
 * which reads as the desk refusing a move that was plainly made.
 *
 * So the zone REACHES (`Reaching`), and nothing else about the drop changes: the same seam, the same
 * accept rule, the same re-parent, the same layout squaring the cards up. Turn the pull to zero and
 * the desk is every other desk — the release has to land inside the border.
 *
 * It is NOT a pull on the carried card. A held thing rides the hand one to one, which is a law of
 * this kit; a card that started drifting towards the zone under the finger would read as a dropped
 * frame rather than as attraction. The magnet acts at the release, which is also the only moment a
 * player is asking it anything.
 */
export const Magnetism: StoryObj<MagnetArgs> = {
  render: ({ physics, lifted, lift, dropping, throwing, stacking, gripWidth, gripMin, gripMax, cardDrop, chipDrop, dieDrop, pull, cardShare, heldShare }) =>
    grabScene(
      physics,
      lifted ? lift : undefined,
      dropping ? (throwing ? "throw" : "drop") : undefined,
      stacking,
      { w: gripWidth, min: gripMin, max: gripMax },
      { card: cardDrop, chip: chipDrop, die: dieDrop },
      () => magnetMap(pull),
      false,
      0,
      // Cards heap by being COVERED, as they do everywhere; the zone holds by a share of its own.
      { ...mergeRule(cardShare), held: zoneHolds(heldShare) },
      undefined,
      zoneNear,
    ),
  // Dropping on, so a release away from the zone still falls — the zone gets first refusal, and the
  // fall is what happens when it says no.
  args: { ...STACK_ARGS, lifted: true, dropping: true, throwing: true, pull: PULL, cardShare: CARD_SHARE, heldShare: HELD_SHARE },
  argTypes: { ...STACK_KNOBS, pull: PULL_KNOB, cardShare: CARD_KNOB, heldShare: HELD_KNOB },
  parameters: { gkDocStory: "magnetism.scene" },
};
