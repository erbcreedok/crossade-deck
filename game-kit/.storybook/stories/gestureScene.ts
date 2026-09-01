// THE GRAB SCENE — the one page every carrying story on the shelf stands on.
//
// It lives apart from the stories because more than one shelf now needs it: `Engine/Gestures` teaches
// the gestures one at a time, and `Mechanics/Stack merging` teaches a RULE about the pieces, on the
// same desk and with the same finger. A second copy of this wiring would be a second answer to
// "what happens when a hand lets go", and the two would disagree within a week.
//
// Everything a page can differ by is an argument. Everything a page CANNOT differ by — that a
// border never loses, that a handle has no physics of its own, that the seat is written before the
// fall is asked for — is stated here once, so a new page inherits it by existing.

import {
  apply,
  byId,
  compose,
  DEFAULT_TUNING,
  draggable,
  fieldsOf,
  polar,
  RISE,
  Transformable,
  type CarryItem,
  type Node,
  type TransformableFields,
  type Vec,
} from "../../src/index.js";
import { throwDie } from "@game-presets/dice";
import { wireDrag } from "../devtools/drag.js";
import { scene, type Scene } from "../devtools/scene.js";
import {
  DIE_HOP,
  DIE_SPIN,
  DIE_SPIN_DRAG,
  deckMap,
  dropOf,
  fallOrder,
  gestureMap,
  GRIP,
  GRIP_HOLD,
  isGrip,
  MAP,
  mapWalls,
  regrip,
  stackMap,
  stackSeats,
  thrown,
  toFront,
  turnOver,
  type HeapRule,
  type LetGo,
} from "./gestureMap.js";

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
export function grabScene(
  physics: boolean,
  lift?: number,
  letGo?: "drop" | "throw",
  stacking = false,
  grip: { w: number; min: number; max: number } = { w: GRIP.w, ...GRIP_HOLD },
  ways: { card?: LetGo; chip?: LetGo; die?: LetGo } = {},
  desk: "map" | "stack" | "deck" | (() => Node) = stacking ? "stack" : "map",
  flipping = false,
  showsEnough = 0,
  // WHAT MAY LIE IN ONE HEAP, as the desk's own answer rather than this file's. Absent, the shelf's
  // original rule: same kind, touching. A desk with a stricter one hands it in, and every line
  // below — the handles, the lift, the squaring-up — reads it instead of knowing it.
  rule?: HeapRule,
): HTMLElement {
  // THE HEAPS AS THEY STAND, by the handle that lifts each — rebuilt whenever anything moves, since
  // that is the only time the answer can have changed.
  let heaps = new Map<string, readonly Node[]>();
  /** The handle a finger has hold of right now, if any — see `regrip`'s `keep`. */
  let inHand: string | undefined;
  const built = scene(typeof desk === "function" ? desk() : desk === "deck" ? deckMap() : desk === "stack" ? stackMap() : gestureMap(), {
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
    // WHAT THE CLOCK IS CARRYING IS NOT IN A HEAP. A thrown card is in the air, not lying on the
    // felt, and a handle that still counted it would pull it back out of its own flight the moment
    // somebody took the stack again — the piece has to leave the heap when it leaves the desk. What
    // a HAND is carrying is not lying there either, for the same reason.
    const carried = inHand ? heaps.get(inHand) : undefined;
    const aloft = (id: string): boolean =>
      (built.motions?.busy(id) ?? false) || (carried?.some((n) => n.id === id) ?? false);
    heaps = regrip(built.host.root, grip, aloft, inHand, rule);
    // The held handle keeps its own run: it was taken with those pieces and it puts down those
    // pieces, whatever the desk has rearranged itself into meanwhile.
    if (inHand && carried) heaps.set(inHand, carried);
    built.host.setRoot(built.host.root);
  };
  settle();
  return wireDrag(built, {
    view: () => built.camera!.transform(),
    // A PILE HIDES ALL BUT A SLIVER OF WHAT IS UNDER ITS TOP, and a finger that lands on a sliver
    // gets a card nobody was aiming at. Below this much showing a piece does not answer at all: the
    // touch goes to whatever is covering it, and so on up the pile.
    ...(showsEnough > 0 ? { showsEnough } : {}),
    // A HANDLE LIFTS THE HEAP IT STANDS UNDER, and itself with it — left behind, the tab would hang
    // over felt the heap has walked away from. Anything else lifts alone, which is the whole of
    // "pull a card out of the heap instead of the heap".
    ...(stacking
      ? {
          runOf: (_root: Node, hit: Node) => {
            // Remembered for as long as the gesture lasts, so nothing redraws the tab in the hand.
            inHand = isGrip(hit) ? hit.id : undefined;
            return isGrip(hit) ? [hit, ...(heaps.get(hit.id) ?? [])] : [hit];
          },
          // The tab is the hand's own and takes no lift or lean; everything hanging off it does.
          stillOf: (_root: Node, hit: Node, run: readonly Node[]) => (isGrip(hit) ? run.map((n) => isGrip(n)) : undefined),
          // ...AND THE HEAP IS SQUARED UP AS IT COMES OFF THE DESK, not when it is put down. The
          // handle is the anchor, so the stack hangs off the finger exactly where the tab was.
          offsetOf: (_root: Node, hit: Node, run: readonly Node[]) =>
            isGrip(hit) ? [{ x: 0, y: 0 }, ...(rule?.seats ?? stackSeats)(run.slice(1), grip.w)] : undefined,
          feelOf: (_root: Node, hit: Node) => (isGrip(hit) ? HANDLE_IS_THE_GRAB : undefined),
          // AFTER the tree has been written, never at the carry's `done`: at `done` the drop has
          // not been decided yet, so the handles would be redrawn from the seats the pieces had
          // before they were put down — a tab under the heap that used to be there.
          onSettled: (root: Node, ids: readonly string[]) => {
            // Once per gesture and synchronously with its drop, so there is no staleness to guard.
            inHand = undefined;
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
    // A TAP TURNS WHAT IT LANDED ON, and it lands on the topmost card DRAWN — which on a closed
    // pile is the top of the deck. Nothing here knows what a deck is: the finger's own answer is
    // already the right one, and so the same line reads "turn this card over" in the open and
    // "turn the deck's top card over" on the pile. A gesture that STAYED is not a tap and reports
    // nothing, which is the whole of "hold it and it does not turn".
    ...(flipping
      ? {
          onTap: (piece: Node) => {
            built.motions?.flip(piece.id, () => {
              turnOver(piece);
              built.host.setRoot(built.host.root);
            });
          },
        }
      : {}),
    // A page that DROPS or THROWS takes the release over: the ordinary one puts the piece down
    // where the finger was, and putting down is the thing those pages say is not what happens.
    // A throw is a drop with the hand's speed still on it — one call, and the piece falls from the
    // hand's height WHILE it travels, which is what a thrown thing does.
    ...(letGo
      ? {
          onRelease: (v: Vec | undefined, items: readonly CarryItem[]) =>
            // A heap let go of by its handle was never lifted, so it has no height to fall from —
            // the run comes down from wherever the hand was actually holding it.
            ((mine: string | undefined) =>
              letFall(built, items, held, letGo === "throw" ? v : undefined, () => {
                // ONLY IF IT IS STILL MINE. This runs twice — once as the pieces leave, and again
                // on every landing, which can be a second later. By then another gesture may have a
                // different handle in hand, and a stale callback clearing that would leave the
                // rebuild with nothing to protect: the tab under the live finger is destroyed and
                // the hand is holding an id that no longer exists.
                if (inHand === mine) inHand = undefined;
                settle();
              }, ways))(inHand),
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
export function letFall(
  s: Scene,
  items: readonly CarryItem[],
  lift: number,
  hand?: Vec | undefined,
  after?: () => void,
  ways: { card?: LetGo; chip?: LetGo; die?: LetGo } = {},
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
  // A PUTTING-DOWN IS A THING A SLOW HAND DOES. Above the throwing speed even a piece that would
  // have been set down flies instead — a card flicked across the desk is not a card appearing where
  // the finger stopped.
  const speed = hand ? Math.hypot(hand.x, hand.y) : 0;
  const falling = put.filter((n) => thrown(n, speed, ways));
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
  // THE GESTURE IS OVER EVEN WHEN NOTHING FLIES, and it has to say so. The announcement rides the
  // LANDING, which is right for a piece that falls and nothing at all for a piece that only settles:
  // a heap of cards files no flight, so nothing ever lands, so nothing is ever announced — and a
  // scene that redraws anything from the tree (the handles) never hears that the tree moved.
  // ANNOUNCED ONCE NOW — what flew has just left its heap, and what only settles has arrived — and
  // once more when the LAST of them lands.
  //
  // Once, not per landing. Announcing is a whole redraw of the handles: every heap on the desk
  // re-derived (which is every pair of pieces tested against every other), the tree re-notified and
  // the inspector re-walked. Thirty cards landing a few milliseconds apart asked for thirty of
  // those inside half a second, and the desk stopped answering — the drop of a deck HUNG.
  after?.();
  let left = dropped.length;
  for (const { id, feel, walls, delayMs } of dropped) {
    // ITS OWN SHARE OF THE HAND'S SPEED. Not everything leaves a hand at the speed the hand had: a
    // chip stops being pushed the moment it is let go, a card goes where it was sent.
    const flight = hand ? polar({ x: hand.x * feel.throwGain, y: hand.y * feel.throwGain }) : { speed: 0, angle: 0 };
    const body = {
      ...flight,
      ...(feel.friction === undefined ? {} : { friction: feel.friction }),
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
    };
    const piece = byId(s.host.root, id);
    if (piece && feel.fall === "roll") {
      // A DIE LET GO OF ROLLS. Not "a die thrown hard enough rolls" — always, because that is what a
      // die is for, and one that came down flat and lay there would be a counter. The turn is the
      // hand's when the hand gave it one and its own otherwise, so a die simply dropped still goes
      // over. The add-on owns the rest: the face changes as the body travels and the LAST one is
      // the result, shown while there is still a roll left to see it on — and the seat and the face
      // are written into the tree when it stops, which is what `onDone` does for everything else.
      throwDie(m, s.host.root, piece, {
        ...body,
        spin: DIE_SPIN * (Math.sign(hand?.x ?? 0) || 1),
        // Its own drag, steeper than the desk's: a faster roll must not also be a longer one, and
        // the faces are counted off the TURN, so a brisker turn is also a brisker count.
        spinFriction: DIE_SPIN_DRAG,
        // ...and it leaves the felt. A die that only fell out of the hand gives back a hop of two
        // pixels, which is a die that landed rather than one that rolled.
        hop: DIE_HOP,
        outcome: { rng: Math.random },
        onRest: () => {
          if (--left <= 0) after?.();
        },
      });
      continue;
    }
    m.slide(id, {
      ...body,
      // WHERE IT STOPPED IS WHERE IT NOW LIVES, and it has to be written or the piece does not stay
      // there: the seat in the tree is still the point it was let go of, and the reconcile that
      // follows a landing would fly it all the way back to the hand. A flight is a LOOK; the seat is
      // the truth, and the truth is only true once somebody writes it down.
      onDone: (at) => {
        landed(s, id, at);
        if (--left <= 0) after?.();
      },
    });
  }
  return true;
}
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
  // THE SEAT ONLY, never the turn. A flight reports its turn as the resting pose's own plus whatever
  // it spun, and the resting pose of a FACE-DOWN card is a mirror — a matrix a turn is read out of
  // as a half circle, because that is what a mirror looks like to `atan2`. Written back it lands the
  // card upside down. Nothing on this desk turns while it flies except the die, and the die writes
  // its own landing (`throwDie`), so there is no turn here to keep.
  compose(n, Transformable({ ...(own ?? {}), at: at.at }));
}
