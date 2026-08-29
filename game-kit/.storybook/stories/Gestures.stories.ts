import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  circle,
  Container,
  CONTROL_LABEL,
  draggable,
  Draggable,
  Flippable,
  freeLayout,
  Labeled,
  node,
  rect,
  roundedRect,
  Rotatable,
  ANCHOR_SLOP,
  IDENTITY,
  installStockFlips,
  installStockShuffles,
  permutation,
  remove,
  reorder,
  seededRng,
  setFacing,
  shuffleNames,
  wireKnead,
  wireShake,
  byId,
  compose,
  fieldsOf,
  keyframeMotion,
  registerLayout,
  registerSurface,
  ShadowCaster,
  Surfaced,
  Transformable,
  wireSwipe,
  type LayoutRecord,
  type Motions,
  type Node,
  type Swipe,
} from "../../src/index.js";
import { BACK_SURFACE, cards, crossade, deckByCardId, faceSurface, installClassicSkin } from "@game-presets/cards";
import { DIE_KINDS, die, dieSpec, flashFace, showFace, type DieKind } from "@game-presets/dice";
import { CHIP_SURFACE, ROOK_SHAPE, ROOK_SURFACE, installGesturePieces } from "./gestureAssets.js";
import { scene, type CameraScene, type Scene } from "../devtools/scene.js";
installStockShuffles();
installGesturePieces();
installClassicSkin();
// THE FLIP EFFECT, without which `turns` is a number nobody reads: which side is up is the summed
// parity, and the effect is what turns that parity into the surface actually drawn.
installStockFlips();
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
// The target is a REAL CARD, from the set's own builder — as is everything else on this shelf. The
// kit ships no art and should not (a game brings its own), so a catalog page that stood on painted
// boxes would be showing a gesture against something no game will ever hold: a box has no
// silhouette to read, no back to turn to, and no weight to its picture. What matters about it here
// is unchanged — it is ONE target, and there is one gesture on it, so "it did not move" has exactly
// one meaning.
//
// What it carries besides its face is a shadow, and that is not decoration: half of what these
// pages show is height — a shiver stays on the desk, a hop leaves it — and without a shadow the two
// look alike.

/**
 * The one target the first two pages use: a real card, face up, that a hand may take hold of.
 *
 * Built here rather than taken from `cards()` because these pages name their target `tile` in three
 * handlers, and a node's id is its identity — not something to overwrite after the fact. What is
 * borrowed instead is the SKIN: the set's own face for the ace of spades and the set's own back.
 */
function tile(id: string, size: number): Node {
  const spec = crossade().find((c) => c.id === "spade-A")!;
  return node(
    id,
    Bounded({ bounds: rect(size, size * 1.4) }),
    Surfaced({ surface: faceSurface(spec) }),
    Flippable({ back: BACK_SURFACE }),
    Transformable({ at: { x: 0, y: 0 } }),
    // It lays a shadow, so a hop reads as a hop rather than as the card growing.
    ShadowCaster(),
    // A hand may take hold of it — which is what `want` on the hold wiring asks about.
    Draggable(),
  );
}

/** The scene every page builds: the card, and a line saying what the gesture last did. */
function stage(size: number, said: string): Node {
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
   * OFF THE DESK and back down — height, not travel. The card does not move across the felt at all;
   * what changes is how far above it it stands, and the shadow falling away is the whole tell.
   */
  zBounce: (m: Motions, id: string) => m.slide(id, { speed: 0, angle: 0, hop: HOP }),
  /**
   * UP THE SCREEN and back to the same seat — travel, not height. The pair with `zBounce` is the
   * point of having both: the card covers the same distance on the glass, and the shadow riding
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
  // HOLD THE CARD. Half a second of a finger that does not travel, and it shivers — the
  // answer to a gesture that has just changed meaning. Without it a player who gets no reply lifts
  // their finger to check, cancelling the very gesture they were making.
  render: ({ size, answer }) => {
    let said = "hold the card";
    const live = scene(stage(size, said), {
      camera: eye(draggableNode, 3),
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
  // finger, on the same card, means one thing when it leaves quickly and another when it stays.
  // The card answers with whatever the panel says. `zBounce` and `yBounce` are the pair worth
  // switching between here: both throw it the same distance, and only the shadow says which one
  // left the desk.
  render: ({ size, answer }) => {
    let said = "tap the card";
    const live = scene(stage(size, said), {
      camera: eye(draggableNode, 3),
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

/** How hard a `zBounce` throws the card off the desk, units/s of rise — one clear bounce, not a ball. */
const HOP = 3.4;
/** Fast enough to cross the desk and slow enough to watch it stop, units/s. */
const SLIDE_SPEED = 4.5;
/** Hard enough to clear the glass rather than dribble off the bottom edge, units/s. */
const LAUNCH_SPEED = 7;


// ---- the desk under the hand, and the desk the hand moves ---------------------------------------
//
// EVERY SCENE ON THIS SHELF STANDS ON A CAMERA, and it is not scenery. It is the outermost ring of
// the same law the shelf is about: when several gestures are possible, who wins — and here the
// claimants are a PIECE and the DESK ITSELF.
//
// The arbitration is already written, in the camera's own wiring, and it is the same shape as every
// other one here: a finger that lands on a claimed node gives the gesture away, and A GESTURE GIVEN
// AWAY IS NOT TAKEN BACK. So the second finger of a deal cannot become a pinch half way through,
// and the two fingers of a knead cannot zoom the felt out from under the pack they are working. On
// bare desk the same two fingers pan, pinch and twist — because there nothing claimed them.
//
// That is why `claims` is the only camera field these pages differ in: it is the sentence "this is
// mine" said by the thing the page is about.

/**
 * The desk every gesture page is looked AT rather than merely fitted into.
 *
 * `zoom` is the one thing worth arguing about per page. A desk SMALLER than the glass opens at `1`:
 * it is centred rather than scrolled, and opening at the fit would blow one card up to fill a phone.
 * A desk BIGGER than the glass opens at the fit, or the page spends its first gesture panning to
 * find the thing it is about — and on a table that is exactly the seats a deal is aimed at.
 */
function eye(claims: (n: Node) => boolean, halfW: number, halfH = halfW * 0.72, zoom: number | "fit" = 1): CameraScene {
  return {
    // Generous both ways: a reader who zooms in to watch a shadow and one who pulls back to see
    // where a card went are the same reader, a second apart.
    limits: { minZoom: 0.4, maxZoom: 3 },
    // The desks here are laid out AROUND zero, so the content rect starts at minus half — the
    // camera is told the RECT and not the size, or half of every desk would be unreachable.
    content: { x: -halfW, y: -halfH, w: halfW * 2, h: halfH * 2 },
    claims,
    // Opened where the pieces are, at the size they were drawn: a gesture page that opened
    // somewhere else would spend its first gesture on getting back.
    start: { at: { x: 0, y: 0 }, zoom },
  };
}

/** Whatever a hand can pick up claims its own finger — the plainest reading of "this is mine". */
const draggableNode = (n: Node): boolean => draggable(n);

/** The view a wiring picks through — the SAME matrix the painter drew, or the finger lands elsewhere. */
const eyeOf = (s: Scene) => () => s.camera?.transform() ?? IDENTITY;

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

/**
 * THE PIECES A TABLE ACTUALLY HOLDS — real ones.
 *
 * Cards come from `@game-presets/cards` and dice from `@game-presets/dice`: whole sets with their
 * own classic skins, imported BY PACKAGE NAME like any other consumer. The kit ships no art and
 * should not — a game brings its own — and these pages are that game. A chip and a rook have no
 * add-on of their own, so they are drawn in `gestureAssets.ts` beside the catalog's other pictures.
 *
 * They differ in every way a real table's pieces differ: size, silhouette, weight of picture. That
 * is the point rather than decoration — a gesture does not know what it is moving, and a desk of
 * six unlike things is how that stops being a claim and starts being visible.
 */
function sandboxPieces(): Node[] {
  const by = deckByCardId({ size: { w: 0.9, h: 1.26 } });
  const card = (id: string, x: number, y: number): Node | undefined => {
    const n = by.get(id);
    if (!n) return undefined;
    compose(n, Transformable({ at: { x, y } }));
    compose(n, ShadowCaster());
    return n;
  };
  const chip = node(
    "chip",
    Bounded({ bounds: circle(0.34) }),
    Surfaced({ surface: CHIP_SURFACE }),
    Transformable({ at: { x: 0.7, y: -0.8 } }),
    // FROM THE SILHOUETTE, not from the box. A chip is round and a rook is not a rectangle, and a
    // square shadow under either is the one thing that would give the drawing away as a sticker.
    ShadowCaster({ from: "silhouette" }),
  );
  const rook = node(
    "rook",
    // ITS OWN OUTLINE, not a box round it: the contour is what the finger tests and what the shadow
    // is cast from, and a rectangle would put a slab under a piece that plainly is not one.
    Bounded({ bounds: ROOK_SHAPE }),
    Surfaced({ surface: ROOK_SURFACE }),
    Transformable({ at: { x: -1.4, y: 0.9 } }),
    ShadowCaster({ from: "silhouette" }),
  );
  const d6 = die("d6", { kind: "d6", face: 3, at: { x: 1.75, y: -0.75 } });
  const d20 = die("d20", { kind: "d20", face: 17, at: { x: 1.5, y: 0.95 } });
  return [card("spade-A", -1.85, -0.7), card("heart-10", -0.55, -0.8), chip, rook, d6, d20].filter(
    (n): n is Node => n !== undefined,
  );
}

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
  for (const piece of sandboxPieces()) {
    // STAY, and not the kit's own `home`. A sandbox has nothing that refuses a drop, so every
    // release is a refusal — and a desk that flew every piece back would be teaching that a drag
    // does not work. A die arrives already `Draggable`; composing replaces the atom outright.
    compose(piece, Draggable({ onReject: "stay" }));
    if (turns) compose(piece, Rotatable({ onRelease: a.onRelease as "keep" | "home" | "snap", snap: a.snap }));
    add(desk, piece);
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
  render: (a) => {
    const s = scene(sandbox(a, false), { animate: true, camera: eye(draggableNode, 3.4) });
    return wireDrag(s, { lift: a.lift, carry: a.carry, toFront: true, view: eyeOf(s) }).el;
  },
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
  render: (a) => {
    const s = scene(sandbox(a, true), { animate: true, camera: eye(draggableNode, 3.4) });
    return wireDrag(s, { lift: a.lift, carry: a.carry, toFront: true, view: eyeOf(s) }).el;
  },
};

// ---- the round table: one hand holds the pack, the other deals off it ---------------------------
//
// THE GESTURE THIS PAGE EXISTS FOR is the one every card player already owns and no interface has
// ever had a word for: a hand rests on the pack, and a finger of the other hand flicks a card off
// it toward somebody. It is not a drag of the top card — nothing is carried anywhere — and it is
// not a drag of the pack, which is what the resting hand is doing.
//
// So the arbitration cannot be a mode, a modifier or a long press. It is READ OFF THE TWO HANDS:
//   • one finger alone on the pack MOVES THE PACK (`wireDrag`, exactly as the sandbox does);
//   • a SECOND finger that leaves fast and straight while the first is still resting DEALS
//     (`wireSwipe`, and the resting hand is `Swipe.anchor`).
// The test is `anchor.drift < ANCHOR_SLOP` — how far the other hand wandered from where it landed.
// Under it, that hand is holding. Over it, that hand is dragging and this was never a deal.
//
// WHAT THE TWO PAGES BELOW DIFFER IN is what happens after the card leaves, and it is worth having
// both because they are the two halves of one decision. `Deal` looks for somebody to land on, and
// a card that finds nobody must COME BACK — a card that stopped in the middle of the felt because
// the dealer aimed badly is a mess the game then has to explain. `Fling` looks for nobody at all,
// and so a card lands where it stops and that is the whole of it. A game that wants one and got
// the other is telling its players something about the table that is not true.

const SEAT_R = 0.34;
/**
 * THE RIM, root units — round, and big.
 *
 * ROUND because every seat has to be the same throw. On an oval the near seat is a flick and the
 * side seats are a shove, so the same `reach` means two different things depending on who is being
 * dealt to — and a dealer would learn to aim differently per player, which is a rule nobody wrote.
 *
 * BIG because a swipe needs ROOM. The gesture is a flick with a measurable direction, and on a rim
 * close to the pack every seat is a few degrees from its neighbours: the dealer aims, the table
 * refuses, and there is nothing on the glass to say why. Distance is what makes an angle readable,
 * by the hand as much as by the arithmetic. It no longer has to fit the phone either — a camera
 * stands under every page on this shelf, so a table bigger than the glass is one the reader pans.
 */
const TABLE_R = 2.6;
const CARD = { w: 0.56, h: 0.8 };

/** Everyone at the origin: what a closed pack looks like to a layout. */
const stackLayout: LayoutRecord = { place: (children) => children.map(() => ({ x: 0, y: 0 })) };

/**
 * A HAND, FANNED — an arc of seats, each a little further round than the last.
 *
 * A layout writes only `at` (`guard.layout-writes-only-at`), so the spread is here and the TURN of
 * each card is on the card itself. That split is not a workaround: where a card sits is the hand's
 * business and which way it faces is the card's, and a layout that wrote both would take the angle
 * away from a game that wanted to say something with it.
 */
const fanLayout: LayoutRecord = {
  place: (children) =>
    children.map((_, i) => {
      const n = children.length;
      const step = n > 1 ? (i - (n - 1) / 2) : 0;
      return { x: step * 0.26, y: Math.abs(step) * 0.05 };
    }),
};

/** How far round the table seat `i` of `n` stands, degrees clockwise from +x. `0` is the near seat. */
const seatAngle = (i: number, n: number): number => 90 + (i * 360) / n;

/** A point on the rim — the same distance from the pack whichever seat it is. */
const at = (deg: number) => ({
  x: Math.cos((deg * Math.PI) / 180) * TABLE_R,
  y: Math.sin((deg * Math.PI) / 180) * TABLE_R,
});

interface TableArgs {
  dealt: number;
  dealAngle: number;
  seats: number;
  count: number;
  arc: number;
  reach: number;
  gain: number;
  spin: number;
  friction: number;
  boomerangMs: number;
  grip: number;
}

/**
 * THE TREE IS THE STATE ON THESE TWO PAGES, and it is kept between renders rather than rebuilt.
 * Which cards have been dealt and to whom is not derivable from any control, and a story that
 * handed `scene()` a fresh tree on every knob turn would sweep the reader's own dealing off the
 * table — `scene()` takes a re-render as new DATA for the standing view (see its own note on why).
 *
 * Keyed by the STORY and not by the element, because the tree has to exist before `scene()` is
 * called with it. Rebuilt only when a control that changes its SHAPE moves: seats, or cards.
 */
const TABLES = new Map<string, { root: Node; shape: string }>();

/**
 * The deal, as the NEWEST render's numbers see it. Swapped per render and never re-attached — the
 * same trick `scene()` plays with its own handlers, and for the same reason: the listeners belong
 * to the view and the closure belongs to the story.
 */
const DEALERS = new WeakMap<HTMLElement, (angle: number, speed: number) => void>();

/**
 * THE GESTURE WIRINGS OF A STANDING SCENE, so a re-render swaps them instead of stacking them.
 *
 * Storybook calls a story again for every knob turn and the scene shell answers with the SAME
 * standing canvas — so a wiring attached in a render body is attached again on every keystroke,
 * and a deal would be dealt twice, then three times. `wireDrag` guards itself; the three seams
 * beside it return a teardown and leave the bookkeeping to whoever owns the view, which here is
 * this page.
 */
const GESTURES = new WeakMap<HTMLElement, () => void>();
function rewire(el: HTMLElement, attach: () => () => void): void {
  GESTURES.get(el)?.();
  GESTURES.set(el, attach());
}

/** Did this control move since the last render of this scene? First sight is not a move. */
const SEEN = new WeakMap<HTMLElement, Record<string, unknown>>();
function moved(el: HTMLElement, key: string, value: unknown): boolean {
  const seen = SEEN.get(el) ?? {};
  const changed = key in seen && seen[key] !== value;
  SEEN.set(el, { ...seen, [key]: value });
  return changed;
}

function tableTree(a: TableArgs): Node {
  registerLayout("gesture.table.free", freeLayout);
  registerLayout("gesture.table.stack", stackLayout);
  registerLayout("gesture.table.fan", fanLayout);
  registerSurface("gesture.table.felt", { layers: [{ paint: "text", opacity: 0.12 }] });
  registerSurface("gesture.table.seat", { layers: [{ paint: "text", opacity: 0.3 }], radius: SEAT_R });

  const desk = node("desk", Container({ layout: "gesture.table.free" }));
  // THE FELT IS NOT INTERACTIVE and carries no atom that would let a finger take hold of it: a
  // table is the room the gesture happens in, not a thing in the room.
  add(
    desk,
    node(
      "felt",
      Bounded({ bounds: circle(TABLE_R + SEAT_R * 1.8) }),
      Surfaced({ surface: "gesture.table.felt" }),
    ),
  );
  for (let i = 0; i < a.seats; i++) {
    add(
      desk,
      node(
        `seat${i}`,
        Bounded({ bounds: circle(SEAT_R) }),
        Surfaced({ surface: "gesture.table.seat" }),
        Transformable({ at: at(seatAngle(i, a.seats)) }),
        Container({ layout: "gesture.table.fan" }),
      ),
    );
  }
  const deck = node(
    "deck",
    Bounded({ bounds: roundedRect(CARD.w, CARD.h, 0.08) }),
    // THE PACK'S OWN BACK is the set's back — the same surface every card in it wears face down,
    // so an empty deck and a full one are the same picture and the anchor never reads as a hole.
    Surfaced({ surface: BACK_SURFACE }),
    Transformable({ at: { x: 0, y: 0 } }),
    ShadowCaster(),
    // THE PACK IS A CONTAINER THAT DRAWS ITSELF, and that is what an empty deck's anchor IS: there
    // is no separate slot node to keep in step with it. Deal the last card away and the pack is
    // still standing there, ready to be dealt back onto.
    Container({ layout: "gesture.table.stack" }),
    Draggable({ onReject: "stay" }),
  );
  // REAL CARDS, from the set's own builder: each one `Flippable` onto the shared back, so "face
  // down in somebody else's hand, face up in mine" is a TURN and not a picture swapped behind the
  // player's back. The pack is dealt from the end, so the order is the set's own.
  for (const card of cards({ size: { w: CARD.w, h: CARD.h } }).slice(0, a.count)) {
    compose(card, Transformable({ at: { x: 0, y: 0 } }));
    compose(card, ShadowCaster());
    // HOME, not `stay`, while it is IN the pack. A card carried as part of the pack is written
    // nowhere on release: its seat is the middle of the deck, and the deck is what moved. Written
    // a root-space seat instead — which is what `stay` means — every card in a moved pack would be
    // displaced again by the pack's own offset, and the pack would come apart in the hand.
    compose(card, Draggable({ onReject: "home" }));
    setFacing(card, "down");
    add(deck, card);
  }
  add(desk, deck);
  add(
    desk,
    node(
      "said",
      Bounded({ bounds: rect(TABLE_R * 2, 0.34) }),
      Transformable({ at: { x: 0, y: TABLE_R + SEAT_R * 2.4 } }),
      Labeled({ label: "rest a finger on the pack, flick a card off it with another", style: CONTROL_LABEL }),
    ),
  );
  return desk;
}

/**
 * SAY WHAT THE HAND DID — and, when nothing was dealt, WHY.
 *
 * A gesture page whose gesture does not fire is unreadable: every one of the four numbers a deal
 * turns on (speed, reach, straightness, the other hand's drift) is invisible, and "it does not
 * work" is the only report a reader can make. This turns that into a sentence with the numbers in
 * it, which is the difference between a bug report and a tuning session.
 */
function say(s: Scene, text: string): void {
  const line = byId(s.host.root, "said");
  if (!line) return;
  compose(line, Labeled({ label: text, style: CONTROL_LABEL }));
  s.setRoot(s.host.root);
}

/** The pack's top card — the one a deal takes, and `undefined` on an empty pack. */
const topOf = (root: Node): Node | undefined => {
  const deck = byId(root, "deck");
  return deck?.children[deck.children.length - 1];
};

/** Where a node stands in root units — these desks are free layouts, so it is the sum of the `at`s. */
const worldAt = (n: Node | undefined): { x: number; y: number } => {
  let x = 0;
  let y = 0;
  for (let up = n; up; up = up.parent ?? undefined) {
    const t = fieldsOf<{ at?: { x: number; y: number } }>(up, "Transformable")?.at;
    if (t) {
      x += t.x;
      y += t.y;
    }
  }
  return { x, y };
};

/**
 * WHERE A SWIPE OFF THE PACK LANDS — the seat closest to the direction it was thrown, or nobody.
 *
 * Two separate refusals, and they are separate because the player can tell them apart. A swipe
 * pointed between two players finds nobody because it was AIMED badly (`arc`). A swipe with no
 * strength behind it finds nobody because it was THROWN badly (`reach`): the card would have died
 * short of the seat, and pretending otherwise would be the table doing the dealer's work for them.
 *
 * The strength test is the slide's own arithmetic and not a number of its own: a body under
 * friction covers `v² / 2f` and no more, so "would it have got there" is a question the physics
 * already answers. A `reach` of `1` demands the card would have reached the seat on its own; below
 * that, the table helps.
 */
function seatFor(root: Node, a: TableArgs, angle: number, speed: number): Node | undefined {
  const from = worldAt(byId(root, "deck"));
  let best: { seat: Node; off: number } | undefined;
  for (let i = 0; i < a.seats; i++) {
    const seat = byId(root, `seat${i}`);
    if (!seat) continue;
    const to = worldAt(seat);
    const bearing = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
    // Folded into ±180, or a swipe at 179° and a seat at -179° are two degrees apart and read as
    // three hundred and fifty eight.
    const off = Math.abs(((bearing - angle + 540) % 360) - 180);
    if (off > a.arc) continue;
    const gap = Math.hypot(to.x - from.x, to.y - from.y);
    const carry = (speed * speed) / (2 * Math.max(a.friction, 0.01));
    if (carry < gap * a.reach) continue;
    if (!best || off < best.off) best = { seat, off };
  }
  return best?.seat;
}

/** The look a card that found nobody comes home with — out along the swipe, and back to the pack. */
const boomerang = (angle: number, reach: number, ms: number) =>
  keyframeMotion({
    durMs: ms,
    ease: "easeOut",
    keys: [
      {
        at: 0.45,
        move: { x: Math.cos((angle * Math.PI) / 180) * reach, y: Math.sin((angle * Math.PI) / 180) * reach },
        turn: reach * 12,
      },
    ],
  });

/** The deal itself, built fresh each render so it reads the newest numbers. */
function dealer(s: Scene, a: TableArgs, snap: boolean): (angle: number, speed: number) => void {
  return (angle, speed) => {
    const root = s.host.root;
    const card = topOf(root);
    const deck = byId(root, "deck");
    if (!card || !deck || !s.motions) return;
    const seat = snap ? seatFor(root, a, angle, speed) : undefined;
    const home = worldAt(deck);

    if (snap && !seat) {
      // NOBODY THERE. The card never leaves the pack's tree at all — it plays a LOOK, and the look
      // ends on the seat it started from by construction (`keyframeMotion`). A boomerang written as
      // a throw plus a trip home would need the card to be somewhere in between, and that is the
      // state a mis-dealt card must never be caught in.
      s.motions.animate(card.id, boomerang(angle, Math.min(speed * 0.18, TABLE_R), a.boomerangMs));
      return;
    }

    // OFF THE PACK AND ONTO THE FELT, standing exactly where the pack stands — so the throw starts
    // from under the dealer's hand and not from wherever a layout would have put a loose card. It
    // has to LEAVE its owner first: the kit refuses a node that already has one, loudly, and that
    // refusal is the reason a card cannot quietly end up in two places.
    if (card.parent) remove(card.parent, card);
    add(root, card);
    // OFF THE PACK IS ON ITS OWN: it is nobody's child now, so a refused drop must leave it where
    // the hand let go rather than fly it back to a seat it no longer has.
    compose(card, Draggable({ onReject: "stay" }));
    compose(card, Transformable({ at: home }));
    s.setRoot(root);

    const to = seat ? worldAt(seat) : undefined;
    const gap = to ? Math.hypot(to.x - home.x, to.y - home.y) : 0;
    // AIMED AT THE SEAT, not where the finger pointed: the swipe said WHO, and a card that landed
    // two units past the player because the dealer flicked hard would make the snap unreadable.
    // Thrown with exactly the speed that dies at the seat — the same `v² = 2fd`, the other way up.
    const throwAngle = to ? (Math.atan2(to.y - home.y, to.x - home.x) * 180) / Math.PI : angle;
    const throwSpeed = to ? Math.sqrt(2 * Math.max(a.friction, 0.01) * gap) : speed * a.gain;

    s.motions.slide(card.id, {
      speed: throwSpeed,
      angle: throwAngle,
      spin: a.spin,
      friction: a.friction,
      onDone: (rest) => {
        const live = byId(s.host.root, card.id);
        if (!live) return;
        if (seat) {
          const target = byId(s.host.root, seat.id);
          if (target) {
            if (live.parent) remove(live.parent, live);
            add(target, live);
            compose(live, Transformable({ at: { x: 0, y: 0 }, angle: 0 }));
            // THE NEAR SEAT IS THE READER'S OWN, and a hand you are holding is a hand you can see.
            // Every other seat keeps its cards face down. It is a real TURN and not a surface
            // swapped behind the player's back: the card carries the set's own back, and which side
            // is up is the summed parity `Atoms/Flippable` already owns.
            setFacing(live, target.id === "seat0" ? "up" : "down");
          }
        } else {
          // NOBODY WAS LOOKED FOR, so the card stays where it stopped. The override is gone the
          // same frame, so the pose has to be written or the card would snap back to the pack.
          compose(live, Transformable({ at: rest.at, angle: rest.angle }));
        }
        s.setRoot(s.host.root);
      },
    });
  };
}

const TABLE_ARGS: TableArgs = {
  dealt: 0,
  dealAngle: 90,
  seats: 6,
  count: 8,
  arc: 30,
  reach: 0.7,
  gain: 1,
  spin: 240,
  friction: 6,
  boomerangMs: 520,
  grip: ANCHOR_SLOP,
};

const TABLE_KNOBS = {
  dealt: documented("arg.dealt", { control: { type: "number", min: 0, step: 1 } }, "deal"),
  dealAngle: documented("arg.dealAngle", { control: { type: "number", step: 15 } }, "deal"),
  seats: documented("arg.seats", { control: { type: "number", min: 2, max: 10, step: 1 } }, "table"),
  count: documented("arg.count", { control: { type: "number", min: 0, max: 20, step: 1 } }, "table"),
  gain: documented("arg.gain", { control: { type: "number", min: 0, step: 0.1 } }, "deal"),
  spin: documented("arg.spin", { control: { type: "number", step: 20 } }, "deal"),
  friction: documented("arg.friction", { control: { type: "number", min: 0.1, step: 0.5 } }, "deal"),
  grip: documented("arg.grip", { control: { type: "number", min: 0, step: 2 } }, "deal"),
};

/** Wire both table pages the same way — the only difference is whether a seat is looked for. */
function tablePage(a: TableArgs, snap: boolean, key: string): HTMLElement {
  const shape = `${a.seats}/${a.count}`;
  const held = TABLES.get(key);
  const root = held && held.shape === shape ? held.root : tableTree(a);
  TABLES.set(key, { root, shape });
  const s = scene(root, {
    animate: true,
    motion: { friction: a.friction },
    // THE PACK AND ITS CARDS TAKE THEIR OWN FINGERS; the felt round them is the camera's. A finger
    // that lands on the deck gives the gesture away, and the deal's second finger is then free —
    // the camera does not take a gesture back.
    // The oval plus the line under it, and opened at the FIT: every seat a deal can be aimed at is
    // on the glass from the first frame, and the reader zooms in rather than hunting.
    camera: eye(
      (n: Node) => n.id === "deck" || n.parent?.id === "deck" || draggableNode(n),
      TABLE_R + SEAT_R * 2,
      TABLE_R + SEAT_R * 3.2,
      "fit",
    ),
  });
  DEALERS.set(s.el, dealer(s, a, snap));
  wireDrag(s, {
    toFront: true,
    view: eyeOf(s),
    // THE PACK TRAVELS WHOLE. A carry poses the nodes it was given and nothing else — the override
    // is per-node, by id, and a container's children keep their own tree poses under it. Grab the
    // deck alone and the cards stay behind and then settle after it, which reads as the pack coming
    // apart in the hand. The run is the answer the wiring already had a word for.
    runOf: (_root, hit) => (hit.id === "deck" ? [hit, ...hit.children] : [hit]),
    // A CARD STILL IN THE PACK REFUSES THE FINGER, and that refusal is what makes the pack one
    // object under the hand. The pick then falls through to the deck itself, which is drawn under
    // it — so one finger on the pack moves the pack, whichever of its cards was on top.
    may: (n: Node) => n.parent?.id !== "deck",
    zoneAt: (root, p) => {
      const deck = byId(root, "deck");
      if (!deck) return undefined;
      const home = worldAt(deck);
      return Math.abs(p.x - home.x) <= CARD.w && Math.abs(p.y - home.y) <= CARD.h ? deck : undefined;
    },
    onDrop: ({ lead, target }) => {
      // THE PACK CANNOT BE DROPPED ON ITSELF. One finger dragging the deck lands it on the zone the
      // deck IS, and a drop taken at face value would ask the tree to put a node inside itself —
      // which the kit refuses loudly, as it should. Refusing here instead lets the ordinary drop
      // stand: the pack stays where the hand left it.
      if (lead.id === target.id) return false;
      // BACK ONTO THE PACK, face down again. The kit's own move machinery is not asked: this desk
      // has no rules about who may hold what, and `planMove` answers a question nobody here posed.
      if (lead.parent) remove(lead.parent, lead);
      add(target, lead);
      compose(lead, Transformable({ at: { x: 0, y: 0 }, angle: 0 }));
      compose(lead, Draggable({ onReject: "home" })); // back in the pack, it belongs to the pack again
      setFacing(lead, "down");
      s.setRoot(s.host.root);
      return true;
    },
  });
  rewire(s.el, () =>
    wireSwipe({
      host: s.host,
      // WIDER THAN THE LAW, on purpose. Gated to the pack alone, a flick that started a finger's
      // width off it is refused inside the recogniser and the page has nothing to say — which is
      // indistinguishable, to a reader, from a page that does not work. Let the felt through and
      // the refusal is a sentence instead of a silence.
      want: (n: Node) => n.id === "deck" || n.parent?.id === "deck" || n.id === "felt",
      view: eyeOf(s),
      poses: () => s.motions?.poses(),
      onSwipe: (sw: Swipe) => {
      // THE WHOLE LAW OF THE PAGE, in one line. The other hand has to be ON the pack and has to
      // have STAYED there: a hand that wandered was dragging the pack, and a deal it happened to
      // pass through is not a deal.
        const anchored =
          sw.anchor && sw.anchor.drift < ANCHOR_SLOP && (sw.anchor.on?.id === "deck" || sw.anchor.on?.parent?.id === "deck");
        if (!anchored) return;
        DEALERS.get(s.el)?.(sw.angle, sw.speed);
      },
    }),
  );
  // THE PANEL DEALS TOO. The gesture this page is about needs two fingers, and a reader on a
  // laptop has one mouse — so the counter fires the same deal through the same code, and the page
  // is legible without a touchscreen. It is not a second mechanism: `dealt` calls what a swipe calls.
  if (moved(s.el, "dealt", a.dealt)) DEALERS.get(s.el)?.(a.dealAngle, 6 * a.gain);
  return s.el;
}

/**
 * DEAL: ONE HAND ON THE PACK, THE OTHER FLICKS A CARD AT SOMEBODY.
 *
 * Rest a finger on the deck. With a second finger, swipe off it toward a player. The card leaves
 * along the swipe, finds the seat nearest that direction and lands in their hand; find nobody, and
 * it comes back.
 *
 * THE ARBITRATION IS THE PAGE. One finger alone on the pack MOVES THE PACK — drag it anywhere, and
 * the deal still works from wherever you left it. A second finger that leaves fast and straight
 * while the first is still resting DEALS. The test is `Swipe.anchor.drift`: how far the other hand
 * wandered from where it landed. Under the slop it is holding; over it, it was dragging, and a deal
 * that happened to pass through a drag is not a deal. Nothing here is a mode, and there is nothing
 * to hold down.
 *
 * A CARD THAT FINDS NOBODY COMES BACK, and it does it without ever leaving the pack: it plays a
 * LOOK (a registered `keyframeMotion`), and a look ends on the seat it started from by construction.
 * Written as a throw plus a trip home it would need the card to exist somewhere in between — which
 * is the one state a mis-dealt card must never be caught in, because that is where a game has to
 * start explaining itself.
 *
 * TWO REASONS TO FIND NOBODY, and a player can tell them apart. `arc` is AIM: a swipe between two
 * players belongs to neither. `reach` is STRENGTH: a lazy flick would have died short of the seat,
 * and the test is the slide's own arithmetic (`v² = 2fd`) rather than a number of its own — "would
 * it have got there" is a question the physics already answers. Turn `reach` to zero and the table
 * does the dealing for you; turn it up and a weak deal is the dealer's problem, as at a real table.
 *
 * Cards go back: drag one onto the pack and it is face down again. The pack itself is a container
 * that draws its own back, so an empty deck is still standing there to be dealt onto — there is no
 * separate slot node that could fall out of step with it.
 */
export const Deal: StoryObj<TableArgs> = {
  args: { ...TABLE_ARGS },
  argTypes: {
    ...TABLE_KNOBS,
    arc: documented("arg.arc", { control: { type: "number", min: 0, max: 180, step: 5 } }, "deal/snap"),
    reach: documented("arg.reach", { control: { type: "number", min: 0, max: 2, step: 0.05 } }, "deal/snap"),
    boomerangMs: documented("arg.boomerangMs", { control: { type: "number", min: 0, step: 20 } }, "deal/snap"),
  },
  parameters: { gkDocStory: "gestures.deal" },
  render: (a) => tablePage(a, true, "gestures.deal"),
};

/**
 * FLING: THE SAME GESTURE, AND NOBODY IS LOOKED FOR.
 *
 * Rest a finger on the pack, flick a card off it with another. It goes where you sent it, at the
 * speed you sent it, and stops where friction leaves it. There is no seat to find, so there is
 * nothing to come back from — and that absence is the point of standing this page next to `Deal`.
 *
 * The pair is one decision, seen from both sides. A table that SNAPS is saying "a card belongs to
 * somebody"; a table that does not is saying "a card belongs where it lies". Neither is more
 * correct, and a game that wanted one and shipped the other has told its players something untrue
 * about what the table is: cards drifting to the nearest player in a game where position is the
 * state, or cards stranded mid-felt in a game where every card has an owner.
 *
 * `gain` is how much of the finger's speed the card inherits, and it is the only strength lever
 * here: with nobody to aim at, how hard you flicked is the whole of what you said. `friction` is
 * the felt, and between them they are the ordinary physics of a puck — the same body a `slide`
 * always was, given a swipe's own number instead of a scripted one.
 */
export const Fling: StoryObj<TableArgs> = {
  args: { ...TABLE_ARGS, gain: 1.2 },
  argTypes: TABLE_KNOBS,
  parameters: { gkDocStory: "gestures.fling" },
  render: (a) => tablePage(a, false, "gestures.fling"),
};

// ---- kneading a pack, and shaking a die ---------------------------------------------------------
//
// THE LAST TWO GESTURES ON THE SHELF HAVE NO DESTINATION, and that is what makes them a pair. A
// drag ends somewhere; a swipe leaves in a direction. These two end where they began and are worth
// something anyway, because the WORK is the point — and a gesture whose content is work cannot be
// reported as an outcome at the end. It has to be paid out as it is done, or the thing under the
// fingers sits dead and jumps when they leave, which is the one thing a player reads as broken.

interface KneadArgs {
  count: number;
  recipe: string;
  quantum: number;
  shuffleMs: number;
}

const KNEAD_STATE = new Map<string, Node>();
/** What the newest render does with a quantum of kneading — swapped per render, never re-attached. */
const KNEADERS = new WeakMap<HTMLElement, (count: number, done: boolean) => void>();

function packTree(a: KneadArgs): Node {
  registerLayout("gesture.knead.free", freeLayout);
  registerLayout("gesture.knead.stack", stackLayout);
  const desk = node("desk", Container({ layout: "gesture.knead.free" }));
  const pack = node(
    "pack",
    Bounded({ bounds: roundedRect(CARD.w, CARD.h, 0.08) }),
    Surfaced({ surface: BACK_SURFACE }),
    Transformable({ at: { x: 0, y: 0 } }),
    ShadowCaster(),
    Container({ layout: "gesture.knead.stack" }),
  );
  // A REAL PACK, face down. A shuffle must not look like a piece changing its face, and cards that
  // are genuinely the set's — every one different, every one turned the same way — are the only
  // honest way to show that nothing was swapped.
  for (const card of cards({ size: { w: CARD.w, h: CARD.h } }).slice(0, a.count)) {
    compose(card, Transformable({ at: { x: 0, y: 0 } }));
    compose(card, ShadowCaster());
    setFacing(card, "down");
    add(pack, card);
  }
  add(desk, pack);
  return desk;
}

/**
 * TWO FINGERS ON THE PACK, WORKING IT. THE MORE YOU KNEAD, THE MORE IT IS SHUFFLED.
 *
 * Put two fingers on the deck and rub them back and forth. The pack comes apart under them and
 * keeps coming apart for as long as you work it; let go and it settles into the order the work
 * left it in.
 *
 * IT IS PAID OUT IN QUANTA, and that is the shape of the whole gesture rather than an
 * implementation detail. A shuffle is a CHOREOGRAPHY — it has a span and an end — so a knead
 * cannot be one shuffle: a hand that keeps working would be watching an animation that finished
 * without it. Every `quantum` of ground the two fingers cover together is one short shuffle with a
 * reorder of its own, and a hand that goes on kneading simply starts the next one over the top of
 * the last. The pack is therefore genuinely more disordered the longer it is worked — the counter
 * on the glass is the reorders that actually happened, not a measure of enthusiasm.
 *
 * A QUANTUM IS GROUND AND NOT TIME. A slow knead and a fast one do the same work per pass of the
 * hand; the fast one simply gets more passes in. That is the honest model of the thing being
 * imitated, and it is why `quantum` is measured in units of the desk.
 *
 * BOTH FINGERS HAVE TO BE WORKING. One holding while the other travels is a DEAL — the gesture two
 * pages back, off the same kind of pack, with the same two fingers. Only the roles differ, and the
 * whole shelf turns on that: try it here, hold with one and flick with the other, and nothing is
 * kneaded at all.
 */
export const Knead: StoryObj<KneadArgs> = {
  args: { count: 10, recipe: "riffle", quantum: 2, shuffleMs: 320 },
  argTypes: {
    count: documented("arg.count", { control: { type: "number", min: 2, max: 24, step: 1 } }, "pack"),
    recipe: documented("arg.recipe", { control: "select", options: shuffleNames() }, "pack/shuffle"),
    quantum: documented("arg.quantum", { control: { type: "number", min: 0.2, step: 0.2 } }, "knead"),
    shuffleMs: documented("arg.shuffleMs", { control: { type: "number", min: 40, step: 20 } }, "knead"),
  },
  parameters: { gkDocStory: "gestures.knead" },
  render: (a) => {
    const key = "gestures.knead";
    const held = KNEAD_STATE.get(key);
    const root = held && (byId(held, "pack")?.children.length ?? -1) === a.count ? held : packTree(a);
    KNEAD_STATE.set(key, root);
    // THE PACK CLAIMS BOTH FINGERS. It carries no `Draggable` — a knead is not a carry — so the
    // ordinary "whatever can be picked up" would leave the camera pinching the felt out from under
    // the very pack the hands are working.
    const s = scene(root, { animate: true, camera: eye((n: Node) => n.id === "pack" || n.parent?.id === "pack", 3) });
    let worked = 0;
    KNEADERS.set(s.el, (count, done) => {
      const pack = byId(s.host.root, "pack");
      if (!pack || !s.motions || pack.children.length < 2) return;
      worked = count;
      // A REORDER PER QUANTUM, and the seed comes off the counter so every quantum is a different
      // one. The truth is the reorder (`container.no-state-diffs`); the recipe is only the picture
      // of the pack between the old order and the new, and it never sees the rng.
      const order = permutation(pack.children.length, seededRng(count * 7919 + a.count));
      s.motions.shuffle(
        "pack",
        () => void reorder(pack, order),
        { recipe: a.recipe, shuffleMs: done ? a.shuffleMs * 2 : a.shuffleMs },
      );
    });
    rewire(s.el, () =>
      wireKnead({
        host: s.host,
        want: (n: Node) => n.id === "pack" || n.parent?.id === "pack",
        quantum: a.quantum,
        view: eyeOf(s),
        poses: () => s.motions?.poses(),
        onKnead: (k) => KNEADERS.get(s.el)?.(k.count, k.done),
      }),
    );
    void worked;
    return s.el;
  },
};

interface ShakeArgs {
  gain: number;
  spinGain: number;
  friction: number;
  kind: string;
}

const SHAKE_STATE = new Map<string, Node>();
const SHAKING = new WeakMap<HTMLElement, ReturnType<typeof wireShake>>();

function dieTree(a: ShakeArgs): Node {
  registerLayout("gesture.shake.free", freeLayout);
  registerSurface("gesture.shake.felt", { layers: [{ paint: "text", opacity: 0.1 }], radius: 0.2 });
  const desk = node("desk", Container({ layout: "gesture.shake.free" }));
  add(desk, node("felt", Bounded({ bounds: roundedRect(5.4, 3.4, 0.2) }), Surfaced({ surface: "gesture.shake.felt" })));
  // A REAL DIE from the add-on: its own silhouette, its own pips, its own `Rollable` truth. The
  // face this page shows is the set's picture for it (`showFace`), so the die never says one thing
  // and shows another — which a square with a number painted on it could not promise.
  const d = die("die", { kind: a.kind as DieKind, face: 1, at: { x: 0, y: 0 } });
  compose(d, Draggable({ onReject: "stay" }));
  add(desk, d);
  return desk;
}

/**
 * SHAKE THE DIE AND LET GO. HOW HARD YOU RATTLED IT IS HOW HARD IT LANDS.
 *
 * Take the die, shake it about, and open your hand. It is thrown WHERE the finger was going and as
 * hard as the hand had been WORKING — and those are two different numbers, out of two different
 * gestures, which is the whole subject of the page.
 *
 * THE PARTING SPEED IS THE WRONG NUMBER FOR STRENGTH. A carry knows how fast the finger was moving
 * at the instant it let go (`velocity()`), and a hand that rattled a die for a second and then
 * stopped dead before opening has a parting speed of near zero — and every right to expect a hard
 * throw. What the hand DID is a fact about a stretch of time, not about an instant, so it is
 * measured over the stretch: the path walked, the reversals counted, the width covered.
 *
 * SO THE SHAKE IS A READING AND NOT AN EVENT. There is no `onShake`, because a shake has no moment
 * at which it happens — a callback would have to invent one, and every consumer would then race
 * that invention against its own release. It is asked for instead, at the moment the hand opens,
 * and it survives the finger leaving precisely so that asking then is safe.
 *
 * THE TWO NUMBERS DIVIDE CLEANLY, and you can feel the seam: rattle hard and flick gently, and the
 * die goes a long way in the direction you barely nudged. Rattle gently and flick hard, and it
 * barely moves however sharply you let go. Direction is the parting instant's business; strength is
 * the whole gesture's. `turns` — how many times the hand came back on itself — is what separates a
 * shake from a throw at all, and it is what the tumble is counted off.
 */
export const Shake: StoryObj<ShakeArgs> = {
  args: { gain: 0.5, spinGain: 30, friction: 5, kind: "d6" },
  argTypes: {
    gain: documented("arg.gain", { control: { type: "number", min: 0, step: 0.1 } }, "throw"),
    spinGain: documented("arg.spinGain", { control: { type: "number", min: 0, step: 10 } }, "throw"),
    friction: documented("arg.friction", { control: { type: "number", min: 0.1, step: 0.5 } }, "throw"),
    kind: documented("arg.kind", { control: "select", options: DIE_KINDS }, "die"),
  },
  parameters: { gkDocStory: "gestures.shake" },
  render: (a) => {
    const key = `gestures.shake.${a.kind}`;
    const root = SHAKE_STATE.get(key) ?? dieTree(a);
    SHAKE_STATE.set(key, root);
    const s = scene(root, { animate: true, motion: { friction: a.friction }, camera: eye(draggableNode, 3.2) });
    // The shake is a READING and not a callback, so it is kept rather than re-attached: a second
    // one over the top of the first would measure the same hand twice and answer with whichever
    // the release handler happened to hold.
    const shaking = SHAKING.get(s.el) ?? wireShake({ host: s.host, want: (n: Node) => n.id === "die", view: eyeOf(s), poses: () => s.motions?.poses() });
    SHAKING.set(s.el, shaking);
    wireDrag(s, {
      toFront: true,
      view: eyeOf(s),
      onRelease: (velocity) => {
        const shake = shaking.reading();
        if (!shake || !s.motions) return false;
        // STRENGTH FROM THE WHOLE GESTURE, DIRECTION FROM THE INSTANT — and the fallback when the
        // hand let go dead still is the shake's own AXIS, which is the only direction a gesture
        // that ended motionless ever named.
        const speed = shake.speed * a.gain;
        if (speed < 0.2) return false; // a die set down is a die set down
        const moving = velocity && Math.hypot(velocity.x, velocity.y) > 0.3;
        const angle = moving
          ? (Math.atan2(velocity!.y, velocity!.x) * 180) / Math.PI
          : shake.axis + (shake.at.x > 0 ? 0 : 180);
        const sides = dieSpec(a.kind as DieKind).sides;
        s.motions.slide("die", {
          speed,
          angle,
          // A HARD SHAKE TUMBLES MORE. `turns` is the reversals the hand made, and counting the
          // faces off them is what makes "I rattled it properly" visible in the result.
          spin: (shake.turns + 1) * a.spinGain,
          hop: Math.min(shake.span, 3),
          friction: a.friction,
          // EVERY TIME IT GOES OVER, a face — and the last of those is the result. `flashFace` is
          // the PICTURE alone while it is still travelling; `showFace` writes the truth as well,
          // once, when the body rests. A die that held its old number until it stopped and then
          // blinked to the new one would be a slot machine, not a die.
          onTumble: (count, last) => {
            const d = byId(s.host.root, "die");
            if (!d) return;
            const face = ((count - 1) % sides) + 1;
            if (last) showFace(d, face);
            else flashFace(d, face);
          },
          onDone: (rest) => {
            const d = byId(s.host.root, "die");
            if (d) compose(d, Transformable({ at: rest.at, angle: rest.angle }));
            s.setRoot(s.host.root);
          },
        });
        return true; // the throw took the die; the ordinary drop must not also put it down
      },
    });
    return s.el;
  },
};
