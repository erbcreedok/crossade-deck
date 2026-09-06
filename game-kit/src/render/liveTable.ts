// THE LIVE DESK — the one wiring every carrying desk stands on, catalog and product alike.
//
// It lives in the kit because more than one consumer now needs it: the catalog teaches the gestures
// one at a time and on a desk with a rule about its pieces, and a product stands the very same desk
// up with a network behind it. A second copy of this wiring would be a second answer to "what
// happens when a hand lets go", and the two would disagree within a week — which is exactly what
// they did, for as long as there were two.
//
// Everything a consumer can differ by is an option. Everything a consumer CANNOT differ by — that a
// border never loses, that a handle has no physics of its own, that the seat is written before the
// fall is asked for — is stated here once, so a new desk inherits it by existing.
//
// IT HOLDS NO FRAME LOOP (`guard.one-clock`). The camera's throw is stepped by whoever already runs
// frames, handed in as `clock` — the same refusal `wireCamera` makes one file over.

import { wouldAccept } from "../core/atoms/acceptor.js";
import { Coated, NO_COAT, type Coat } from "../core/atoms/coated.js";
import { draggable } from "../core/atoms/draggable.js";
import { facing, setFacing } from "../core/atoms/flippable.js";
import { mark } from "../core/atoms/marked.js";
import { Private } from "../core/atoms/private.js";
import { screened } from "../core/atoms/screened.js";
import { Transformable, type TransformableFields } from "../core/atoms/transformable.js";
import { type Walls } from "../core/ballistic.js";
import { DEFAULT_TUNING, installStockEasings } from "../core/motion.js";
import { byId, caps, compose, fieldsOf, type Node } from "../core/node.js";
import { type Vec } from "../core/transform.js";
import { type ViewerSettings } from "../core/viewer.js";
import { attachMotion, type CarryItem, type Motions } from "./animator/index.js";
import { Camera, type CameraContent, type CameraLimits } from "./camera/index.js";
import { wireCamera } from "./cameraInput.js";
import { unwireDrag, wireDrag } from "./drag.js";
import {
  flickOf,
  letFall,
  mapWalls,
  seatIn,
  stackSeats,
  THROWN_AT,
  toFront,
  type Bump,
  type LetGo,
} from "./fall.js";
import { type GripSpec, GRIP, GRIP_HOLD, GRIP_MISS, isDrawn, isGrip, isMark, isPlaceGrip, regrasp, regrip } from "./grips.js";
import { boxOfDesk, handOver, otherGrips } from "./handover.js";
import { type HeapRule } from "./heaps.js";
import { mount, type Host, type Viewport } from "./host.js";
import { idleReturn, type IdleReturnTracker } from "./idleReturn.js";
import { aimOf, landingPicture, throwGate, zoneFor } from "./landing.js";
import { type Mirror } from "./mirror.js";
import { type Painter } from "./painter.js";
import { type Presence } from "./presence.js";

/** One place at a desk — the shelf's own `seatPlaces(n)` answer, read here without knowing the game. */
export interface SeatPlace {
  readonly at: Vec;
  readonly facing: number;
}

/**
 * THE CARRY WITH THE PHYSICS TAKEN OUT — the piece is exactly where the finger is, at the size it
 * has always been, at the angle it was lying at. Nothing eases, nothing banks, nothing pops.
 *
 * It is the honest floor of the gesture, and it is worth having: everything the carry does beyond
 * following the hand is a CHOICE the kit made, and a reader cannot tell a choice from a law without
 * having seen the thing without it. The position was never a choice — a held thing rides the hand
 * 1:1 either way (`layCarry`), because a lag there reads as a dropped frame rather than as weight.
 */
const NO_PHYSICS = { lift: 1, leanFactor: 0, leanMaxDeg: 0 } as const;

/**
 * A HANDLE HAS NO PHYSICS OF ITS OWN TO HAVE — it IS the grab.
 *
 * The same three fields as `NO_PHYSICS`, and named apart because they are not the same decision: one
 * is a consumer's switch about how carrying a PIECE should feel, and this is a fact about a control.
 * A handle that popped would be the thing you are holding growing in your hand; one that banked
 * would be it leaning out of it. And the pop is a scale about the anchor, so it would drag the whole
 * heap away from the tab as well: the stack must keep the distance from the handle it was drawn at.
 */
const HANDLE_IS_THE_GRAB = {
  /**
   * ...AND WHAT HANGS OFF IT TRAILS. The tab is the hand, exactly and instantly; the stack is being
   * DRAGGED by it, and a stack that arrived rigid would read as a picture of a stack rather than as
   * one. Each card a little further behind the one before it, so the run stretches out like an
   * accordion while the hand moves and closes up the moment it stops.
   *
   * The pop and the bank are NOT switched off here any more. They belong to the pieces — a stack
   * coming off the desk is picked up exactly as one card is, and a desk whose stack alone stayed
   * flat would be saying that a stack is a different kind of thing. What must not pop is the TAB,
   * and that is said on the tab itself (`CarryItem.still`) rather than by flattening the gesture.
   */
  // How much slower the TAIL is than the hand — across the whole run, so a hand of five and a deck
  // of thirty-six stretch the same way and neither comes off its handle like an anchor.
  trail: 2.2,
} as const;

/**
 * A CONTROL, TOLD FROM A PIECE — and told by the one thing that is already true of every control on
 * a desk: it is held at its size on the GLASS (`Screened`) and so was never lying on the felt.
 *
 * A handle is one, an avatar is one, and a seat's own ring is one. What follows is the same sentence
 * twice: there is nothing for a fall to be a fall FROM, so it is not thrown (`onRelease` reads the
 * same atom), and there is no place for it to come down at, so no picture of one is drawn under it.
 * The pop and the bank are already off it one file over — the carry reads this very atom to make a
 * held control `still` (`drag.ts`). It goes where the finger put it and stays there.
 *
 * Read off the atom and never off a name — a desk names its own furniture and the kit parses none of
 * it (`guard.id-is-opaque`).
 */
const isControl = (n: Node): boolean => screened(n);

/**
 * THE BARRIER THAT NEVER LOSES.
 *
 * The kit gives a carry two ways to end AT a wall, and this wiring closes both. SHOVED in hard
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
 * How far a desk may be pushed out and pulled in when nobody says otherwise. Narrow on purpose: a
 * reader who has zoomed to a tenth is looking at a problem no desk on this shelf is about.
 */
const DESK_ZOOM: CameraLimits = { minZoom: 0.5, maxZoom: 2.5 };

/** How long a hand that was throwing has to stay still before it is a hand that has stopped. */
const HAND_AT_REST_MS = 120;

/**
 * IS A HANDLE AMONG WHAT IS BEING HANDED TO A ZONE — asked of `items` as they stand in the tree
 * RIGHT NOW, never of whatever `runOf` drew.
 *
 * An item may have already left the tree by the time a zone is found: the landing picture rides
 * along in `items` (`runOf`'s own `[hit, picture]`) and is removed the moment the release starts
 * (`landingPic.end()`), before this is ever asked. A missing node answers "not a handle" — it is
 * not one — and must not be conjured into an empty-id node just to ask `isGrip` of it, which is a
 * node the model refuses to make at all.
 */
export function isHandleAmong(root: Node, items: readonly CarryItem[]): boolean {
  return items.some((one) => {
    const n = byId(root, one.id);
    return n !== undefined && isGrip(n);
  });
}

/**
 * THE SCREEN THIS DESK IS STANDING ON, as far as the wiring needs to know it.
 *
 * A consumer that already owns a shell — the catalog's, with its panel and its inspector — hands
 * one in and the wiring uses it; one that owns nothing hands in nothing and gets the shell built
 * here. Either way the wiring above is the same wiring, which is the whole point of this file.
 */
export interface LiveStage {
  readonly el: HTMLElement;
  readonly host: Host;
  readonly motions?: Motions;
  readonly camera?: Camera;
  setRoot(next: Node): void;
  dispose(): void;
}

/**
 * A CLOCK THE CAMERA MAY BORROW — the kit runs none of its own (`guard.one-clock`).
 *
 * Called when a fling starts, and the returned function is called when `tick` answers `false`: the
 * view has come to rest and the frames may stop. `dt` is in seconds.
 */
export type LiveClock = (tick: (dt: number) => boolean) => () => void;

/** How a stage gets its renderer — injected, so the kit never reaches for a renderer of its own. */
export type MakePainter = (
  view: HTMLCanvasElement,
  size: { readonly width: number; readonly height: number; readonly resolution: number },
) => Painter;

/**
 * WHAT A DESK WITH ITS OWN LAW ABOUT PIECES SAYS — and only that. A nardy point is not a heap
 * (`stacking`) and not a square (`zones` alone): a checker lifted from a point takes the ones
 * above it, the run stands in a column in the hand, and a die thrown beside the board stays
 * beside it. Three answers, given as data, for a desk that is neither of the two kinds known.
 */
export interface LivePieces {
  readonly runOf?: (root: Node, hit: Node) => readonly Node[];
  readonly offsetOf?: (root: Node, hit: Node, run: readonly Node[]) => readonly Vec[] | undefined;
  readonly wallsOf?: (piece: Node, at: Vec) => Walls | undefined;
  /** Whether this run may be THROWN at all — a column of checkers is set down however fast the hand was. */
  readonly mayThrow?: (items: readonly CarryItem[], root: Node) => boolean;
  /** The desk came to rest after these — a handle can be put back under what it belongs to. */
  readonly settled?: (root: Node, ids: readonly string[]) => void;
}

export interface LiveTableOptions<S extends LiveStage = LiveStage> {
  /**
   * The kit's own carry, or the honest floor with the physics taken out — see `NO_PHYSICS`. Absent,
   * the kit's own: a product asking for a desk asks for the desk the kit believes in.
   */
  readonly physics?: boolean;
  /**
   * How high the hand holds what it has picked up.
   *
   * `lift` absent means "whatever the physics switch says", which is what the first two pages want:
   * the pop is one of the things the switch is switching. A page that is ABOUT the height hands its
   * own number in, and then the height is that number on both settings of the switch — otherwise the
   * `Lift` page would answer "no lift at all" to a reader who turned the physics off on it.
   */
  readonly lift?: number;
  /** Whether a release is a putting-down, a throw, or neither — absent, the wiring's own drop. */
  readonly letGo?: "drop" | "throw";
  /** Whether what is touching what forms a heap with a handle over it (`regrip`). */
  readonly stacking?: boolean;
  /** How wide a handle is drawn and how far off it a finger may still land. */
  readonly grip?: GripSpec;
  /** How each kind of piece leaves the hand — its default, which a fast enough hand overrules. */
  readonly ways?: { card?: LetGo; chip?: LetGo; die?: LetGo };
  /** Whether a tap turns over what it landed on. */
  readonly flipping?: boolean;
  // A PILE HIDES ALL BUT A SLIVER OF WHAT IS UNDER ITS TOP, and a finger that lands on a sliver
  // gets a card nobody was aiming at. Below this much showing a piece does not answer at all: the
  // touch goes to whatever is covering it, and so on up the pile.
  readonly showsEnough?: number;
  // WHAT MAY LIE IN ONE HEAP, as the desk's own answer rather than this file's. Absent, the shelf's
  // original rule: same kind, touching. A desk with a stricter one hands it in, and every line
  // below — the handles, the lift, the squaring-up — reads it instead of knowing it.
  readonly rule?: HeapRule;
  // WHAT TAKES UP ROOM, as the panel's answer rather than the pieces' own. Absent, the desk's own.
  readonly bump?: Bump;
  // WHICH ZONE A RELEASE BELONGS TO. Absent, no release belongs to any — which is what every desk on
  // this shelf said before one of them grew a zone.
  readonly zones?: (root: Node, at: Vec, lead: Node) => Node | undefined;
  // THE OTHER SCREENS ON THIS DESK, if there are any. Absent, this scene is alone with its tree,
  // which is what every page on the shelf but one is.
  readonly mirror?: Mirror<S>;
  /**
   * WHAT ONE UNIT IS WORTH IN PIXELS on this page. Absent, the host's own etalon, which is sized for
   * one scene filling a page — and a page holding two of them stacked shows each a crop of the desk
   * at that size, which is how two areas a reader was told to aim between end up off the glass.
   *
   * A FUNCTION is asked afresh, for a desk whose scale is worked out from the room it has to fit
   * into: told a number, "zoom 1" means one thing to the camera and another to the plan.
   */
  readonly unit?: number | ((root: Node, view: Viewport) => number);
  /**
   * ...AND THE SAME NUMBER TOLD TO THE VIEWER as the HUD etalon. A `Screened` node measures itself
   * against the host's own, and a desk whose camera unit is several times that draws its controls
   * several times too big to make up for it. Only a desk that names its own `unit` can say this.
   */
  readonly hudUnit?: boolean;
  /**
   * DRAW THE PICTURE OF WHERE A LIFTED RUN WILL LAND. Off, and a lifted thing says nothing about
   * where it is going — which is the desk before this feature, and worth turning off once to feel
   * what carrying a hand across a board was like without it.
   */
  readonly landingShown?: boolean;
  /**
   * THE STRETCH THE VIEW IS HELD INSIDE, when this desk is not the shelf's own size.
   *
   * A board has a zone beside it, and a camera told the shelf's stock rectangle holds the view
   * inside one the zone is OUTSIDE of: the view stops at the board's edge with the zone past the
   * wall, reachable by nothing and lookable at by nobody. Absent, the desk's own box, which is
   * every desk but the one with something standing beside its felt.
   */
  readonly room?: CameraContent | ((root: Node) => CameraContent);
  /** Who is acting on this screen (e.g. a seat key like "south" or "p2"). */
  readonly actor?: string;
  /** Viewer settings this screen opens with. */
  readonly viewer?: Partial<ViewerSettings>;
  readonly pieces?: LivePieces;
  /**
   * THE SEAT'S OWN ANGLE, in degrees — a screen looking at the SAME desk from the other side of it.
   *
   * Chess is where this first matters: the black player's board is the white player's, turned, and
   * without this every screen opens looking at it from the white side regardless of who is sitting
   * there. Absent, the camera opens at 0°, which is every other page on the shelf.
   */
  readonly turn?: number;
  /**
   * THE VIEW MOVED, told to the page — for the one desk where where somebody is LOOKING is itself
   * something standing on the felt. Absent, nobody asks, which is every page but that one.
   */
  readonly onView?: () => void;
  /**
   * AN EXTRA GATE ON THE PICK, beside "is it draggable" — the SEAT'S permission.
   *
   * A desk where a place can be shut needs it, and it cannot be answered by the drop: a drop is
   * asked at the end of a gesture, and what a shut hand refuses is the gesture ever STARTING. The
   * usual answer is `grippableBy(n, seat)`; absent, every draggable thing takes every finger, which
   * is every page on the shelf that has no owners.
   */
  readonly may?: (n: Node) => boolean;
  /**
   * THE PAGE'S OWN ANSWER TO A TAP, asked first — `true` means the page took it.
   *
   * The same shape as `onRelease`, for the same reason: a tap means one thing on a card (turn it
   * over) and another on a thing that is not a card, and which of those is a fact about the desk
   * rather than about the gesture. Absent, or answering `false`, and the tap goes on to whatever
   * this scene was already doing with one.
   */
  readonly taps?: (piece: Node) => boolean;
  /**
   * THE DESK CAME TO REST AND THE PAGE HAS SOMETHING TO SAY ABOUT IT.
   *
   * A page whose furniture is DERIVED from the tree — a hand that is the size of what is in it —
   * has to be given the moment to re-derive it, and there is exactly one such moment: after the drop
   * has been written and before the next frame is planned. Absent, nothing asks, which is every page
   * whose desk is the same shape at the end of a gesture as it was at the start.
   */
  readonly onDeskChanged?: (root: Node) => void;
  /**
   * WHAT COUNTS AS THE SAME SORT OF THING IN A HEAP — a piece's heap name, or `""` for one that
   * heaps with nothing. Absent, nothing heaps, which is every desk that does not stack.
   */
  readonly heapKindOf?: (n: Node) => string;
  /** THE BORDER A CARRIED PIECE MAY NOT CROSS. Absent, the desk's own box (`mapWalls`). */
  readonly trayOf?: (root: Node, hit: Node, lift: number) => Walls;
  /** What a handle wears while it IS the landing mark — the desk's own picture, handed in as data. */
  readonly anchorMark?: Coat;
  /** How a `Rollable` piece rolls when it is thrown — the dice add-on's, handed in rather than reached for. */
  readonly onRoll?: (m: Motions, root: Node, piece: Node, opts: any) => void;
  /**
   * THE SHELL THIS DESK STANDS ON, when the consumer already owns one. Absent, it is built here —
   * and then `painter` says what draws it and `clock` says what steps its camera.
   */
  readonly stage?: S;
  readonly painter?: MakePainter;
  readonly clock?: LiveClock;
  /**
   * THE DESK'S OWN LOOK, applied once the shell is up and before anything is drawn — a consumer
   * whose surfaces override the desk's own registers them here.
   */
  readonly look?: () => void;
  /**
   * THE OPENING ZOOM, worked out on the first real glass. Absent, the view opens fitted to the
   * room. Whatever it answers is clamped into the limits, so a wish is never a way out of them.
   */
  readonly open?: (ctx: { readonly root: Node; readonly room: CameraContent; readonly unit: number; readonly view: Viewport }) => number | undefined;
  /** How far the view may zoom, either way. Absent, `DESK_ZOOM`. */
  readonly limits?: CameraLimits;
  /**
   * WHERE THE SEATS ARE, and whether a view left idle drifts back to the one this screen sits at.
   *
   * `places` is the shelf's own `seatPlaces(n)`; `mine` says which of them is THIS screen's own —
   * the seat the idle glide returns to, read the same way `turn` reads which side a screen is
   * looking at the desk from. Absent, no seat is minded and an idle view simply stays wherever a
   * reader left it, which is every desk that does not know who is sitting where.
   *
   * THE COUNTDOWN IS THE CONSUMER'S CLOCK, not this file's (`guard.one-clock`, see the file header):
   * `liveTable` wires `input()` on its own gestures — a pick, a carry — but a clock that must keep
   * counting while the view is dead still cannot be the same one the camera sleeps whenever nothing
   * is moving (see `wireCamera`'s own idle sleep). So `step` is left on the returned `idle` handle for
   * whoever already runs a heartbeat to call, exactly as `clock` is handed in for a fling.
   */
  readonly seats?: {
    readonly places: readonly SeatPlace[];
    readonly mine: number;
    /**
     * WHERE MY OWN PLACE IS NOW, on a desk where a place can be MOVED — its owner drags their chair
     * and the view has to come home to where it went, not to where it opened. Absent, `places[mine]`
     * stands for ever, which is every desk whose seats are geometry.
     */
    readonly placeNow?: () => SeatPlace | undefined;
    /** Absent, the idle glide's own defaults (6000ms/600ms). `false` turns it off. */
    readonly idleReturn?: { readonly afterMs?: number; readonly glideMs?: number } | false;
  };
}

/** A live desk, and the two things a consumer outside this file still has to do to it. */
export interface LiveTable {
  readonly el: HTMLElement;
  readonly host: Host;
  readonly motions?: Motions | undefined;
  readonly camera?: Camera | undefined;
  /**
   * THE IDLE GLIDE, when `seats` named one — absent otherwise. `input()` is already wired to this
   * screen's own gestures (a pick, a carry); a consumer with a persistent heartbeat calls `step(dtMs)`
   * on it, and one with a further pan/zoom wiring of its own (a scene the kit was not handed, see
   * `stage`) calls `input()` on that too, exactly as it would tell the kit about any other gesture.
   */
  readonly idle?: IdleReturnTracker | undefined;
  /**
   * Show a different tree on this desk. `"me"` is this screen's own change and is announced to the
   * others (`Mirror.changed`); `"net"` is a change that arrived FROM them — announced back, it
   * would echo round the room forever, and the handles are re-READ rather than redrawn (`regrasp`),
   * so a tab this screen's finger is on is never pulled out from under it mid-gesture.
   */
  setRoot(next: Node, from: "me" | "net"): void;
  stop(): void;
}

/**
 * The one wiring every live desk stands on — consumers differ by their options, and by nothing else.
 */
export function liveTable<S extends LiveStage = LiveStage>(
  container: HTMLElement,
  desk: Node,
  opts: LiveTableOptions<S> = {},
): LiveTable {
  const {
    physics = true,
    lift,
    letGo,
    stacking = false,
    grip = { w: GRIP.w, miss: GRIP_MISS, ...GRIP_HOLD },
    ways = {},
    flipping = false,
    showsEnough = 0,
    rule,
    bump,
    zones,
    mirror,
    landingShown = true,
    actor,
    pieces,
    may,
    taps,
    onDeskChanged,
    heapKindOf,
    trayOf,
    anchorMark,
    onRoll,
    seats,
  } = opts;

  // THE DESK'S OWN LOOK, before a single frame: a surface registered after the first draw is a
  // desk that flickers into its own clothes.
  opts.look?.();

  // THE HEAPS AS THEY STAND, by the handle that lifts each — rebuilt whenever anything moves, since
  // that is the only time the answer can have changed.
  let heaps = new Map<string, readonly Node[]>();
  /** The handle a finger has hold of right now, if any — see `regrip`'s `keep`. */
  let inHand: string | undefined;
  /**
   * THE PLACE THIS RUN WAS LIFTED OUT OF, for as long as the gesture lasts.
   *
   * A zone that reaches for a card it just gave up is a zone nothing can be taken out of. Pull a
   * card clear and let go: you are still within its pull — you always are, that is what a pull IS —
   * and it takes the card straight back. With two areas near each other the card simply hops from
   * one to the other and there is no way on the desk to put it down anywhere else.
   *
   * So the place a run CAME from does not take it back in the same gesture. Everything else still
   * does, including that same place on the next one — this is about a gesture, not a grudge.
   */
  let liftedFrom: Node | undefined;
  /**
   * THE RUN AS THE HAND IS HOLDING IT — ids AND the offset each stands at, for as long as the
   * gesture lasts.
   *
   * Kept because the wiring's own report of a moving hand names only the ids, and a screen mirroring
   * it needs the shape too: without the offsets every piece goes to the anchor and a deck arrives as
   * one card.
   */
  let carried: readonly CarryItem[] = [];
  /**
   * WHERE THIS RELEASE IS AIMED, for as long as the release lasts.
   *
   * The wiring asks a zone about the point the finger came up at, and a throw is not aimed at that
   * point — it is aimed at where it will come to rest. The two questions are asked a few lines apart
   * inside one synchronous release, so the answer is worked out once and read once; it is cleared
   * with the gesture, and outside one it is nothing at all.
   */
  let aimed: Vec | undefined;

  // A BOX AND NOT A DIRECT CALL: a stage of its own is built below, before the idle tracker can
  // exist (it needs the camera THAT BUILD hands back) — so its `onView` is wired to whatever this
  // box holds by the time a pan or a pinch actually fires it, filled in a few lines further down.
  const idleOnPan: { current?: () => void } = {};
  const built =
    opts.stage ??
    (buildStage(container, desk, {
      ...opts,
      onView: () => {
        idleOnPan.current?.();
        opts.onView?.();
      },
    }) as unknown as S);
  const own = opts.stage ? undefined : (built as unknown as BuiltStage);
  /**
   * THE IDLE GLIDE, standing on THIS screen's own camera and THIS screen's own seat — see `seats`.
   * A stub `Presence` carries only what `idleReturn` reads off it (`place`); the rest of the shape
   * is never asked, so it is never worth threading a whole presence in just to build one.
   */
  const mySeat = (): SeatPlace | undefined => seats?.placeNow?.() ?? seats?.places[seats.mine];
  // BUILT WHENEVER THERE IS A SEAT TO GO HOME TO, and not only when the countdown is armed: `false`
  // turns off the WAITING, not the place — a tap on one's own ring still asks to be taken back to
  // it (`goHome`), and a tracker that did not exist would make one knob silently disable two things.
  const idle: IdleReturnTracker | undefined =
    seats && mySeat() && built.camera
      ? idleReturn(
          built.camera,
          // ASKED EVERY STEP and never remembered: a place is draggable, and a home read once at
          // build time would bring the eye back to a chair its owner has since got up from.
          (): Presence | undefined => {
            const place = mySeat();
            if (!place) return undefined;
            return {
              seat: "",
              place,
              name: "",
              ink: "accent",
              state: "online",
              holding: false,
              view: { target: { x: 0, y: 0 }, zoom: 1, rotation: 0, glass: { w: 0, h: 0 } },
            };
          },
          seats.idleReturn === false ? { afterMs: Infinity } : (seats.idleReturn ?? {}),
        )
      : undefined;
  // ANY POINTER DOWN ON THIS GLASS IS AN INPUT, whatever it lands on: a pan across bare felt starts
  // with the same event a pick does, and a countdown that only heard about a successful grab would
  // glide the view away from underneath a reader who has their finger on it but has not moved yet.
  if (idle) built.el.addEventListener("pointerdown", () => idle.input(), true);
  // How high the hand is actually holding it, once the switch and the consumer have both had their say.
  const held = lift ?? (physics ? DEFAULT_TUNING.lift : 1);
  const landingPic = landingPicture(built, { shown: landingShown, onChange: () => mirror?.changed() });
  /** What is in the air or in a hand — never in a heap, on any screen. */
  const airborne = (): ((id: string) => boolean) => {
    const inTheHand = inHand ? heaps.get(inHand) : undefined;
    return (id: string): boolean =>
      (built.motions?.busy(id) ?? false) || (inTheHand?.some((n) => n.id === id) ?? false);
  };

  /**
   * READ THE HANDLES SOMEBODY ELSE DREW. A screen that did not draw them must not redraw them —
   * `regrip` throws every tab away and makes it afresh, so a second screen doing that destroys the
   * very tab the first screen's finger is about to land on.
   */
  const grasp = (): void => {
    if (!stacking || !heapKindOf) return;
    heaps = regrasp(built.host.root, heapKindOf, airborne(), rule);
    built.host.setRoot(built.host.root);
  };

  /** Redraw the handles for whatever is touching now, and show them. */
  const settle = (): void => {
    // FIRST, and whatever else this desk is: a consumer that re-derives its own furniture must do it
    // before anything reads the tree again, or one frame is drawn against the shape it just left.
    onDeskChanged?.(built.host.root);
    // WHAT THE CLOCK IS CARRYING IS NOT IN A HEAP. A thrown card is in the air, not lying on the
    // felt, and a handle that still counted it would pull it back out of its own flight the moment
    // somebody took the stack again — the piece has to leave the heap when it leaves the desk. What
    // a HAND is carrying is not lying there either, for the same reason.
    if (stacking && heapKindOf) {
      const inTheHand = inHand ? heaps.get(inHand) : undefined;
      const aloft = (id: string): boolean =>
        (built.motions?.busy(id) ?? false) || (inTheHand?.some((n) => n.id === id) ?? false);
      heaps = regrip(built.host.root, heapKindOf, grip, aloft, inHand, rule);
      // The held handle keeps its own run: it was taken with those pieces and it puts down those
      // pieces, whatever the desk has rearranged itself into meanwhile.
      if (inHand && inTheHand) heaps.set(inHand, inTheHand);
    }
    // A GESTURE JUST ENDED ON THIS DESK, whatever shape it is — a heap regripped above, a mark this
    // touch wrote (`fall.ts`), a plain seat a card was let go at. Every one of those is a tree change
    // the other screens have not seen: told only here, or a desk with no heaps and no derived
    // furniture (a plain live map) never resyncs its partner after a drop at all.
    built.host.setRoot(built.host.root);
    // ...AND SO DOES EVERY OTHER SCREEN LOOKING AT THIS DESK. One tree, several hosts: a change made
    // here is a change to the board they are all reading, and a host is only ever told by being told.
    mirror?.changed();
  };
  /**
   * HOW WIDE THE DESK IS THROUGH THIS GLASS, in root units — the room a hand held up has.
   *
   * Read off the view every time it is asked, never captured: a reader who zooms out has more room
   * and one who zooms in has less, and a hand measured once at load would be answering about a
   * screen that is no longer there.
   */
  const seenWide = (): number => {
    const px = built.host.viewport().width;
    const scale = glassScale();
    return scale > 0 ? px / scale : (boxOfDesk(built.host.root)?.w ?? 0);
  };
  /**
   * PIXELS PER UNIT RIGHT NOW — what one unit of desk is worth on this glass at this zoom, and the
   * one number that turns a gesture into a distance.
   *
   * Read every time it is asked and never captured: the reader zooms between one gesture and the
   * next, and a number taken once at load would be answering about a view that is no longer there.
   */
  const glassScale = (): number => {
    const view = built.camera?.transform();
    return view ? Math.hypot(view.a, view.b) : built.host.unit();
  };

  /**
   * ONE ID, AS THE THING THE HAND HAS HOLD OF — for the desk that writes no `carried` of its own.
   *
   * `still` and not a bare id, because the far screen is drawing this too: a control takes no pop
   * and no bank on THIS screen (`drag.ts` reads the atom at the pick), and told nothing about it the
   * other screen picked the same ring up with a card's physics — a seat's ring that swelled and
   * leaned on the partner's desk while standing quietly on its owner's. See `isControl`.
   */
  const inTheHand = (id: string): CarryItem => {
    const n = byId(built.host.root, id);
    return { id, offset: { x: 0, y: 0 }, ...(n && isControl(n) ? { still: true } : {}) };
  };

  const flickVector = (v?: Vec): Vec | undefined =>
    letGo === "throw" ? flickOf(v, glassScale(), built.motions?.tuning().friction ?? 0) : undefined;
  const wouldFly = (v?: Vec): boolean => flickVector(v) !== undefined;
  /**
   * WHETHER THE HAND IS THROWING RIGHT NOW — with a memory, so the picture does not flicker.
   *
   * The throw threshold is one number and the hand crosses it many times in a single carry. Read
   * bare, the landing picture blinked at the threshold; worse, the first crossing used to take the
   * picture OFF THE DESK for good, because hiding was implemented as ending the gesture's picture —
   * a hand that sped up for a moment and then set the card down carefully saw no picture at all,
   * and the next carry looked "broken" for the same reason. So: the hand is throwing from the
   * moment it would fly, and is not throwing again only once it has slowed to half the threshold.
   */
  let rest: ReturnType<typeof setTimeout> | undefined;
  const throwingNow = throwGate(wouldFly, THROWN_AT / 2);

  /**
   * THE ZONE THIS CARRY WOULD BE HANDED TO IF THE HAND LET GO NOW — asked exactly as the release
   * asks it, down to the refusal to hand a run back to the place it was lifted out of.
   */
  const zoneAimed = (ids: readonly string[], at: Vec): Node | undefined => {
    // WHAT THE HAND IS ACTUALLY HOLDING. `carried` is written by a desk that stacks, and carries the
    // seats a run stands in; a desk without stacking never writes it, and the wiring's own list of
    // ids is the whole of what is in the hand there. Only the ids and the seats are read either way.
    const run = carried.length > 0 ? carried : ids.map(inTheHand);
    // THE ANCHOR'S OWN POINT, which is where the hand is: a carry is anchored ON the thing the hand
    // has hold of, so `at` is the tab's point for a run carried by its tab and the piece's own for a
    // run of one. Nothing to add and nothing to look up.
    return ((z) => (z && z === liftedFrom ? undefined : z))(zoneFor(built, run, zones, at));
  };
  rule?.tune?.(built.host.root);
  mirror?.ready(built, grasp);
  settle();
  const el = wireDrag(built, {
    ...(built.camera ? { view: () => built.camera!.transform() } : {}),
    // MY HAND, TOLD TO THE OTHER SCREENS — with its FEEL, or it is not the same hand over there —
    // and the picture of where it lands, moved under it.
    onCarry: ({ ids, at, done, feel, swing }) => {
      // A CARRY IS INPUT TOO — the same reason the pointerdown listener above exists: a reader whose
      // hand is on a piece must not have the view glide out from under it mid-gesture.
      idle?.input();
      // WHAT THE HAND IS ACTUALLY HOLDING. `carried` is written by a desk that stacks; a desk without
      // stacking never writes it, and told an empty run the far screen showed a cursor gliding about
      // and the piece standing perfectly still — which is what the board did. The wiring's own list
      // of ids is the whole of what is in the hand there.
      mirror?.hand(carried.length > 0 ? carried : ids.map(inTheHand), at, done, feel);
      // ...AND THE PICTURE OF WHERE IT LANDS GOES WHERE THAT IS — asked by the very question that
      // lights the zone, so the light and the picture can never say two different things.
      // A FINGER THAT RESTS EMITS NOTHING. The hand is judged on every move, and a hand that flew
      // and then stopped dead makes no move to be judged on: the last word was "throwing", and the
      // picture stayed off the desk for as long as the finger stayed still — which on a phone is
      // most of a careful drop. So a hide sets ONE deadline, cleared by the next move; a hand that
      // is still when it fires has stopped throwing, whatever its last speed said.
      if (rest !== undefined) clearTimeout(rest);
      rest = undefined;
      if (done) {
        throwingNow(undefined);
        landingPic.end();
      } else if (throwingNow(swing)) {
        landingPic.hide();
        rest = setTimeout(() => {
          rest = undefined;
          throwingNow(undefined);
          if (landingPic.current) landingPic.show(at, zones ? zoneAimed(ids, at) : undefined, feel, carried);
        }, HAND_AT_REST_MS);
      } else {
        landingPic.show(at, zones ? zoneAimed(ids, at) : undefined, feel, carried);
      }
    },
    // ...AND THE ZONE MY HAND IS OVER, TOLD TO ME. The wiring lights it; what it asks is this, and
    // it is the same question the release answers — down to refusing to hand a run back to the
    // place it was lifted out of, so a card being pulled OUT of an area never glows to go back in.
    ...(zones ? { aimAt: (_root: Node, ids: readonly string[], at: Vec) => zoneAimed(ids, at) } : {}),
    // A PILE HIDES ALL BUT A SLIVER OF WHAT IS UNDER ITS TOP, and a finger that lands on a sliver
    // gets a card nobody was aiming at. Below this much showing a piece does not answer at all: the
    // touch goes to whatever is covering it, and so on up the pile.
    ...(showsEnough > 0 ? { showsEnough } : {}),
    // A HANDLE LIFTS THE HEAP IT STANDS UNDER, and itself with it — left behind, the tab would hang
    // over felt the heap has walked away from. Anything else lifts alone, which is the whole of
    // "pull a card out of the heap instead of the heap".
    ...(stacking
      ? {
          // THE FINGER IS THE HOLDER on a desk that lifts what it takes. The load hangs clear of it
          // (`CARRY_CLEAR`), so there is nothing left for the grab offset to protect — and with it,
          // the picture of the landing sat wherever the finger happened to touch the card rather
          // than under the finger doing the aiming.
          underFinger: true,
          runOf: (_root: Node, hit: Node) => {
            // Remembered for as long as the gesture lasts, so nothing redraws the tab in the hand.
            inHand = isGrip(hit) ? hit.id : undefined;
            if (!isGrip(hit)) {
              liftedFrom = hit.parent && caps(hit.parent).has("Acceptor") ? hit.parent : undefined;
              // A CONTROL IS CARRIED BARE — see `isControl`. Nothing is drawn under it and nothing
              // is arranged around it: the run is the one thing the finger has hold of.
              if (isControl(hit)) {
                liftedFrom = undefined;
                landingPic.end();
                return [hit];
              }
              // A CARD LIFTED ALONE GETS ONE TOO. It is the same question — where will this be when
              // I let go — and a hand carrying one card in the air is no better placed to answer it
              // than a hand carrying thirty-six: the card is lifted, so it is drawn bigger and
              // higher than it will lie.
              landingPic.end();
              const alone = landingPic.mark([hit], [{ x: 0, y: 0 }], seatIn(hit));
              return alone ? [hit, alone] : [hit];
            }
            // ...AND IT BECOMES THE LANDING MARK for as long as the run is up. The tab takes no
            // lift, so it is already travelling flat on the felt at the very point the run will
            // come down on; all it needs is to look like a target rather than like the control it
            // was a moment ago. Nothing to undo: `settle` throws every handle away and draws the
            // next ones fresh, so the mark goes when the gesture does.
            if (anchorMark) compose(hit, Coated({ self: anchorMark, cast: NO_COAT }));
            // ...AND EVERY OTHER TAB GOES DARK. A hand that is holding one cannot take another, so
            // the rest are controls that answer nothing: left on the felt they are clutter under a
            // moving hand, and clutter around a control is exactly what made this one hard to catch.
            //
            // NOT ON A DESK WITH OTHER HANDS ON IT. "You cannot take another" is true of a hand, not
            // of a board: somebody else's finger may be on its way to one of those tabs right now,
            // and the tree they would take it out of is the same tree. So a shared desk keeps them.
            //
            // Nothing to undo: `settle` throws every handle away and draws the next ones fresh.
            if (!mirror) for (const other of otherGrips(built.host.root, hit)) compose(other, Private({ access: [] }));
            const run = heaps.get(hit.id) ?? [];
            const owner = run[0]?.parent;
            liftedFrom = owner && caps(owner).has("Acceptor") ? owner : undefined;
            // A PLACE POSES WHAT IT LIFTS, and it poses it as the run leaves the desk — the same
            // moment the stack squares up, and for the same reason: a hand closing on a row of cards
            // splays them, it does not carry a row about and splay it on arrival.
            //
            // Written into the tree rather than applied by the carry, because a drop leaves a piece
            // as it was: the fan has to be the card's OWN pose by then, or putting it down would
            // straighten it. Which is also why the turn is data the desk hands over and never a
            // number read back off a carried pose — that pose has the card's mirror composed into it.
            // THE PICTURE OF WHERE THIS LANDS, handed to the hand as one more thing it is carrying.
            // No lift, so it stays on the felt; seated where the run's first card will stand, so it
            // IS the answer rather than a hint at it. It follows the finger for free — a carry is an
            // override, and an override costs the tree nothing while the hand is moving.
            landingPic.end(); // whatever the last gesture left, if anything ever does
            const drawnMark = landingPic.mark(run, stackSeats(run, grip.w), seatIn(hit));
            const posed = isPlaceGrip(hit) ? rule?.fan?.(run, grip.w, seenWide()) : undefined;
            posed?.forEach((seat, i) => {
              const piece = run[i];
              if (!piece) return;
              const ownFields = fieldsOf<TransformableFields>(piece, "Transformable");
              compose(piece, Transformable({ ...(ownFields ?? {}), angle: seat.deg }));
            });
            return drawnMark ? [hit, ...run, drawnMark] : [hit, ...run];
          },
          // The tab and the landing mark are the desk's own pictures: no lift and no lean, so both
          // stay the size they will be and lie flat while the cards ride at the hand's height.
          stillOf: (_root: Node, _hit: Node, run: readonly Node[]) => run.map((n) => isDrawn(n)),
          // ...AND THE HEAP IS SQUARED UP AS IT COMES OFF THE DESK, not when it is put down. The
          // handle is the anchor, so the stack hangs off the finger exactly where the tab was.
          offsetOf: (_root: Node, hit: Node, run: readonly Node[]) => {
            if (!isGrip(hit)) {
              // A card and, when there is one, the picture of where it will land — which stands at
              // the card's own landing spot, so its offset from the hand is nothing at all.
              carried = run.map((n) => ({ id: n.id, offset: isDrawn(n) ? { x: 0, y: 0 } : (landingPic.current?.hover ?? { x: 0, y: 0 }), still: isDrawn(n) }));
              return carried.map((it) => it.offset);
            }
            const under = run.slice(1).filter((n) => !isDrawn(n));
            const posed = isPlaceGrip(hit) ? rule?.fan?.(under, grip.w, seenWide()) : undefined;
            const hover = landingPic.current?.hover ?? { x: 0, y: 0 };
            const seatsHeld = (posed ? posed.map((s) => s.at) : (rule?.seats ?? stackSeats)(under, grip.w)).map((seat) => ({
              x: seat.x + hover.x,
              y: seat.y + hover.y,
            }));
            const seats = [{ x: 0, y: 0 }, ...seatsHeld, ...(landingPic.current ? [landingPic.current.seat] : [])];
            // ...and remembered as the hand is holding it, so another screen can lay it out the same.
            carried = run.map((n, i) => ({ id: n.id, offset: seats[i] ?? { x: 0, y: 0 }, still: isDrawn(n) }));
            return seats;
          },
          feelOf: (_root: Node, hit: Node) => (isGrip(hit) ? HANDLE_IS_THE_GRAB : undefined),
          // AFTER the tree has been written, never at the carry's `done`: at `done` the drop has
          // not been decided yet, so the handles would be redrawn from the seats the pieces had
          // before they were put down — a tab under the heap that used to be there.
          onSettled: (root: Node, ids: readonly string[]) => {
            // Once per gesture and synchronously with its drop, so there is no staleness to guard.
            inHand = undefined;
            // The aim and the place it came from belong to the gesture that made them.
            aimed = undefined;
            liftedFrom = undefined;
            // WHAT WAS JUST PUT DOWN GOES ON TOP, and it does not move to get there: a card let go
            // of over a heap is lying ON the heap, not under it, and the only thing that says which
            // is the order they are drawn in. It is also the order they will stand in when the
            // handle lifts them, so the newest is at the FRONT of the stack — which is the same
            // sentence a player would say about a real one.
            for (const id of ids) {
              const piece = byId(root, id);
              if (piece) toFront(piece);
            }
            // ...AND A PLACE HAS THE LAST WORD ON WHAT IT TOOK. A drop leaves pieces as they were,
            // fan and all; a place re-poses them, because how its things lie is its own business.
            rule?.settled?.(root, ids);
            settle();
          },
        }
      : {}),
    // ...and the wall is the DESK'S edge. A desk that named its own room is a desk that is not the
    // shelf's stock size, and its felt reaches wherever its own box says it does.
    ...(!stacking && pieces?.runOf
      ? {
          // A RUN THE DESK NAMES, carried the way the desk says, with the picture of its landing
          // under it — the same three hooks the stacking desk answers with heaps and handles,
          // answered here with the desk's own data.
          runOf: (root: Node, hit: Node) => {
            const run = pieces.runOf!(root, hit);
            // BACK ONTO THE SAME PLACE IS A MOVE HERE. A run of cards is never handed back to the
            // hand it was lifted out of (`liftedFrom`); a column of checkers set down on the point
            // it came from is simply on that point again, and the wiring puts it back for us.
            liftedFrom = undefined;
            landingPic.end();
            // A CONTROL IS CARRIED BARE — see `isControl`.
            if (isControl(hit)) return [...run];
            const lead = run[0];
            const seats = pieces.offsetOf?.(root, hit, run) ?? run.map(() => ({ x: 0, y: 0 }));
            const drawnMark = lead ? landingPic.mark(run, seats, seatIn(lead)) : undefined;
            return drawnMark ? [...run, drawnMark] : [...run];
          },
          stillOf: (_root: Node, _hit: Node, run: readonly Node[]) => run.map((n) => isDrawn(n)),
          offsetOf: (root: Node, hit: Node, run: readonly Node[]) => {
            const hover = landingPic.current?.hover ?? { x: 0, y: 0 };
            const theirs = run.filter((n) => !isDrawn(n));
            const seats = (pieces.offsetOf?.(root, hit, theirs) ?? theirs.map(() => ({ x: 0, y: 0 }))).map((seat) => ({ x: seat.x + hover.x, y: seat.y + hover.y }));
            // BY THE RUN'S OWN ORDER, whatever is in it: a handle rides at the anchor, the landing
            // picture at its seat, and the pieces take the desk's seats in turn. Laid out as one
            // list of pieces-then-picture, a run led by a handle had every seat one piece off.
            const all = run.map((n) => (isMark(n) ? (landingPic.current?.seat ?? { x: 0, y: 0 }) : isDrawn(n) ? { x: 0, y: 0 } : seats[theirs.indexOf(n)] ?? { x: 0, y: 0 }));
            carried = run.map((n, i) => ({ id: n.id, offset: all[i] ?? { x: 0, y: 0 }, still: isDrawn(n) }));
            return all;
          },
          onSettled: (root: Node, ids: readonly string[]) => {
            inHand = undefined;
            aimed = undefined;
            liftedFrom = undefined;
            for (const id of ids) {
              const piece = byId(root, id);
              if (piece) toFront(piece);
            }
            pieces.settled?.(root, ids);
            settle();
          },
        }
      : {}),
    ...(may ? { may } : {}),
    // THE ORDINARY DROP'S OWN ENDING, for the desk that neither stacks nor names its own runs.
    // Both of those answer `onSettled` themselves above — and this one always does too, `onDeskChanged`
    // or not: a plain desk still owes its mirror a `settle()` once the drop is written, or a mark
    // this touch just earned (`fall.ts`) sits in the tree with nobody else ever told to look again.
    ...(!stacking && !pieces?.runOf
      ? {
          onSettled: () => {
            inHand = undefined;
            aimed = undefined;
            liftedFrom = undefined;
            settle();
          },
        }
      : {}),
    // THE MAP'S BORDER IS A WALL, and the piece is inside it for the whole gesture — see
    // `NEVER_THROUGH`. The height is handed in because the wall is the DRAWN edge of the piece:
    // raise a piece and it is wider, and a border that ignored that would let the difference out.
    trayOf: (root: Node, hit: Node) =>
      trayOf
        ? trayOf(root, hit, isGrip(hit) ? 1 : held)
        : mapWalls(hit, isGrip(hit) ? 1 : held, opts.room ? boxOfDesk(root) : undefined),
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
            if (taps?.(piece)) return;
            built.motions?.flip(piece.id, () => {
              setFacing(piece, facing(piece) === "up" ? "down" : "up");
              if (actor) {
                mark(piece, { by: actor, mark: "flipped" });
              }
              built.host.setRoot(built.host.root);
              mirror?.changed();
            });
          },
        }
      : {}),
    // A consumer that DROPS or THROWS takes the release over: the ordinary one puts the piece down
    // where the finger was, and putting down is the thing those consumers say is not what happens.
    // A throw is a drop with the hand's speed still on it — one call, and the piece falls from the
    // hand's height WHILE it travels, which is what a thrown thing does.
    // A ZONE IS ASKED WHERE THE PIECE IS DRAWN, not where the finger is: the finger may be outside
    // the border the carry clamped the piece to, and it is the PIECE a zone is taking.
    ...(zones
      ? {
          zoneAt: (root: Node, at: Vec, lead: Node) => {
            const zone = zones(root, aimed ?? at, lead);
            // ...BUT NOT BACK WHERE IT CAME FROM. See `liftedFrom`.
            return zone && zone === liftedFrom ? undefined : zone;
          },
        }
      : {}),
    ...(letGo
      ? {
          onRelease: (v: Vec | undefined, items: readonly CarryItem[]) => {
            // THE HAND HAS LET GO, AND THE OTHER SCREENS ARE TOLD SO HERE.
            //
            // The wiring reports a finished carry from inside its own drop, and a release the scene
            // TAKES never reaches that line — a throw, or a zone taking a hand, returns `true` and
            // the drop is skipped entirely. Left to the wiring, the far screen goes on holding a
            // card that was thrown a minute ago: lifted, leaning, following a finger that let go.
            //
            // Said first, before anything is decided, because it is true either way: whatever
            // happens next, the hand is off. Where the card ENDS UP arrives separately, as the tree
            // change that every screen is told about (`changed`).
            mirror?.hand(items, undefined, true, {});
            // THE PIECES, AND NOT THE PICTURE OF WHERE THEY LAND. The landing mark rides the carry
            // like a handle does, so it arrives here in `items` — and a fall that asked the clock
            // for ITS pose found none and gave the whole release back to the ordinary drop. Which
            // is how every throw on the shelf turned into a putting-down the day the mark appeared:
            // not the threshold, not the speed, one picture in the list. Read now, before the
            // picture is taken off the desk below and can no longer be told from a piece.
            const falling = items.filter((one) => {
              const n = byId(built.host.root, one.id);
              return n !== undefined && !isMark(n) && !screened(n);
            });
            // HOW FAR THE LOAD WAS HANGING, read BEFORE the picture is taken off the desk: the
            // landing is the picture's place, so the number that says where the picture WAS is the
            // number the landing needs — and taking the picture away first threw it away with it.
            const drop = landingPic.current?.hover ?? { x: 0, y: 0 };
            // ...AND THE PICTURE OF WHERE IT LANDS GOES WITH THE GESTURE. A release the scene TAKES
            // never reaches the wiring's own drop, so the carry's `done` never comes: left to that,
            // the last thing the reader sees is a ghost of a stack standing on empty felt.
            landingPic.end();
            // A CONTROL IS NOT THROWN AND IS NOT PUT INTO A ZONE. A node held at its size on the
            // glass was never lying on the felt to be picked off it (`Screened`), so there is
            // nothing for a fall to be a fall FROM: it stays exactly where the hand let go, and the
            // release is handed back to the ordinary drop, which writes that very seat and settles
            // on it. Given to the fall instead, an avatar left the finger at the hand's own speed
            // and came down half a desk away.
            if (falling.length === 0) return false;
            // ...and the place it came from belongs to the gesture that is now over. Cleared FIRST,
            // so nothing below can read a lift that has already ended.
            const cameFrom = liftedFrom;
            liftedFrom = undefined;
            // A THROW IS AIMED TOO. Asked where the piece was LET GO of, a magnet catches only what
            // was carried over and set down — and a card flicked at somebody's area is aimed just as
            // plainly. So the zone is asked about where the throw will come to REST (`restsAt`),
            // which is arithmetic and not a guess.
            // THE FINGER'S OWN SPEED, measured where the finger is and turned into a throw exactly
            // once. `v` arrives in GLASS PIXELS PER SECOND — not a number read off the carry's
            // springs and multiplied back by the zoom to undo the division that put it there. Above
            // this line everything is the gesture; below it, everything is the desk (`flickOf`).
            // A RUN THE DESK WILL NOT LET FLY is let go of as if the hand had stopped: no swing, so
            // it comes down where it is. The hand's speed is not a lie, it is simply not for this.
            const swing = pieces?.mayThrow && !pieces.mayThrow(items, built.host.root) ? undefined : flickVector(v);
            aimed = aimOf(built, items, swing, ways, bump);
            // A ZONE GETS FIRST REFUSAL. Falling and being taken are two different endings, and a
            // desk that had both would otherwise always fall: this runs BEFORE the drop is decided,
            // so a fall filed here is a fall the zone never gets to see. Answering `false` hands the
            // release back to the ordinary path, which is where zones live — and the piece is taken
            // the moment it leaves the finger rather than flown there and pulled back.
            const zone = ((z: Node | undefined) => (z && z === cameFrom ? undefined : z))(
              zoneFor(built, items, zones, aimed),
            );
            if (zone) {
              // A RUN LED BY A HANDLE IS HANDED OVER HERE; anything else the wiring re-parents
              // itself, with its accept rules and its displacement, which is where that belongs.
              //
              // A DESK WITH ITS OWN RUNS hands the whole column over — unless the place refuses it,
              // and then the wiring's own drop is left to send the column home.
              if (pieces?.runOf) {
                const lead = byId(built.host.root, items[0]?.id ?? "");
                if (!lead || !wouldAccept(zone, lead)) return false;
              } else if (!isHandleAmong(built.host.root, items)) return false;
              handOver(built, zone, items);
              rule?.settled?.(built.host.root, items.map((one) => one.id));
              inHand = undefined;
              aimed = undefined;
              settle();
              return true;
            }
            // WHOSE HANDLE THIS WAS, remembered for the length of the fall. `settle` runs again on
            // every landing, which can be a second later — by then another gesture may have a
            // different handle in hand, and a stale callback clearing that would destroy the tab
            // under the live finger and leave the hand holding an id that no longer exists.
            const mine = inHand;
            return letFall(
              built,
              falling,
              held,
              swing,
              () => {
                if (inHand === mine) inHand = undefined;
                // A PLACE HAS THE LAST WORD HERE TOO. The wiring announces a drop it decided itself
                // (`onSettled`); a release the scene took never reaches that line at all, and a rule
                // that only ran on the wiring's path would re-pose a card dealt in one at a time and
                // leave every hand ever put back exactly as the hand had splayed it.
                rule?.settled?.(built.host.root, falling.map((it) => it.id));
                pieces?.settled?.(built.host.root, falling.map((it) => it.id));
                settle();
              },
              ways,
              bump,
              drop,
              onRoll,
              pieces?.wallsOf,
            );
          },
        }
      : {}),
  }).el;

  return {
    el: built.el,
    host: built.host,
    ...(built.motions ? { motions: built.motions } : {}),
    ...(built.camera ? { camera: built.camera } : {}),
    ...(idle ? { idle } : {}),
    setRoot(next: Node, from: "me" | "net") {
      if (from === "net") {
        // THE TABS IN A TREE THAT ARRIVED ARE WHICHEVER SCREEN MADE THE CHANGE'S OWN, already
        // sitting in it — `regrasp` only relabels which pieces each already holds, so a tab this
        // screen's finger is on is never pulled out from under it mid-gesture.
        built.host.setRoot(next);
        grasp();
        return;
      }
      built.host.setRoot(next);
      mirror?.changed();
    },
    stop() {
      if (rest !== undefined) clearTimeout(rest);
      unwireDrag(el);
      own?.stop();
      built.dispose();
    },
  };
}

/** What `buildStage` hands back beside the stage itself: the wiring only it knows how to undo. */
interface BuiltStage extends LiveStage {
  stop(): void;
}

/**
 * WHAT A SHELL OF ITS OWN NEEDS TO BE STOOD UP — the options about the GLASS, named apart from the
 * options about the gesture. The wiring above is the same whoever owns the shell; these are the
 * fields that exist only when nobody does.
 */
interface StageOptions {
  readonly viewer?: Partial<ViewerSettings>;
  readonly painter?: MakePainter;
  readonly clock?: LiveClock;
  readonly limits?: CameraLimits;
  readonly room?: CameraContent | ((root: Node) => CameraContent);
  readonly unit?: number | ((root: Node, view: Viewport) => number);
  readonly hudUnit?: boolean;
  readonly turn?: number;
  readonly onView?: () => void;
  readonly open?: (ctx: { readonly root: Node; readonly room: CameraContent; readonly unit: number; readonly view: Viewport }) => number | undefined;
}

/**
 * THE SHELL, FOR A CONSUMER THAT OWNS NONE — a glass, a renderer, the one clock's runtime, and a
 * camera over them. Everything here is what the catalog's own shell does around its panel, with the
 * panel taken out: a product wants the desk, not the showcase around it.
 */
function buildStage(container: HTMLElement, desk: Node, opts: StageOptions): BuiltStage {
  installStockEasings();
  const host = mount(container, desk);
  if (opts.viewer) host.setViewer({ ...host.viewer(), ...opts.viewer });
  const first = host.viewport();
  const painter = opts.painter?.(host.view, { width: first.width, height: first.height, resolution: first.dpr });
  if (!painter) throw new Error("liveTable: a stage of its own needs a painter");

  const limits = opts.limits ?? DESK_ZOOM;
  const roomOf = (): CameraContent => {
    const room = typeof opts.room === "function" ? opts.room(host.root) : opts.room;
    if (room) return room;
    // A DESK THAT NAMES NO ROOM IS ITS OWN ROOM, and the eye may stand at its edge.
    const box = boxOfDesk(host.root) ?? { w: 0, h: 0 };
    return { x: -box.w / 2, y: -box.h / 2, w: box.w, h: box.h };
  };
  const unitOf = (): number =>
    typeof opts.unit === "function" ? opts.unit(host.root, host.viewport()) : (opts.unit ?? host.unit());

  const camera = new Camera(limits);
  const view = (): ReturnType<Camera["transform"]> => camera.transform();
  const pitch = (): number => camera.pitch;
  const rotation = (): number => camera.rotation;
  const motions = attachMotion(host, painter, { view, pitch, rotation });

  const repaint = (): void => motions.redraw();
  // A THROW OR A PINCH NEEDS A CLOCK, and the camera has none of its own (`guard.one-clock`): the
  // consumer's is joined only while a fling is actually moving, and left the moment it rests.
  let leaveClock: (() => void) | undefined;
  const wake = (): void => {
    opts.onView?.();
    if (!opts.clock) {
      repaint();
      return;
    }
    if (leaveClock) return;
    leaveClock = opts.clock((dt) => {
      const going = control.step(dt);
      repaint();
      if (!going) {
        leaveClock?.();
        leaveClock = undefined;
      }
      return going;
    });
  };

  /**
   * ONE UNIT FOR THE CAMERA AND THE PLAN. A `Screened` node measures itself against the HOST's unit,
   * and a desk whose camera unit is several times that is telling the node the view has shrunk —
   * so it grows to make up for it, and a handle becomes a bar across half the glass.
   */
  let unitTold = -1;
  const tellUnit = (): void => {
    if (!opts.hudUnit) return;
    const u = unitOf();
    if (Math.abs(u - unitTold) < 0.01) return;
    unitTold = u;
    host.setViewer({ ...host.viewer(), hudUnit: u });
  };

  const control = wireCamera({
    host,
    camera,
    content: roomOf,
    unit: unitOf,
    // THE ARBITRATION, as one predicate: whatever can be picked up takes its own finger, and over
    // bare felt the same finger drives the view. The two never argue about a hand.
    claims: draggable,
    onView: wake,
  });

  // WHERE THE VIEW OPENS — once, and not before there is a glass to open it on. A shell hands its
  // element back before it is laid out, and a host asked for its size that early reports one pixel
  // by one: "the middle of the desk" measured against that glass is its top-left corner. So it is a
  // LATCH, not a line: re-applying it would drag a reader who has panned back to the middle.
  let opened = false;
  const openView = (): void => {
    const v = host.viewport();
    if (opened || v.width <= 1 || v.height <= 1) return;
    opened = true;
    const room = roomOf();
    tellUnit();
    control.refresh(); // the glass and the room must be known before a fit is measured
    const wish = opts.open?.({ root: host.root, room, unit: unitOf(), view: v });
    // A WISH IS NOT A WAY OUT OF THE LIMITS: whatever the desk asks for is held between the zoom
    // that fits the room and the furthest the camera is allowed in.
    camera.setZoom(Math.max(camera.fitZoom(), Math.min(wish ?? camera.fitZoom(), limits.maxZoom)));
    camera.lookAt({ x: room.x + room.w / 2, y: room.y + room.h / 2 });
    if (opts.turn !== undefined) camera.turnTo(opts.turn);
    repaint();
  };
  openView();
  const stopFitting = host.onChange(() => {
    tellUnit();
    control.refresh(); // a resize is a new glass, and the clamp has to know
    openView();
  });

  return {
    el: host.view,
    host,
    motions,
    camera,
    setRoot: (next: Node) => host.setRoot(next),
    stop() {
      leaveClock?.();
      stopFitting();
      control.stop();
      motions.stop();
    },
    dispose() {
      painter.destroy();
      host.unmount();
    },
  };
}
