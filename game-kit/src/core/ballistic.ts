// BALLISTICS — a body that flies on its own once let go, in two worlds the desk actually has:
//
//   • FALL   — down the SCREEN: gravity pulls +y, a floor bounces with restitution. What a card
//              does in the old solitaire's victory cascade, what a chip does tossed off the edge.
//   • SLIDE  — across the DESK, seen from above: no gravity, a GLIDE LAW (`glide.ts`) bleeds speed
//              and spin to a stop, the walls of a tray reflect. What a die does when thrown, what a
//              puck does. The law is the platform's own deceleration rate, so how far a throw gets
//              can be asked BEFORE it is made and the answer holds.
//
// Both are the arithmetic only — headless, per step, like `spring.ts` — so a plain unit test pins
// a bounce without a clock or a GPU. The one clock (the animator) owns the stepping and the
// viewer's speed; a game names a speed and an angle and reads the pose where the body stops.

import { type GlideLaw } from "./glide.js";
import { type Vec } from "./transform.js";

/** A flying body: where it is, how fast it goes, how it is turned and how fast it turns. */
export interface Body {
  readonly pos: Vec;
  /** Root units per second. */
  readonly vel: Vec;
  /** Degrees — the pose's rotation. */
  readonly angle: number;
  /** Degrees per second. */
  readonly spin: number;
  /**
   * HOW HIGH ABOVE THE DESK, root units, and how fast it is rising. A slide has this because a
   * thrown die does not skate — it bounces, and every landing is where a real one changes its mind
   * about which way it was going. `0` all the way is a puck, and that is the default.
   */
  readonly up: number;
  readonly upVel: number;
}

/** A body at rest at `pos`, upright and flat on the desk — the seed before a throw gives it a velocity. */
export function bodyAt(pos: Vec, angle = 0): Body {
  return { pos, vel: { x: 0, y: 0 }, angle, spin: 0, up: 0, upVel: 0 };
}

/** A velocity from a speed and a heading — degrees clockwise from +x, the kit's one angle convention. */
export function velocityOf(speed: number, angleDeg: number): Vec {
  const a = (angleDeg * Math.PI) / 180;
  return { x: speed * Math.cos(a), y: speed * Math.sin(a) };
}

/** The speed and heading of a velocity — the inverse of `velocityOf`, for a throw read off a finger. */
export function polar(v: Vec): { speed: number; angle: number } {
  return { speed: Math.hypot(v.x, v.y), angle: (Math.atan2(v.y, v.x) * 180) / Math.PI };
}

export interface FallConfig {
  /** Down-screen acceleration, units/s². */
  readonly gravity: number;
  /** The y (root units) the body bounces off. Absent, it falls forever. */
  readonly floor?: number | undefined;
  /** Restitution of the bounce, 0..1. */
  readonly bounce: number;
}

/**
 * One step of a screen-fall. Semi-implicit: velocity from gravity first, then position from the new
 * velocity — the order that stays stable on a jittery frame (`spring.ts` says why). A crossing of the
 * floor is resolved by clamping to it and reflecting the vertical speed, scaled by `bounce`; spin is
 * untouched — a falling card keeps turning.
 */
export function stepFall(b: Body, cfg: FallConfig, dt: number): Body {
  const vy = b.vel.y + cfg.gravity * dt;
  let y = b.pos.y + vy * dt;
  let velY = vy;
  if (cfg.floor !== undefined && y > cfg.floor && velY > 0) {
    y = cfg.floor;
    velY = -velY * cfg.bounce;
  }
  // A fall is a fall: it has no hop of its own, and carries whatever height it was handed.
  return { pos: { x: b.pos.x + b.vel.x * dt, y }, vel: { x: b.vel.x, y: velY }, angle: b.angle + b.spin * dt, spin: b.spin, up: b.up, upVel: b.upVel };
}

/** An axis-aligned box in root units — the walls of a tray a sliding body stays inside. */
export interface Walls {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface SlideConfig {
  /**
   * HOW THE DESK TAKES THE SPEED AWAY — a named law, not a number of units per second squared
   * (`glide.ts`). Exponential, with Apple's own `decelerationRate`, because that law is the only one
   * that answers "how far will it get" before the throw and still agrees with the stepping after it.
   */
  readonly glide: GlideLaw;
  /** The same law for the TURN — a card stops turning on its own clock, not on the run's. */
  readonly spinGlide: GlideLaw;
  /** Restitution off a wall, 0..1 — and of a landing, which is the same bounce seen from the side. */
  readonly bounce: number;
  /** The tray. Absent, the desk is endless. */
  readonly walls?: Walls | undefined;
  /** What pulls a hopping body back down, units/s². Only used by a body that is off the desk. */
  readonly gravity?: number | undefined;
  /**
   * WHAT THE AIR DOES TO THE FALL — a glide law on the RISING/FALLING speed, exactly as `glide` is
   * one on the run. Absent, the air is not there and the body falls like a stone, which is what a
   * die does and should.
   *
   * A card is the other case, and it is not a smaller number of the same thing: a card is nearly
   * all surface and hardly any mass, so it reaches a terminal speed almost at once and then comes
   * down at that speed however far it has to go. Gravity alone cannot say that — it only
   * accelerates — so the law that ends the fall's acceleration is the whole of "it is a card".
   */
  readonly airGlide?: GlideLaw | undefined;
  /**
   * A PLACE THE BODY IS DRAWN TOWARD WHILE IT TRAVELS — `UIFieldBehavior.radialGravityField`.
   *
   * Not a snap and not a target: the body keeps flying its own flight, and this leans on it. It is
   * how a seat says "that one was meant for me" without taking the throw away from the player —
   * the run bends toward the seat, and how much is `strength`, in units per second squared.
   *
   * `radius` is how far the field reaches. Outside it there is nothing at all, which is what makes
   * a field DIFFERENT from an attractor: a throw aimed elsewhere is not quietly curved home.
   */
  readonly pull?:
    | {
        readonly to: Vec;
        readonly strength: number;
        readonly radius: number;
        /**
         * HOW CLOSE IS CAUGHT, root units — inside this the flight is OVER, however fast the body
         * was going.
         *
         * A lean alone is not a catch: a hard throw crosses the whole field in a few frames and is
         * barely bent by it, so a seat that only leans watches the card sail past — which is the
         * one thing a seat is there not to do. A hand reaching out and taking a card that comes
         * past is not physics, and pretending otherwise makes the table worse.
         *
         * It is also what keeps a field from holding a body FOREVER. The lean does not know the
         * body has all but stopped, so a piece resting a hair off the middle is pushed, overshoots,
         * is pushed back — a slow orbit that never satisfies "at rest", and a flight that never
         * ends is a card hanging on the glass with the game never told it landed.
         */
        readonly caught: number;
      }
    | undefined;
  /**
   * HOW MUCH A SPINNING BODY CURVES, per unit of spin and speed — the Magnus effect, which is why a
   * card flicked with a twist of the wrist arcs instead of ruling a line.
   *
   * Sideways to the run and proportional to both the turn rate and the speed, so it dies out with
   * the throw rather than curling a body that has stopped. `0` (the default) is a body with no
   * grip on the air at all.
   */
  readonly magnus?: number | undefined;
}

/** How much of the hop a wall gives back on top of what the body had: a die caught by a border pops UP. */
const WALL_KICK = 1.6;
/**
 * How far a landing turns the body, degrees — alternating, so a bouncing die wanders instead of
 * running a straight line. It is small on purpose: a die that changed its mind by a quarter turn a
 * bounce would read as wind, not as a die.
 */
const LAND_TURN = 7;
/** Under this rising speed a landing is the LAST one: the body lies down instead of trembling on the spot. */
const HOP_EPS = 0.35;

/**
 * One step of a desk-slide. The glide law takes a fixed FRACTION of the speed per millisecond, so
 * the speed decays towards zero and never crosses it — a body that has all but stopped drifts the
 * last hair instead of jerking still. Spin bleeds by its own law. A wall reflects the component that
 * crossed it, scaled by `bounce`, and clamps the position back inside, so a fast body cannot tunnel
 * out of a thin tray on one frame.
 *
 * The position moves by the law's own `travel` and not by `v·dt`: `travel` is the integral the
 * projection is taken from, so a body stepped to rest lands where `project` said it would, at any
 * frame rate. That equality is what lets a throw be AIMED — see `glide.ts`.
 */
export function stepSlide(b: Body, cfg: SlideConfig, dt: number): Body {
  const k = cfg.glide.after(dt);
  let vx = b.vel.x * k;
  let vy = b.vel.y * k;
  // THE AIR AND THE SEAT LEAN ON THE RUN, and both are accelerations rather than laws of decay, so
  // they are added to the speed AFTER the glide has taken its fraction of it — the desk's grip is a
  // property of the body, and these are things the world is doing to it.
  //
  // A SPINNING BODY CURVES: sideways to the run, in proportion to the turn and to the speed. The
  // left-hand normal of the heading times the spin gives the sign, so a card twisted one way arcs
  // one way, and a card that has stopped turning stops arcing.
  if (cfg.magnus) {
    const speed = Math.hypot(vx, vy);
    if (speed > 0) {
      const sway = ((cfg.magnus * b.spin * Math.PI) / 180) * dt;
      const nx = -(vy / speed) * sway;
      const ny = (vx / speed) * sway;
      vx += nx * speed;
      vy += ny * speed;
    }
  }
  // A SEAT LEANING ON THE THROW — a field and not a target. It reaches only `radius`, and it leans
  // hardest at the middle and not at all at the rim, so a run that merely grazes the zone is nudged
  // while one aimed at the middle is properly gathered in.
  if (cfg.pull) {
    const dx = cfg.pull.to.x - b.pos.x;
    const dy = cfg.pull.to.y - b.pos.y;
    const gap = Math.hypot(dx, dy);
    if (gap > 0 && gap < cfg.pull.radius) {
      const near = 1 - gap / cfg.pull.radius;
      const a = cfg.pull.strength * near * dt;
      vx += (dx / gap) * a;
      vy += (dy / gap) * a;
    }
  }
  // Per unit of speed, so the step is exact for both axes at once and asks nothing of the heading.
  // Taken on the speed the body ENDS the step with, so what the air and the field just added is
  // travelled this frame rather than the next.
  const run = cfg.glide.travel(1, dt);
  let x = b.pos.x + (vx / (k || 1)) * run;
  let y = b.pos.y + (vy / (k || 1)) * run;
  // The hop, one axis of its own: gravity pulls it down, the desk gives back `bounce` of what
  // arrives, and the body is HELD by nothing else — a body with no hop in it never leaves zero.
  let up = b.up;
  let upVel = b.upVel;
  let hopped = false;
  if (up > 0 || upVel > 0) {
    upVel -= (cfg.gravity ?? 0) * dt;
    // THE AIR, if there is any. Gravity only ever accelerates, so a body with no air around it
    // falls like a stone however wide it is; a card is nearly all surface, reaches its terminal
    // speed almost at once and then comes down at that speed the whole way. The law that ends the
    // acceleration is the whole difference between a card and a die.
    if (cfg.airGlide) upVel *= cfg.airGlide.after(dt);
    up += upVel * dt;
    if (up <= 0) {
      up = 0;
      // A landing: what comes back up, and the small change of mind that makes a bouncing die
      // wander. Alternating rather than random — the runtime has one clock and no dice of its own.
      const back = -upVel * cfg.bounce;
      hopped = back > HOP_EPS;
      upVel = hopped ? back : 0;
    }
  }
  const w = cfg.walls;
  let kicked = false;
  if (w) {
    if (x < w.x0 && vx < 0) { x = w.x0; vx = -vx * cfg.bounce; kicked = true; }
    else if (x > w.x1 && vx > 0) { x = w.x1; vx = -vx * cfg.bounce; kicked = true; }
    if (y < w.y0 && vy < 0) { y = w.y0; vy = -vy * cfg.bounce; kicked = true; }
    else if (y > w.y1 && vy > 0) { y = w.y1; vy = -vy * cfg.bounce; kicked = true; }
  }
  // A WALL THROWS IT UP. A die that catches a border does not slide along it — it pops, and the pop
  // is higher than the hop it was already on. A body with no hop in it (a puck, a card) is not
  // thrown anywhere: the wall reflects it and that is all, which is the law the flat slide keeps.
  const hopping = b.up > 0 || b.upVel !== 0 || upVel !== 0;
  if (kicked && hopping) upVel = Math.max(upVel, Math.abs(b.upVel) * WALL_KICK, HOP_EPS * WALL_KICK);
  // Every touch-down and every wall turns the run of the body a little, and the two turn it the
  // same way each time only by accident: the sign follows the height, so it alternates as it hops.
  if (hopped || (kicked && hopping)) {
    const turn = ((up > 0 || upVel > 0 ? 1 : -1) * LAND_TURN * Math.PI) / 180;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const tx = vx * cos - vy * sin;
    vy = vx * sin + vy * cos;
    vx = tx;
  }
  const spin = b.spin * cfg.spinGlide.after(dt);
  // Signed, and by the law's integral for the same reason the run is: how far it turns over the
  // step is a distance, and `travel` is linear in the speed it is handed, so the sign carries.
  return { pos: { x, y }, vel: { x: vx, y: vy }, angle: b.angle + cfg.spinGlide.travel(b.spin, dt), spin, up, upVel };
}

/**
 * IS THE BODY IN THE HANDS OF A FIELD — inside the radius the field calls caught. `false` when
 * there is no field, which is most throws.
 */
export function slideCaught(b: Body, cfg: SlideConfig): boolean {
  if (!cfg.pull) return false;
  return Math.hypot(b.pos.x - cfg.pull.to.x, b.pos.y - cfg.pull.to.y) <= cfg.pull.caught;
}

/**
 * True once a sliding body has all but stopped moving AND turning — the gate the clock sleeps on.
 * A body still in the air is never at rest, however slowly it is drifting: it has a landing to make.
 */
export function slideRests(b: Body, eps: number, spinEps: number): boolean {
  // A BODY WHOSE OWN NUMBERS HAVE GONE IS FINISHED, whatever else is true of it — the same law the
  // snap keeps, and for the same reason: a flight that cannot be finished must not be immortal.
  if (![b.pos.x, b.pos.y, b.vel.x, b.vel.y, b.up, b.upVel, b.spin].every(Number.isFinite)) return true;
  return Math.hypot(b.vel.x, b.vel.y) <= eps && Math.abs(b.spin) <= spinEps && b.up <= 0 && b.upVel <= 0;
}
