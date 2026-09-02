// THE MAGNETISM PANEL AND THE SCENE IT DRIVES — held apart from the stories that show them.
//
// Not in the story file, because every export of one of those is a STORY: Storybook reads the module
// and puts a page in the sidebar for each thing it finds, so a shared constant left there becomes a
// scene called "Magnet args" that renders nothing. Two pages need these — the one desk and the two
// screens looking at one — so they live where a module lives.

import { type Node } from "../../src/index.js";
import { grabScene, type Mirror } from "./gestureScene.js";
import { mergeRule } from "./mergeMap.js";
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
  type Spread,
} from "./magnetMap.js";
import { STACK_ARGS, STACK_KNOBS, type StackArgs } from "./gestureKnobs.js";
import { documented } from "./surfaceControls.js";

export interface MagnetArgs extends StackArgs {
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
 * desk"; a width alone cannot state "two cards must not sit a hand's length apart just because there
 * is room". The widths are fractions of the room the spread is in — the desk for the fan, the zone's
 * own box for the row — so the same number means the same thing on both sides.
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

export const MAGNET_ARGS: MagnetArgs = {
  ...STACK_ARGS,
  lifted: true,
  dropping: true,
  throwing: true,
  pull: PULL,
  cardShare: CARD_SHARE,
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
};
export const MAGNET_KNOBS = { ...STACK_KNOBS, pull: PULL_KNOB, cardShare: CARD_KNOB, heldShare: HELD_KNOB, ...FAN_KNOBS };

export const zoneSpread = (a: MagnetArgs): Spread => ({
  gapMin: a.zoneGapMin,
  gapMax: a.zoneGapMax,
  wideMin: a.zoneWideMin,
  wideMax: a.zoneWideMax,
});

/** The rule both scenes play by — cards heap by being COVERED, a place holds by a share of its own. */
const magnetRule = (a: MagnetArgs, tune: (root: Node) => void) => ({
  ...mergeRule(a.cardShare),
  held: zoneHolds(a.heldShare),
  fan: zoneFan({ gapMin: a.fanGapMin, gapMax: a.fanGapMax, wideMin: a.fanWideMin, wideMax: a.fanWideMax }, a.fanTilt),
  settled: zoneSquares(a.heldShare),
  tune,
});

/**
 * THE SCENE BOTH PAGES STAND ON, differing by their desk and by nothing else. The live one is not a
 * second mechanic — it is this one with somebody else looking at it.
 */
export const magnetScene = (
  a: MagnetArgs,
  desk: () => Node,
  tune: (root: Node) => void,
  mirror?: Mirror,
  unit?: number,
): HTMLElement =>
  grabScene(
    a.physics,
    a.lifted ? a.lift : undefined,
    a.dropping ? (a.throwing ? "throw" : "drop") : undefined,
    a.stacking,
    { w: a.gripWidth, min: a.gripMin, max: a.gripMax },
    { card: a.cardDrop, chip: a.chipDrop, die: a.dieDrop },
    desk,
    false,
    0,
    magnetRule(a, tune),
    undefined,
    zoneNear,
    mirror,
    unit,
  );

