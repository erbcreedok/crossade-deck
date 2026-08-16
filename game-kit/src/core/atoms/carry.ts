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

import { compose, move, pose, type Transform, type Vec } from "../transform.js";
import { clampAbs } from "../spring.js";

/**
 * How much a card leans into its motion, in DEGREES (what `rotate` speaks). `factor` turns speed
 * (root units per second, the spring's own velocity) into degrees; `maxDeg` is the saturation, so a
 * brisk flick pins the lean instead of spinning. Sign follows the direction of travel.
 */
export function lean(velX: number, factor: number, maxDeg: number): number {
  return clampAbs(velX * factor, maxDeg);
}

/** What a style needs to place one carried card, in root-unit space. */
export interface CarryContext {
  /** The springed grab pivot — where the finger is, lagged. */
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
