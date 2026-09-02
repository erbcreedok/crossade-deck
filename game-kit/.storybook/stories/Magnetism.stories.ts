import type { Meta, StoryObj } from "@storybook/html";
import { installStockCarries, installStockCoats, installStockFlips, t, type Node, type Vec } from "../../src/index.js";
import { grabScene, type Mirror } from "./gestureScene.js";
import { liveMap, liveTune, SEATS } from "./liveMap.js";
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
import { mergeRule } from "./mergeMap.js";
import { STACK_ARGS, STACK_KNOBS, type StackArgs } from "./gestureKnobs.js";
import { type Scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

installStockCarries();
installStockCoats();
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

const MAGNET_ARGS: MagnetArgs = {
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
const MAGNET_KNOBS = { ...STACK_KNOBS, pull: PULL_KNOB, cardShare: CARD_KNOB, heldShare: HELD_KNOB, ...FAN_KNOBS };

const zoneSpread = (a: MagnetArgs): Spread => ({
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
const magnetScene = (a: MagnetArgs, desk: () => Node, tune: (root: Node) => void, mirror?: Mirror): HTMLElement =>
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
  );

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
 * a place with a size.
 *
 * Cards on the felt heap as they do everywhere; the zone has a handle of its own whenever it holds
 * anything, and what it holds comes up as a FAN and goes back down as a row.
 */
export const Magnetism: StoryObj<MagnetArgs> = {
  render: (a) => magnetScene(a, () => magnetMap(a.pull, zoneSpread(a)), magnetTune(a.pull, zoneSpread(a))),
  args: { ...MAGNET_ARGS },
  argTypes: { ...MAGNET_KNOBS },
  parameters: { gkDocStory: "magnetism.scene" },
};

/** How big another hand's cursor is drawn, in screen pixels. */
const DOT = 18;

/** One screen of the live desk: its seat, its colour, its scene once it exists, and its cursor. */
interface Screen {
  readonly seat: string;
  readonly ink: string;
  readonly dot: HTMLElement;
  scene?: Scene;
}

/**
 * SHOW A HAND THAT IS NOT THIS SCREEN'S. Two things, and they are two because a cursor is a picture
 * of a PERSON and a carry is what their hand is doing to the desk.
 *
 * The carry is mirrored with the same three calls the local wiring makes, so what this screen draws
 * is a carry and not a picture of one: the card moves, leans and pops exactly as it does over there.
 * Without it the far screen shows a cursor gliding about and the card standing perfectly still.
 *
 * The cursor is drawn over the GLASS and never on the desk: a piece is what anything on the felt
 * would be — touchable, heapable, and in everybody's way.
 */
function follow(screen: Screen, ids: readonly string[], at: Vec | undefined, done: boolean, lift: number): void {
  const s = screen.scene;
  if (!s) return;
  if (done || !at) {
    for (const id of ids) s.motions?.release(id);
    screen.dot.style.display = "none";
    return;
  }
  const view = s.camera?.transform();
  if (view) {
    screen.dot.style.display = "block";
    screen.dot.style.left = `${view.a * at.x + view.c * at.y + view.e}px`;
    screen.dot.style.top = `${view.b * at.x + view.d * at.y + view.f}px`;
  }
  if (!s.motions?.busy(ids[0] ?? "")) {
    s.motions?.grab(ids.map((id) => ({ id, offset: { x: 0, y: 0 } })), { anchor: at, lift });
  }
  s.motions?.dragTo(at);
}

/**
 * LIVE — one desk, two screens, and everything the page above does.
 *
 * The same magnetism, the same handles, the same fan: it is not a second mechanic, it is the first
 * one with somebody else looking at it. Drag a card on the top screen and it moves on the bottom one
 * WHILE YOU ARE STILL HOLDING IT; take the hand by its handle and both screens see it come up as a
 * fan; let go near an area and both see it line up.
 *
 * TWO HOSTS OVER ONE TREE is what two people at one board ARE, and it needs exactly two things said.
 * A host is only ever told by being TOLD, so a change made here is announced to the other. And a
 * carry is an OVERRIDE and never a tree write, so a hand moving here would be invisible over there
 * unless it is reported and mirrored.
 *
 * NO VISIBILITY RULES. Hiding is real and the kit does it, but it is a second subject: with cards
 * hidden, a reader watching one screen cannot tell "they have not moved" from "they moved something
 * I may not see".
 */
export const Live: StoryObj<MagnetArgs> = {
  render: (a) => {
    const wall = document.createElement("div");
    wall.style.cssText = "display:grid;grid-template-rows:1fr 1fr;gap:8px;height:100%;min-height:520px";
    // ONE DESK. Not a copy each: the tree IS the board, and two screens reading two trees would be
    // two boards that happened to agree at the start.
    const desk = liveMap(a.pull, zoneSpread(a));
    const screens: Screen[] = [];
    const held = a.lifted ? a.lift : 1;

    for (const { seat, ink } of SEATS) {
      const pane = document.createElement("div");
      pane.style.cssText = "position:relative;min-height:240px;overflow:hidden";
      const dot = document.createElement("div");
      dot.style.cssText =
        `position:absolute;z-index:4;width:${DOT}px;height:${DOT}px;border-radius:50%;pointer-events:none;` +
        `display:none;transform:translate(-50%,-50%);background:${t(ink)};box-shadow:0 0 0 2px ${t("sunkBg")}`;
      const mine: Screen = { seat, ink, dot };
      screens.push(mine);
      const others = (): Screen[] => screens.filter((one) => one !== mine);
      pane.appendChild(
        magnetScene(a, () => desk, liveTune(a.pull, zoneSpread(a)), {
          ready: (s) => {
            mine.scene = s;
          },
          // EVERY OTHER SCREEN, told. A host is only ever told by being told.
          changed: () => {
            for (const one of others()) one.scene?.setRoot(desk);
          },
          hand: (ids, at, done) => {
            for (const one of others()) follow(one, ids, at, done, held);
          },
        }),
      );
      pane.appendChild(dot);
      wall.appendChild(pane);
    }
    return wall;
  },
  args: { ...MAGNET_ARGS },
  argTypes: { ...MAGNET_KNOBS },
  parameters: { gkDocStory: "magnetism.live" },
};
