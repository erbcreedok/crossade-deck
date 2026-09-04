import { type Node, fieldsOf, node, add, remove } from "../core/node.js";
import { type Coat } from "../core/atoms/coated.js";
import { type BoundedFields, Bounded } from "../core/atoms/bounded.js";

const KAPPA = 0.552284749831;
function rect(w: number, h: number) {
  const x = w / 2;
  const y = h / 2;
  return {
    start: { x: -x, y: -y },
    segments: [{ to: { x, y: -y } }, { to: { x, y } }, { to: { x: -x, y } }, { to: { x: -x, y: -y } }],
  };
}
function roundedRect(w: number, h: number, radius: number) {
  const r = Math.min(radius, Math.min(w, h) / 2);
  if (r <= 0) return rect(w, h);
  const x = w / 2;
  const y = h / 2;
  const k = r * KAPPA;
  const segments = [
    { to: { x: x - r, y: -y } },
    { c1: { x: x - r + k, y: -y }, c2: { x, y: -y + r - k }, to: { x, y: -y + r } },
    { to: { x, y: y - r } },
    { c1: { x, y: y - r + k }, c2: { x: x - r + k, y }, to: { x: x - r, y } },
    { to: { x: -x + r, y } },
    { c1: { x: -x + r - k, y }, c2: { x: -x, y: y - r + k }, to: { x: -x, y: y - r } },
    { to: { x: -x, y: -y + r } },
    { c1: { x: -x, y: -y + r - k }, c2: { x: -x + r - k, y: -y }, to: { x: -x + r, y: -y } },
  ];
  return { start: { x: -x + r, y: -y }, segments };
}

import { type TransformableFields, Transformable } from "../core/atoms/transformable.js";
import { type ValuedFields, Valued } from "../core/atoms/valued.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { Screened } from "../core/atoms/screened.js";
import { Forgiving } from "../core/atoms/forgiving.js";
import { Draggable } from "../core/atoms/draggable.js";
import { heapBox, heapsOf, type HeapRule, TOUCHING } from "./heaps.js";

/**
 * WHAT A PIECE IS, off what it carries and never off its name — `guard.id-is-opaque`, which caught
 * this file reading `id.startsWith` the first time it was written.
 *
 * A die rolls, a card turns over, a chip states a denomination and a handle states that it is one.
 * A fifth piece added tomorrow is sorted by what it has, not by somebody remembering a list.
 */
// export type Piece = "die" | "card" | "chip" | "grip" | "mark" | "warm" | "";
// The prompt says Piece and kindOf stay in catalog. So we ONLY put isGrip/isMark/isDrawn in grips.ts!

/** A handle says so on itself. Its id is a NAME and nothing reads it — membership is looked up. */
export const isGrip = (n: Node): boolean => fieldsOf<ValuedFields>(n, "Valued")?.values?.["grip"] !== undefined;

/** The picture of where a carried run will come down. Like a handle, it is drawn and never played. */
export const isMark = (n: Node): boolean => fieldsOf<ValuedFields>(n, "Valued")?.values?.["mark"] !== undefined;

/**
 * A CONTROL OR A PICTURE — anything on the desk that is not a piece of the game.
 *
 * Handles and landing marks are both drawn by the desk, both ride a carry, and neither is ever
 * seated, heaped, handed to a zone or counted in a run. They are asked about together everywhere,
 * so they are asked with one word: a second list of exceptions somewhere is a place for the two to
 * drift, and the drift shows up as a tab laid out in a hand of cards.
 */
export const isDrawn = (n: Node): boolean => isGrip(n) || isMark(n);

/**
 * How big the grip's tab is, in units — wide and low, so it reads as a handle and hides nothing.
 *
 * The width is the number; the height follows it, because the SHAPE is what makes a tab read as one
 * and a tab that changed proportion with its size would stop being the same control.
 */
export const GRIP_RATIO = 4;
export const GRIP = { w: 0.6, h: 0.6 / GRIP_RATIO };

/**
 * How far the view may take the handle down before it is held, and how far up — see `Screened`.
 *
 * The ceiling is ONE and goes no higher: a handle has a size that suits the finger, and there is
 * nothing above it to want. Zoomed in, the desk grows and the tab stays the size it always was;
 * zoomed out, it is allowed to come down a little rather than tower over the heap it belongs to.
 */
export const GRIP_HOLD = { min: 0.8, max: 1 };

/** How far under the heap's own edge the tab sits, in units. */
export const GRIP_GAP = 0.06;

export interface GripSpec {
  /** The tab's width in units; its height follows by `GRIP_RATIO`. */
  readonly w: number;
  /** How far the view may take it down and up before it is held — see `Screened`. */
  readonly min: number;
  readonly max: number;
  /**
   * HOW FAR A FINGER MAY MISS THE TAB and still take it, in units — see `Forgiving`.
   *
   * A tab is a few pixels tall on purpose: one drawn as a slab would be a slab, and the heap it
   * stands under is the thing the reader is meant to be looking at. But a fingertip covers forty-odd
   * pixels of glass and hides the target on the way down, so a control that is honest to the EYE is
   * a control that has to be aimed at twice. The answer is not to draw it bigger.
   *
   * IT NEVER STEALS: what is drawn is offered first, and only touches that would have found nothing
   * at all reach this (`pick`). A finger on a card gets the card.
   */
  readonly miss: number;
}

/**
 * HALF A TAB'S WIDTH, forgiven all round.
 *
 * Which is about a fingertip: the tab is drawn to a constant size on the glass (`Screened`), so this
 * is a constant number of pixels too — the same forgiveness at every zoom, because the thing being
 * forgiven is a finger and a finger does not zoom.
 */
export const GRIP_MISS = GRIP.w / 2;

/**
 * HOW FAR WHAT IS BEING CARRIED HANGS OFF THE FINGER, as a factor of its own height.
 *
 * THE FINGER IS THE HOLDER, and what hangs on it is the handle and the picture of where the load is
 * going. The load itself hangs ABOVE, clear of both. Drawn ON the finger it covers the one thing the
 * gesture is FOR: a player carrying a card across a desk could not see where the card was going,
 * because the card was in the way of the answer — and the answer is the whole reason there is a
 * picture at all. A held thing may lag the finger by a mile and it may sit some way off it; what it
 * may not do is stand on top of the place it is being sent to.
 *
 * A FACTOR of the load's height and not a fixed gap, so a card clears a card and a pile clears a
 * pile: what has to be cleared is the picture of the landing, and the landing is the load's own size.
 *
 * A THIRD, not the whole. Edge to edge is ONE — the load and the picture just touching — and that
 * is the number this began at. It is far too much: on a phone the load ends up a card's height off
 * the finger, which reads as a thing that got away from you rather than a thing in your hand, and
 * the further the load is from the place it is going, the less the picture of that place is worth.
 */
export const GRIP_SPEC: GripSpec = { w: GRIP.w, miss: GRIP_MISS, ...GRIP_HOLD };

/**
 * A HANDLE'S OWN WORD FOR WHOSE IT IS — a heap's, or a place's.
 *
 * The two are lifted differently (`HeapRule.fan`), and the difference has to be readable off the tab
 * a finger landed on. Said on the node, as a field, because everything on this desk is: the
 * alternative is the scene keeping a list of which tabs it made how, and a list is a thing that goes
 * stale between the moment it is written and the moment somebody drops a card.
 */
export const isPlaceGrip = (n: Node): boolean => fieldsOf<ValuedFields>(n, "Valued")?.values?.["place"] !== undefined;

/**
 * HOW MANY HANDLES HAVE EVER BEEN DRAWN — the next one's name, and never a name used before.
 *
 * A handle is a PICTURE of a heap, not a thing on the desk, and the difference is its identity. Named
 * by their place in the list, two handles swap names the moment a heap between them goes: the clock
 * sees one id whose rest pose has moved and eases it there, so every remaining tab slides along into
 * the one before it, and a new tab flies out of an old one's seat instead of appearing under its own
 * heap. Named afresh, each is a node the clock has never seen — and a new node is drawn at its rest
 * and does not fly in from nowhere (`motion.a-new-node-appears-without-flying`). It appears where it
 * belongs and goes where it stood.
 */
let handlesDrawn = 0;
const GRIP_SURFACE = "gesture.map.grip";

function gripFor(root: Node, under: readonly Node[], nth: number, spec: GripSpec, ofPlace = false): Node {
  const { mid, bottom } = heapBox(root, under);
  const h = spec.w / GRIP_RATIO;
  return node(
    `stack handle ${handlesDrawn++}`,
    Bounded({ bounds: roundedRect(spec.w, h, h / 2) }),
    Surfaced({ surface: GRIP_SURFACE }),
    Transformable({ at: { x: mid, y: bottom + GRIP_GAP + h / 2 } }),
    Valued({ values: ofPlace ? { grip: nth, place: 1 } : { grip: nth } }),
    // A HANDLE IS SIZED FOR THE FINGER, not for the desk: the same pixels at every zoom, the way
    // every drag handle in every application anybody has ever used is drawn.
    Screened({ min: spec.min, max: spec.max }),
    // ...AND IT IS EASIER TO CATCH THAN TO SEE. The picture stays exactly the size it was.
    Forgiving({ miss: spec.miss }),
    Draggable({ onReject: "stay" }),
  );
}

/**
 * REBUILD THE HANDLES for whatever is touching right now, and say which pieces each one holds.
 *
 * Called after anything moves, because that is the only time the answer can have changed. The old
 * tabs go first: a handle is a picture of a heap, and a picture nobody redrew is a handle hanging
 * under a heap that has walked away from it.
 */
export function regrip(
  root: Node,
  kind: (n: Node) => string,
  spec: GripSpec = GRIP_SPEC,
  aloft: (id: string) => boolean = () => false,
  keep?: string,
  rule?: HeapRule,
): Map<string, readonly Node[]> {
  const actualRule = rule ?? TOUCHING(kind);
  const held = new Map<string, readonly Node[]>();
  // A HANDLE A HAND IS HOLDING IS NOT REDRAWN. Every other tab is thrown away and made afresh — that
  // is what keeps them from sliding into each other's places — but the one under a finger belongs to
  // the gesture until the gesture ends. Replaced mid-carry it is a new node the hand never took, and
  // what the hand is holding vanishes out from under it.
  // WHEREVER THEY ENDED UP, not only at the top. A handle is drawn as a child of the desk, but a
  // desk with zones on it can re-home a node — and a tab that found its way inside one would be laid
  // out by that zone as though it were a card, and never swept away again by a pass that only looked
  // at the desk's own children. One stale tab is one control that lifts a heap that is not there.
  for (const owner of [root, ...root.children]) {
    for (const old of owner.children.filter(isDrawn)) if (old.id !== keep) remove(owner, old);
  }
  // A PLACE'S OWN HANDLE FIRST, and what it holds is not on the felt any more as far as the islands
  // are concerned: a card the zone has claimed must not also grow a felt handle of its own, or the
  // reader is given two tabs for one card and whichever they take lifts a different thing.
  const claimed = new Set<string>();
  (actualRule.held?.(root, aloft) ?? []).forEach(({ under, pieces }, i) => {
    for (const piece of pieces) claimed.add(piece.id);
    if (pieces.length === 0) return; // a place holding nothing has nothing to lift, and no handle
    const tab = gripFor(root, [under], -1 - i, spec, true);
    add(root, tab);
    held.set(tab.id, pieces);
  });
  heapsOf(root, kind, (id) => aloft(id) || claimed.has(id), actualRule).forEach((group, i) => {
    const tab = gripFor(root, group, i, spec);
    add(root, tab);
    held.set(tab.id, group);
  });
  return held;
}

export function regrasp(
  root: Node,
  kind: (n: Node) => string,
  aloft: (id: string) => boolean = () => false,
  rule?: HeapRule,
): Map<string, readonly Node[]> {
  const actualRule = rule ?? TOUCHING(kind);
  const held = new Map<string, readonly Node[]>();
  const tabs = root.children.filter(isGrip);
  const claimed = new Set<string>();
  const runs: (readonly Node[])[] = [];
  for (const { pieces } of actualRule.held?.(root, aloft) ?? []) {
    for (const piece of pieces) claimed.add(piece.id);
    if (pieces.length > 0) runs.push(pieces);
  }
  runs.push(...heapsOf(root, kind, (id) => aloft(id) || claimed.has(id), actualRule));
  runs.forEach((run, i) => {
    const tab = tabs[i];
    if (tab) held.set(tab.id, run);
  });
  return held;
}
