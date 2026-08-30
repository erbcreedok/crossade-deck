import type { Meta, StoryObj } from "@storybook/html";
import {
  acrossOf,
  add,
  caps,
  Bounded,
  circle,
  Container,
  CONTROL_LABEL,
  draggable,
  Draggable,
  Flippable,
  freeLayout,
  Labeled,
  note,
  node,
  rect,
  roundedRect,
  Rotatable,
  IDENTITY,
  decayGlide,
  glassPerUnit,
  glideLaw,
  LAYER_HEIGHT,
  RISE,
  installStockFlips,
  installStockGlides,
  installStockShuffles,
  permutation,
  remove,
  reorder,
  seededRng,
  setFacing,
  shuffleNames,
  wireKnead,
  wirePan,
  wireTap,
  wireShake,
  byId,
  compose,
  fieldsOf,
  liftToFit,
  trace,
  registerGlide,
  registerLayout,
  registerSurface,
  ShadowCaster,
  Surfaced,
  Transformable,
  type LayoutRecord,
  type Motions,
  type Node,
  type Pan,
  type Vec,
} from "../../src/index.js";
import { BACK_SURFACE, cards, crossade, deckByCardId, faceSurface, installClassicSkin } from "@game-presets/cards";
import { DIE_KINDS, die, dieSpec, flashFace, showFace, type DieKind } from "@game-presets/dice";
import { CHIP_SURFACE, ROOK_SHAPE, ROOK_SURFACE, installGesturePieces } from "./gestureAssets.js";
import { scene, type CameraScene, type Scene } from "../devtools/scene.js";
installStockGlides();
/**
 * THE AIR UNDER A CARD, as its own law beside the platform's two.
 *
 * `normal` and `fast` are scrolling rates — they are about a finger flicking a list, and neither is
 * about a piece of cardboard falling. A card is nearly all surface: it reaches a terminal speed of
 * a couple of units a second and comes down at it, which is about a second from the height a hand
 * holds a pack at. That is the number, and it is registered rather than written into the page so a
 * reader can swap it for the platform's own and feel the difference.
 */
registerGlide("card", decayGlide(0.9975));
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
  /** Across the felt and stopping where the run-out law leaves it — the shadow rides under it the whole way. */
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
// ever had a word for: a hand rests on the pack, and a finger of the other hand leads a card off it
// toward somebody. It is not a drag of the top card in the ordinary sense — the card is never
// carried to a place and dropped — and it is not a drag of the pack, which is what the resting hand
// may be doing at the very same moment.
//
// So the arbitration cannot be a mode, a modifier or a long press. It is READ OFF THE TWO HANDS:
//   • one finger alone on the pack MOVES THE PACK (`wireDrag`, exactly as the sandbox does);
//   • a SECOND finger that starts moving while the first is resting DEALS (`wirePan`, and the
//     resting hand is `Pan.anchor`).
// And the two do not have to be told apart, because they are not rivals: `together` — UIKit's
// `shouldRecognizeSimultaneouslyWith` — says yes, once, in one place. The resting hand may wander;
// dragging the pack and dealing off it are two hands doing two things.
//
// THE DEAL IS CONTINUOUS. `began` takes the top card off the pack, every `changed` moves it by
// exactly what that finger moved, and `ended` throws it on with the finger's own velocity. A
// verdict delivered on release could not say any of that: by the time it exists the gesture is
// over, and everything the player did during it was answered by nothing.
//
// WHAT THE TWO PAGES BELOW DIFFER IN is what happens after the card leaves, and it is worth having
// both because they are the two halves of one decision. `Deal` looks for somebody to land on, and
// a card that finds nobody must COME BACK — a card that stopped in the middle of the felt because
// the dealer aimed badly is a mess the game then has to explain. `Fling` looks for nobody at all,
// and so a card lands where it stops and that is the whole of it. A game that wants one and got
// the other is telling its players something about the table that is not true.

/**
 * A SEAT IS A PLACE, AND A CARD IS A THING PUT IN IT, so the place has to be the bigger of the two
 * — otherwise a hand reads as a card lying next to a dot rather than a card given to somebody. The
 * card is unchanged; what grew is the player.
 */
const SEAT_R = 0.62;
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
/**
 * THE CARD ON THIS TABLE, root units. A tenth bigger than the deck the kit ships, because the rim
 * here is big enough to make a deal readable and the card was reading as a chip on it.
 */
const CARD = { w: 0.616, h: 0.88 };

/**
 * HOW HARD THE PANEL'S OWN DEAL THROWS, root units/s.
 *
 * A number and not a knob, because it is standing in for a HAND: the panel exists so a reader with
 * one mouse can see the page work, and what it has to imitate is an ordinary flick. Six units a
 * second is one — the same order the recogniser reports off a real finger, so `reach` and `catch`
 * mean the same thing whether the deal came from the panel or from a hand.
 */
const PANEL_SPEED = 6;
/**
 * The panel is not a finger, so its deals are booked under an id no pointer can have — and not
 * under the kit's own `ONE_HAND` either, which the pack's drag is already using.
 */
const PANEL_HAND = -2;
/** And it throws with a small twist, so the panel shows the arc a hand puts on a card. */
const PANEL_CURL = 200;

/**
 * THE DESK'S OWN EDGE, root units — half the rect and then the whole box a card may be in.
 *
 * THE SAME RECT THE CAMERA IS BOUNDED BY, because "off the table" has to mean one thing. A card
 * thrown hard used to run out wherever the law left it, which on a flick of twenty units a second
 * is ten units — four times the table — and the card was gone somewhere nobody could pan to. A
 * border the eye can reach is the only one worth having.
 *
 * INSET BY THE CARD'S OWN HALF, so what stops at the wall is the card and not its centre.
 */
const DESK_HALF = { w: TABLE_R + SEAT_R * 2, h: TABLE_R + SEAT_R * 3.2 };
const DESK_WALLS = {
  x0: -DESK_HALF.w + CARD.w / 2,
  x1: DESK_HALF.w - CARD.w / 2,
  y0: -DESK_HALF.h + CARD.h / 2,
  y1: DESK_HALF.h - CARD.h / 2,
};

/**
 * HOW CLOSE TO ITS SLOT A CARD IS CAUGHT, root units.
 *
 * Half a card. Nearer than that and a hard throw is through it between two frames; further and the
 * card is taken while it still visibly has somewhere to go, which reads as the table snatching.
 */
const CAUGHT = CARD.w / 2;

/**
 * A PACK, AND IT HAS TO LOOK LIKE ONE. Everyone at the origin is what a closed pack IS to a layout,
 * and it is also indistinguishable from a single card — which is a lie about the one thing the page
 * needs the reader to believe, that there is a stack there to deal off.
 *
 * So each card stands a hair up and left of the one under it. It is a real pack's edge, and it is
 * the whole of what makes a pack legible from above: the thickness, not the top card.
 *
 * CAPPED, because a fifty-five card pack staggered all the way would be a staircase across the
 * felt. Past the cap the cards pile exactly, as they really do — the eye has already been told how
 * deep the pack is by the first few edges.
 */
const PACK_STEP = 0.012;
const PACK_EDGES = 9;
const stackLayout: LayoutRecord = {
  place: (children) =>
    children.map((_, i) => {
      const deep = Math.min(children.length - 1 - i, PACK_EDGES);
      return { x: -deep * PACK_STEP, y: -deep * PACK_STEP };
    }),
};

/**
 * A HAND, FANNED — an arc of seats, each a little further round than the last.
 *
 * A layout writes only `at` (`guard.layout-writes-only-at`), so the spread is here and the TURN of
 * each card is on the card itself. That split is not a workaround: where a card sits is the hand's
 * business and which way it faces is the card's, and a layout that wrote both would take the angle
 * away from a game that wanted to say something with it.
 */
/**
 * WHERE THE `i`-th OF `n` CARDS SITS IN A HAND, relative to the seat — written once and read twice:
 * by the layout that places them, and by the DEAL that has to know where a card is going before it
 * throws it. Two copies of this would drift, and the drift would be visible as a card landing a
 * hair off and then being tugged into line.
 */
const fanAt = (i: number, n: number): { x: number; y: number } => {
  const step = n > 1 ? i - (n - 1) / 2 : 0;
  return { x: step * 0.26, y: Math.abs(step) * 0.05 };
};

const fanLayout: LayoutRecord = {
  place: (children) => children.map((_, i) => fanAt(i, children.length)),
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
  catch: number;
  reach: number;
  gain: number;
  twist: number;
  air: string;
  magnus: number;
  magnet: number;
  pullMs: number;
  pullStrength: number;
  glide: string;
  fingers: number;
  liftMax: number;
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
const DEALERS = new WeakMap<HTMLElement, Dealing>();

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

/** The same bookkeeping for the tap, kept apart so one re-render swaps each wiring exactly once. */
const TAPS = new WeakMap<HTMLElement, () => void>();
function rewireTap(el: HTMLElement, attach: () => () => void): void {
  TAPS.get(el)?.();
  TAPS.set(el, attach());
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
      Labeled({ label: "one finger holds the pack, another pulls a card off — bring it back to put it back", style: CONTROL_LABEL }),
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
function say(s: Scene, text: string, why: Readonly<Record<string, unknown>> = {}): void {
  // AND INTO THE DASHCAM, with the numbers the sentence was rounded off from. The line on the glass
  // is for the person playing; the trace is for whoever has to work out afterwards WHY the page
  // decided that, and a rounded sentence is not enough to work anything out from.
  note("deal", { said: text, ...why });
  const line = byId(s.host.root, "said");
  if (!line) return;
  compose(line, Labeled({ label: text, style: CONTROL_LABEL }));
  s.setRoot(s.host.root);
}

/**
 * EVERY LOOSE CARD THE PACK IS STANDING ON GOES INTO IT — at the BOTTOM, and squared up.
 *
 * At the bottom because that is where a card a pack was set down on ends up: the pack did not go
 * under it. The deal takes from the END of the children, so the bottom is the front, and a card
 * absorbed this way is the last one that will be dealt rather than the next.
 *
 * SQUARED UP, and eased there rather than snapped: a card that has been lying crooked on the felt
 * straightens as the pack settles onto it. Writing the angle is the whole of it — the settle does
 * the rest, and does it as a TURN now (`motion.a-settle-TURNS-and-never-collapses`).
 */
function underPack(deck: Node): void {
  const desk = deck.parent;
  if (!desk) return;
  const home = worldAt(deck);
  const loose = desk.children.filter(
    (n) =>
      n.id !== deck.id &&
      caps(n).has("Flippable") &&
      Math.abs(worldAt(n).x - home.x) <= CARD.w &&
      Math.abs(worldAt(n).y - home.y) <= CARD.h,
  );
  for (const card of loose) {
    remove(desk, card);
    // FIRST, so it lies at the bottom of what is already there.
    deck.children.unshift(card);
    card.parent = deck;
    const own = fieldsOf<{ at: Vec }>(card, "Transformable");
    compose(card, Transformable({ ...(own ?? {}), at: { x: 0, y: 0 }, angle: 0, z: 0, scale: 1 }));
    compose(card, Draggable({ onReject: "home" }));
    setFacing(card, "down");
  }
}

/**
 * IS THIS A PACK — asked of WHAT IT IS, never of what it is called.
 *
 * This desk began with exactly one pack and a node id to match, and every rule about dealing was
 * written against that id. Then two loose cards had to be able to become a pack, and a rule written
 * on a name cannot say that: the new pile would have been a pack that nothing recognised. A pack is
 * a container that STACKS its cards — that is the whole of it, and it is true of the first one and
 * of every one a player builds.
 */
const isPack = (n: Node): boolean =>
  fieldsOf<{ layout?: string }>(n, "Container")?.layout === "gesture.table.stack";

/** The pack this node is in, itself included — `undefined` for a card lying loose. */
function packOf(n: Node): Node | undefined {
  for (let up: Node | undefined = n; up; up = up.parent ?? undefined) if (isPack(up)) return up;
  return undefined;
}

/**
 * IS THIS A CARD LYING ABOUT, rather than a pack or one of a pack's own?
 *
 * A pack's cards ARE the pack — a finger on them means the pack, which is what the drag already
 * says (`may`). Everything else a hand can point at is a card somebody put somewhere, and pointing
 * at it means it.
 */
function looseCard(root: Node, on: Node): boolean {
  if (packOf(on)) return false;
  return byId(root, on.id) !== undefined && caps(on).has("Flippable");
}

/** A pack's top card — the one a deal takes, and `undefined` on an empty pack. */
const topOf = (pack: Node | undefined): Node | undefined => pack?.children[pack.children.length - 1];

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
 * WHOSE SEAT A CARD GOING THIS WAY WOULD COME TO REST IN — or nobody.
 *
 * WHERE IT STOPS, NOT WHAT IT FLIES OVER, and that is a correction. It used to be the seat whose
 * circle the run PASSED THROUGH first, which reads well and is wrong at a table: a player leaning
 * out past their own place to throw across the felt has their own seat between their hand and
 * everybody else's, so every throw they made was caught by themselves. The strength said otherwise
 * the whole time — a card going that fast was never being put into the near hand — and the throw
 * knew it: `project` is the very number the desk decelerates by, so where the card stops is a fact
 * available before it is let go.
 *
 * So: the seat the run ENDS in, and the nearest one when a rest point sits between two. Aim and
 * strength are one question rather than two gates — a flick pointed between two players stops
 * between them, and a
 * lazy flick stops before it reaches any of them. Both refusals are geometry, and the player can
 * still tell them apart on the glass, because one card dies short and the other dies wide.
 *
 * `reach` is the table's HELP, and it is the only thumb on the scale: at `1` the dealer must
 * genuinely have thrown hard enough, and below it the table lends the throw what it lacks. `catch`
 * is the same lever for aim — how many seat-widths wide the catching circle is.
 */
function seatFor(root: Node, a: TableArgs, from: Vec, velocity: Vec): Node | undefined {
  const glide = glideLaw(a.glide);
  const help = 1 / Math.max(a.reach, 0.01);
  const thrown = { x: velocity.x * help, y: velocity.y * help };
  const speed = Math.hypot(thrown.x, thrown.y);
  const run = glide.project(speed);
  if (!(speed > 0) || !Number.isFinite(run)) return undefined;
  // WHERE THE THROW WOULD STOP — and it is the whole question.
  const rest = { x: from.x + (thrown.x / speed) * run, y: from.y + (thrown.y / speed) * run };
  const reach = SEAT_R * Math.max(a.catch, 0.1);
  let best: { seat: Node; gap: number } | undefined;
  for (let i = 0; i < a.seats; i++) {
    const seat = byId(root, `seat${i}`);
    if (!seat) continue;
    const at = worldAt(seat);
    const gap = Math.hypot(at.x - rest.x, at.y - rest.y);
    if (gap > reach) continue;
    if (!best || gap < best.gap) best = { seat, gap };
  }
  return best?.seat;
}

/**
 * WHOSE SEAT A CARD HAS COME TO REST IN — asked of where it ACTUALLY lies, after the flight.
 *
 * The companion of `seatFor`, and the two are deliberately different questions. `seatFor` is asked
 * BEFORE the throw and answers "who is this one leaning toward"; this one is asked after and
 * answers "who got it". They can disagree — a card leaned toward a player and fell short of them
 * belongs to nobody — and that disagreement is a card thrown badly, which is a thing that should be
 * able to happen at a table.
 */
function seatUnder(root: Node, a: TableArgs, at: Vec): Node | undefined {
  const reach = SEAT_R * Math.max(a.catch, 0.1);
  for (let i = 0; i < a.seats; i++) {
    const seat = byId(root, `seat${i}`);
    if (!seat) continue;
    const home = worldAt(seat);
    if (Math.hypot(at.x - home.x, at.y - home.y) <= reach) return seat;
  }
  return undefined;
}

/**
 * IS THE HOLDING HAND ON THE PACK — asked of the PLACE and not of the tree.
 *
 * The obvious test is whether the node that hand landed on is the deck or one of its cards, and it
 * is wrong after the very first deal: the finger lands on the top CARD, that card is dealt away,
 * and the node it is still holding a reference to now belongs to the desk. The hand did not move
 * and the answer flips. Where the hand IS does not have that problem — and it is also the honest
 * statement, because "on the pack" was always about a place.
 *
 * Measured against the pack as DRAWN, so a raised pack is the bigger target it looks like.
 */
/**
 * WHERE THE PACK IS, AND HOW BIG IT IS BEING DRAWN — asked in the ONE place, and it is the drawn
 * pose rather than the tree's.
 *
 * A held pack is posed by an OVERRIDE: a carry never writes the tree, it lays the run out at the
 * finger every frame. So `worldAt` answers with the seat the pack was lifted FROM, and it goes on
 * answering that for as long as the hand holds it — which is exactly the whole of a deal. Read that
 * way, cards leave the place the deck last lay instead of the hand that is holding it.
 *
 * One function because it is one fact. Two readers who each work it out separately agree until the
 * day one of them is fixed, and then the page is wrong in a way nothing points at.
 */
/**
 * WHERE A NODE IS DRAWN — the pose on the glass, falling back to the tree when nothing is posing it.
 *
 * The rule the pack taught, applied to everything a hand can hold. A carry never writes the tree:
 * it lays the run out at the finger every frame, so the tree goes on naming the seat the piece was
 * lifted FROM for the whole gesture. Ask the tree where a carried card is and the answer is where
 * it was when the fingers closed — which is exactly the bug that sent cards flying out of the place
 * the deck last lay.
 */
function drawnAt(s: Scene, id: string): Vec {
  const drawn = s.motions?.poses()?.get(id);
  return drawn ? { x: drawn.e, y: drawn.f } : worldAt(byId(s.host.root, id));
}

function packAt(s: Scene, pack: Node | undefined): { at: Vec; grew: number } {
  const drawn = pack && s.motions?.poses()?.get(pack.id);
  if (drawn) return { at: { x: drawn.e, y: drawn.f }, grew: Math.hypot(drawn.a, drawn.b) };
  return { at: worldAt(pack), grew: 1 };
}

/** Is this point on that pack, as the pack is DRAWN — so a raised one is the bigger target it looks like. */
function onPack(s: Scene, pack: Node, at: Vec): boolean {
  const spot = packAt(s, pack);
  return (
    Math.abs(at.x - spot.at.x) <= (CARD.w / 2) * spot.grew && Math.abs(at.y - spot.at.y) <= (CARD.h / 2) * spot.grew
  );
}

/**
 * WHICH PACK THIS POINT IS ON — asked of the PLACE and not of the tree, and there may be several.
 *
 * Several because a player can build one: two loose cards merged are a pack like any other, and the
 * desk has to answer "is the holding hand on a pack" without knowing which one it will be. The
 * TOPMOST is the answer when two overlap, and topmost here is last drawn, which is last in the desk.
 */
/**
 * WHICH LOOSE CARD THIS POINT IS ON — the pack's twin, and the other half of "what is that hand on".
 *
 * Topmost first, and a card in a pack is not one of these: a finger on a pack means the pack, which
 * is the same answer the drag gives.
 */
function cardUnder(s: Scene, at: Vec): Node | undefined {
  const desk = s.host.root;
  for (let i = desk.children.length - 1; i >= 0; i--) {
    const n = desk.children[i]!;
    if (isPack(n) || !caps(n).has("Flippable")) continue;
    const spot = packAt(s, n);
    if (
      Math.abs(at.x - spot.at.x) <= (CARD.w / 2) * spot.grew &&
      Math.abs(at.y - spot.at.y) <= (CARD.h / 2) * spot.grew
    )
      return n;
  }
  return undefined;
}

function packUnder(s: Scene, at: Vec): Node | undefined {
  const desk = s.host.root;
  for (let i = desk.children.length - 1; i >= 0; i--) {
    const n = desk.children[i]!;
    if (isPack(n) && onPack(s, n, at)) return n;
  }
  return undefined;
}

/**
 * A DEAL, AND IT IS AN ORDINARY DRAG WITH AN ORDINARY DROP.
 *
 * One finger holds the pack. The second one pulls the top card off it and CARRIES it: the card
 * comes to that finger and stays under it for as long as it is down, which is what a drag is
 * everywhere else on this desk and everywhere else on a screen. Nothing here is a mode and nothing
 * is held down — the pack was named by the hand already on it.
 *
 *   begin  — the second finger has started moving. The top card is off the pack and UNDER that
 *            finger, at the pack's own size and the pack's own height.
 *   move   — the card is where that finger is. Not offset from it and not led by it: under it.
 *   let go — the card FALLS, from the height the hand was holding it at, carrying the finger's own
 *            velocity. The air holds it up, its twist curves it, a seat leans on it, and where the
 *            run leaves it is where it lies. Nothing flies it anywhere and nothing takes it back.
 *
 * AND THE PACK IS SOMEWHERE TO PUT ONE BACK. A card let go over the pack with nowhere left to go
 * returns to the pack — the same answer the deck already gives a card DRAGGED onto it, given now
 * to a hand that simply opened. It replaced a card that flew home by itself, which was the wrong
 * shape twice over: it was a journey the player never asked for, and it made "I have changed my
 * mind" indistinguishable from "I threw it badly".
 *
 * WHY THE HEIGHT IS A `z` WHILE THE FINGER HAS IT AND AN `up` ONCE IT FALLS. They are the same
 * height said by the two owners of it: the tree says how high a standing thing is (`z`, thick by
 * `LAYER_HEIGHT`), and the clock says how high a falling body is. Both are drawn through `RISE`, so
 * the card does not change size at the hand-off — which is exactly what went wrong when the two
 * numbers were guessed separately.
 */
interface Dealing {
  /**
   * The second finger has started moving, here: the top card comes off the pack, under that finger,
   * and that finger owns it. `false` when nothing came off — an empty pack, or a card already on
   * its way.
   */
  begin(hand: number, at: Vec, on: Node | undefined, pack: Node | undefined): boolean;
  /** That finger is here now, so the card is here now. */
  move(hand: number, at: Vec): void;
  /**
   * THE PACK MOVED — the other hand dragged it. Asked so the magnet can be judged from the pack's
   * side too: carrying the card to the pack and dragging the pack up to the card are the same fact
   * about the table, and a rule written on the dealing finger alone would answer only one of them.
   */
  stir(): void;
  /**
   * SEND A CARD TO THE PACK without ever picking it up — a tap while the other hand holds the deck.
   *
   * `top` is the ordinary put-back; `anywhere` is the double tap, "lose it in there". Both FLY: a
   * card that arrives by jumping has not been put anywhere, it has been replaced.
   */
  send(card: Node, pack: Node, where: "top" | "anywhere"): void;
  /**
   * MERGE TWO LOOSE CARDS INTO A PACK — the held one and the tapped one.
   *
   * The result is a pack like any other, and that is the point: every rule on this desk asks what a
   * thing IS rather than what it is called, so a pile a player built deals, drags and receives
   * exactly as the one the page shipped with. `undefined` when either card is already in a pack.
   */
  merge(holder: Node, card: Node): Node | undefined;
  /**
   * That finger has gone, at this velocity and with this twist of the wrist: the card falls on from
   * where it was, and the table leans on it or does not.
   *
   * IT SAYS WHICH OF THE TWO ENDINGS IT WAS, because the page has to be able to tell the player —
   * and because a desk that answers "put it back" and "throw it" the same way is a desk nobody can
   * report a bug against. `undefined` when this finger was not the one dealing.
   */
  end(hand: number, velocity: Vec, curl: number): "pack" | "thrown" | undefined;
}

/**
 * WHICH CARD IS BETWEEN THE PACK AND ITS SEAT, and WHOSE FINGER is taking it there.
 *
 * The finger is half of it because this desk has more than two of them in play: a third finger
 * arriving while a deal is under way would otherwise end that deal when IT let go, throwing a card
 * the hand that was dealing had not finished leading.
 */
const DEALT = new WeakMap<
  HTMLElement,
  {
    readonly card: string;
    readonly hand: number;
    /**
     * Where the card is RIGHT NOW.
     *
     *   `leaving` — sliding out of the pack, on its way to the fingers. Not in the hand yet, and
     *               nothing may be thrown from it: the player has not got it.
     *   `hand`    — under that finger, on that hand's carry.
     *   `pack`    — the magnet took it back, with the finger still down.
     */
    readonly at: "leaving" | "hand" | "pack";
    /** Where that finger last was, root units — the magnet measures its gap to the pack from here. */
    readonly finger: Vec;
    /**
     * WHICH PACK this card came off, by id.
     *
     * By id and not by node, and named at all because there may be more than one: a player can
     * build a pack out of two loose cards, and a card pulled off THAT one goes back to THAT one.
     * A deal that assumed the pack was the pack would put it back on somebody else's.
     */
    readonly pack: string;
  }
>();

/**
 * HOW MUCH FURTHER THAN THE CATCH THE FINGER MUST GO to pull the card back out — the hysteresis.
 *
 * A single threshold chatters: the card lands in the pack, the pack is under the finger, the finger
 * is sitting exactly on the line, and the card flies in and out every frame. A third further out is
 * the whole of what makes it read as a decision.
 */
const MAGNET_LET_GO = 1.35;

/** How near the fingers a card sliding out of the pack counts as having reached them, in card widths. */
const ARRIVED = 0.35;

/**
 * WHERE A CARD LOST IN THE PACK ENDS UP — the one place chance enters this page, and it is SEEDED.
 *
 * Seeded because a page nobody can re-run is a page nobody can report a bug against: "the card went
 * somewhere random" has to mean the same somewhere twice. The seed walks with each use, so two
 * cards lost in a row do not land on top of each other.
 */
let lost = 0;
/** Packs a player has built, counted so each gets an id of its own — two things answering to one name is a lost identity. */
let piles = 0;
const dice = (): number => seededRng(++lost * 7919)();

/**
 * HOW MUCH THE PACK IS RAISED RIGHT NOW — the scale it is being DRAWN at, and nothing else.
 *
 * It used to be the lift the pack WOULD be given if a hand took it (`liftToFit`, the very call the
 * drag makes), and that is a different number from the one on the glass whenever no hand has it: a
 * card came off a pack lying flat on the felt at two and a bit times the size of the pack it had
 * just left. The pack's drawn pose already knows, and it is right in both states.
 */
const packLift = (s: Scene, pack: Node | undefined): number => packAt(s, pack).grew;

/** How high a pack is being held, in the TREE's own units of height — see `Dealing`. */
function packZ(s: Scene, pack: Node | undefined): number {
  return (packLift(s, pack) - 1) / (RISE * LAYER_HEIGHT);
}

function dealer(s: Scene, a: TableArgs, snap: boolean): Dealing {
  /** The pack this deal came off — there may be several on the desk, and it goes back to its own. */
  const mine = (): Node | undefined => byId(s.host.root, DEALT.get(s.el)?.pack ?? "");

  const held = (hand?: number): Node | undefined => {
    const it = DEALT.get(s.el);
    if (!it || (hand !== undefined && it.hand !== hand)) return undefined;
    return byId(s.host.root, it.card);
  };

  /**
   * HAS THE CARD REACHED THE FINGERS — within a third of its own width of them.
   *
   * The spring is asymptotic, so "has it arrived" can never be "is it exactly there", and it must
   * not be "has it stopped" either: the finger is what it is chasing, and a finger that is still
   * moving never lets it stop. Near enough that the player would say they are holding it.
   */
  const arrived = (id: string, at: Vec): boolean => {
    const now = drawnAt(s, id);
    return Math.hypot(now.x - at.x, now.y - at.y) <= CARD.w * packLift(s, mine()) * ARRIVED;
  };

  /**
   * BACK INTO THE PACK — face down, at the pack's own seat, and in the hand that is holding it.
   *
   * `where` is which card it becomes: the TOP (the next one dealt), the BOTTOM, or somewhere in
   * the middle. A tap means the top; a double tap means "lose it in there", which is a thing a
   * player does with a card they do not want to see again soon.
   */
  const intoPack = (card: Node, deck: Node | undefined, where: "top" | "anywhere" = "top"): void => {
    if (!deck) return;
    if (card.parent) remove(card.parent, card);
    add(deck, card);
    if (where === "anywhere" && deck.children.length > 1) {
      // The kit's own reorder, so the pack's order is a PERMUTATION and never a silent loss — and
      // so the settle eases every card it displaces instead of the picture jumping.
      const n = deck.children.length;
      const to = Math.floor(dice() * (n - 1));
      const order = [...Array(n - 1).keys()];
      order.splice(to, 0, n - 1);
      reorder(deck, order);
    }
    compose(card, Transformable({ at: { x: 0, y: 0 }, angle: 0, z: 0, scale: 1 }));
    compose(card, Draggable({ onReject: "home" })); // back in the pack, it belongs to the pack again
    setFacing(card, "down");
    s.setRoot(s.host.root);
    // AND IT JOINS THE HAND THAT IS STILL HOLDING THE PACK. A carry poses the nodes it was GIVEN:
    // a card that rejoins the deck afterwards is laid out at whatever the TREE says, and a held
    // pack's tree still names the seat it was lifted from. Without this the card drops into the
    // pack and then jumps across the desk on the very next frame.
    s.motions?.grabAlso([{ id: card.id, offset: { x: 0, y: 0 } }]);
  };

  /**
   * WHERE THE RUN-OUT LAW WOULD LEAVE A CARD THROWN FROM HERE — `project`, the very number the desk
   * decelerates by, and the same one the seats are found through. Asked before anything is thrown,
   * because "has this card anywhere to go" is a question about the throw, not about the flight.
   */
  const restOf = (from: Vec, push: Vec): Vec => {
    const speed = Math.hypot(push.x, push.y);
    const run = glideLaw(a.glide).project(speed);
    if (!(speed > 0) || !Number.isFinite(run)) return from;
    return { x: from.x + (push.x / speed) * run, y: from.y + (push.y / speed) * run };
  };

  const begin = (hand: number, at: Vec, on: Node | undefined, deck: Node | undefined): boolean => {
    if (DEALT.get(s.el)) return false; // one card at a time; a finger already dealing is still dealing
    const root = s.host.root;
    // WHAT THE FINGER CAME DOWN ON WINS. A card already lying on the felt is a card the player is
    // pointing AT — to throw again, or to bring back to the pack — and answering a tap on it by
    // dealing a different card off the deck is the desk contradicting the finger. Only when the
    // finger is on nothing of its own (or on a pack, whose cards are the pack) does the top card
    // come off — and off THAT pack, the one the other hand is holding.
    const loose = on && looseCard(root, on) ? on : undefined;
    const card = loose ?? topOf(deck);
    if (!card || !s.motions) return false;
    // OFF THE PACK AND ONTO THE DESK, standing exactly where the pack stands. It has to LEAVE its
    // owner first — the kit refuses a node that already has one, loudly, and that refusal is the
    // reason a card cannot quietly end up in two places.
    if (card.parent) remove(card.parent, card);
    add(root, card);
    // AND IT LEAVES THE HAND. The pack is still held, and this card was part of the run the holding
    // finger took: left in it, the carry goes on laying it out at the anchor while the deal thinks
    // it owns the card.
    s.motions.release(card.id);
    // OFF THE PACK IS ON ITS OWN: it is nobody's child now, so a refused drop must leave it where
    // the hand let go rather than fly it back to a seat it no longer has.
    compose(card, Draggable({ onReject: "stay" }));
    // WHERE IT STANDS RIGHT NOW, in the tree as well — a carry is an override and the tree is what
    // a refused drop, a reconcile or a settle falls back to. A card off the pack starts AT the
    // pack; a card already lying on the felt starts where it lies, and is not moved by being
    // picked up.
    const from = loose ? drawnAt(s, card.id) : packAt(s, deck).at;
    compose(card, Transformable({ at: from, z: 0, scale: 1 }));
    s.setRoot(root);
    if (loose) {
      // ALREADY UNDER THE FINGER. Nothing to slide out of anywhere: the player put their finger on
      // this card, so the hand simply has it. It still belongs to the pack the OTHER hand is on —
      // that is the pack the magnet will offer it back to.
      DEALT.set(s.el, { card: card.id, hand, at: "hand", finger: at, pack: deck?.id ?? "" });
      take(card, hand, at, deck);
      return true;
    }
    // IT SLIDES OUT OF THE PACK, and it is not in the hand until it gets there.
    //
    // A carry cannot do this and must not be made to: a held thing rides the finger ONE TO ONE, no
    // lag, which is the law that makes a drag feel like holding something. Opened at the fingertip
    // it puts the card there on that very frame — a card out of thin air, half the desk from the
    // deck it is supposed to have come off.
    //
    // So the card FLIES the way any card flies, aimed at the fingers; the flight is re-aimed as
    // they move (`aim`), because a hand does not wait for a card; and the hand takes it on arrival.
    DEALT.set(s.el, { card: card.id, hand, at: "leaving", finger: at, pack: deck!.id });
    s.motions.snap(card.id, {
      to: at,
      up: (packLift(s, deck) - 1) / RISE,
      toUp: (packLift(s, deck) - 1) / RISE,
      response: a.pullMs / 1000,
      onDone: (rest) => {
        const live = byId(s.host.root, card.id);
        if (!live) return;
        const it = DEALT.get(s.el);
        if (it?.card === card.id && it.at === "leaving") {
          DEALT.set(s.el, { ...it, at: "hand" });
          take(live, hand, it.finger);
          return;
        }
        // NOBODY IS HOLDING IT ANY MORE, so where it stopped is where it lives. Left unwritten, the
        // tree still names the place the pack stood when the card came off it, and the reconcile
        // takes the card there the instant the flight ends — "the drop carries it under where the
        // deck used to be", exactly.
        if (s.motions?.poses()?.has(card.id)) return; // something else has it — a carry, another flight
        compose(live, Transformable({ at: rest.at, angle: rest.angle, z: 0, scale: 1 }));
        s.setRoot(s.host.root);
      },
    });
    return true;
  };



  /**
   * INTO THE DEALING HAND — a real carry, on that hand's own springs.
   *
   * It used to be a `hold` and a pose written straight into the tree, and the note beside it said
   * why: the runtime held ONE carry and the pack was already in it under the other hand. So the
   * card had no follow, no lean and no lift — it sat dead under the fingertip while the pack beside
   * it breathed. That was never a choice; it was a limit of `animator/index.ts`, and it is gone
   * (`motion.two-hands-carry-two-runs`). A carry belongs to a HAND now, and this is that hand's.
   *
   * `lift` is the pack's own, so the card is exactly the size of the thing it came off, and `walls`
   * are the desk's — a hand cannot carry a card off the edge of the world either.
   */
  const take = (card: Node, hand: number, at: Vec, deck = mine()): void => {
    // IT LEAVES FROM THE PACK, and it TRAVELS to the finger. `anchor` seeds the springs, so a carry
    // opened at the fingertip puts the card there on that very frame — a card out of thin air, half
    // the desk away from the deck it is supposed to have come off. Seeded at the PACK and dragged
    // at once to the finger, the same spring that carries it afterwards is what pulls it out, and
    // there is no frame in which anything jumped. Nothing in this tree may teleport.
    s.motions?.grab([{ id: card.id, offset: { x: 0, y: 0 } }], {
      anchor: packAt(s, deck).at,
      hand,
      lift: packLift(s, deck),
      walls: DESK_WALLS,
    });
    s.motions?.dragTo(at, hand);
  };

  /**
   * THE PACK IS A MAGNET, AND IT PULLS WHILE THE FINGER IS STILL DOWN.
   *
   * "How do I put a card back if I pulled it out by accident" had no answer that did not involve
   * finishing a throw first, and that is the wrong shape for a mistake: undoing one should not cost
   * a second gesture. Bring the card near the pack and the pack TAKES it, with the flight, whether
   * or not the hand has opened. Take it away again and it comes back out to the finger.
   *
   * IT IS THE GAP THAT DECIDES, not which hand moved. Carrying the card to the pack and dragging
   * the pack up to the card are the same fact about the table, and a rule written on the dealing
   * finger alone would answer only one of them.
   *
   * TWO RADII AND NOT ONE. A single threshold chatters: the card lands in the pack, the pack is now
   * under the finger, the finger is at the threshold, and it flies in and out every frame. In is
   * `magnet` card-widths; out is a third further, and the third is the whole of what makes it feel
   * like a decision instead of a flicker.
   */
  const magnet = (): void => {
    const it = DEALT.get(s.el);
    // A CARD STILL ON ITS WAY OUT IS NOT IN ANYBODY'S HAND, so there is nothing for the pack to
    // take back — and taking it would fight the flight that is already carrying it.
    if (!it || it.at === "leaving" || !s.motions) return;
    const card = byId(s.host.root, it.card);
    const deck = byId(s.host.root, it.pack);
    if (!card || !deck) return;
    const pack = packAt(s, deck);
    const near = CARD.w * pack.grew * Math.max(a.magnet, 0);
    const gap = Math.hypot(it.finger.x - pack.at.x, it.finger.y - pack.at.y);
    if (it.at === "hand" && gap <= near) {
      // HOME, AND IT FLIES THERE. The card is off the finger from this instant — a snap the hand
      // could go on dragging would be a card in two places — and the pack takes it on landing.
      DEALT.set(s.el, { ...it, at: "pack" });
      s.motions.release(card.id);
      say(s, `back on the pack`, { magnet: true, gap: trace(gap), near: trace(near) });
      s.motions.snap(card.id, {
        to: pack.at,
        toUp: 0,
        up: (packLift(s, deck) - 1) / RISE,
        onDone: () => {
          const live = byId(s.host.root, it.card);
          if (!live) return;
          // THE DECISION WAS MADE WHEN THE MAGNET FIRED, and nothing since undoes it — least of all
          // the hand opening, which is a player who has finished putting the card back. It used to
          // ask whether the deal was still standing, and a release during the flight (a quarter of
          // a second, so: always) meant the card never joined the pack at all. It then eased to the
          // seat its tree still named — the place the deck stood when the card came off it.
          //
          // The one thing that DOES undo it is the card being pulled out again, which is a fresh
          // deal on this card and says so.
          const now = DEALT.get(s.el);
          if (now?.card === it.card && now.at !== "pack") return;
          intoPack(live, byId(s.host.root, it.pack));
        },
      });
      return;
    }
    if (it.at === "pack" && gap >= near * MAGNET_LET_GO) {
      // AND OUT AGAIN, to the finger that never opened. The same card, not the next one off the
      // pack: the player is still holding the one they pulled.
      const root = s.host.root;
      if (card.parent) remove(card.parent, card);
      add(root, card);
      s.motions.release(card.id);
      compose(card, Draggable({ onReject: "stay" }));
      compose(card, Transformable({ at: pack.at, z: 0, scale: 1, angle: 0 }));
      s.setRoot(root);
      say(s, `off the pack again`, { magnet: false, gap: trace(gap), near: trace(near) });
      DEALT.set(s.el, { ...it, at: "hand" });
      take(card, it.hand, it.finger);
    }
  };

  const move = (hand: number, at: Vec): void => {
    const it = DEALT.get(s.el);
    if (!it || it.hand !== hand) return;
    DEALT.set(s.el, { ...it, finger: at });
    // STILL ON ITS WAY OUT: the card is flying to these fingers, and the fingers have moved, so the
    // flight is told where they are now. A hand does not wait for a card.
    if (it.at === "leaving") {
      s.motions?.aim(it.card, at);
      // AND THE HAND HAS IT AS SOON AS IT HAS CAUGHT UP — not when the spring has SETTLED.
      //
      // Settling was the rule and it never happened: the target is the finger, the finger keeps
      // moving, so the spring is never at rest and the card stayed "on its way out" for the whole
      // gesture. Every release was then a card dropped mid-flight — ten deals in a row in a real
      // trace, one of them a flick at thirty-six units a second, and not a single throw among them.
      //
      // Caught up is a DISTANCE, and it is the honest reading of "it has reached your fingers".
      if (arrived(it.card, at)) {
        DEALT.set(s.el, { ...DEALT.get(s.el)!, at: "hand" });
        take(byId(s.host.root, it.card)!, hand, at);
      }
      return;
    }
    // THE FINGER IS AN ANCHOR NOW, not a pose. Everything between it and the card — the follow, the
    // lag, the lean into the run, the lift — is the carry's, on this hand's own springs.
    s.motions?.dragTo(at, hand);
    magnet();
  };

  /** THE PACK MOVED, so ask the magnet again — the gap is the same fact from the other side. */
  const stir = (): void => magnet();

  const end = (hand: number, velocity: Vec, curl: number): "pack" | "thrown" | undefined => {
    const it = DEALT.get(s.el);
    const card = held(hand);
    if (!card || !s.motions) return undefined; // a finger that was not dealing has nothing to let go of
    // ALREADY BACK IN THE PACK — the magnet took it while the hand was still down, so there is
    // nothing to throw. Opening the fingers over the pack is how a mistake ends, not a deal.
    if (it?.at === "pack") {
      DEALT.delete(s.el);
      return "pack";
    }
    // LET GO BEFORE IT ARRIVED. A flick is a flick whether or not the card had caught up, so the
    // flight is stopped WHERE THE CARD ACTUALLY IS and the throw is made from there. It used to
    // report "pack" and let the flight run on — so the desk said "back on the pack", put the card
    // nowhere near it, and every throw a player made while the card was still coming was silently
    // thrown away. A line that says what did not happen is worse than no line.
    // The deal is over BEFORE the flight is stopped: landing it runs the fly-out's own `onDone`,
    // and a deal still standing in the map there would hand the card to a finger that has gone.
    DEALT.delete(s.el);
    if (it?.at === "leaving") {
      // Grabbing LANDS the flight (the finger is the latest word), and grabbing it at its own place
      // is what keeps that from being a jump.
      take(card, hand, drawnAt(s, card.id));
    }
    // WHERE IT IS DRAWN, before anything is released — the carry is an override and the tree still
    // names the place the card came off at. Read from the tree, every throw would start from there.
    const from = drawnAt(s, card.id);
    s.motions.release(card.id);
    // THE HEIGHT CHANGES HANDS HERE, and it may not be held by both at once. While a finger had the
    // card the TREE carried its height — `scale` for the size, `z` for the shadow. From here the
    // CLOCK carries it, and the flight grows the body by the height it is at. Left in the tree as
    // well, the two multiply: the card doubles in size at the instant it is let go, which is the
    // one moment it must not change at all.
    compose(card, Transformable({ at: from, z: 0, scale: 1, angle: 0 }));
    s.setRoot(s.host.root);
    // THE PUSH IS THE FINGER'S OWN VELOCITY, scaled by one named number and handed over whole —
    // `UIPushBehavior(.instantaneous)`. Nothing is recomputed from it: taking a velocity apart into
    // a speed and a heading only to build it back up is two conversions, each able to be wrong.
    const push = { x: velocity.x * a.gain, y: velocity.y * a.gain };
    // THE HAND'S OWN TWIST, MEASURED. A card thrown off a turning wrist spins about its own axis
    // AND arcs through the air, and both of those come from this one number, because the hand
    // really did draw a curve. Guessing a spin from a straight line would be inventing the thing
    // the player is actually doing.
    const spin = curl * a.twist;
    // LET GO OVER THE PACK, WITH NOWHERE LEFT TO GO — SO IT GOES BACK INTO THE PACK.
    //
    // Two clauses and both are needed. Where the hand OPENED is the player's sentence: a card lifted
    // off the deck and put straight back down is a change of mind, and a desk that answered it by
    // dropping the card beside the pack would be making the player tidy up after themselves. Where
    // the run would END is what keeps that from swallowing a real throw: a card flicked hard while
    // still over the pack has been sent somewhere, and it goes there.
    const rest = restOf(from, push);
    const deck = mine();
    if (deck && onPack(s, deck, from) && onPack(s, deck, rest)) {
      note("home", { card: card.id, from: [trace(from.x), trace(from.y)], rest: [trace(rest.x), trace(rest.y)] });
      intoPack(card, mine());
      return "pack";
    }
    const seat = snap ? seatFor(s.host.root, a, from, push) : undefined;
    const up = (packLift(s, deck) - 1) / RISE;
    // EVERYTHING THE THROW WAS DECIDED FROM, in one entry. Where the card left, how hard, how
    // twisted, how high, who is being leaned on and how far the run was reckoned to reach — this is
    // the entry that turns "it flew wrong" into a sentence with a cause in it.
    note("throw", {
      card: card.id,
      from: [trace(from.x), trace(from.y)],
      push: [trace(push.x), trace(push.y)],
      spin: trace(spin),
      up: trace(up),
      reach: trace(glideLaw(a.glide).project(Math.hypot(push.x, push.y))),
      rest: [trace(rest.x), trace(rest.y)],
      seat: seat?.id,
    });

    // WHERE THE SEAT WOULD LIKE IT, worked out before the throw — the slot this card takes once it
    // is theirs, not the middle of the player. It is not a TARGET though: it is where the seat's
    // field pulls from, and the card keeps flying its own flight the whole way.
    const already = seat ? seat.children.length : 0;
    const slot = seat ? fanAt(already, already + 1) : undefined;
    const to = seat && slot ? { x: worldAt(seat).x + slot.x, y: worldAt(seat).y + slot.y } : undefined;

    // A THROWN CARD, AND NOT A SCRIPTED ONE. It leaves the hand at the hand's height with the
    // finger's own velocity, and from there the world has it:
    //   • the AIR holds it up — a card is nearly all surface, so it reaches a terminal speed at
    //     once and comes down at that speed. It falls slower than a die and it does not bounce,
    //     because cardboard does not.
    //   • its own TWIST curves the run (the Magnus arc) while it spins about its axis;
    //   • the seat LEANS on it, inside its own circle and nowhere else.
    // What none of them do is take the throw away from the player: nothing here decides where the
    // card stops, and the correction that used to be at the end of the flight is simply not there.
    s.motions.slide(card.id, {
      speed: 0,
      angle: 0,
      push,
      up,
      spin,
      // THE TURN DIES WITH THE RUN, on the same law. A card sliding on felt stops turning when it
      // stops travelling — they are one friction — and a turn that outlived the run was the reason
      // the twist had to be cut short to a few degrees, which is to say never seen at all.
      spinGlide: a.glide,
      airGlide: a.air,
      magnus: a.magnus,
      bounce: 0,
      // AND IT MAY NOT LEAVE THE DESK. The same rect the camera is bounded by, so "gone" cannot
      // mean "somewhere nobody can pan to": a card that reaches the edge stops at it, and with no
      // bounce (cardboard does not) it simply lies down there.
      walls: DESK_WALLS,
      // THE SEAT LEANS ON IT ACROSS ITS WHOLE CIRCLE AND TAKES IT AT THE SLOT. The lean alone was
      // not enough and could not be: a hard flick crosses the field in a few frames and is barely
      // bent, so the card sailed past the player it was thrown to.
      ...(to ? { pull: { to, strength: a.pullStrength, radius: SEAT_R * Math.max(a.catch, 0.1), caught: CAUGHT } } : {}),
      onDone: (rest) => {
        const live = byId(s.host.root, card.id);
        if (!live) return;
        // `rest` and not `at`: the journal owns `at`, and a landing that wrote its place under that
        // name lost it — the one field anybody reading a trace of a bad throw actually wants.
        note("landed", { card: card.id, rest: [trace(rest.at.x), trace(rest.at.y)], turn: trace(rest.angle) });
        // WHOSE IT IS, ASKED OF WHERE IT ACTUALLY LIES. The throw was leaned on, not aimed, so the
        // seat that gets the card is the one it really came to rest in — and a card that fell short
        // of everybody stays on the felt, which is what a badly thrown card does at a real table.
        const landed = snap ? seatUnder(s.host.root, a, rest.at) : undefined;
        if (landed) {
          if (live.parent) remove(live.parent, live);
          add(landed, live);
          // AS IT FELL, SO IT LIES — the angle it landed with is kept, because a card that came to
          // rest a little crooked is a card that was thrown, and squaring it up is the tell that
          // nothing was. The fan gives it its place; the last of the way is an ordinary settle.
          const own = fieldsOf<{ at: { x: number; y: number } }>(live, "Transformable");
          compose(live, Transformable({ ...(own ?? {}), at: { x: 0, y: 0 }, angle: rest.angle, z: 0, scale: 1 }));
          // FACE DOWN, WHOEVER GETS IT. No seat here is "mine": the near one used to turn its cards
          // over on arrival, which is a rule about whose table this is and not about dealing — and
          // a card that turns itself over is a card the player did not turn. Whoever wants that
          // writes it; this page does not.
          setFacing(live, "down");
        } else {
          // NOBODY GOT IT, so the card stays where it stopped. The override is gone the same frame,
          // so the pose has to be written or the card would snap back to the pack.
          compose(live, Transformable({ at: rest.at, angle: rest.angle, z: 0, scale: 1 }));
        }
        s.setRoot(s.host.root);
      },
    });
    return "thrown";
  };

  /**
   * TWO LOOSE CARDS BECOME A PACK — the one being held, and the one tapped.
   *
   * A pack is a container that stacks (`isPack`), and that is all it takes: the new one is built at
   * the held card's place, both cards go into it, and from that moment every rule on this desk
   * treats it as a pack because every rule asks what a thing IS. Deal off it, drag it whole, drop a
   * card on it, set it down on a card and it picks that up too — none of that had to be written
   * again, and none of it could have been if the pack were still a node id.
   *
   * The held card is the BOTTOM and the tapped one lands on top, which is what putting one card on
   * another does.
   */
  const merge = (holder: Node, card: Node): Node | undefined => {
    const desk = s.host.root;
    if (!s.motions || packOf(holder) || packOf(card) || holder.id === card.id) return undefined;
    const at = drawnAt(s, holder.id);
    const pack = node(
      `pack${++piles}`,
      Bounded({ bounds: roundedRect(CARD.w, CARD.h, 0.08) }),
      Surfaced({ surface: BACK_SURFACE }),
      Transformable({ at }),
      ShadowCaster(),
      Container({ layout: "gesture.table.stack" }),
      Draggable({ onReject: "stay" }),
    );
    // THE HELD CARD LEAVES THE HAND FIRST. A carry poses the nodes it was GIVEN, and a card that
    // quietly became somebody's child while a finger still had it is laid out in two places.
    s.motions.release(holder.id);
    DEALT.delete(s.el);
    if (holder.parent) remove(holder.parent, holder);
    add(pack, holder);
    compose(holder, Transformable({ at: { x: 0, y: 0 }, angle: 0, z: 0, scale: 1 }));
    compose(holder, Draggable({ onReject: "home" }));
    setFacing(holder, "down");
    add(desk, pack);
    s.setRoot(desk);
    // AND THE TAPPED ONE FLIES TO IT, the same journey a card sent to any pack makes. The hand goes
    // on holding — what it is holding is now a pack.
    send(card, pack, "top");
    return pack;
  };

  const send = (card: Node, pack: Node, where: "top" | "anywhere"): void => {
    if (!s.motions) return;
    const spot = packAt(s, pack);
    // OFF WHATEVER IT WAS ON, and onto the desk, so the flight is over the felt rather than inside
    // somebody's hand — and so nothing lays it out at a seat while it is on its way.
    const from = drawnAt(s, card.id);
    if (card.parent && card.parent.id !== "desk") {
      remove(card.parent, card);
      add(s.host.root, card);
    }
    s.motions.release(card.id);
    compose(card, Transformable({ at: from, z: 0, scale: 1 }));
    s.setRoot(s.host.root);
    s.motions.snap(card.id, {
      to: spot.at,
      toUp: 0,
      up: (packLift(s, pack) - 1) / RISE,
      onDone: () => {
        const live = byId(s.host.root, card.id);
        if (live) intoPack(live, pack, where);
      },
    });
  };

  return { begin, move, stir, send, merge, end };
}

const TABLE_ARGS: TableArgs = {
  dealt: 0,
  dealAngle: 90,
  seats: 4,
  count: 36,
  catch: 1.4,
  reach: 0.7,
  gain: 0.3,
  twist: 1.2,
  air: "card",
  magnus: 0.25,
  magnet: 1.1,
  pullMs: 220,
  pullStrength: 9,
  glide: "normal",
  fingers: 1.5,
  liftMax: 2.25,
};

const TABLE_KNOBS = {
  dealt: documented("arg.dealt", { control: { type: "number", min: 0, step: 1 } }, "deal"),
  dealAngle: documented("arg.dealAngle", { control: { type: "number", step: 15 } }, "deal"),
  seats: documented("arg.seats", { control: { type: "number", min: 2, max: 10, step: 1 } }, "table"),
  count: documented("arg.count", { control: { type: "number", min: 0, max: 55, step: 1 } }, "table"),
  gain: documented("arg.gain", { control: { type: "number", min: 0, step: 0.02 } }, "deal"),
  twist: documented("arg.twist", { control: { type: "number", min: 0, step: 0.1 } }, "deal"),
  air: documented("arg.air", { control: "select", options: ["card", "normal", "fast"] }, "deal"),
  magnus: documented("arg.magnus", { control: { type: "number", min: 0, step: 0.05 } }, "deal"),
  magnet: documented("arg.magnet", { control: { type: "number", min: 0, step: 0.1 } }, "deal/pack"),
  pullMs: documented("arg.pullMs", { control: { type: "number", min: 0, step: 20 } }, "deal/pack"),
  pullStrength: documented("arg.pullStrength", { control: { type: "number", min: 0, step: 1 } }, "deal/snap"),
  glide: documented("arg.glide", { control: "select", options: ["card", "normal", "fast"] }, "deal"),
  fingers: documented("arg.fingers", { control: { type: "number", min: 0, step: 0.25 } }, "pack/lift"),
  liftMax: documented("arg.liftMax", { control: { type: "number", min: 1, step: 0.5 } }, "pack/lift"),
};

/** Wire both table pages the same way — the only difference is whether a seat is looked for. */
function tablePage(a: TableArgs, snap: boolean, key: string): HTMLElement {
  const shape = `${a.seats}/${a.count}`;
  const held = TABLES.get(key);
  const root = held && held.shape === shape ? held.root : tableTree(a);
  TABLES.set(key, { root, shape });
  const s = scene(root, {
    animate: true,
    motion: { glide: a.glide },
    // THE PACK AND ITS CARDS TAKE THEIR OWN FINGERS; the felt round them is the camera's. A finger
    // that lands on the deck gives the gesture away, and the deal's second finger is then free —
    // the camera does not take a gesture back.
    // The oval plus the line under it, and opened at the FIT: every seat a deal can be aimed at is
    // on the glass from the first frame, and the reader zooms in rather than hunting.
    camera: eye(
      (n: Node) => isPack(n) || packOf(n) !== undefined || draggableNode(n),
      DESK_HALF.w,
      DESK_HALF.h,
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
    runOf: (_root, hit) => (isPack(hit) ? [hit, ...hit.children] : [hit]),
    // THE PACK GROWS UNDER THE HAND, AND ONLY THE PACK. A deal needs a second finger to land ON it
    // beside the first, and whether one fits is a fact about GLASS PIXELS — a pack a third of a
    // unit across is thirty of them at the fit, which is less than one fingertip. The scale is not
    // picked: it falls out of the finger, the etalon and the camera's zoom (`liftToFit`), so it is
    // right on a phone, on a laptop and at every zoom without anybody retuning it.
    //
    // A dealt card gets no such treatment. Nothing is dealt off a single card, so it has nothing to
    // make room for, and growing it would be decoration.
    liftOf: (_root, hit) =>
      isPack(hit)
        ? liftToFit(acrossOf(hit), glassPerUnit(s.host.unit(), s.camera?.state().zoom ?? 1), {
            fingers: a.fingers,
            max: a.liftMax,
          })
        : undefined,
    // A CARD STILL IN THE PACK REFUSES THE FINGER, and that refusal is what makes the pack one
    // object under the hand. The pick then falls through to the deck itself, which is drawn under
    // it — so one finger on the pack moves the pack, whichever of its cards was on top.
    may: (n: Node) => packOf(n) === undefined || isPack(n),
    zoneAt: (root, p) => {
      // ANY PACK, and the topmost when two overlap: a player can build one, so the desk may have
      // several, and a card dropped on a pile joins the pile it was dropped on.
      for (let i = root.children.length - 1; i >= 0; i--) {
        const n = root.children[i]!;
        if (!isPack(n)) continue;
        const home = worldAt(n);
        if (Math.abs(p.x - home.x) <= CARD.w && Math.abs(p.y - home.y) <= CARD.h) return n;
      }
      return undefined;
    },
    onDrop: ({ lead, target }) => {
      // THE PACK SET DOWN ON LOOSE CARDS PICKS THEM UP — and it picks them up UNDERNEATH itself,
      // which is what putting a pack down on a card does. A drop of the deck lands it on the zone
      // the deck IS, so this is where that arrives; the drop itself is still refused, because the
      // pack stays where the hand left it rather than being moved by its own zone.
      if (lead.id === target.id) {
        if (isPack(lead)) underPack(lead);
        return false;
      }
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
    wirePan({
      host: s.host,
      // ANYWHERE. THE HOLDING HAND NAMES THE PACK; THE OTHER ONE ONLY POINTS.
      //
      // The first rule asked the dealing finger to land on the pack as well, and it was wrong in
      // the way a rule written from the arithmetic rather than from the hand is always wrong: the
      // pack is the smallest thing on the desk, the holding thumb is already sitting on it, and
      // there is barely room for a second fingertip on what is left. Nothing about a deal needs the
      // flick to begin anywhere in particular — it carries a DIRECTION, and the pack was named by
      // the hand already holding it.
      want: () => true,
      view: eyeOf(s),
      poses: () => s.motions?.poses(),
      // `shouldRecognizeSimultaneouslyWith`, and the answer is YES. A gate settles a conflict
      // between two readings of one gesture, and on this desk the second finger has no rival: two
      // fingers here mean a deal and nothing else. So the holding hand may WANDER — it can be
      // dragging the pack at the very same moment, and that is two hands doing two things, not two
      // readings of one. A test on how far it had moved was a gate against a conflict that does not
      // exist, and it refused every real deal a person made.
      together: () => true,
      onPan: (p: Pan) => {
        const deal = DEALERS.get(s.el);
        if (!deal) return;
        // THE OTHER HAND HAS TO BE ON THE PACK, and that is the whole of the law. It is asked of
        // the PLACE and not of the tree (`overPack`): after the first deal the finger is holding a
        // node that has since gone to a seat, and a test on the node would flip its answer without
        // the hand having moved.
        // THE HOLDING HAND IS THE ONE THAT WAS ALREADY DOWN, and asking that is not pedantry: both
        // fingers see each other as the other hand, so a rule written on the anchor alone lets the
        // RESTING thumb deal the moment it shifts a few pixels — which it does, because thumbs do.
        const holding = p.anchor !== undefined && p.anchor.earlier;
        // WHICH pack, not whether the pack: a player can build one, so the desk may have several,
        // and the deal belongs to the one that hand is actually on.
        const deck = holding ? packUnder(s, p.anchor!.at) : undefined;
        const speed = Math.round(Math.hypot(p.velocity.x, p.velocity.y) * 10) / 10;
        if (p.state === "began") {
          // AND EVERY REFUSAL IS SAID OUT LOUD. None of these numbers is visible, and a page that
          // speaks only when it succeeds leaves a reader one report to make — "it does not work" —
          // which names nothing and cannot be acted on.
          if (!p.anchor) return say(s, `moving at ${speed} u/s — no other hand is down: rest one on the pack`, { refused: "no anchor" });
          if (!holding) {
            return say(s, `this is the holding hand — deal with the other one`, {
              refused: "this hand was down first",
              id: p.id,
            });
          }
          if (!deck) {
            return say(s, `moving at ${speed} u/s — the holding hand is not on a pack`, {
              refused: "anchor off every pack",
              anchor: p.anchor ? [trace(p.anchor.at.x), trace(p.anchor.at.y)] : undefined,
            });
          }
          // SAID AFTER THE FACT, not before it. The message used to go out first and then the deal
          // was attempted, so a refusal — an empty pack, a card already on its way — was announced
          // as a card coming off. A page that says what it did not do is worse than a silent one.
          const took = deal.begin(p.id, p.at, p.on, deck);
          say(
            s,
            took ? `off the pack, going ${Math.round(p.heading ?? 0)}°` : `nothing to deal: a card is already on its way`,
            { began: p.id, took, curl: trace(p.curl) },
          );
          return;
        }
        // AND THE HOLDING HAND DOES NOT NARRATE. It is a pan too — it may well be dragging the pack —
        // so without this it writes the line under the dealing hand's own words, and the one place
        // the page speaks says whatever the thumb was doing last.
        //
        // IT DOES STIR THE MAGNET, THOUGH. Dragging the pack up to a card somebody is holding is
        // the same closing gap as carrying the card to the pack, and the table must answer it the
        // same way — see `Dealing.stir`.
        if (!holding) {
          deal.stir();
          return;
        }
        if (p.state === "changed") {
          // THE CARD IS ALREADY OUT AND IT IS WHERE THIS FINGER IS. Nothing is decided here and
          // nothing is thrown: the player is holding the card they are about to send, and holding
          // it the way anything is held on a screen — under the finger.
          deal.move(p.id, p.at);
          if (snap) {
            const id = DEALT.get(s.el)?.card;
            const seat = id
              ? seatFor(s.host.root, a, drawnAt(s, id), { x: p.velocity.x * a.gain, y: p.velocity.y * a.gain })
              : undefined;
            // WHO WOULD GET IT IF THE HAND LET GO NOW — the same question the release asks, asked
            // early. It costs one projection and it turns an invisible rule into something a reader
            // can aim by.
            say(s, seat ? `${speed} u/s → ${seat.id}` : `${speed} u/s → nobody yet`);
          }
          return;
        }
        if (p.state === "ended") {
          // SAID AFTER THE FACT, like the deal's own first word: the two endings are different
          // enough that announcing the throw and then quietly putting the card back would be the
          // page lying about what the player just did.
          const how = deal.end(p.id, p.velocity, p.curl);
          say(
            s,
            how === "pack"
              ? `back on the pack`
              : `let go at ${speed} u/s, ${Math.round(p.heading ?? 0)}°`,
            { how, v: [trace(p.velocity.x), trace(p.velocity.y)], curl: trace(p.curl) },
          );
          return;
        }
        // A CANCEL IS NOT A THROW. The gesture was taken away rather than finished, so the card
        // goes back the way a card that found nobody does: home, through the air, at no speed.
        deal.end(p.id, { x: 0, y: 0 }, 0);
      },
    }),
  );
  // AND A TAP IS A GESTURE OF ITS OWN, beside the pan and on the same fingers.
  //
  // "Hold the pack and tap a card" is the shortest way to say "that one goes back", and it is not a
  // drag: nothing is being carried anywhere, the player is POINTING. One tap puts it on top of the
  // pack; two lose it somewhere inside. Both are the same finger doing the same thing a different
  // number of times, which is exactly what `numberOfTapsRequired` is for.
  rewireTap(s.el, () =>
    wireTap({
      host: s.host,
      want: () => true,
      double: true,
      view: eyeOf(s),
      poses: () => s.motions?.poses(),
      onTap: (t) => {
        const deal = DEALERS.get(s.el);
        if (!deal || !t.anchor?.earlier || !looseCard(s.host.root, t.node)) return;
        // WHAT THE OTHER HAND IS ON DECIDES WHAT A TAP MEANS, and there are only two answers.
        //
        // A PACK: the card goes to it — on top for a tap, lost inside for two. A CARD: the two
        // become a pack, which is the same sentence read the other way round. Both are "put this
        // with that", and which one it is was never a mode: it is what the holding hand has.
        const deck = packUnder(s, t.anchor.at);
        if (deck) {
          deal.send(t.node, deck, t.taps >= 2 ? "anywhere" : "top");
          say(s, t.taps >= 2 ? `lost in the pack` : `back on top of the pack`, { tapped: t.node.id, taps: t.taps });
          return;
        }
        // THE HOLDING HAND IS ON A CARD, then — asked of the PLACE, like everything else here.
        // The node it came down ON is the wrong question after it has dragged that card anywhere:
        // the finger reports what was under it when it landed, and the card has been under it ever
        // since. Where it IS is the honest reading.
        const holder = cardUnder(s, t.anchor.at);
        if (!holder || holder.id === t.node.id) return;
        const made = deal.merge(holder, t.node);
        if (made) say(s, `two cards make a pack`, { pack: made.id, with: t.node.id });
      },
    }),
  );
  // THE PANEL DEALS TOO. The gesture this page is about needs two fingers, and a reader on a
  // laptop has one mouse — so the counter fires the same deal through the same three moments, and
  // the page is legible without a touchscreen. It is not a second mechanism: `dealt` walks the very
  // steps a finger walks, with the angle and strength off the panel instead of off a hand.
  if (moved(s.el, "dealt", a.dealt)) {
    const deal = DEALERS.get(s.el)!;
    const rad = (a.dealAngle * Math.PI) / 180;
    // The panel is a hand with no pointer of its own, so it borrows one that no glass can produce,
    // and it takes the card where a finger resting on the pack would have taken it — off the pack.
    const deck = byId(s.host.root, "deck");
    deal.begin(PANEL_HAND, packAt(s, deck).at, undefined, deck);
    deal.end(PANEL_HAND, { x: Math.cos(rad) * PANEL_SPEED, y: Math.sin(rad) * PANEL_SPEED }, PANEL_CURL);
  }
  return s.el;
}

/**
 * DEAL: ONE HAND HOLDS THE PACK, THE OTHER POINTS.
 *
 * Rest a finger on the deck. Put a second finger down and move it: the top card comes off the pack
 * and is UNDER that finger, at the pack's own size, and it stays under it — an ordinary drag, of the
 * kind everything else on the glass does. Let go and it FALLS from the height the hand was holding
 * it at, carrying the speed you let go with. Nothing carries it anywhere and nothing brings it back.
 *
 * A DRAG, AND THAT IS THE CORRECTION. It used to be led BY the finger — the card started at the pack
 * and moved by the same amount the finger did — which is a sentence that reads well and is nothing
 * like holding a card: the card sat a hand's width from the fingertip for the whole gesture, and no
 * player reading the glass could say what they were touching. A card you have pulled off a pack is
 * IN YOUR HAND, so it comes to the hand.
 *
 * IT ANSWERS WHILE YOU ARE STILL DEALING, and that is what the running report is for. A verdict
 * delivered on release cannot say "the card is out, and it is here" — by then the gesture is over
 * and everything the player did during it was answered by nothing. `UIPanGestureRecognizer` is the
 * shape that can say otherwise — `began`, `changed`, `ended`, with a position and a velocity at
 * every step — and the line at the bottom of the desk names who would get the card if the hand let
 * go NOW.
 *
 * THE ARBITRATION IS THE PAGE, and it lives entirely in the HOLDING hand. One finger alone on the
 * pack MOVES THE PACK — drag it anywhere, and the deal still works from wherever you left it. A
 * second finger that moves DEALS, whatever the first one is doing meanwhile: dragging the pack and
 * dealing off it are two hands doing two things, not two readings of one. That is one rule and it
 * is written in one place (`together`, which is `shouldRecognizeSimultaneouslyWith`), not as a pile
 * of conditions in a handler. Nothing here is a mode, and there is nothing to hold down.
 *
 * THE DEALING FINGER MAY START ANYWHERE, and that is a correction rather than a convenience. The
 * first rule asked it to begin on the pack too, which reads well and is wrong in the hand: the pack
 * is the smallest thing on the desk, the holding thumb is already on it, and what is left is barely
 * a fingertip wide. Nothing about a deal needs the gesture to begin in a particular place — it
 * carries a DIRECTION, and the pack was named by the hand already holding it.
 *
 * IT IS THROWN, NOT SENT. What leaves the hand is a body with the finger's own velocity on it, and
 * from there the world has it: the AIR holds it up — a card is nearly all surface, so it reaches a
 * terminal speed at once, falls slower than a die and does not bounce, because cardboard does not;
 * its own TWIST curves the run (the Magnus arc) while it turns about its axis; and the seat LEANS
 * on it, inside its own circle and nowhere else (`UIFieldBehavior`, not a target). Not one of them
 * decides where the card stops.
 *
 * WHICH SEAT IS LEANED ON is decided before the throw — the table walks the run the card would
 * cover if nothing caught it (`project`, the very number the desk decelerates by) and asks which
 * seat that run passes through. Aim and strength are one question rather than two gates: a card
 * pointed between two players passes through neither circle, and a lazy one dies before it reaches
 * any. `reach` is how much of the distance the dealer must have covered themselves, `catch` how
 * wide a seat's circle is, and `pullStrength` how hard that seat leans — all three are the table's
 * HELP, and turned down the dealing is entirely the dealer's aim.
 *
 * WHOSE IT IS is then asked of where the card ACTUALLY came to rest, which can disagree with who
 * was leaned on: a card that fell short of everybody belongs to nobody and stays on the felt. That
 * disagreement is a badly thrown card, and a table where that cannot happen is not a table.
 *
 * A PACK IS WHAT IT DOES, NOT WHAT IT IS CALLED. This desk shipped with one pack and a node id to
 * match, and every rule about dealing was written against that id — which meant a pack a PLAYER
 * built could never be one. A pack is a container that stacks its cards, and asking that instead is
 * the whole of it: hold a loose card, tap another, and the two become a pack that deals, drags,
 * receives a dropped card and picks up what it is set down on, with none of those written twice.
 *
 * WHAT THE OTHER HAND IS ON DECIDES WHAT A TAP MEANS, and there are only two answers. On a PACK: the
 * tapped card goes to it — on top for one tap, lost somewhere inside for two, which is what a player
 * does with a card they do not want to see again soon. On a CARD: the two become a pack. Both are
 * "put this with that", and which one it is was never a mode — it is what the hand is holding.
 *
 * A SEAT CATCHES WHAT STOPS IN IT, not what flies over it. It used to be the seat the run PASSED
 * THROUGH first, which reads well and is wrong at a table: a player leaning out past their own place
 * to throw across the felt has their own seat between their hand and everybody else's, so every
 * throw they made was caught by themselves. The strength said otherwise the whole time — a card
 * going that fast was never being put into the near hand.
 *
 * A PACK SET DOWN ON LOOSE CARDS PICKS THEM UP, underneath itself and squared up: the pack did not
 * go under them. The straightening is a settle and not a write, so a card that was lying crooked
 * turns as the pack comes down on it.
 *
 * NOTHING TURNS ITSELF OVER. No seat here is "mine" — the near one used to show its cards face up
 * on arrival, which is a rule about whose table this is and not about dealing.
 *
 * IT SLIDES OUT OF THE PACK, and only then is it in the hand. A carry cannot do that and must not
 * be made to: a held thing rides the finger ONE TO ONE, with no lag at all, which is the law that
 * makes a drag feel like holding something. So a carry opened at the fingertip puts the card there
 * on the very frame it was asked for — a card out of thin air, half a desk from the deck it is
 * supposed to have come off. The card FLIES instead, the way any card flies, aimed at the fingers;
 * the flight is re-aimed as they move (`aim`, because a hand does not wait for a card); and the
 * hand takes it on arrival. `pullMs` is how long that takes.
 *
 * AND THE FINGER NAMES THE CARD. Put the second finger on a card already lying on the felt and it
 * is THAT card you are holding — to throw again, or to bring back to the pack. Answering a tap on
 * a card by dealing a different one off the deck is the desk contradicting the finger. Only when
 * the finger is on nothing of its own, or on the pack (whose cards ARE the pack), does the top card
 * come off.
 *
 * IT IS CARRIED, NOT POSED, and that is the fix that mattered most. The card rides the dealing
 * hand's own carry — the follow spring, the lag, the lean into the run, the lift — the same physics
 * the pack has under the other hand. It did not, and the reason was not a tuning anybody chose: the
 * runtime held ONE carry, the pack was already in it, and the card had to be posed into the tree by
 * hand. It sat dead under the fingertip while the pack beside it breathed. A carry belongs to a
 * HAND now (`motion.two-hands-carry-two-runs`), and a table may have as many as it has fingers.
 *
 * THE PACK IS A MAGNET, AND IT PULLS WHILE THE FINGER IS STILL DOWN. Bring the card back near the
 * deck and the deck TAKES it, with the flight, without waiting for the hand to open; take it away
 * again and it comes back out to the finger that never let go. That is the answer to "I pulled one
 * out by accident" — undoing a mistake should not cost a second gesture. It is the GAP that
 * decides and not which hand moved: carrying the card to the pack and dragging the pack up to the
 * card are the same fact about the table. Two radii, in and a third wider out, or the card would
 * fly in and out every frame with the finger sitting on the line.
 *
 * AND NOTHING LEAVES THE DESK. Card and hand alike are held inside the very rect the camera is
 * bounded by, so "gone" cannot mean "somewhere nobody can pan to": a flick of twenty units a second
 * projects ten units, which is four times this table. `gain` is what a flick is worth — a third,
 * so an ordinary throw reaches a player rather than the far wall — and the wall is what catches
 * everything harder than that. With no bounce (cardboard does not) a card that reaches it lies down.
 *
 * A CARD THAT FINDS NOBODY LIES WHERE IT STOPPED, and that is a deliberate removal. It used to fly
 * home by itself, through the air, to the pack in the holding hand — and the flight was wrong twice
 * over. It was a journey nobody asked for, which is the one thing a thrown object may never make;
 * and it made "I have changed my mind" indistinguishable from "I threw it badly", because the desk
 * answered both by taking the card back. Everything falls now. What the player did is what happened.
 *
 * PUTTING ONE BACK IS A THING YOU DO, then, and the pack is where you do it: let go over the pack
 * with nowhere left to go and the card is in the pack again, face down. Both halves are asked —
 * where the hand OPENED, which is the player's sentence, and where the run would END, which is what
 * keeps a hard flick made over the deck from being swallowed as a change of mind. It is the same
 * answer the deck already gives a card DRAGGED onto it: one place, two ways in.
 *
 * AND IT COMES DOWN AS IT GOES. The height is the same number in two owners' hands: the TREE holds
 * it while the finger does (`scale` for the size, `z` for the shadow), the CLOCK holds it once the
 * card is thrown, and both are drawn through `RISE` — so the card leaves the pack at exactly the
 * pack's own size and loses height and size together, as one thing. The hand-over matters: held by
 * both at once the two multiply, and the card doubles at the very instant it must not change.
 *
 * AND A CARD OFF THE PACK IS DRAWN UNDER THE PACK, all the way down. The pack is being held UP by a
 * hand; the card has left it and is falling away from it, so it passes beneath. Added to the desk it
 * was drawn last of all and therefore over the raised pack, while the same card landing in a seat
 * came to rest under it — the desk disagreeing with itself about which of two things was higher.
 *
 * The pack itself is a container that draws its own back, so an empty deck is still standing there
 * to be dealt onto — there is no separate slot node that could fall out of step with it.
 */
export const Deal: StoryObj<TableArgs> = {
  args: { ...TABLE_ARGS },
  argTypes: {
    ...TABLE_KNOBS,
    catch: documented("arg.catch", { control: { type: "number", min: 0.1, step: 0.1 } }, "deal/snap"),
    reach: documented("arg.dealReach", { control: { type: "number", min: 0.05, max: 2, step: 0.05 } }, "deal/snap"),
  },
  parameters: { gkDocStory: "gestures.deal" },
  render: (a) => tablePage(a, true, "gestures.deal"),
};

/**
 * FLING: THE SAME GESTURE, AND NOBODY IS LOOKED FOR.
 *
 * Rest a finger on the pack and pull a card off it with another. It comes out under that finger and
 * follows it, and where you let go it falls and runs out on the felt. There is no seat to find and
 * nobody leans on it — the whole of where it stops is how you threw it, and that absence is the
 * point of standing this page next to `Deal`.
 *
 * The pair is one decision, seen from both sides. A table that SNAPS is saying "a card belongs to
 * somebody"; a table that does not is saying "a card belongs where it lies". Neither is more
 * correct, and a game that wanted one and shipped the other has told its players something untrue
 * about what the table is: cards drifting to the nearest player in a game where position is the
 * state, or cards stranded mid-felt in a game where every card has an owner.
 *
 * `gain` is how much of the finger's velocity the card is pushed off with — an instantaneous push
 * and not a recomputation, so what the card leaves with is what the hand did. It is the only
 * strength lever here: with nobody to aim at, how hard you flicked is the whole of what you said.
 * `glide` is the felt, and between them they are the ordinary physics of a puck.
 */
export const Fling: StoryObj<TableArgs> = {
  args: { ...TABLE_ARGS, gain: 0.16 },
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
  args: { count: 36, recipe: "riffle", quantum: 2, shuffleMs: 320 },
  argTypes: {
    count: documented("arg.count", { control: { type: "number", min: 2, max: 55, step: 1 } }, "pack"),
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
  glide: string;
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
  args: { gain: 0.5, spinGain: 30, glide: "normal", kind: "d6" },
  argTypes: {
    gain: documented("arg.gain", { control: { type: "number", min: 0, step: 0.1 } }, "throw"),
    spinGain: documented("arg.spinGain", { control: { type: "number", min: 0, step: 10 } }, "throw"),
    glide: documented("arg.glide", { control: "select", options: ["normal", "fast"] }, "throw"),
    kind: documented("arg.kind", { control: "select", options: DIE_KINDS }, "die"),
  },
  parameters: { gkDocStory: "gestures.shake" },
  render: (a) => {
    const key = `gestures.shake.${a.kind}`;
    const root = SHAKE_STATE.get(key) ?? dieTree(a);
    SHAKE_STATE.set(key, root);
    const s = scene(root, { animate: true, motion: { glide: a.glide }, camera: eye(draggableNode, 3.2) });
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
          glide: a.glide,
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
