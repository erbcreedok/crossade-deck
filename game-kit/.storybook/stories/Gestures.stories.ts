import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  circle,
  Container,
  CONTROL_LABEL,
  Draggable,
  freeLayout,
  Labeled,
  node,
  polygon,
  rect,
  roundedRect,
  Rotatable,
  registerLayout,
  registerSurface,
  ShadowCaster,
  Surfaced,
  Transformable,
  type Motions,
  type Node,
  type Shape,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { wireDrag } from "../devtools/drag.js";
import { documented } from "./surfaceControls.js";

// GESTURES — one page per gesture, and on every one of them the SAME element answers.
//
// UNDER `Engine/` and not beside the atoms, because a gesture is neither. It puts no field on a
// node and assembles nothing: it is a seam of the INPUT wiring (`render/hold.ts`), and the catalog's
// rule is that a story lives where the law it proves lives. `Engine/Motion` is the same shape from
// the other side — the runtime that ANSWERS, where this is the runtime that ASKS.
//
// The point of the shelf is that a gesture is a seam you can look at alone. A card carries a dozen
// capabilities and a menu on top, and when a hold does not fire on it there are ten places to look.
// Here there is one square, one gesture and one animation, so "it did not move" has exactly one
// meaning.
//
// The square is deliberately plain: a rounded box, no border, one wash. It is a target, not a
// picture — anything more and a reader starts reading the shape instead of watching it move. What
// it DOES carry is a shadow, and that is not decoration either: half of what these pages show is
// height — a shiver stays on the desk, a hop leaves it — and without a shadow the two look alike.

const TILE = "gesture.tile";

/** The one target every page on this shelf uses: a rounded square, washed, with no contour. */
function tile(id: string, size: number): Node {
  return node(
    id,
    Bounded({ bounds: roundedRect(size, size, 0.18) }),
    Surfaced({ surface: TILE }),
    Transformable({ at: { x: 0, y: 0 } }),
    // It lays a shadow, so a hop reads as a hop rather than as the square growing.
    ShadowCaster(),
    // A hand may take hold of it — which is what `want` on the hold wiring asks about.
    Draggable(),
  );
}

/** The axis of the tile's wash, degrees clockwise from +x — a corner-to-corner warm fall. */
const WASH_ANGLE = 60;

/** The scene every page builds: the tile, and a line saying what the gesture last did. */
function stage(size: number, said: string): Node {
  registerSurface(TILE, {
    // ONE LAYER, WASHED. The gradient is an angle and two stops, never coordinates — the plan turns
    // the angle into an axis against the area, so the same record draws at every size the knob picks.
    layers: [{ gradient: { angle: WASH_ANGLE, stops: [{ at: 0, paint: "accent" }, { at: 1, paint: "alert" }] } }],
    radius: 0.18,
  });
  registerLayout("gesture.free", freeLayout);
  const desk = node("desk", Container({ layout: "gesture.free" }));
  add(desk, tile("tile", size));
  add(
    desk,
    node(
      "said",
      Bounded({ bounds: rect(3.6, 0.34) }),
      Transformable({ at: { x: 0, y: 1.5 } }),
      Labeled({ label: said, style: CONTROL_LABEL }),
    ),
  );
  return desk;
}

/**
 * WHAT THE GESTURE ANSWERS WITH — the choreography a page fires when its gesture lands.
 *
 * A knob and not a page apiece, because the pairing is the point: a gesture and its answer are two
 * separate things, and swapping the answer under a fixed gesture is what shows that the kit reports
 * the finger and the CONSUMER decides what it means. It is also the only way to feel that they are
 * not interchangeable — a shiver reads as "noted", a hop as "taken", a launch as "gone".
 *
 * The list is closed on purpose: these are the verbs a bare square can actually perform. A flip or
 * a roll would need atoms this tile does not carry, and offering them would put a dead option on
 * the panel — which is exactly the `disabled` the kit refuses to have.
 */
const ANSWERS = {
  /** The small fast tremble: the piece stays exactly where it was. */
  shiver: (m: Motions, id: string) => m.shiver(id),
  /**
   * OFF THE DESK and back down — height, not travel. The square does not move across the felt at
   * all; what changes is how far above it it stands, and the shadow falling away is the whole tell.
   */
  zBounce: (m: Motions, id: string) => m.slide(id, { speed: 0, angle: 0, hop: HOP }),
  /**
   * UP THE SCREEN and back to the same seat — travel, not height. The pair with `zBounce` is the
   * point of having both: the square covers the same distance on the glass, and the shadow riding
   * along under this one is what says it never left the desk.
   */
  yBounce: (m: Motions, id: string) => m.bounce(id),
  /** Across the felt and stopping where friction leaves it — the shadow rides under it the whole way. */
  slide: (m: Motions, id: string) => m.slide(id, { speed: SLIDE_SPEED, angle: 30, spin: 90 }),
  /** Off the glass entirely: gravity pulls, the floor bounces, and it is gone. */
  launch: (m: Motions, id: string) => m.launch(id, { speed: LAUNCH_SPEED, angle: 250, spin: 220 }),
} satisfies Record<string, (m: Motions, id: string) => void>;

type Answer = keyof typeof ANSWERS;

interface GestureArgs {
  size: number;
  answer: Answer;
}

const meta: Meta = {
  title: "Engine/Gestures",
  parameters: { gkDoc: "gestures.component" },
};
export default meta;

const KNOBS = {
  size: documented("arg.w", { control: { type: "number", min: 0.2, step: 0.1 } }, "tile/bounds"),
  answer: documented("arg.answer", { control: "select", options: Object.keys(ANSWERS) }, "gesture/answer"),
};

export const Hold: StoryObj<GestureArgs> = {
  // HOLD THE SQUARE. Half a second of a finger that does not travel, and the tile shivers — the
  // answer to a gesture that has just changed meaning. Without it a player who gets no reply lifts
  // their finger to check, cancelling the very gesture they were making.
  render: ({ size, answer }) => {
    let said = "hold the square";
    const live = scene(stage(size, said), {
      // THE ONE CLOCK, and this is the switch that starts it: `motion` is only a tuning patch, and a
      // page that sets it without `animate` gets a still painter and a `motions` that is undefined —
      // every choreography then calls into nothing and the square never moves.
      animate: true,
      hold: {
        want: (n) => n.id === "tile",
        onHold: (on) => {
          said = `held → ${answer}`;
          // The caption first, the choreography second: `setRoot` reconciles, and a node the clock
          // is already posing is snapped to its rest by that pass.
          live.setRoot(stage(size, said));
          if (live.motions) ANSWERS[answer](live.motions, on.id);
        },
      },
    });
    return live.el;
  },
  args: { size: 1.2, answer: "shiver" },
  argTypes: KNOBS,
  parameters: { gkDocStory: "gestures.hold" },
};

export const Tap: StoryObj<GestureArgs> = {
  // A TAP IS THE OTHER HALF of the same press, and the pair is what makes either legible: the same
  // finger, on the same square, means one thing when it leaves quickly and another when it stays.
  // The square answers with whatever the panel says. `zBounce` and `yBounce` are the pair worth
  // switching between here: both throw it the same distance, and only the shadow says which one
  // left the desk.
  render: ({ size, answer }) => {
    let said = "tap the square";
    const live = scene(stage(size, said), {
      animate: true,
      tap: (hit) => {
        said = hit ? `tapped ${hit.id} → ${answer}` : "tapped the bare desk";
        live.setRoot(stage(size, said));
        if (hit?.id === "tile" && live.motions) ANSWERS[answer](live.motions, hit.id);
      },
    });
    return live.el;
  },
  args: { size: 1.2, answer: "zBounce" },
  argTypes: KNOBS,
  parameters: { gkDocStory: "gestures.tap" },
};

/** How hard a `zBounce` throws the square off the desk, units/s of rise — one clear bounce, not a ball. */
const HOP = 3.4;
/** Fast enough to cross the desk and slow enough to watch it stop, units/s. */
const SLIDE_SPEED = 4.5;
/** Hard enough to clear the glass rather than dribble off the bottom edge, units/s. */
const LAUNCH_SPEED = 7;

// ---- the desk where several gestures are possible at once ---------------------------------------
//
// THE TWO PAGES ABOVE HAVE ONE GESTURE EACH, and that is what makes them readable. Everything below
// has SEVERAL available on the same piece at the same moment, which is the state a real table is
// always in — and the law those pages cannot show, because a law about who wins needs two claimants.
//
// The arbitration is never a mode and never a modifier key. It is READ OFF THE HAND, out of three
// numbers every one of these scenes uses:
//   • how fast a finger was going when it LEFT (a drag ends; a swipe is still going) — `Swipe.speed`;
//   • how far the OTHER finger wandered from where it landed (an anchor holds; a hand drags) —
//     `Swipe.anchor.drift`;
//   • whether BOTH fingers are working (a knead) or one is holding while the other travels (a deal)
//     — `wireKnead`'s own gate.
// None of those is a preference. Each is a fact about what the hand did, and every page below is
// one law written out of them.

/** The pieces a table actually holds, told apart by SHAPE rather than by art. */
const PIECES: ReadonlyArray<{ id: string; shape: Shape; at: { x: number; y: number }; paint: string }> = [
  { id: "card", shape: roundedRect(1, 1.4, 0.1), at: { x: -1.9, y: -0.7 }, paint: "accent" },
  { id: "tile", shape: roundedRect(0.85, 0.85, 0.08), at: { x: -0.5, y: -0.8 }, paint: "alert" },
  { id: "chip", shape: circle(0.34), at: { x: 0.7, y: -0.8 }, paint: "text" },
  { id: "pawn", shape: polygon(6, 0.4), at: { x: 1.8, y: -0.7 }, paint: "accent" },
  { id: "rook", shape: rect(0.55, 0.7), at: { x: -1.3, y: 0.9 }, paint: "text" },
  { id: "board", shape: rect(1.6, 1.6), at: { x: 0.9, y: 0.9 }, paint: "alert" },
];

interface DeskArgs {
  deskLayout: string;
  lift: number;
  carry: string;
  onRelease: string;
  snap: number;
}

/**
 * The sandbox desk. `turns` is what separates the two pages that stand on it: without it every
 * piece answers one finger and nothing else, with it a second finger on a piece already in hand
 * means something different from a second finger anywhere else.
 */
function sandbox(a: DeskArgs, turns: boolean): Node {
  registerLayout(a.deskLayout, freeLayout);
  const desk = node("desk", Container({ layout: a.deskLayout }));
  for (const p of PIECES) {
    const surface = `gesture.piece.${p.id}`;
    registerSurface(surface, { layers: [{ paint: p.paint }], radius: 0.08 });
    add(
      desk,
      node(
        p.id,
        Bounded({ bounds: p.shape }),
        Surfaced({ surface }),
        Transformable({ at: p.at }),
        ShadowCaster(),
        // STAY, and not the kit's own `home`. A sandbox has nothing that refuses a drop, so every
        // release is a refusal — and a desk that flew every piece back would be teaching that a
        // drag does not work.
        Draggable({ onReject: "stay" }),
        ...(turns ? [Rotatable({ onRelease: a.onRelease as "keep" | "home" | "snap", snap: a.snap })] : []),
      ),
    );
  }
  return desk;
}

const DESK_ARGS = { deskLayout: "gesture.desk", lift: 1.06, carry: "rigid", onRelease: "keep", snap: 45 };

const DESK_KNOBS = {
  deskLayout: documented("arg.layoutName", { control: "text" }, "desk/container"),
  lift: documented("arg.lift", { control: { type: "number", min: 1, step: 0.02 } }, "carry"),
  carry: documented("arg.carry", { control: "select", options: ["rigid", "loose"] }, "carry"),
};

/**
 * ONE FINGER OWNS ONE PIECE. DRAG ANYTHING.
 *
 * The plainest of the arbitration pages, and it is here to be the BASELINE the others are read
 * against: on this desk a second finger means nothing at all. It cannot take over the piece in
 * hand (`wireDrag` keeps the finger that grabbed and ignores every other one), and it cannot start
 * a second drag of its own — because a hand that grabbed and a hand that arrived later are not two
 * players, they are one person with two fingers, and only one of them is holding the card.
 *
 * That refusal is the thing to feel. Put two fingers on the same piece and move them apart: nothing
 * happens, and nothing SHOULD — this desk has no gesture that two fingers mean, so a piece that
 * started following the wrong hand would be a bug the reader could not name. The next page gives
 * that pair a meaning, and the difference between the two is the whole subject of the shelf.
 *
 * Pieces are told apart by SHAPE and not by art: a card, a tile, a chip, a pawn, a rook, a board.
 * A gesture does not know what it is moving, and a desk of six different things is how that stops
 * being a claim and starts being visible.
 */
export const Sandbox: StoryObj<DeskArgs> = {
  args: { ...DESK_ARGS },
  argTypes: DESK_KNOBS,
  parameters: { gkDocStory: "gestures.sandbox" },
  render: (a) => wireDrag(scene(sandbox(a, false), { animate: true, key: "gestures.sandbox" }), { lift: a.lift, carry: a.carry }).el,
};

/**
 * THE SECOND FINGER TURNS WHAT THE FIRST IS HOLDING. DRAG WITH ONE, ADD ANOTHER AND TWIST.
 *
 * The same six pieces, and one atom more: `Rotatable`. The gesture that was meaningless on the page
 * above now means something, and the arbitration is decided by ORDER — the finger that grabbed goes
 * on owning the piece's PLACE, and the one that arrived owns its ANGLE.
 *
 * The carry is given up the moment the turn starts, and that is deliberate rather than incidental: a
 * carried piece is posed entirely by the carry style, so an angle written into the tree while it is
 * in flight is a write nothing reads. Let go, it eases the few pixels back to where the tree says it
 * stands, and from there the angle is the only thing moving.
 *
 * `onRelease` is the atom's whole verdict when the fingers leave, and it is worth turning: `keep`
 * leaves what the hand did (a token turned to mean something), `home` undoes it (a card that is only
 * ever upright), `snap` lands it on the nearest `snap` degrees (a tile on a grid). There is NO SWIPE
 * on this desk — two fingers here have exactly one meaning, and the page after next is where a
 * second finger has to be told apart from a turn.
 */
export const Turn: StoryObj<DeskArgs> = {
  args: { ...DESK_ARGS },
  argTypes: {
    ...DESK_KNOBS,
    onRelease: documented("arg.onRelease", { control: "select", options: ["keep", "home", "snap"] }, "piece/rotatable"),
    snap: documented("arg.snap", { control: { type: "number", min: 1, step: 5 } }, "piece/rotatable"),
  },
  parameters: { gkDocStory: "gestures.turn" },
  render: (a) => wireDrag(scene(sandbox(a, true), { animate: true, key: "gestures.turn" }), { lift: a.lift, carry: a.carry }).el,
};
