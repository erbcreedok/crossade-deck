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

import { kindOf , heapKindOf } from "./gestureMap.js";
import {
  type CarryFeel,
  type Walls,
  landingPicture,
  throwGate,
  zoneFor,
  aimOf,

  Coated,
  wouldAccept,
  mark,
  NO_COAT,
  Private,
  apply,
  byId,
  caps,
  node,
  velocityOf,
  compose,
  DEFAULT_TUNING,
  draggable,
  fieldsOf,
  polar,
  RISE,
  Transformable,
  letFall as letFallInKit,
  formationOf,
  fanOf,
  seatIn,
  landed,
  handOver,
  otherGrips,
  boxOfDesk,
  type Mirror as KitMirror,
  type CarryItem,
  type CarryOptions,
  type Node,
  type TransformableFields,
  type Vec,
  type ViewerSettings,
} from "../../src/index.js";

export { formationOf, fanOf, seatIn, landed } from "../../src/index.js";
export type Mirror = KitMirror<Scene>;
import { throwDie } from "@game-presets/dice";
import { wireDrag } from "../devtools/drag.js";
import { scene, type Scene } from "../devtools/scene.js";
import {
  alsoInTheWay,
  bumped,
  restsAt,
  DIE_FAN,
  DIE_HOP,
  DIE_SPIN,
  DIE_SPIN_DRAG,
  shoves,
  deckMap,
  dropOf,
  fallOrder,
  gestureMap,
  GRIP,
  GRIP_HOLD,
  GRIP_MISS,
  isDrawn,
  isGrip,
  isMark,
  isPlaceGrip,
  regrasp,
  MAP,
  ANCHOR_MARK,
  flickOf,
  THROWN_AT,
  flightOf,
  flockTo,
  deskRoom,
  mapWalls,
  regrip,
  stackMap,
  stackSeats,
  thrown,
  toFront,
  turnOver,
  type Bump,
  type DropFeel,
  type GripSpec,
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
  // How much slower the TAIL is than the hand — across the whole run, so a hand of five and a deck
  // of thirty-six stretch the same way and neither comes off its handle like an anchor.
  trail: 2.2,
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
): HTMLElement {
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
  // How high the hand is actually holding it, once the switch and the page have both had their say.
  const held = lift ?? (physics ? DEFAULT_TUNING.lift : 1);
  const landingPic = landingPicture(built, { shown: landingShown, onChange: () => mirror?.changed() });
  /** What is in the air or in a hand — never in a heap, on any screen. */
  const airborne = (): ((id: string) => boolean) => {
    const carried = inHand ? heaps.get(inHand) : undefined;
    return (id: string): boolean =>
      (built.motions?.busy(id) ?? false) || (carried?.some((n) => n.id === id) ?? false);
  };

  /**
   * READ THE HANDLES SOMEBODY ELSE DREW. A screen that did not draw them must not redraw them —
   * `regrip` throws every tab away and makes it afresh, so a second screen doing that destroys the
   * very tab the first screen's finger is about to land on.
   */
  const grasp = (): void => {
    if (!stacking) return;
    heaps = regrasp(built.host.root, heapKindOf, airborne(), rule);
    built.host.setRoot(built.host.root);
  };

  /** Redraw the handles for whatever is touching now, and show them. */
  const settle = (): void => {
    // A DESK WITH ITS OWN LAW ABOUT PIECES has said what it had to say (`pieces.settled`) — and a
    // handle put back under the dice is a tree write every screen has to be told about.
    if (!stacking && pieces?.settled) {
      built.host.setRoot(built.host.root);
      mirror?.changed();
    }
    if (!stacking) return;
    // WHAT THE CLOCK IS CARRYING IS NOT IN A HEAP. A thrown card is in the air, not lying on the
    // felt, and a handle that still counted it would pull it back out of its own flight the moment
    // somebody took the stack again — the piece has to leave the heap when it leaves the desk. What
    // a HAND is carrying is not lying there either, for the same reason.
    const carried = inHand ? heaps.get(inHand) : undefined;
    const aloft = (id: string): boolean =>
      (built.motions?.busy(id) ?? false) || (carried?.some((n) => n.id === id) ?? false);
    heaps = regrip(built.host.root, heapKindOf, grip, aloft, inHand, rule);
    // The held handle keeps its own run: it was taken with those pieces and it puts down those
    // pieces, whatever the desk has rearranged itself into meanwhile.
    if (inHand && carried) heaps.set(inHand, carried);
    built.host.setRoot(built.host.root);
    // ...AND SO DOES EVERY OTHER SCREEN LOOKING AT THIS DESK. One tree, several hosts: a change made
    // here is a change to the board they are all reading, and a host is only ever told by being told.
    mirror?.changed();
  };
  // ...AND THE PANEL'S NUMBERS ARE RE-APPLIED TO THE DESK THAT IS ALREADY STANDING. The desk is not
  // rebuilt on an argument change, so anything a control writes INTO it — a zone's reach, a named
  // arrangement — has to be written again here, or the knob would only take effect on a page reload.
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
    return scale > 0 ? px / scale : MAP.w;
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
   * MOVE THE LANDING MARK UNDER THE HAND, or take it off the desk when the gesture is over.
   *
   * Written rather than carried, and this is the one place on the shelf where that is right. A carry
   * is an override because what the hand is HOLDING must not be written until it is let go of; a
   * mark is not held and is not a piece — it is scenery the desk draws for the length of one gesture
   * and throws away, and it is one node on a desk of forty.
   */
  

  /**
   * THE ZONE THIS CARRY WOULD BE HANDED TO IF THE HAND LET GO NOW — asked exactly as the release
   * asks it, down to the refusal to hand a run back to the place it was lifted out of.
   */
  const zoneAimed = (ids: readonly string[], at: Vec): Node | undefined => {
    // WHAT THE HAND IS ACTUALLY HOLDING. `carried` is written by a desk that stacks, and carries the
    // seats a run stands in; a desk without stacking never writes it, and the wiring's own list of
    // ids is the whole of what is in the hand there. Only the ids and the seats are read either way.
    const run = carried.length > 0 ? carried : ids.map((id) => ({ id, offset: { x: 0, y: 0 } }));
    // THE ANCHOR'S OWN POINT, which is where the hand is: a carry is anchored ON the thing the hand
    // has hold of, so `at` is the tab's point for a run carried by its tab and the piece's own for a
    // run of one. Nothing to add and nothing to look up.
    return ((z) => (z && z === liftedFrom ? undefined : z))(zoneFor(built, run, zones, at));
  };
  rule?.tune?.(built.host.root);
  mirror?.ready(built, grasp);
  settle();
  return wireDrag(built, {
    view: () => built.camera!.transform(),
    // MY HAND, TOLD TO THE OTHER SCREENS. A carry is an override and never a tree write, so a hand
    // moving here is invisible over there unless it is reported and mirrored.
    // MY HAND, TOLD TO THE OTHER SCREENS — with its FEEL, or it is not the same hand over there —
    // and the picture of where it lands, moved under it.
    onCarry: ({ ids, at, done, feel, swing }) => {
      // WHAT THE HAND IS ACTUALLY HOLDING. `carried` is written by a desk that stacks; a desk without
      // stacking never writes it, and told an empty run the far screen showed a cursor gliding about
      // and the piece standing perfectly still — which is what the board did. The wiring's own list
      // of ids is the whole of what is in the hand there.
      mirror?.hand(carried.length > 0 ? carried : ids.map((id) => ({ id, offset: { x: 0, y: 0 } })), at, done, feel);
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
            compose(hit, Coated({ self: ANCHOR_MARK, cast: NO_COAT }));
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
            const mark = landingPic.mark(run, stackSeats(run, grip.w), seatIn(hit));
            const posed = isPlaceGrip(hit) ? rule?.fan?.(run, grip.w, seenWide()) : undefined;
            posed?.forEach((seat, i) => {
              const piece = run[i];
              if (!piece) return;
              const own = fieldsOf<TransformableFields>(piece, "Transformable");
              compose(piece, Transformable({ ...(own ?? {}), angle: seat.deg }));
            });
            return mark ? [hit, ...run, mark] : [hit, ...run];
          },
          // The tab is the hand's own and takes no lift or lean; everything hanging off it does.
          // The tab is the hand's own and takes no lift or lean; everything hanging off it does.
          // The tab and the landing mark are the desk's own pictures: no lift and no lean, so both
          // stay the size they will be and lie flat while the cards ride at the hand's height.
          stillOf: (_root: Node, hit: Node, run: readonly Node[]) => run.map((n) => isDrawn(n)),
          // ...AND THE HEAP IS SQUARED UP AS IT COMES OFF THE DESK, not when it is put down. The
          // handle is the anchor, so the stack hangs off the finger exactly where the tab was.
          offsetOf: (_root: Node, hit: Node, run: readonly Node[]) => {
            if (!isGrip(hit)) {
              // A card and, when there is one, the picture of where it will land — which stands at
              // the card's own landing spot, so its offset from the hand is nothing at all.
              carried = run.map((n) => ({ id: n.id, offset: isDrawn(n) ? { x: 0, y: 0 } : (landingPic.current?.hover ?? { x: 0, y: 0 }), still: isDrawn(n) }));
              return carried.map((it) => it.offset);
              return undefined;
            }
            const pieces = run.slice(1).filter((n) => !isDrawn(n));
            const posed = isPlaceGrip(hit) ? rule?.fan?.(pieces, grip.w, seenWide()) : undefined;
            const lift = landingPic.current?.hover ?? { x: 0, y: 0 };
            const held = (posed ? posed.map((s) => s.at) : (rule?.seats ?? stackSeats)(pieces, grip.w)).map((seat) => ({
              x: seat.x + lift.x,
              y: seat.y + lift.y,
            }));
            const seats = [{ x: 0, y: 0 }, ...held, ...(landingPic.current ? [landingPic.current.seat] : [])];
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
    // THE MAP'S BORDER IS A WALL, and the piece is inside it for the whole gesture — see
    // `NEVER_THROUGH`. The height is handed in because the wall is the DRAWN edge of the piece:
    // raise a piece and it is wider, and a border that ignored that would let the difference out.
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
            const lead = run[0];
            const seats = pieces.offsetOf?.(root, hit, run) ?? run.map(() => ({ x: 0, y: 0 }));
            const mark = lead ? landingPic.mark(run, seats, seatIn(lead)) : undefined;
            return mark ? [...run, mark] : [...run];
          },
          stillOf: (_root: Node, _hit: Node, run: readonly Node[]) => run.map((n) => isDrawn(n)),
          offsetOf: (root: Node, hit: Node, run: readonly Node[]) => {
            const lift = landingPic.current?.hover ?? { x: 0, y: 0 };
            const own = run.filter((n) => !isDrawn(n));
            const seats = (pieces.offsetOf?.(root, hit, own) ?? own.map(() => ({ x: 0, y: 0 }))).map((seat) => ({ x: seat.x + lift.x, y: seat.y + lift.y }));
            // BY THE RUN'S OWN ORDER, whatever is in it: a handle rides at the anchor, the landing
            // picture at its seat, and the pieces take the desk's seats in turn. Laid out as one
            // list of pieces-then-picture, a run led by a handle had every seat one piece off.
            const all = run.map((n) => (isMark(n) ? (landingPic.current?.seat ?? { x: 0, y: 0 }) : isDrawn(n) ? { x: 0, y: 0 } : seats[own.indexOf(n)] ?? { x: 0, y: 0 }));
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
    trayOf: (root, hit) => mapWalls(hit, isGrip(hit) ? 1 : held, room ? boxOfDesk(root) : undefined),
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
              if (actor) {
                mark(piece, { by: actor, mark: "flipped" });
              }
              built.host.setRoot(built.host.root);
            });
          },
        }
      : {}),
    // A page that DROPS or THROWS takes the release over: the ordinary one puts the piece down
    // where the finger was, and putting down is the thing those pages say is not what happens.
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
              return n !== undefined && !isMark(n);
            });
            // HOW FAR THE LOAD WAS HANGING, read BEFORE the picture is taken off the desk: the
            // landing is the picture's place, so the number that says where the picture WAS is the
            // number the landing needs — and taking the picture away first threw it away with it.
            const drop = landingPic.current?.hover ?? { x: 0, y: 0 };
            // ...AND THE PICTURE OF WHERE IT LANDS GOES WITH THE GESTURE. A release the scene TAKES
            // never reaches the wiring's own drop, so the carry's `done` never comes: left to that,
            // the last thing the reader sees is a ghost of a stack standing on empty felt.
            landingPic.end();
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
            // page that had both would otherwise always fall: this runs BEFORE the drop is decided,
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
              } else if (!items.some((one) => isGrip(byId(built.host.root, one.id) ?? node("")))) return false;
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
            return letFall(built, falling, held, swing, () => {
              if (inHand === mine) inHand = undefined;
              // A PLACE HAS THE LAST WORD HERE TOO. The wiring announces a drop it decided itself
              // (`onSettled`); a release the scene took never reaches that line at all, and a rule
              // that only ran on the wiring's path would re-pose a card dealt in one at a time and
              // leave every hand ever put back exactly as the hand had splayed it.
              rule?.settled?.(built.host.root, falling.map((it) => it.id));
              pieces?.settled?.(built.host.root, falling.map((it) => it.id));
              settle();
            }, ways, bump, drop, pieces?.wallsOf);
          },
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
/**
 * WHERE THIS ONE OF THE HANDFUL GOES — the fan, in degrees, or nothing at all.
 *
 * Counted from the middle outwards, so a run of two parts evenly about the throw and a run of one
 * is not fanned at all: a single die thrown goes where it was thrown, and a rule that nudged it
 * aside would be the desk disagreeing with the hand.
 */


/** Which way a handful goes when the hand had no direction of its own: away from the reader. */
/** How long a hand that was throwing has to stay still before it is a hand that has stopped. */
const HAND_AT_REST_MS = 120;
const DOWN_THE_DESK = 90;

/** Two velocities as one — the throw the hand gave it plus its own share of the opening. */
const sum = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });



/**
 * EVERY PIECE OF A THROWN RUN, AIMED AT ITS OWN PLACE IN THE FORMATION — id to a throw that lands
 * exactly there. Empty when this run has no formation to keep.
 *
 * THE DESTINATION IS THE ANCHOR'S. A run carried by its handle is anchored on that handle: it is
 * what the hand had hold of and what the hand aimed, so where IT comes to rest is where the run
 * comes to rest (`restsAt`, the same arithmetic the zone is asked about). The pieces are then seated
 * around that point exactly as they are seated around the handle in the hand (`stackSeats`), which
 * is why the hand keeps its shape through the whole flight instead of being reassembled on arrival.
 *
 * A thrown run used to be a handful of separate throws that happened to share a hand: each piece
 * left from where the fan had put it and travelled its own distance, so the hand arrived on the felt
 * as the same spread it had been held in — a stack in name only, tidied up afterwards. Tidying up
 * after a landing is what a correction looks like.
 *
 * A THROW IS SOLVED, NOT GUESSED. A slide of speed `v` under drag `a` stops after `v²/2a`, so the
 * speed that stops at a given distance is `sqrt(2ad)`: the flight is aimed at the seat and ends
 * there, with the same slowing-down every other throw on the desk has.
 *
 * WHO FLIES LIKE THIS IS DATA AND NOT A KIND. A piece that scatters is being opened out on purpose,
 * and a piece that takes up room is going to be shoved by its neighbours anyway: either one aimed at
 * a seat would be aimed at a seat it cannot keep. What is left — a thing that neither scatters nor
 * takes room — is a card, and a hand of them lands as a hand.
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
