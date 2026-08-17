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
}

/** A body at rest at `pos`, upright — the seed before a throw gives it a velocity. */
export function bodyAt(pos: Vec, angle = 0): Body {
  return { pos, vel: { x: 0, y: 0 }, angle, spin: 0 };
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
  return { pos: { x: b.pos.x + b.vel.x * dt, y }, vel: { x: b.vel.x, y: velY }, angle: b.angle + b.spin * dt, spin: b.spin };
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
  /** Restitution off a wall, 0..1. */
  readonly bounce: number;
  /** The tray. Absent, the desk is endless. */
  readonly walls?: Walls | undefined;
}

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
  const w = cfg.walls;
  if (w) {
    if (x < w.x0 && vx < 0) { x = w.x0; vx = -vx * cfg.bounce; }
    else if (x > w.x1 && vx > 0) { x = w.x1; vx = -vx * cfg.bounce; }
    if (y < w.y0 && vy < 0) { y = w.y0; vy = -vy * cfg.bounce; }
    else if (y > w.y1 && vy > 0) { y = w.y1; vy = -vy * cfg.bounce; }
  }
  const spinMag = Math.abs(b.spin);
  const spin = spinMag > 0 ? Math.sign(b.spin) * Math.max(0, spinMag - cfg.spinFriction * dt) : 0;
  return { pos: { x, y }, vel: { x: vx, y: vy }, angle: b.angle + spin * dt, spin };
}

/** True once a sliding body has all but stopped moving AND turning — the gate the clock sleeps on. */
export function slideRests(b: Body, eps: number, spinEps: number): boolean {
  return Math.hypot(b.vel.x, b.vel.y) <= eps && Math.abs(b.spin) <= spinEps;
}
