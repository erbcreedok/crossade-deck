import { type Node, fieldsOf } from "../core/node.js";
import { transformsOf } from "./scenePlan/index.js";
import { type Vec } from "../core/transform.js";
import { Bounded, type BoundedFields, outlineOf } from "../core/atoms/bounded.js";
import { placedOutline, islands, outlinesTouch } from "../core/overlap.js";
import { stackSeats } from "./fall.js";

/**
 * How close is TOUCHING, in units. Not zero: to a player two cards a hair apart on a felt are
 * touching, and a heap that would not form until the pixels met would read as broken.
 */
const TOUCH_SLACK = 0.04;

/** True for the pieces this desk lets form a heap together — a card with a card, a chip with a chip. */
export function sameKind(a: Node, b: Node, kind: (n: Node) => string): boolean {
  const k = kind(a);
  return k !== "" && k === kind(b);
}

/**
 * WHAT MAY LIE IN ONE HEAP, and how a heap stands once it is lifted — a desk's answer, not the kit's.
 *
 * Every desk on this shelf so far has had the same one (same kind, touching, one step per piece) and
 * so it was written into `heapsOf` directly. A desk with a stricter rule is not a special case of
 * that one: `Mechanics/Stack merging` asks how MUCH two pieces overlap and which way up they are
 * lying, and neither question can be phrased as a tweak to "do the outlines meet". So the questions
 * became a seam, and the shelf's original answer became one implementation of it.
 *
 * Three questions, and they are three because they are asked at three different moments: `joins` per
 * PAIR while the islands are being found, `admits` per ISLAND once one has been, and `seats` when a
 * handle picks one up. A rule that had to answer all three at once could not say "these two touch
 * enough, and yet this one is not in the heap" — which is the whole of rules 3 to 6 down there.
 */
export interface HeapRule {
  /** May these two lie in one heap? Asked for every pair whose boxes are near enough to bother. */
  readonly joins: (a: Node, b: Node) => boolean;
  /**
   * ...AND ARE THEY CLOSE ENOUGH? THE geometry question, asked with the two pieces and the two
   * outlines as they actually stand.
   *
   * Apart from `joins` because it is a different question about a different thing: `joins` is about
   * what the two pieces ARE and has no geometry in it, this is about where they happen to be lying
   * and has nothing else. A throw that leaves a card with one corner over a pile has answered the
   * first question yes and the second no, and that is exactly the accident this exists for.
   *
   * The pieces come with the outlines because "close enough" is not one number: a card has to be
   * COVERED and a chip only has to be NEAR, and which of those a piece means is written on the
   * piece (`Heaping.reach`), not chosen here.
   */
  readonly meets: (a: Node, b: Node, oa: readonly Vec[], ob: readonly Vec[]) => boolean;
  /** Which of an island's pieces the heap actually takes. Given in paint order, bottom first. */
  readonly admits: (group: readonly Node[]) => readonly Node[];
  /** Where each piece stands under the handle that lifted them, in the handle's own frame. */
  readonly seats: (group: readonly Node[], gripW: number) => Vec[];
  /**
   * HOW A RUN LIFTED BY A PLACE'S HANDLE STANDS — its seats AND its turns. Absent, the ordinary
   * squared stack, which is what every handle on the shelf has lifted so far.
   *
   * A place may pose what it holds differently from how a heap poses itself, and differently again
   * from how it poses them while they are lying in it. A hand of cards is the case everybody knows:
   * laid out in a row on the felt, splayed into a fan the moment it comes up, and back into a row
   * the moment it is put down again. Three poses, one set of cards, and the only thing that says
   * which is where they are and whether they are moving.
   *
   * The turn is DATA and not something read back off the glass: a carried pose is the piece's own
   * resting pose with the style composed onto it, so a face-down card's mirror is in there and reads
   * as a half circle. The desk that decided the fan is the one that knows what the angle was.
   */
  readonly fan?: (
    group: readonly Node[],
    gripW: number,
    /**
     * HOW MUCH ROOM THE HAND IS ALLOWED, in root units — what the reader can actually SEE.
     *
     * Not the desk. A desk is as big as the game wants and a screen is as big as it is, and a hand
     * measured against the first runs off the second: the outer cards sit past the glass, where
     * nobody can read them and nobody can reach them. What a spread is bounded by is the room it is
     * being held IN, and that room is the viewport.
     */
    room: number,
  ) => readonly { readonly at: Vec; readonly deg: number }[];
  /**
   * WHAT THE DESK DOES TO WHAT HAS JUST BEEN PUT DOWN, once the tree says where everything is.
   *
   * A drop leaves pieces as they were — that is the whole of a drop, and a fan let go of on the felt
   * stays a fan. A PLACE is the exception: it has an opinion about how its things lie, and what it
   * takes it re-poses. Nothing else on the shelf needs this, so it is absent everywhere else.
   */
  readonly settled?: (root: Node, ids: readonly string[]) => void;
  /**
   * THE PANEL'S NUMBERS, WRITTEN INTO A DESK THAT IS ALREADY STANDING.
   *
   * A desk is furniture and is not rebuilt because a knob moved — a reader who has dealt a hand
   * would lose it to the very control that was meant to show them something. So anything a control
   * puts INTO the tree (a zone's reach) or into a registry the tree names (an arrangement) is
   * written again here, on every render, to the desk the reader is already working in.
   */
  readonly tune?: (root: Node) => void;
  /**
   * HEAPS THAT TOUCHING CANNOT FIND — a place that HOLDS things, rather than things that hold each
   * other.
   *
   * A heap on the felt is an accident of where pieces came to rest: nobody declared it, it is simply
   * what is touching what, and it appears and vanishes as pieces move. A ZONE is the opposite claim
   * — it is a place, it was there before anything was put in it, and its handle belongs to it and
   * not to whatever happens to be lying in it today. Islands cannot express that, and a zone squeezed
   * into one would be a piece: liftable, carryable, and gone the moment somebody dragged it.
   *
   * `under` is the node the handle stands beneath — the zone itself, so the tab is always in the same
   * place — and `pieces` is what the handle lifts, which is never the zone.
   */
  readonly held?: (root: Node, aloft: (id: string) => boolean) => readonly { readonly under: Node; readonly pieces: readonly Node[] }[];
}

/** The shelf's original answer: a card with a card, a chip with a chip, touching, one step apart. */
export function TOUCHING(kind: (n: Node) => string): HeapRule {
  return {
    joins: (a, b) => sameKind(a, b, kind),
    meets: (_a, _b, oa, ob) => outlinesTouch(oa, ob, TOUCH_SLACK),
    admits: (group) => group,
    seats: stackSeats,
  };
}

/**
 * THE HEAPS ON THE DESK RIGHT NOW — every set of pieces of one kind joined by a chain of touches.
 *
 * The kit answers "do these two outlines overlap"; WHICH pieces are allowed to is this desk's rule
 * and lives here. Groups of one are dropped: a lone card is not a heap, and a handle under it would
 * be a control that does nothing.
 */
export function heapsOf(root: Node, kind: (n: Node) => string, aloft: (id: string) => boolean = () => false, rule?: HeapRule): Node[][] {
  const actualRule = rule ?? TOUCHING(kind);
  const poses = transformsOf(root);
  // A HEAP IS WHAT IS LYING ON THE DESK. A piece the clock is taking somewhere is not lying
  // anywhere: it left the heap at the moment it was taken out of it, and a handle that still
  // counted it would pull a card back out of the air it was thrown into.
  const pieces = root.children.filter((n) => actualRule.joins(n, n) && !aloft(n.id));
  const outline = new Map<string, ReturnType<typeof placedOutline>>();
  for (const n of pieces) {
    const shape = fieldsOf<BoundedFields>(n, "Bounded")?.bounds;
    const at = poses.get(n.id);
    if (shape && at) outline.set(n.id, placedOutline(outlineOf(shape), at));
  }
  const touch = (a: Node, b: Node): boolean => {
    const oa = outline.get(a.id);
    const ob = outline.get(b.id);
    return !!oa && !!ob && actualRule.joins(a, b) && actualRule.meets(a, b, oa, ob);
  };
  // ADMITTED AFTER THE ISLAND IS FOUND, never during. Which pieces a heap takes can depend on the
  // whole island — on which of them is on top of it — and a union-find asks about pairs and knows
  // nothing about tops. Cut afterwards, and what is left of one is a heap only if two are left.
  return islands(pieces.filter((n) => outline.has(n.id)), touch)
    .map((group) => [...actualRule.admits(group)])
    .filter((group) => group.length > 1);
}

/**
 * The box a heap covers, in root units — what "the common perimeter" means when the answer has to
 * be a place a handle can stand.
 */
export function heapBox(root: Node, group: readonly Node[]): { readonly mid: number; readonly bottom: number } {
  const poses = transformsOf(root);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const n of group) {
    const shape = fieldsOf<BoundedFields>(n, "Bounded")?.bounds;
    const at = poses.get(n.id);
    if (!shape || !at) continue;
    for (const p of placedOutline(outlineOf(shape), at)) {
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y > y1) y1 = p.y;
    }
  }
  return { mid: (x0 + x1) / 2, bottom: y1 };
}
