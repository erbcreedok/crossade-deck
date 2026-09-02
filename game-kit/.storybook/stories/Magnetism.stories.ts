import type { Meta, StoryObj } from "@storybook/html";
import {
  byId,
  draggable,
  installStockCarries,
  installStockCoats,
  installStockFlips,
  planMove,
  transformsOf,
  type Node,
} from "../../src/index.js";
import { localMaster, type Master } from "../devtools/master.js";
import { wireDrag } from "../devtools/drag.js";
import { scene } from "../devtools/scene.js";
import { MAP } from "./gestureMap.js";
import { liveMap, markHands, SEATS, type Hand } from "./liveMap.js";
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

interface LiveArgs {
  /** One way, in milliseconds — a round trip costs it twice. `0` is the honest default. */
  latency: number;
  /** How far an area reaches past its own border, root units. */
  pull: number;
}

const LATENCY = documented("arg.latency", { control: { type: "number", min: 0, step: 50 } }, "live");

/**
 * THE MASTER STANDS AS LONG AS ITS DESK DOES.
 *
 * A re-render is new numbers for the same board, not a new board — rebuilt on every keystroke, the
 * board everybody shares would be swept away by a control, which is the same complaint a single
 * screen had about its desk. The latency is retuned on the standing master instead.
 */
let board: { master: Master; latency: number } | undefined;
function boardFor(latency: number, pull: number): Master {
  if (!board) board = { master: localMaster(liveMap(pull, ZONE_SPREAD), latency), latency };
  if (board.latency !== latency) {
    board.master.retune(latency);
    board.latency = latency;
  }
  return board.master;
}

/**
 * LIVE — one desk, two screens, and neither of them is the truth.
 *
 * Everything `Magnetism` does, with the one difference that decides whether any of it was really
 * built: the board is somewhere else. Drag a card on the top screen and let go near an area — it
 * goes in, and it goes in on the bottom screen too, because what moved was the board they share
 * and not the picture in front of you.
 *
 * A finger PROPOSES. A drop resolved on one screen alone would be real for one pair of eyes and
 * would never have happened for the other, so the move goes to the board and the authoritative
 * answer comes back to everybody — including the seat that sent it. Turn the latency up and watch
 * the two halves of that: the card lands under your own finger at once (position is reversible, so
 * predicting it is safe) and appears on the other screen when the word arrives.
 *
 * EVERY SEAT SEES EVERY CARD. Hiding is a real thing and the kit does it, but it is a second
 * subject: with cards hidden, a reader watching one screen cannot tell "they have not moved" from
 * "they moved something I am not allowed to see".
 *
 * AND EVERY HAND IS ON THE DESK, in its own colour — a ring on what somebody else is holding, and a
 * cursor wherever their finger is. The cursor is drawn even when they hold nothing, because a hand
 * you cannot see is a player who has left.
 */
export const Live: StoryObj<LiveArgs> = {
  render: ({ latency, pull }) => {
    const master = boardFor(latency, pull);
    const truth = master.truth();
    const wall = document.createElement("div");
    wall.style.cssText = "display:grid;grid-template-rows:1fr 1fr;gap:8px;height:100%;min-height:520px";

    for (const { seat } of SEATS) {
      const pane = document.createElement("div");
      pane.style.cssText = "position:relative;min-height:240px";
      // ONE SCENE PER SCREEN, keyed by its seat so a re-render finds it standing rather than taking
      // a fresh WebGL context per keystroke. Two hosts, two clocks, two cameras — because that is
      // what two devices are, and one canvas drawn twice would be proving nothing.
      const built = scene(() => truth, {
        key: `live.${seat}`,
        animate: true,
        camera: {
          limits: { minZoom: 0.5, maxZoom: 2.5, input: { pan: true, zoom: true, rotate: false } },
          content: { x: -MAP.w / 2, y: -MAP.h / 2, w: MAP.w, h: MAP.h },
          claims: draggable,
          // THE OTHER SEAT SITS OPPOSITE, and sees the desk from there. Not a decoration: a player
          // who had to read their own area upside down would be reading somebody else's board.
          turn: seat === "north" ? 180 : 0,
          unit: 44,
          start: { at: { x: 0, y: 0 }, zoom: 1 },
        },
      });
      pane.appendChild(built.el);
      wall.appendChild(pane);

      const mate = master.join(seat);
      // OTHER HANDS. Ephemeral: not truth, not saved, not projected — redrawn under the newest
      // snapshot and forgotten the moment a hand lets go.
      const hands = new Map<string, Hand>();
      let latest: Node | undefined;
      const redraw = (): void => {
        if (latest) built.setRoot(markHands(latest, hands));
      };
      mate.onCarry((carry) => {
        if (carry.done) hands.delete(carry.actor);
        else hands.set(carry.actor, carry.at ? { els: carry.els, at: carry.at } : { els: carry.els });
        redraw();
      });
      mate.onState((seen) => {
        latest = seen;
        redraw();
      });
      wireDrag(built, {
        zoneAt: zoneNear,
        view: () => built.camera?.transform() ?? { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        // MY FINGER, TOLD TO THE TABLE. Retransmitted to the others and never echoed back — a hand
        // does not need to be told where its own finger is.
        onCarry: ({ ids, at, done }) => mate.carry({ els: ids, at, done }),
        onDrop: ({ lead, target, seat: at }) => {
          const zone = byId(truth, target.id);
          const from = lead.parent;
          if (!from || !zone) return false;
          // No `seat` given: a grip seat is a card game's notion of where a hand may take a piece by,
          // and this desk has none — every card is taken anywhere on it.
          if (planMove({ source: from, touched: lead, target: zone }).verdict === "deny") return false;
          const home = transformsOf(truth).get(zone.id);
          mate.send({
            source: from.id,
            touched: lead.id,
            target: zone.id,
            at: { x: at.x - (home?.e ?? 0), y: at.y - (home?.f ?? 0) },
            actor: seat,
          });
          // FALSE ON PURPOSE. The wiring then makes its ordinary local drop, which is this seat's
          // optimistic PREDICTION: the card lands under the finger at once and the authoritative
          // snapshot either confirms it or takes it away.
          return false;
        },
      });
    }
    return wall;
  },
  args: { latency: 0, pull: PULL },
  argTypes: { latency: LATENCY, pull: PULL_KNOB },
  parameters: { gkDocStory: "magnetism.live" },
};
