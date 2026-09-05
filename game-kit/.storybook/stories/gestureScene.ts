// THE GRAB SCENE — the one page every carrying story on the shelf stands on.
//
// It lives apart from the stories because more than one shelf now needs it: `Engine/Gestures` teaches
// the gestures one at a time, and `Mechanics/Stack merging` teaches a RULE about the pieces, on the
// same desk and with the same finger. A second copy of this wiring would be a second answer to
// "what happens when a hand lets go", and the two would disagree within a week.
//
// Everything a page can differ by is an argument. Everything a page CANNOT differ by — that a
// border never loses, that a handle has no physics of its own, that the seat is written before the
// fall is asked for — is stated once, so a new page inherits it by existing.
//
// THE WIRING ITSELF IS THE KIT'S (`render/liveTable.ts`) and no longer this file's. A product stands
// the same desk up with a network behind it, and while the catalog owned the wiring it had to build
// a second one — which is how the hub ended up with a desk a card could not be thrown on. What is
// left here is the DEVTOOLS half: the panel, the inspector, the story's arguments, and the shell the
// scene is fed rather than rebuilt in (`scene()`). Everything below is that shell plus a call.

import { heapKindOf } from "./gestureMap.js";
import {
  type Walls,
  draggable,
  liveTable,
  isHandleAmong as isHandleAmongInKit,
  letFall as letFallInKit,
  type LiveTable,
  type Mirror as KitMirror,
  type CarryItem,
  type Node,
  type SeatPlace,
  type Vec,
  type ViewerSettings,
} from "../../src/index.js";

export { formationOf, fanOf, seatIn, landed } from "../../src/index.js";
export type Mirror = KitMirror<Scene>;
export const isHandleAmong = isHandleAmongInKit;
import { throwDie } from "@game-presets/dice";
import { scene, type Scene } from "../devtools/scene.js";
import {
  deckMap,
  gestureMap,
  GRIP,
  GRIP_HOLD,
  GRIP_MISS,
  ANCHOR_MARK,
  deskRoom,
  stackMap,
  type Bump,
  type GripSpec,
  type HeapRule,
  type LetGo,
} from "./gestureMap.js";

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
export function grabScene(
  physics: boolean,
  lift?: number,
  letGo?: "drop" | "throw",
  stacking = false,
  grip: GripSpec = { w: GRIP.w, miss: GRIP_MISS, ...GRIP_HOLD },
  ways: { card?: LetGo; chip?: LetGo; die?: LetGo } = {},
  desk: "map" | "stack" | "deck" | (() => Node) = stacking ? "stack" : "map",
  flipping = false,
  showsEnough = 0,
  // WHAT MAY LIE IN ONE HEAP, as the desk's own answer rather than this file's. Absent, the shelf's
  // original rule: same kind, touching. A desk with a stricter one hands it in, and every line
  // below — the handles, the lift, the squaring-up — reads it instead of knowing it.
  rule?: HeapRule,
  // WHAT TAKES UP ROOM, as the panel's answer rather than the pieces' own. Absent, the desk's own.
  bump?: Bump,
  // WHICH ZONE A RELEASE BELONGS TO. Absent, no release belongs to any — which is what every desk on
  // this shelf said before one of them grew a zone.
  zones?: (root: Node, at: Vec, lead: Node) => Node | undefined,
  // THE OTHER SCREENS ON THIS DESK, if there are any. Absent, this scene is alone with its tree,
  // which is what every page on the shelf but one is.
  mirror?: Mirror,
  /**
   * WHAT ONE UNIT IS WORTH IN PIXELS on this page. Absent, the host's own etalon, which is sized for
   * one scene filling a page — and a page holding two of them stacked shows each a crop of the desk
   * at that size, which is how two areas a reader was told to aim between end up off the glass.
   */
  unit?: number,
  /**
   * DRAW THE PICTURE OF WHERE A LIFTED RUN WILL LAND. Off, and a lifted thing says nothing about
   * where it is going — which is the desk before this feature, and worth turning off once to feel
   * what carrying a hand across a board was like without it.
   */
  landingShown = true,
  /**
   * THE STRETCH THE VIEW IS HELD INSIDE, when this desk is not the shelf's own size.
   *
   * A board has a zone beside it, and a camera told the shelf's stock rectangle holds the view
   * inside one the zone is OUTSIDE of: the view stops at the board's edge with the zone past the
   * wall, reachable by nothing and lookable at by nobody. Absent, the shelf's own room, which is
   * every page but the one with something standing beside its felt.
   */
  room?: { x: number; y: number; w: number; h: number },
  actor?: string,
  viewer?: Partial<ViewerSettings>,
  /**
   * WHAT A DESK WITH ITS OWN LAW ABOUT PIECES SAYS — and only that. A nardy point is not a heap
   * (`stacking`) and not a square (`zones` alone): a checker lifted from a point takes the ones
   * above it, the run stands in a column in the hand, and a die thrown beside the board stays
   * beside it. Three answers, given as data, for a desk that is neither of the two the shelf knew.
   */
  pieces?: {
    readonly runOf?: (root: Node, hit: Node) => readonly Node[];
    readonly offsetOf?: (root: Node, hit: Node, run: readonly Node[]) => readonly Vec[] | undefined;
    readonly wallsOf?: (piece: Node, at: Vec) => Walls | undefined;
    /** Whether this run may be THROWN at all — a column of checkers is set down however fast the hand was. */
    readonly mayThrow?: (items: readonly CarryItem[], root: Node) => boolean;
    /** The desk came to rest after these — a handle can be put back under what it belongs to. */
    readonly settled?: (root: Node, ids: readonly string[]) => void;
  },
  /**
   * THE SEAT'S OWN ANGLE, in degrees — a screen looking at the SAME desk from the other side of it.
   *
   * Chess is where this first matters: the black player's board is the white player's, turned, and
   * without this every screen opens looking at it from the white side regardless of who is sitting
   * there. Absent, the camera opens at 0°, which is every other page on the shelf.
   */
  turn?: number,
  /**
   * THE VIEW MOVED, told to the page — for the one desk where where somebody is LOOKING is itself
   * something standing on the felt. Absent, nobody asks, which is every page but that one.
   */
  onView?: () => void,
  /**
   * AN EXTRA GATE ON THE PICK, beside "is it draggable" — the SEAT'S permission.
   *
   * A desk where a place can be shut needs it, and it cannot be answered by the drop: a drop is
   * asked at the end of a gesture, and what a shut hand refuses is the gesture ever STARTING. The
   * usual answer is `grippableBy(n, seat)`; absent, every draggable thing takes every finger, which
   * is every page on the shelf that has no owners.
   */
  may?: (n: Node) => boolean,
  /**
   * THE PAGE'S OWN ANSWER TO A TAP, asked first — `true` means the page took it.
   *
   * The same shape as `onRelease`, for the same reason: a tap means one thing on a card (turn it
   * over) and another on a thing that is not a card, and which of those is a fact about the desk
   * rather than about the gesture. Absent, or answering `false`, and the tap goes on to whatever
   * this scene was already doing with one.
   */
  taps?: (piece: Node) => boolean,
  /**
   * THE DESK CAME TO REST AND THE PAGE HAS SOMETHING TO SAY ABOUT IT.
   *
   * A page whose furniture is DERIVED from the tree — a hand that is the size of what is in it —
   * has to be given the moment to re-derive it, and there is exactly one such moment: after the drop
   * has been written and before the next frame is planned. Absent, nothing asks, which is every page
   * whose desk is the same shape at the end of a gesture as it was at the start.
   */
  onDeskChanged?: (root: Node) => void,
  /**
   * WHERE THE SEATS ARE AT THIS DESK, and whether an idle view glides back to this screen's own —
   * the same option `liveTable` itself takes (`LiveTableOptions.seats`), threaded through unchanged.
   * Absent, no seat is minded, which is every page on the shelf until a reader asks for one.
   */
  seats?: {
    readonly places: readonly SeatPlace[];
    readonly mine: number;
    readonly idleReturn?: { readonly afterMs?: number; readonly glideMs?: number } | false;
  },
  /**
   * THE LIVE DESK ITSELF, handed back before its element is torn out of this function's return —
   * the one way a page's own heartbeat can reach `idle.step` (`liveTable.ts`'s own note on `seats`:
   * the countdown is the CONSUMER's clock, not the kit's). Returns a teardown, called if the page is
   * ever asked to build a fresh one; absent, nobody outside this call ever sees the `LiveTable`.
   */
  onLive?: (live: LiveTable) => (() => void) | void,
): HTMLElement {
  // A DESK HANDED OVER AS A FACTORY IS BUILT ONCE and is the reader's from then on — turning a knob
  // must not sweep away the cards they dealt. See `scene`.
  const make = typeof desk === "function" ? desk : desk === "deck" ? deckMap : desk === "stack" ? stackMap : gestureMap;
  const built = scene(make, {
    animate: true,
    ...(actor ? { actor } : {}),
    ...(viewer ? { viewer } : {}),
    camera: {
      limits: MAP_ZOOM,
      // THE DESK PLUS THE ROOM TO LOOK AT IT. Told the desk exactly, the camera holds it covering
      // the glass and the felt's edge becomes a wall the view stops dead against — every pan ending
      // in a stop with nothing beyond it, and a piece by the border never reachable to the middle of
      // the glass. `deskRoom` gives the eye somewhere to stand; the pieces are still walled in.
      content: room ?? deskRoom(),
      ...(unit === undefined ? {} : { unit }),
      // THE ARBITRATION, as one predicate: whatever can be picked up takes its own finger, and
      // over bare map the same finger drives the view. The two never argue about a hand.
      claims: draggable,
      ...(turn === undefined ? {} : { turn }),
      ...(onView ? { onView } : {}),
      // Opened in the middle at zoom 1, where the pieces are life-size and the map is not: a phone
      // holds about half of it, so there is somewhere to carry a piece TO from the first touch.
      // A DESK THAT NAMES ITS ROOM WANTS TO BE SEEN WHOLE: a board with a zone under it is taller
      // than a pane at life size, and opened at zoom 1 the zone is off the glass — on one screen and
      // not the other, whichever pane happened to be shorter. Fitted, every pane shows the same desk.
      start: { at: room ? { x: room.x + room.w / 2, y: room.y + room.h / 2 } : { x: 0, y: 0 }, zoom: room ? "fit" : 1 },
    },
  });
  // ...AND THE PANEL'S NUMBERS ARE RE-APPLIED TO THE DESK THAT IS ALREADY STANDING. The desk is not
  // rebuilt on an argument change, so anything a control writes INTO it — a zone's reach, a named
  // arrangement — has to be written again here, or the knob would only take effect on a page reload.
  const live = liveTable<Scene>(built.el, built.host.root, {
    stage: built,
    physics,
    ...(lift === undefined ? {} : { lift }),
    ...(letGo ? { letGo } : {}),
    stacking,
    grip,
    ways,
    flipping,
    showsEnough,
    ...(rule ? { rule } : {}),
    ...(bump ? { bump } : {}),
    ...(zones ? { zones } : {}),
    ...(mirror ? { mirror } : {}),
    landingShown,
    ...(room ? { room } : {}),
    ...(actor ? { actor } : {}),
    ...(pieces ? { pieces } : {}),
    ...(may ? { may } : {}),
    ...(taps ? { taps } : {}),
    ...(onDeskChanged ? { onDeskChanged } : {}),
    ...(seats ? { seats } : {}),
    // WHAT A PIECE HEAPS BY — the shelf's own answer, off what a piece carries and never off its
    // name (`guard.id-is-opaque`).
    heapKindOf,
    // The mark a handle wears while it IS the landing picture — the shelf's furniture, as data.
    anchorMark: ANCHOR_MARK,
    // ...AND A DIE ROLLS THE DICE ADD-ON'S WAY. The kit ships no dice; the page that has them says so.
    onRoll: throwDie,
  });
  onLive?.(live);
  return live.el;
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
export function letFall(
  s: Scene,
  items: readonly CarryItem[],
  lift: number,
  hand?: Vec | undefined,
  after?: () => void,
  ways: { card?: LetGo; chip?: LetGo; die?: LetGo } = {},
  bump?: Bump,
  hover: Vec = { x: 0, y: 0 },
  wallsOf?: (piece: Node, at: Vec) => Walls | undefined,
): boolean {
  return letFallInKit(s, items, lift, hand, after, ways, bump, hover, throwDie, wallsOf);
}
