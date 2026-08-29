// HOW BIG A HELD THING HAS TO BE — the arithmetic of a lift, and the reason a multiplier cannot say it.
//
// `MotionTuning.lift` is a MULTIPLIER: the small pop of a picked-up card, the same for everything.
// That is right for what it is for — the piece acknowledging the hand — and it is the wrong shape
// for the question this file answers, which is not "how much bigger" but "big enough for WHAT".
//
// The case that forces it: a pack held under one finger, dealt off by another. The second finger
// has to land ON the pack, beside the first, and whether it can is a fact about GLASS PIXELS. A
// pack a third of a unit across is thirty pixels on a phone at the fit — there is no room beside a
// finger there, and no multiplier a designer picks will be right on the next device, at the next
// zoom, or for the next piece. A multiplier is relative to the piece; a finger is relative to the
// HAND, and the hand is the thing that does not change.
//
// So the lever here is a TARGET, and the scale is derived:
//
//     scale = (fingers × finger px) / (the piece's own width on the glass)
//
// with the glass width being the piece's size in units times the HUD etalon times the camera's
// zoom. Every term is already known to the runtime, and every one of them belongs: a bigger etalon
// means a piece already big enough, and a camera zoomed in means the same. Clamped below at `1` (a
// lift never shrinks — a piece that is already roomy is picked up at its own size) and above at
// `max`, because a piece blown up past recognition is a different problem from a piece too small.
//
// WHAT THIS FILE DOES NOT DECIDE: which pieces lift, or by how many fingers. Those are the game's,
// and on this shelf they are one page's answer about one pack.

import { extentOf, footprint } from "../core/atoms/bounded.js";
import { type Node } from "../core/node.js";

/**
 * WHAT A FINGER IS WORTH ON THE GLASS, CSS pixels.
 *
 * Not a guess: it is the platform minimum both phone makers landed on independently — 44pt on iOS,
 * 48dp on Android — which is about nine millimetres, and about the width of the contact patch an
 * adult fingertip actually makes. A target smaller than this is one people miss, and two of them
 * side by side is the smallest thing two fingers can share.
 */
export const FINGER_PX = 44;

export interface LiftFit {
  /**
   * HOW MANY FINGERS THE HELD PIECE MUST OFFER across its narrow side.
   *
   * `2` is the ARITHMETIC minimum for two fingers: the first sits in the middle, and the second's
   * centre lands exactly on the edge. That is sufficient and not comfortable — a hand does not
   * place fingers at ideal centres — so a little over two is what a page that means it should ask
   * for. `1` is "big enough to be held accurately", which is what a piece nobody deals off wants.
   */
  readonly fingers: number;
  /**
   * The most it may grow, as a multiple of its own size. A piece blown up past recognition is a
   * different complaint from a piece too small to touch, and this is the line between them.
   */
  readonly max: number;
  /** What a finger is worth on this glass, CSS px. Absent, `FINGER_PX`. */
  readonly finger?: number | undefined;
}

/**
 * What one root unit is worth on the glass: the HUD etalon, times the camera's zoom when there is
 * a camera. This is the whole of what stands between a size in the model and a size under a thumb.
 */
export function glassPerUnit(unit: number, zoom = 1): number {
  return unit * zoom;
}

/** The NARROW side of a node's footprint, root units — the side a second finger has to share. */
export function acrossOf(n: Node): number {
  const box = footprint(n);
  if (!box) return 0;
  const { w, h } = extentOf(box);
  return Math.min(w, h);
}

/**
 * The scale a held piece must take to offer `fit.fingers` fingers across `across` root units, on a
 * glass worth `pxPerUnit` per unit. Never below `1`, never above `fit.max`.
 *
 * A piece with no size at all — measured before layout, or one that draws nothing — lifts by `1`:
 * there is no width to divide into, and a guess would be a number nobody could account for.
 */
export function liftToFit(across: number, pxPerUnit: number, fit: LiftFit): number {
  const have = across * pxPerUnit;
  if (!(have > 0)) return 1;
  const want = fit.fingers * (fit.finger ?? FINGER_PX);
  const need = want / have;
  if (!(need > 1)) return 1;
  return need > fit.max ? fit.max : need;
}
