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
  regrip,
  stackMap,
  stackSeats,
  toFront,
} from "./gestureMap.js";
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

// The carry styles are installed here, as an ordinary consumer would install them.
installStockCarries();

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

interface GrabArgs {
  physics: boolean;
}

/**
 * THE CARRY WITH THE PHYSICS TAKEN OUT — the piece is exactly where the finger is, at the size it
 * has always been, at the angle it was lying at. Nothing eases, nothing banks, nothing pops.
 *
 * It is the honest floor of the gesture, and it is worth having its own scene: everything the
 * carry does beyond following the hand is a CHOICE the kit made, and a reader cannot tell a
 * choice from a law without having seen the thing without it. The position was never a choice —
 * a held thing rides the hand 1:1 on both scenes (`layCarry`), because a lag there reads as a
 * dropped frame rather than as weight.
 */
const NO_PHYSICS = { lift: 1, leanFactor: 0, leanMaxDeg: 0 } as const;

/**
 * A HANDLE HAS NO PHYSICS OF ITS OWN TO HAVE — it IS the grab.
 *
 * The same three fields as `NO_PHYSICS`, and named apart because they are not the same decision: one
 * is a page's switch about how carrying a PIECE should feel, and this is a fact about a control. A
 * handle that popped would be the thing you are holding growing in your hand; one that banked would
 * be it leaning out of it. And the pop is a scale about the anchor, so it would drag the whole heap
 * away from the tab as well: the stack must keep the distance from the handle it was drawn at.
 */
const HANDLE_IS_THE_GRAB = {
  /**
   * ...AND WHAT HANGS OFF IT TRAILS. The tab is the hand, exactly and instantly; the stack is being
   * DRAGGED by it, and a stack that arrived rigid would read as a picture of a stack rather than as
   * one. Each card a little further behind the one before it, so the run stretches out like an
   * accordion while the hand moves and closes up the moment it stops.
   *
   * The pop and the bank are NOT switched off here any more. They belong to the pieces — a stack
   * coming off the desk is picked up exactly as one card is, and a page whose stack alone stayed
   * flat would be saying that a stack is a different kind of thing. What must not pop is the TAB,
   * and that is said on the tab itself (`CarryItem.still`) rather than by flattening the gesture.
   */
  trail: 0.55,
} as const;

/**
 * THE BARRIER THAT NEVER LOSES.
 *
 * The kit gives a carry two ways to end AT a wall, and this scene closes both. SHOVED in hard
 * enough (`wallSpeed`) the wall wins and knocks the run off the hand — right for a die thrown into
 * a tray, wrong here: a piece would leave the hand because the hand pushed too eagerly. PULLED far
 * enough past it (`leash`) the hold breaks instead — also wrong here, and it is the worse of the
 * two, because the hand that broke the hold is still down and the reader has no idea it is now
 * holding nothing.
 *
 * With both closed, what is left is the thing that was asked for: the anchor goes where the finger
 * goes, the piece is clamped inside the border, and because the clamp is per axis the piece CRAWLS
 * along the inner perimeter while the finger travels round the outside. Let go and it simply falls
 * out of the hand where it stood — the release seat is the allowed one, never the finger's.
 */
const NEVER_THROUGH = { wallSpeed: Infinity, leash: Infinity } as const;

/**
 * How far the map may be pushed out and pulled in. Narrow on purpose: the lesson here is the
 * carry, and a reader who has zoomed to a tenth is looking at a problem the page is not about.
 */
const MAP_ZOOM = { minZoom: 0.5, maxZoom: 2.5 };

/**
 * The one scene every grab page stands on — they differ by their arguments, and by nothing else.
 *
 * `lift` absent means "whatever the physics switch says", which is what the first two pages want:
 * the pop is one of the things the switch is switching. A page that is ABOUT the height hands its
 * own number in, and then the height is that number on both settings of the switch — otherwise the
 * `Lift` page would answer "no lift at all" to a reader who turned the physics off on it.
 */
function grabScene(
  physics: boolean,
  lift?: number,
  letGo?: "drop" | "throw",
  stacking = false,
  grip: { w: number; min: number; max: number } = { w: GRIP.w, ...GRIP_HOLD },
  ways: { card?: LetGo; chip?: LetGo } = {},
): HTMLElement {
  // THE HEAPS AS THEY STAND, by the handle that lifts each — rebuilt whenever anything moves, since
  // that is the only time the answer can have changed.
  let heaps = new Map<string, readonly Node[]>();
  const built = scene(stacking ? stackMap() : gestureMap(), {
    animate: true,
    camera: {
      limits: MAP_ZOOM,
      // The map is laid out AROUND zero, so its corner is at minus half — the camera is told the
      // rect and not the size, or three quarters of it would be unreachable.
      content: { x: -MAP.w / 2, y: -MAP.h / 2, w: MAP.w, h: MAP.h },
      // THE ARBITRATION, as one predicate: whatever can be picked up takes its own finger, and
      // over bare map the same finger drives the view. The two never argue about a hand.
      claims: draggable,
      // Opened in the middle at zoom 1, where the pieces are life-size and the map is not: a phone
      // holds about half of it, so there is somewhere to carry a piece TO from the first touch.
      start: { at: { x: 0, y: 0 }, zoom: 1 },
    },
  });
  // How high the hand is actually holding it, once the switch and the page have both had their say.
  const held = lift ?? (physics ? DEFAULT_TUNING.lift : 1);
  /** Redraw the handles for whatever is touching now, and show them. */
  const settle = (): void => {
    if (!stacking) return;
    heaps = regrip(built.host.root, grip);
    built.host.setRoot(built.host.root);
  };
  settle();
  return wireDrag(built, {
    view: () => built.camera!.transform(),
    // A HANDLE LIFTS THE HEAP IT STANDS UNDER, and itself with it — left behind, the tab would hang
    // over felt the heap has walked away from. Anything else lifts alone, which is the whole of
    // "pull a card out of the heap instead of the heap".
    ...(stacking
      ? {
          runOf: (_root: Node, hit: Node) => (isGrip(hit) ? [hit, ...(heaps.get(hit.id) ?? [])] : [hit]),
          // The tab is the hand's own and takes no lift or lean; everything hanging off it does.
          stillOf: (_root: Node, hit: Node, run: readonly Node[]) => (isGrip(hit) ? run.map((n) => isGrip(n)) : undefined),
          // ...AND THE HEAP IS SQUARED UP AS IT COMES OFF THE DESK, not when it is put down. The
          // handle is the anchor, so the stack hangs off the finger exactly where the tab was.
          offsetOf: (_root: Node, hit: Node, run: readonly Node[]) =>
            isGrip(hit) ? [{ x: 0, y: 0 }, ...stackSeats(run.slice(1), grip.w)] : undefined,
          feelOf: (_root: Node, hit: Node) => (isGrip(hit) ? HANDLE_IS_THE_GRAB : undefined),
          // AFTER the tree has been written, never at the carry's `done`: at `done` the drop has
          // not been decided yet, so the handles would be redrawn from the seats the pieces had
          // before they were put down — a tab under the heap that used to be there.
          onSettled: (root: Node, ids: readonly string[]) => {
            // WHAT WAS JUST PUT DOWN GOES ON TOP, and it does not move to get there: a card let go
            // of over a heap is lying ON the heap, not under it, and the only thing that says which
            // is the order they are drawn in. It is also the order they will stand in when the
            // handle lifts them, so the newest is at the FRONT of the stack — which is the same
            // sentence a player would say about a real one.
            for (const id of ids) {
              const piece = byId(root, id);
              if (piece) toFront(piece);
            }
            settle();
          },
        }
      : {}),
    // THE MAP'S BORDER IS A WALL, and the piece is inside it for the whole gesture — see
    // `NEVER_THROUGH`. The height is handed in because the wall is the DRAWN edge of the piece:
    // raise a piece and it is wider, and a border that ignored that would let the difference out.
    trayOf: (_root, hit) => mapWalls(hit, isGrip(hit) ? 1 : held),
    ...NEVER_THROUGH,
    // Physics ON is the kit's own carry, by absence: an unnamed field is `DEFAULT_TUNING`'s, so
    // the switch never has to restate a number the kit already decided.
    ...(physics ? {} : NO_PHYSICS),
    lift: held,
    // A page that DROPS or THROWS takes the release over: the ordinary one puts the piece down
    // where the finger was, and putting down is the thing those pages say is not what happens.
    // A throw is a drop with the hand's speed still on it — one call, and the piece falls from the
    // hand's height WHILE it travels, which is what a thrown thing does.
    ...(letGo
      ? {
          onRelease: (v: Vec | undefined, items: readonly CarryItem[]) =>
            // A heap let go of by its handle was never lifted, so it has no height to fall from —
            // the run comes down from wherever the hand was actually holding it.
            letFall(built, items, held, letGo === "throw" ? v : undefined, settle, ways),
        }
      : {}),
  }).el;
}

/**
 * LET GO OF THE PIECES — they are in the air, and the air is where they are let go of.
 *
 * Three things happen, in this order and for a reason each:
 *
 *   THE SEAT IS WRITTEN FIRST. It is the truth — this is where the piece now lives — and a fall is
 *   only a look. A flight starts from the node's REST, so the seat has to be there before the drop
 *   is asked for, or the piece would fall at the place it was picked up from.
 *
 *   THE PIECE COMES TO THE FRONT. The last thing dropped covers what is under it, which is what a
 *   desk does; tree order and not a height, see `toFront`.
 *
 *   AND THEN IT FALLS, from exactly the height the hand was holding it at. The hand's height is a
 *   SCALE (`lift`) and a fall's is a LENGTH, and `RISE` is the one rate between them — asked here
 *   rather than guessed, because a second answer to it is a piece that jumps the instant it is
 *   released. How it comes down is the piece's own business (`dropOf`).
 *
 * `hand` is the speed the hand still had on it: absent, the piece drops where it stood; present, the
 * same fall carries that speed across the desk and the map's border reflects it. A slow release is
 * then not a special case at all — it is a throw of nearly no speed, which is a drop.
 */
function letFall(
  s: Scene,
  items: readonly CarryItem[],
  lift: number,
  hand?: Vec | undefined,
  after?: () => void,
  ways: { card?: LetGo; chip?: LetGo } = {},
): boolean {
  const m = s.motions;
  const drawn = m?.poses();
  if (!m || !drawn) return false;
  const root = s.host.root;
  const put: Node[] = [];
  for (const it of items) {
    const n = byId(root, it.id);
    const pose = drawn.get(it.id);
    if (!n || !pose) return false; // nothing written yet, so the ordinary drop still answers
    // The DRAWN origin: the carry lays the run at the anchor the walls allowed, so this is already
    // inside the border — the finger's own point never is. Root units are the seat's units here,
    // as the map is the root and stands at the origin.
    const own = fieldsOf<TransformableFields>(n, "Transformable");
    compose(n, Transformable({ ...(own ?? {}), at: apply(pose, { x: 0, y: 0 }) }));
    toFront(n);
    m.release(it.id);
    put.push(n);
  }
  // A PIECE THAT ONLY SETTLES HAS ALREADY DONE EVERYTHING IT IS GOING TO DO. Its seat is written and
  // the hand has let go, so the reconcile above is easing it there with the pop unwinding on the
  // way — which is the whole of the ordinary putting-down, and the reason it never flickers: there
  // is nothing to schedule and nothing to re-order first.
  const falling = put.filter((n) => dropOf(n, ways).fall === "fall");
  // WHO LEAVES WHEN: the handle never, the rest a step apart, so a heap POURS out of the hand
  // instead of coming down as a slab. A run of one has no stagger to have.
  const dropped = fallOrder(falling).map(({ piece, delayMs }) => ({
    id: piece.id,
    feel: dropOf(piece, ways),
    // The border at the piece's OWN size: a throw spends its travel on the felt, and the sliver of
    // the pop it is still wearing on the way down is not what a bounce should be measured off.
    walls: mapWalls(piece),
    delayMs,
  }));
  s.host.setRoot(root); // one notify: the seats and the new order are the tree's now
  const flight = hand ? polar(hand) : { speed: 0, angle: 0 };
  for (const { id, feel, walls, delayMs } of dropped) {
    m.slide(id, {
      ...flight,
      ...(delayMs > 0 ? { delayMs } : {}),
      up: (lift - 1) / RISE,
      gravity: feel.gravity,
      bounce: feel.bounce,
      wallBounce: feel.wallBounce,
      // A BORDER ONLY REFLECTS HERE. The kit's own default has a wall pop a hopping body upwards,
      // which is a die in the rail of its own tray and nothing else: every release on this desk is
      // a piece coming DOWN, so a border would throw it back up into the air it was falling out of.
      wallKick: 0,
      walls,
      // WHERE IT STOPPED IS WHERE IT NOW LIVES, and it has to be written or the piece does not stay
      // there: the seat in the tree is still the point it was let go of, and the reconcile that
      // follows a landing would fly it all the way back to the hand. A flight is a LOOK; the seat is
      // the truth, and the truth is only true once somebody writes it down.
      onDone: (at) => {
        landed(s, id, at);
        after?.();
      },
    });
  }
  return true;
}

const PHYSICS = documented("arg.physics", {}, "carry");
const LIFT = documented("arg.lift", { control: { type: "number", min: 1, step: 0.05 }, if: { arg: "lifted" } }, "carry");

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

interface LiftArgs extends GrabArgs {
  /** The page's own switch: off, and the hand holds the piece flat — the page before this one. */
  lifted: boolean;
  lift: number;
}

interface DropArgs extends LiftArgs {
  /** Off, and a release is an ordinary putting-down again — the page before this one. */
  dropping: boolean;
  /** How a CARD leaves the hand: eased to its seat, or dropped from the hand's height. */
  cardDrop: LetGo;
  /** The same for a chip — and the default is the other one, which is the point of having both. */
  chipDrop: LetGo;
}

interface ThrowArgs extends DropArgs {
  /** Off, and the hand's speed is not handed on: the piece drops where it stood. */
  throwing: boolean;
}

interface StackArgs extends ThrowArgs {
  /** Off, and touching pieces are just pieces that happen to overlap — no handles, no heaps. */
  stacking: boolean;
  /** The tab's width in units; its height follows, because the shape is what makes it read as a tab. */
  gripWidth: number;
  /** How far the view may take it down and up before it is held — see `Screened`. */
  gripMin: number;
  gripMax: number;
}

const GRIP_W = documented("arg.gripWidth", { control: { type: "number", min: 0.1, step: 0.05 }, if: { arg: "stacking" } }, "grip");
const GRIP_MIN = documented("arg.gripMin", { control: { type: "number", min: 0.1, step: 0.05 }, if: { arg: "stacking" } }, "grip");
// The ceiling is ONE and goes no higher: a handle has a size that suits the finger, and there is
// nothing above it to want.
const GRIP_MAX = documented("arg.gripMax", { control: { type: "number", min: 0.1, max: 1, step: 0.05 }, if: { arg: "stacking" } }, "grip");

/**
 * EVERY PAGE HAS THE SWITCH FOR ITS OWN FEATURE, and turning it off leaves the page BEFORE it.
 *
 * That is what makes the shelf readable end to end: each page adds exactly one thing, its switch
 * takes that one thing away, and what is left is the neighbour a reader has already understood. A
 * page whose feature could not be turned off would be asking to be believed rather than compared.
 */
const LIFTED = documented("arg.lifted", {}, "carry");
const DROPPING = documented("arg.dropping", {}, "release");
const THROWING = documented("arg.throwing", {}, "release");
const STACKING = documented("arg.stacking", {}, "stack");
/**
 * HOW EACH KIND LEAVES THE HAND. Two selects and not one switch, because the answer is not the same
 * for every thing on a desk: a card put down on a felt IS a putting-down, while a chip dropped on
 * one is a thing landing. The defaults say so; the panel lets a reader disagree.
 */
const WAYS: readonly LetGo[] = ["settle", "fall"];
const CARD_WAY = documented("arg.cardDrop", { control: "select", options: WAYS, if: { arg: "dropping" } }, "release");
const CHIP_WAY = documented("arg.chipDrop", { control: "select", options: WAYS, if: { arg: "dropping" } }, "release");

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
 * THE SEAT A FLIGHT ENDED ON, written into the tree — in the flight's own frame.
 *
 * Composed and not fed through `setRoot`: the runtime reads the tree itself on the very frame a
 * landing is reported, so the seat is found equal and nothing flies. Routed through a notify it
 * would arrive a frame late, and that frame is the piece back at the hand.
 *
 * Root units are the seat's units here, as the map is the root and stands at the origin.
 */
function landed(s: Scene, id: string, at: { readonly at: Vec; readonly angle: number }): void {
  const n = byId(s.host.root, id);
  if (!n) return;
  const own = fieldsOf<TransformableFields>(n, "Transformable");
  compose(n, Transformable({ ...(own ?? {}), at: at.at, angle: at.angle }));
}

/**
 * DROP — the same map, and the release is a FALL rather than a putting-down.
 *
 * The height is the one the hand was holding at, so nothing jumps at the moment of release; what
 * happens after that is the piece's own (`dropOf`). And the piece that just landed is the one on
 * top: a desk is a pile, and the last thing put on it covers what is under it.
 */
export const Drop: StoryObj<DropArgs> = {
  render: ({ physics, lifted, lift, dropping, cardDrop, chipDrop }) =>
    grabScene(physics, lifted ? lift : undefined, dropping ? "drop" : undefined, false, undefined, { card: cardDrop, chip: chipDrop }),
  args: { physics: true, lifted: true, lift: 1.3, dropping: true, cardDrop: "settle", chipDrop: "fall" },
  argTypes: { physics: PHYSICS, lifted: LIFTED, lift: LIFT, dropping: DROPPING, cardDrop: CARD_WAY, chipDrop: CHIP_WAY },
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
  render: ({ physics, lifted, lift, dropping, throwing, cardDrop, chipDrop }) =>
    grabScene(physics, lifted ? lift : undefined, dropping ? (throwing ? "throw" : "drop") : undefined, false, undefined, {
      card: cardDrop,
      chip: chipDrop,
    }),
  args: { physics: true, lifted: true, lift: 1.3, dropping: true, throwing: true, cardDrop: "settle", chipDrop: "fall" },
  argTypes: { physics: PHYSICS, lifted: LIFTED, lift: LIFT, dropping: DROPPING, throwing: THROWING, cardDrop: CARD_WAY, chipDrop: CHIP_WAY },
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
const STACK_RENDER = ({ physics, lifted, lift, dropping, throwing, stacking, gripWidth, gripMin, gripMax, cardDrop, chipDrop }: StackArgs): HTMLElement =>
  grabScene(
    physics,
    lifted ? lift : undefined,
    dropping ? (throwing ? "throw" : "drop") : undefined,
    stacking,
    { w: gripWidth, min: gripMin, max: gripMax },
    { card: cardDrop, chip: chipDrop },
  );

const STACK_ARGS: StackArgs = {
  physics: true,
  lifted: false,
  lift: 1.3,
  dropping: false,
  throwing: false,
  stacking: true,
  gripWidth: GRIP.w,
  gripMin: GRIP_HOLD.min,
  gripMax: GRIP_HOLD.max,
  cardDrop: "settle",
  chipDrop: "fall",
};

const STACK_KNOBS = {
  physics: PHYSICS,
  lifted: LIFTED,
  lift: LIFT,
  dropping: DROPPING,
  throwing: THROWING,
  stacking: STACKING,
  gripWidth: GRIP_W,
  gripMin: GRIP_MIN,
  gripMax: GRIP_MAX,
  cardDrop: CARD_WAY,
  chipDrop: CHIP_WAY,
};

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
