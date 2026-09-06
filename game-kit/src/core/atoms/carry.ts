// THE CARRY STYLES — how a RUN of cards a finger is dragging composes its lean, and the one place
// the owner's rule about the solitaire column lives. A single card leaning into its motion (Balatro
// whip) always reads right. A RUN is where it forks, and the fork is not "fan vs stack" — it is
// WHERE the lean is applied:
//
//   • `rigid`  — the run is ONE body. The lean turns the whole thing about the grab pivot, so the
//                per-card offsets turn WITH it: a vertical column tilts as a solid plank and keeps
//                its overlaps. This is what solitaire wants; the alternative tears the column into
//                venetian-blind slats, which is the thing that "looks wrong" on a vertical stack.
//   • `loose`  — each card leans about its OWN centre and the offsets stay put. On a horizontal
//                hand that reads as the hand tilting; on a vertical column it is the tear above.
//                Kept as an opt-in for the games that want the per-card look.
//
// The lean ANGLE is computed once per frame from the group's speed (`lean` below) and handed to the
// style — uniform across the run either way; the styles differ only in how they COMPOSE it. Fan
// geometry (a hand splayed on an arc, each card at its own angle) is a card-flavoured thing and
// belongs to the cards preset, not here — it would recompute the offsets, which these two do not.

import { apply, compose, move, pose, rotate, type Transform, type Vec } from "../transform.js";
import { clampAbs } from "../spring.js";
import { defineAtom } from "../atom.js";
import { fieldsOf, type Node } from "../node.js";
import { screened } from "./screened.js";

export interface CarryFields {
  readonly orient?: "holder" | "keep" | undefined;
  /**
   * WHERE THIS TRAVELS WHILE A FINGER HAS IT — in the HAND, off the felt, or ON the felt.
   *
   * A piece is lifted: it pops, it banks, a picture of where it will land is drawn under it, and
   * letting go of it in motion throws it. A ring is not lifted. It slides along the sukno the way a
   * beer mat does, so there is nothing for a fall to be a fall from and no landing to draw a picture
   * of — it is simply wherever the finger left it.
   *
   * Said in the positive and by the thing itself, because the other way of telling the two apart —
   * "is it held at its size on the glass" (`Screened`) — is about SIZE and stopped being true of a
   * ring the day the ring grew to hold cards. A control that is felt-sized is still a control.
   */
  readonly ride?: "hand" | "felt" | undefined;
}

export const Carry = defineAtom<CarryFields>({
  name: "Carry",
  classes: { orient: "own", ride: "own" },
  requires: [],
  defaults: { orient: "keep", ride: "hand" },
});

export function carryOrientOf(n: Node): "holder" | "keep" {
  return fieldsOf<CarryFields>(n, "Carry")?.orient ?? "keep";
}

/**
 * IS THIS CARRIED ALONG THE FELT — no lift, no flight, and no picture of a landing under it.
 *
 * Two ways of saying one thing, and both are read here so there is one answer to the question. A
 * node held at its size on the glass (`Screened`) was never lying on the felt at all — a handle, an
 * avatar — and a node that says `ride: "felt"` is lying on it and never leaves it.
 */
export function ridesFelt(n: Node): boolean {
  return screened(n) || fieldsOf<CarryFields>(n, "Carry")?.ride === "felt";
}

/**
 * THE TURN A HOLDER-FACING PIECE RESTS AT, given the holder's own view matrix — in DEGREES.
 *
 * The view turns the table onto the glass, so a piece lying at `A` is drawn at `A + R`. "Upright to
 * whoever is holding it" is therefore `A = -R`, and that one negation is the whole of this: the
 * carry aims the in-hand pose at it, and the landing writes the same number into the tree, so the
 * turn the hand had does not change when the hand lets go.
 *
 * Read off the MATRIX and not off a camera's `rotation` field, because the two paths that need it —
 * the drag's own drop and the scene's throw — must not be able to disagree: the view is what the
 * finger was already read through, and a desk with no view at all is a desk facing north.
 */
export function holderTurn(view: Transform | undefined): number {
  return view ? -Math.atan2(view.b, view.a) * 180 / Math.PI : 0;
}

/**
 * The lean a speed ASKS FOR, in DEGREES (what `rotate` speaks). `factor` turns speed (root units per
 * second — the chase spring's velocity, which is the finger's speed smoothed) into degrees; `maxDeg`
 * is the saturation, so a brisk flick pins the lean instead of spinning. Sign follows the direction
 * of travel. This IS the liveliness of a drag: the position is 1:1 under the hand, so what says
 * "this thing has weight" is the bank, not a trailing position.
 *
 * A TARGET, not the angle drawn. Because it saturates, an ordinary drag holds it pinned at the
 * limit, so a hand that turns round would trade `+maxDeg` for `-maxDeg` within a few frames; the
 * runtime banks toward this through a spring of its own (`leanStiffness`) so the swing has weight.
 */
export function lean(velX: number, factor: number, maxDeg: number): number {
  return clampAbs(velX * factor, maxDeg);
}

/**
 * THE SAME LEAN, asked with a velocity that is in the DESK's units but read against the ONLOOKER's
 * own screen — what a node framed to the viewer (`Oriented: "viewer"`) needs instead of `lean`.
 *
 * A world-framed run leans by its `x` in TABLE coordinates because it never turns relative to the
 * table it is dragged across. A billboard is drawn upright on the GLASS regardless of the camera's
 * turn (`scenePlan`'s `rotation`), so its bank must answer the same question in the same frame: the
 * table velocity is turned into screen space by the camera's own rotation before the bank reads its
 * `x` — the same "against the direction of travel" a seat on the far side of the table sees, however
 * that camera is turned. A `rotationDeg` of 0 (no camera, or a camera facing straight on) reduces to
 * `lean` exactly.
 */
export function screenLean(vel: Vec, factor: number, maxDeg: number, rotationDeg: number): number {
  const screen = rotationDeg ? apply(rotate(rotationDeg), vel) : vel;
  return lean(screen.x, factor, maxDeg);
}

/** What a style needs to place one carried card, in root-unit space. */
export interface CarryContext {
  /** The grab pivot — where the finger is, exactly: a held run rides the hand 1:1, it does not trail it. */
  readonly anchor: Vec;
  /** This card's base layout offset from the pivot (the game's stacking, e.g. `{x:0, y:i*step}`). */
  readonly offset: Vec;
  /** The group lean this frame, degrees, already clamped. */
  readonly leanDeg: number;
  /** The lift scale this frame (~1 at rest, a touch above while held). */
  readonly lift: number;
  /** Index in the run (bottom = 0) and the run length — for styles that vary by position. */
  readonly i: number;
  readonly n: number;
}

/** A carry style: one carried card's in-flight pose (a root-unit override), from its context. */
export type CarryStyle = (ctx: CarryContext) => Transform;

const STYLES = new Map<string, CarryStyle>();

export function registerCarry(name: string, style: CarryStyle): void {
  STYLES.set(name, style);
}

/** The named style, or `rigid` when unknown — an unknown feel never throws, it just stays coherent. */
export function carry(name: string): CarryStyle {
  return STYLES.get(name) ?? rigidCarry;
}

/** Test seam only — the registry is process-wide and suites must not leak into each other. */
export function resetCarries(): void {
  STYLES.clear();
}

/**
 * The run is one rigid body: place the card by its offset, THEN turn and scale the whole assembly
 * about the pivot. Because `move(offset)` is innermost, the offset rotates with the lean — the
 * column stays a plank. A single card (offset zero) reduces to the plain solo lean about the pivot.
 */
export const rigidCarry: CarryStyle = ({ anchor, offset, leanDeg, lift }) =>
  compose(pose(anchor, leanDeg, lift), move(offset.x, offset.y));

/**
 * Each card leans about its OWN centre: the pivot is the card's own seat (anchor + offset), so the
 * offset does NOT turn with the lean. The per-card look — fine on a spread hand, the tear on a column.
 */
export const looseCarry: CarryStyle = ({ anchor, offset, leanDeg, lift }) =>
  pose({ x: anchor.x + offset.x, y: anchor.y + offset.y }, leanDeg, lift);

/** Register the supplied styles under the names the animator's carry defaults to. */
export function installStockCarries(): void {
  registerCarry("rigid", rigidCarry);
  registerCarry("loose", looseCarry);
}
