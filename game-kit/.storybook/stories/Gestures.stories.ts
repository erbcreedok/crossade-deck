import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  apply,
  byId,
  polar,
  compose,
  Container,
  CONTROL_LABEL,
  DEFAULT_TUNING,
  Draggable,
  draggable,
  fieldsOf,
  RISE,
  freeLayout,
  installStockCarries,
  installStockFlips,
  Labeled,
  node,
  rect,
  roundedRect,
  registerLayout,
  registerSurface,
  ShadowCaster,
  Surfaced,
  Transformable,
  type CarryItem,
  type Motions,
  type Node,
  type TransformableFields,
  type Vec,
} from "../../src/index.js";
import { DIE_HOP, DIE_SPIN, DIE_SPIN_DRAG, thrown } from "./gestureMap.js";
import { throwDie } from "@game-presets/dice";
import { wireDrag } from "../devtools/drag.js";
import { scene, type Scene } from "../devtools/scene.js";
import {
  dropOf,
  fallOrder,
  gestureMap,
  isGrip,
  mapWalls,
  MAP,
  GRIP_HOLD,
  GRIP,
  type LetGo,
  deckMap,
  regrip,
  stackMap,
  turnOver,
  stackSeats,
  toFront,
} from "./gestureMap.js";
import { grabScene } from "./gestureScene.js";
import {
  CARD_WAY,
  CHIP_WAY,
  DIE_WAY,
  DROPPING,
  FLIPPING,
  GRIP_MAX,
  GRIP_MIN,
  GRIP_W,
  LIFT,
  LIFTED,
  PHYSICS,
  SHOWS,
  SHOWS_DEFAULT,
  STACKING,
  STACK_ARGS,
  STACK_KNOBS,
  THROWING,
  type FlipArgs,
  type GrabArgs,
  type LiftArgs,
  type DropArgs,
  type StackArgs,
  type ThrowArgs,
} from "./gestureKnobs.js";
import { documented } from "./surfaceControls.js";

// GESTURES — one page per gesture, and on every one of them the SAME element answers.
//
// UNDER `Engine/` and not beside the atoms, because a gesture is neither. It puts no field on a
// node and assembles nothing: it is a seam of the INPUT wiring (`render/hold.ts`), and the catalog's
// rule is that a story lives where the law it proves lives. `Engine/Motion` is the same shape from
// the other side — the runtime that ANSWERS, where this is the runtime that ASKS.
//
// A PRESS AND A CARRY WANT DIFFERENT DESKS, and that is why the shelf has two of them. `Hold` and
// `Tap` are about the press itself, which has nothing to do with what is under it — so they are one
// square, and the square is the whole scene. A grab does not work like that: the finger picks a
// thing up and takes it somewhere, so those pages stand on a MAP with pieces on it (`gestureMap`).
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

// The carry styles and the flip recipes are installed here, as an ordinary consumer would install
// them. Without the flips a card's `back` is a name nothing resolves, and a face-down card is drawn
// face up — the truth says one thing and the picture another.
installStockCarries();
installStockFlips();

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

// ---- grab ---------------------------------------------------------------------------------



export const Grab: StoryObj<GrabArgs> = {
  // PICK A PIECE UP AND PUT IT DOWN SOMEWHERE ELSE. Two cards, a die and a knight on a map that
  // does not fit the glass: drag a piece to move the piece, drag the map to move the view.
  //
  // The carry is BARE here — the piece is under the finger and that is all — and the switch on the
  // panel is what puts the kit's own feel back on it.
  render: ({ physics }) => grabScene(physics),
  args: { physics: false },
  argTypes: { physics: PHYSICS },
  parameters: { gkDocStory: "gestures.grab" },
};

export const GrabPhysics: StoryObj<GrabArgs> = {
  // THE SAME MAP WITH THE CARRY'S PHYSICS ON from the first touch — the lift pops the piece up as
  // the hand closes on it, and the bank leans it into the direction it is being carried.
  //
  // A page of its own rather than a different default on the one above, because the pair is the
  // point: the two are opened side by side and the difference is the whole of what the physics is.
  render: ({ physics }) => grabScene(physics),
  args: { physics: true },
  argTypes: { physics: PHYSICS },
  parameters: { gkDocStory: "gestures.grabPhysics" },
};

/**
 * HOW HIGH THE HAND HOLDS IT — a third of a card off the desk instead of the kit's polite six
 * percent, and on a desk seen from above that is what height IS: a thing further from the glass
 * covers more of it. `RISE` is the engine's own word for the same rate, and this page is where a
 * reader can feel the number rather than read it.
 *
 * A number and not a slider: the reader of this page is comparing `1.06` against `1.3`, and a
 * value you can only approach by dragging is a value nobody can state.
 */
export const Lift: StoryObj<LiftArgs> = {
  // THE SAME MAP AGAIN, and the one thing that changes is how far the piece comes UP when the hand
  // closes on it. Everything else is the page before: the same pieces, the same camera, the same
  // border it cannot be carried through, the same finger ring on the toolbar.
  //
  // The height is this page's own number, so it survives the physics switch: turn the feel off and
  // the piece still rises, it just stops leaning on the way. The pair is the point — the lean and
  // the lift are two channels, and a page where one switch killed both could not say so.
  render: ({ physics, lifted, lift }) => grabScene(physics, lifted ? lift : undefined),
  args: { physics: true, lifted: true, lift: 1.3 },
  argTypes: { physics: PHYSICS, lifted: LIFTED, lift: LIFT },
  parameters: { gkDocStory: "gestures.lift" },
};


/**
 * DROP — the same map, and the release is a FALL rather than a putting-down.
 *
 * The height is the one the hand was holding at, so nothing jumps at the moment of release; what
 * happens after that is the piece's own (`dropOf`). And the piece that just landed is the one on
 * top: a desk is a pile, and the last thing put on it covers what is under it.
 */
export const Drop: StoryObj<DropArgs> = {
  render: ({ physics, lifted, lift, dropping, cardDrop, chipDrop, dieDrop }) =>
    grabScene(physics, lifted ? lift : undefined, dropping ? "drop" : undefined, false, undefined, { card: cardDrop, chip: chipDrop, die: dieDrop }),
  args: { physics: true, lifted: true, lift: 1.3, dropping: true, cardDrop: "settle", chipDrop: "fall", dieDrop: "roll" },
  argTypes: { physics: PHYSICS, lifted: LIFTED, lift: LIFT, dropping: DROPPING, cardDrop: CARD_WAY, chipDrop: CHIP_WAY, dieDrop: DIE_WAY },
  parameters: { gkDocStory: "gestures.drop" },
};

/**
 * THROW — let go WHILE MOVING and the piece keeps going, on the speed the hand still had on it.
 *
 * The same fall as the page before: it comes down from the hand's height as it travels, so a release
 * that was barely moving is not a special case at all — it is a throw of nearly no speed, which is a
 * drop. The map's border throws it back, and how hard is the piece's own: a die comes off a rail
 * lively, a card fairly, a carved piece hardly at all — weight is what a wall takes out of a thing.
 */
export const Throw: StoryObj<ThrowArgs> = {
  render: ({ physics, lifted, lift, dropping, throwing, cardDrop, chipDrop, dieDrop }) =>
    grabScene(physics, lifted ? lift : undefined, dropping ? (throwing ? "throw" : "drop") : undefined, false, undefined, {
      card: cardDrop,
      chip: chipDrop,
      die: dieDrop,
    }),
  args: { physics: true, lifted: true, lift: 1.3, dropping: true, throwing: true, cardDrop: "settle", chipDrop: "fall", dieDrop: "roll" },
  argTypes: { physics: PHYSICS, lifted: LIFTED, lift: LIFT, dropping: DROPPING, throwing: THROWING, cardDrop: CARD_WAY, chipDrop: CHIP_WAY, dieDrop: DIE_WAY },
  parameters: { gkDocStory: "gestures.throw" },
};

/**
 * STACK — push two of a kind together and a handle appears under them.
 *
 * Six cards, six chips of one denomination and a die, and NOTHING touching anything to begin with:
 * touching is the subject, so the desk has to open with none of it. Slide two cards into each other
 * — or two chips — and a wide low tab appears under the middle of everything they cover. Pull it and
 * they come up as one squared stack; let go and they stay one.
 *
 * WHAT MAY TOUCH WHAT is this desk's rule and not the kit's: a card heaps with a card and a chip
 * with a chip, and the die heaps with nothing, being the only one of itself. The kit answers the
 * geometry — do these two outlines overlap, and what groups does that make (`outlinesTouch`,
 * `islands`) — and stops there.
 *
 * Touching is transitive: three cards in a row whose ends do not meet are still one heap, because a
 * player can see that they are. And a piece is still a piece — take one by ITSELF and it comes out
 * of the heap alone; the handle is the only thing that lifts the whole.
 */
/**
 * The three stacking pages differ by ONE switch each and by nothing else — the shelf's own rule.
 * `Stack` is the bare heap: form it, pull it, put it down. `StackLift` adds the pop, `StackDrop`
 * the fall. Every one of them can be switched back to the page before it.
 */
const STACK_RENDER = ({ physics, lifted, lift, dropping, throwing, stacking, gripWidth, gripMin, gripMax, gripMiss, cardDrop, chipDrop, dieDrop }: StackArgs): HTMLElement =>
  grabScene(
    physics,
    lifted ? lift : undefined,
    dropping ? (throwing ? "throw" : "drop") : undefined,
    stacking,
    { w: gripWidth, min: gripMin, max: gripMax, miss: gripMiss },
    { card: cardDrop, chip: chipDrop, die: dieDrop },
  );

export const Stack: StoryObj<StackArgs> = {
  render: STACK_RENDER,
  args: { ...STACK_ARGS },
  argTypes: { ...STACK_KNOBS },
  parameters: { gkDocStory: "gestures.stack" },
};

/**
 * STACK LIFT — the same desk, and a heap comes UP as it is taken, exactly as one card does.
 *
 * It is worth its own page because the pop is the one thing about a stack that looks like a mistake
 * when it is missing: a card lifts and a stack of the same cards does not, and the desk has quietly
 * said that a stack is a different kind of thing. It is not. What does NOT pop is the tab — a
 * control that grew would be the thing you have hold of growing in your hand — and that is said
 * about the tab, not about the gesture.
 */
export const StackLift: StoryObj<StackArgs> = {
  render: STACK_RENDER,
  args: { ...STACK_ARGS, lifted: true },
  argTypes: { ...STACK_KNOBS },
  parameters: { gkDocStory: "gestures.stackLift" },
};

/**
 * STACK DROP — and it comes DOWN as one, from the height the hand was holding it at.
 *
 * Every piece of the heap falls at its own rate, because they are still the pieces they were: a
 * heap of cards comes down like cards and a heap of chips like chips. The tab is not among them —
 * it is redrawn under wherever they land, and a control does not fall.
 */
export const StackDrop: StoryObj<StackArgs> = {
  render: STACK_RENDER,
  args: { ...STACK_ARGS, lifted: true, dropping: true },
  argTypes: { ...STACK_KNOBS },
  parameters: { gkDocStory: "gestures.stackDrop" },
};

/**
 * STACK THROW — let the heap go WHILE MOVING and the whole of it goes on, on the hand's own speed.
 *
 * Everything the last page does, plus the one thing this one adds: what was a fall becomes a fall
 * that travels. Every piece keeps its own weight and its own bounce off the border, so a heap of
 * chips comes back off a rail and a heap of cards does not, and they arrive spread along the throw
 * rather than in a pile — which is what a handful of things let go of at speed does.
 *
 * The tab is not thrown. It is a control, and a control does not fly any more than it falls: it is
 * redrawn under wherever the pieces come to rest.
 */
export const StackThrow: StoryObj<StackArgs> = {
  render: STACK_RENDER,
  args: { ...STACK_ARGS, lifted: true, dropping: true, throwing: true },
  argTypes: { ...STACK_KNOBS },
  parameters: { gkDocStory: "gestures.stackThrow" },
};

/**
 * FLIP — thirty-six cards, six of them face up and the rest stacked face down, and a TAP turns over
 * whatever it landed on.
 *
 * The pile is not a special kind of thing: it is thirty cards lying on the same spot, which is to
 * say a heap, which is to say every rule this desk already has. So a finger on it lands on the
 * topmost card DRAWN — the top of the deck — and the one line that says "turn over what was tapped"
 * reads as "turn the deck's top card over" without being told that a deck exists. A heap raked
 * together out of scattered cards behaves the same way, because it IS the same way.
 *
 * A TAP AND A CARRY ARE ONE GESTURE until it ends. The same finger lands on the same card; what
 * tells them apart is how far it went and how long it stayed, and that is decided in one place
 * (`DragOptions.onTap`) rather than by two listeners the scene would have to referee. Hold the card
 * and nothing turns — a gesture that stayed was never a tap.
 */
export const Flip: StoryObj<FlipArgs> = {
  render: ({ physics, lifted, lift, dropping, throwing, stacking, gripWidth, gripMin, gripMax, gripMiss, cardDrop, chipDrop, dieDrop, flipping, showsEnough }) =>
    grabScene(
      physics,
      lifted ? lift : undefined,
      dropping ? (throwing ? "throw" : "drop") : undefined,
      stacking,
      { w: gripWidth, min: gripMin, max: gripMax, miss: gripMiss },
      { card: cardDrop, chip: chipDrop, die: dieDrop },
      "deck",
      flipping,
      showsEnough,
    ),
  args: { ...STACK_ARGS, lifted: true, dropping: true, throwing: true, flipping: true, showsEnough: SHOWS_DEFAULT },
  argTypes: { ...STACK_KNOBS, flipping: FLIPPING, showsEnough: SHOWS },
  parameters: { gkDocStory: "gestures.flip" },
};
