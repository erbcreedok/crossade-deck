import type { Meta, StoryObj } from "@storybook/html";
import { installStockCarries, installStockFlips } from "../../src/index.js";
import { grabScene } from "./gestureScene.js";
import {
  CARD_SHARE,
  FAN_SPREAD,
  FAN_TILT,
  HELD_SHARE,
  magnetMap,
  magnetTune,
  PULL,
  ZONE_SPREAD,
  zoneFan,
  zoneHolds,
  zoneNear,
  zoneSquares,
} from "./magnetMap.js";
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
  /** The FAN in the air: units between neighbouring cards, closest and furthest. */
  fanGapMin: number;
  fanGapMax: number;
  /** ...and how wide the whole fan may get, as a fraction of the DESK. `1` is the whole of it. */
  fanWideMin: number;
  fanWideMax: number;
  /** How far the outermost card of the fan leans, degrees. `0` is a straight line of upright cards. */
  fanTilt: number;
  /** The ROW in the zone: the same four, with the zone's own box for the room. */
  zoneGapMin: number;
  zoneGapMax: number;
  zoneWideMin: number;
  zoneWideMax: number;
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
 * FOUR NUMBERS EACH, and they are four because none of them says what another one says. A step
 * alone cannot state "a hand of twenty may be wider than a hand of three but not wider than the
 * desk"; a width alone cannot state "two cards must not sit a hand's length apart just because
 * there is room". The widths are fractions of the room the spread is in — the desk for the fan, the
 * zone's own box for the row — so the same number means the same thing on both sides.
 */
const units = (name: string) => documented(name, { control: { type: "number", min: 0, step: 0.02 } }, "magnetism");
const share = (name: string) => documented(name, { control: { type: "number", min: 0, max: 1, step: 0.05 } }, "magnetism");
const FAN_KNOBS = {
  fanGapMin: units("arg.fanGapMin"),
  fanGapMax: units("arg.fanGapMax"),
  fanWideMin: share("arg.fanWideMin"),
  fanWideMax: share("arg.fanWideMax"),
  fanTilt: documented("arg.fanTilt", { control: { type: "number", min: 0, max: 90, step: 1 } }, "magnetism"),
  zoneGapMin: units("arg.zoneGapMin"),
  zoneGapMax: units("arg.zoneGapMax"),
  zoneWideMin: share("arg.zoneWideMin"),
  zoneWideMax: share("arg.zoneWideMax"),
};

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
  render: ({ physics, lifted, lift, dropping, throwing, stacking, gripWidth, gripMin, gripMax, cardDrop, chipDrop, dieDrop, pull, cardShare, heldShare, fanGapMin, fanGapMax, fanWideMin, fanWideMax, fanTilt, zoneGapMin, zoneGapMax, zoneWideMin, zoneWideMax }) =>
    grabScene(
      physics,
      lifted ? lift : undefined,
      dropping ? (throwing ? "throw" : "drop") : undefined,
      stacking,
      { w: gripWidth, min: gripMin, max: gripMax },
      { card: cardDrop, chip: chipDrop, die: dieDrop },
      () => magnetMap(pull, { gapMin: zoneGapMin, gapMax: zoneGapMax, wideMin: zoneWideMin, wideMax: zoneWideMax }),
      false,
      0,
      // Cards heap by being COVERED, as they do everywhere; the zone holds by a share of its own.
      { ...mergeRule(cardShare), held: zoneHolds(heldShare), fan: zoneFan({ gapMin: fanGapMin, gapMax: fanGapMax, wideMin: fanWideMin, wideMax: fanWideMax }, fanTilt), settled: zoneSquares(heldShare) },
      undefined,
      zoneNear,
    ),
  // Dropping on, so a release away from the zone still falls — the zone gets first refusal, and the
  // fall is what happens when it says no.
  args: { ...STACK_ARGS, lifted: true, dropping: true, throwing: true, pull: PULL, cardShare: CARD_SHARE,
    heldShare: HELD_SHARE,
    fanGapMin: FAN_SPREAD.gapMin,
    fanGapMax: FAN_SPREAD.gapMax,
    fanWideMin: FAN_SPREAD.wideMin,
    fanWideMax: FAN_SPREAD.wideMax,
    fanTilt: FAN_TILT,
    zoneGapMin: ZONE_SPREAD.gapMin,
    zoneGapMax: ZONE_SPREAD.gapMax,
    zoneWideMin: ZONE_SPREAD.wideMin,
    zoneWideMax: ZONE_SPREAD.wideMax,
  },
  argTypes: { ...STACK_KNOBS, pull: PULL_KNOB, cardShare: CARD_KNOB, heldShare: HELD_KNOB, ...FAN_KNOBS },
  parameters: { gkDocStory: "magnetism.scene" },
};
