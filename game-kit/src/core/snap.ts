// THE SNAP — a body that is already moving, being PULLED to a place it has to end up in.
//
// This is `UISnapBehavior` and nothing more clever: attach it to an item and the item keeps its own
// momentum while a spring draws it in, so a piece arriving fast is CAUGHT at speed and a piece
// arriving a little off is tugged the last hair. Both readings of "the zone catches it" are the one
// behaviour, and neither is a special case anybody has to write.
//
// WHAT IT REPLACED, and why that was worth a file. A throw aimed at a seat used to be arithmetic:
// work out where the body would stop, compare that with the seat, decide "it gets there" or "it
// does not", throw it, and then — when it landed somewhere near — move it onto the seat. That last
// move is a correction, and a correction at the end of a flight is exactly the jerk a player sees.
// A snap has no end correction because it has no separate end: the target is where the spring was
// pulling all along, and the body simply stops being distinguishable from it.
//
// THE TWO NUMBERS ARE SwiftUI'S, not invented here — `Animation.spring(response:dampingFraction:)`:
//   • `response` is the period of one full swing of the undamped spring, in SECONDS. It is a
//     duration and reads like one: halve it and everything happens twice as fast.
//   • `damping` is the fraction of critical damping. `1` arrives with no overshoot at all; below
//     one it overshoots and eases back; above one it is sluggish. It is dimensionless, so it
//     survives every change of `response` unchanged.
// The Swift side sets the same pair on the same animation. That is the whole reason for preferring
// them to a raw stiffness and a raw damping coefficient, which do not survive the crossing.
//
// HEIGHT IS PULLED THE SAME WAY, and it is what makes two different flights one behaviour. A dealt
// card is pulled to a seat AND down to the desk (`up: 0`), so it loses height as it travels and its
// apparent size follows the height — one thing, not a second animation. A card that found nobody is
// pulled back to the pack and to a height ABOVE the desk, so it comes home without ever touching
// the felt. Same arithmetic, different targets.
//
// THE TURN IS NOT AIMED ANYWHERE. It runs out under the glide law and stops where it stops: a card
// that comes to rest a little crooked is a card that was thrown, and squaring it up is the tell
// that nothing was.

import { type Body } from "./ballistic.js";
import { type GlideLaw } from "./glide.js";
import { stepSpring, type SpringConfig } from "./spring.js";
import { type Vec } from "./transform.js";

export interface SnapConfig {
  /** Where the body is pulled, root units. */
  readonly to: Vec;
  /**
   * The HEIGHT it is pulled to, root units above the desk. `0` — the default — is the desk itself,
   * which is what a dealt card wants. Anything above it is a body that comes home through the air.
   */
  readonly up?: number | undefined;
  /** The period of one full swing, seconds — SwiftUI's `response`. */
  readonly response: number;
  /** The fraction of critical damping — SwiftUI's `dampingFraction`. `1` arrives without overshoot. */
  readonly damping: number;
  /** What bleeds the TURN. The snap aims the position; the turn merely runs out. */
  readonly spinGlide: GlideLaw;
}

/** SwiftUI's `response`/`dampingFraction` as the stiffness and damping coefficient a spring steps by. */
export function springOf(response: number, damping: number): SpringConfig {
  // A response of zero would be an infinitely stiff spring — a teleport wearing an animation's
  // clothes. Refused at the floor of one frame at 60 Hz rather than dividing by zero.
  const w = (2 * Math.PI) / Math.max(response, 1 / 60);
  return { stiffness: w * w, damping: 2 * damping * w };
}

/**
 * One step of a snap. Position, and height, spring toward their targets from whatever velocity the
 * body already has — which is what "caught at speed" means arithmetically: nothing is thrown away
 * at the moment the snap takes over, so there is no seam to see.
 */
export function stepSnap(b: Body, cfg: SnapConfig, dt: number): Body {
  const spring = springOf(cfg.response, cfg.damping);
  const x = stepSpring({ pos: b.pos.x, vel: b.vel.x }, cfg.to.x, spring, dt);
  const y = stepSpring({ pos: b.pos.y, vel: b.vel.y }, cfg.to.y, spring, dt);
  const up = stepSpring({ pos: b.up, vel: b.upVel }, cfg.up ?? 0, spring, dt);
  const spin = b.spin * cfg.spinGlide.after(dt);
  return {
    pos: { x: x.pos, y: y.pos },
    vel: { x: x.vel, y: y.vel },
    angle: b.angle + cfg.spinGlide.travel(b.spin, dt),
    spin,
    up: up.pos,
    upVel: up.vel,
  };
}

/**
 * True once the body has all but arrived and all but stopped — position, height and turn alike.
 *
 * The turn is in the test on purpose. A card that has reached its slot while still spinning is not
 * finished: let the flight end there and the last of the turn is thrown away, which reads as the
 * card being snatched into place at the very last moment.
 */
export function snapRests(b: Body, cfg: SnapConfig, eps: number, spinEps: number): boolean {
  const off = Math.hypot(b.pos.x - cfg.to.x, b.pos.y - cfg.to.y);
  const speed = Math.hypot(b.vel.x, b.vel.y);
  return (
    off <= eps &&
    speed <= eps &&
    Math.abs(b.up - (cfg.up ?? 0)) <= eps &&
    Math.abs(b.upVel) <= eps &&
    Math.abs(b.spin) <= spinEps
  );
}

/**
 * WOULD A BODY GOING THIS WAY PASS THROUGH THIS ZONE — asked BEFORE the throw, which is the whole
 * point of it. The run is a straight segment from `from` to where the glide law says the body stops
 * (`project`), and the zone is a circle: a seat with a radius, a tray, a hand's reach.
 *
 * The answer is the closest point ON that segment to the zone's middle, so it is also WHERE along
 * the run the zone would take the body — a throw that clips the far edge is caught late, and a
 * throw straight through the middle is caught in the middle, and the two look different because
 * they are different.
 */
export function crossesZone(
  from: Vec,
  velocity: Vec,
  glide: GlideLaw,
  zone: { readonly at: Vec; readonly radius: number },
): boolean {
  const reach = glide.project(Math.hypot(velocity.x, velocity.y));
  if (!(reach > 0)) return Math.hypot(zone.at.x - from.x, zone.at.y - from.y) <= zone.radius;
  const speed = Math.hypot(velocity.x, velocity.y);
  const dx = (velocity.x / speed) * reach;
  const dy = (velocity.y / speed) * reach;
  // How far along the run the zone's middle is, as a fraction of it, clamped to the run's own ends:
  // a zone BEHIND the throw is not crossed, and one past the end of it is not crossed either.
  const t = Math.min(1, Math.max(0, ((zone.at.x - from.x) * dx + (zone.at.y - from.y) * dy) / (reach * reach)));
  const nearX = from.x + dx * t;
  const nearY = from.y + dy * t;
  return Math.hypot(zone.at.x - nearX, zone.at.y - nearY) <= zone.radius;
}
