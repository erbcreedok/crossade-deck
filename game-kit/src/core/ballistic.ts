// BALLISTICS — a body that flies on its own once let go, in two worlds the desk actually has:
//
//   • FALL   — down the SCREEN: gravity pulls +y, a floor bounces with restitution. What a card
//              does in the old solitaire's victory cascade, what a chip does tossed off the edge.
//   • SLIDE  — across the DESK, seen from above: no gravity, friction bleeds speed and spin to a
//              stop, the walls of a tray reflect. What a die does when thrown, what a puck does.
//
// Both are the arithmetic only — headless, per step, like `spring.ts` — so a plain unit test pins
// a bounce without a clock or a GPU. The one clock (the animator) owns the stepping and the
// viewer's speed; a game names a speed and an angle and reads the pose where the body stops.

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
  /** Deceleration of the slide, units/s² — how quickly the desk eats the speed. */
  readonly friction: number;
  /** Deceleration of the spin, degrees/s². */
  readonly spinFriction: number;
  /** Restitution off a wall, 0..1 — and of a landing, which is the same bounce seen from the side. */
  readonly bounce: number;
  /** The tray. Absent, the desk is endless. */
  readonly walls?: Walls | undefined;
  /** What pulls a hopping body back down, units/s². Only used by a body that is off the desk. */
  readonly gravity?: number | undefined;
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
 * One step of a desk-slide. Friction takes a fixed amount of speed per second, opposing the motion,
 * and never pushes THROUGH zero — a body that has stopped stays stopped rather than creeping back.
 * Spin bleeds the same way. A wall reflects the component that crossed it, scaled by `bounce`, and
 * clamps the position back inside, so a fast body cannot tunnel out of a thin tray on one frame.
 */
export function stepSlide(b: Body, cfg: SlideConfig, dt: number): Body {
  const speed = Math.hypot(b.vel.x, b.vel.y);
  const slower = Math.max(0, speed - cfg.friction * dt);
  const k = speed > 0 ? slower / speed : 0;
  let vx = b.vel.x * k;
  let vy = b.vel.y * k;
  let x = b.pos.x + vx * dt;
  let y = b.pos.y + vy * dt;
  // The hop, one axis of its own: gravity pulls it down, the desk gives back `bounce` of what
  // arrives, and the body is HELD by nothing else — a body with no hop in it never leaves zero.
  let up = b.up;
  let upVel = b.upVel;
  let hopped = false;
  if (up > 0 || upVel > 0) {
    upVel -= (cfg.gravity ?? 0) * dt;
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
  const spinMag = Math.abs(b.spin);
  const spin = spinMag > 0 ? Math.sign(b.spin) * Math.max(0, spinMag - cfg.spinFriction * dt) : 0;
  return { pos: { x, y }, vel: { x: vx, y: vy }, angle: b.angle + spin * dt, spin, up, upVel };
}

/**
 * True once a sliding body has all but stopped moving AND turning — the gate the clock sleeps on.
 * A body still in the air is never at rest, however slowly it is drifting: it has a landing to make.
 */
export function slideRests(b: Body, eps: number, spinEps: number): boolean {
  return Math.hypot(b.vel.x, b.vel.y) <= eps && Math.abs(b.spin) <= spinEps && b.up <= 0 && b.upVel <= 0;
}
