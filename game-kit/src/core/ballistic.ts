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
export interface BoxWalls {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/**
 * A ROUND tray, in root units — a felt with no corners, which a rectangle cannot say however many
 * numbers it is given. A body inside it is inside a DISC, and what stops it is the one wall it has,
 * everywhere normal to the line from the middle.
 */
export interface RingWalls {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

/** The tray a carried or sliding body stays inside: a box or a disc. */
export type Walls = BoxWalls | RingWalls;

/**
 * WHICH OF THE TWO A TRAY IS — asked HERE and nowhere else.
 *
 * The shape of a wall is arithmetic, and arithmetic about walls lives in this file: a hand's clamp
 * (`insideWalls`) and a slide's bounce (`stepSlide`) are the only two readers there are, and both
 * are below. A consumer names a tray and never asks what sort it is.
 */
const isRing = (w: Walls): w is RingWalls => (w as RingWalls).r !== undefined;

/**
 * THE NEAREST POINT THE TRAY ALLOWS — the clamp a carried run is under, and the one a wall-check
 * measures "how far past it is the finger" from.
 */
export function insideWalls(w: Walls, at: Vec): Vec {
  if (!isRing(w)) return { x: Math.min(w.x1, Math.max(w.x0, at.x)), y: Math.min(w.y1, Math.max(w.y0, at.y)) };
  const dx = at.x - w.cx;
  const dy = at.y - w.cy;
  const gap = Math.hypot(dx, dy);
  if (gap <= w.r) return at;
  // Dead centre cannot be outside a disc, so `gap` is never zero here and the direction is real.
  return { x: w.cx + (dx / gap) * w.r, y: w.cy + (dy / gap) * w.r };
}

export interface SlideConfig {
  /** Deceleration of the slide, units/s² — how quickly the desk eats the speed. */
  readonly friction: number;
  /** Deceleration of the spin, degrees/s². */
  readonly spinFriction: number;
  /** Restitution of a LANDING, 0..1 — how much of the arriving fall the desk gives back. */
  readonly bounce: number;
  /**
   * Restitution off a WALL, 0..1. Absent, the desk's own — which is right for a die, and only for a
   * die: a felt and a rail are not the same material, and the pieces that touch them are not the
   * same either. A card is dead on the cloth and still comes off a border; a carved piece is heavy
   * against a rail and lands like a stone. One number for both makes every such pair unsayable.
   */
  readonly wallBounce?: number | undefined;
  /**
   * How much of a HOP a wall adds back on top of what the body had — see `WALL_KICK`, which is the
   * default. `0` and a wall does nothing but reflect: it takes speed across the desk and gives none
   * of it back upwards.
   *
   * A die caught by the rail of its own tray pops, and that is worth having. Anything else on a desk
   * does not: a piece coming DOWN from a hand, which is every release on a desk people play on, has
   * a height only because it has not landed yet — kicked by a border it climbs back into the air it
   * was falling out of, and nothing about that reads as a thing hitting a wall.
   */
  readonly wallKick?: number | undefined;
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
  const off = cfg.wallBounce ?? cfg.bounce;
  let kicked = false;
  if (w && isRing(w)) {
    // ONE WALL, AND ITS NORMAL IS WHEREVER THE BODY MET IT. A box reflects the component that
    // crossed an axis; a disc has no axes, so the reflection is about the line from the middle —
    // `v - (1 + off) * (v·n) n`, which IS the box's `-v * off` written for a normal that turns.
    const dx = x - w.cx;
    const dy = y - w.cy;
    const gap = Math.hypot(dx, dy);
    if (gap > w.r) {
      const nx = dx / gap;
      const ny = dy / gap;
      const into = vx * nx + vy * ny;
      if (into > 0) {
        x = w.cx + nx * w.r;
        y = w.cy + ny * w.r;
        vx -= (1 + off) * into * nx;
        vy -= (1 + off) * into * ny;
        kicked = true;
      }
    }
  } else if (w) {
    if (x < w.x0 && vx < 0) { x = w.x0; vx = -vx * off; kicked = true; }
    else if (x > w.x1 && vx > 0) { x = w.x1; vx = -vx * off; kicked = true; }
    if (y < w.y0 && vy < 0) { y = w.y0; vy = -vy * off; kicked = true; }
    else if (y > w.y1 && vy > 0) { y = w.y1; vy = -vy * off; kicked = true; }
  }
  // A WALL THROWS IT UP. A die that catches a border does not slide along it — it pops, and the pop
  // is higher than the hop it was already on. A body with no hop in it (a puck, a card) is not
  // thrown anywhere: the wall reflects it and that is all, which is the law the flat slide keeps.
  const hopping = b.up > 0 || b.upVel !== 0 || upVel !== 0;
  const kick = cfg.wallKick ?? WALL_KICK;
  if (kicked && hopping && kick > 0) upVel = Math.max(upVel, Math.abs(b.upVel) * kick, HOP_EPS * kick);
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
 * TWO BODIES ON ONE DESK CANNOT BE IN THE SAME PLACE — push them apart and let them bounce.
 *
 * The walls are not the only thing a thrown piece can hit. Two dice let go of together travel the
 * same way at nearly the same speed, and nothing in a one-body physics has an opinion about that:
 * they arrive stacked, one drawn over the other, which is not a pair of dice at all — it is one die
 * with a shadow, and the second result is unreadable.
 *
 * ROUND, and deliberately. A die is square and the honest answer is a polygon solve with contact
 * points and angular impulse, which is a physics engine and not a desk. A disc gives what a player
 * actually reads — they never end up on top of each other, and they leave each other going
 * somewhere else — for two lines of arithmetic. Where the two answers differ is a corner-on-corner
 * touch, and a die that separated a hair early is not a thing anybody can see.
 *
 * The push is split evenly and the exchange is along the line between the centres, which is what an
 * equal-mass collision does; the tangent components are untouched, so a glancing blow glances.
 * Either of them may instead HOLD ITS PLACE (`fixed`), and then it is a wall: the other one gives
 * way entirely and bounces off it, and the wall does not stir.
 * Bodies at different HEIGHTS still collide: on a desk seen from above, one die hopping over another
 * reads as one die on top of another, and it is the picture that has to be right.
 *
 * Returns the pair, or `undefined` when they were never in each other's way — so a caller can skip
 * the write on the frames where nothing happened, which is nearly all of them.
 */
/** Neither of them holds its place — the ordinary case, where both are free to be moved. */
const BOTH_FREE = { a: false, b: false };

export function separate(
  a: Body,
  b: Body,
  girth: number,
  bounce: number,
  /**
   * WHICH OF THEM HOLDS ITS PLACE — a body nothing can move, however hard it is hit.
   *
   * Infinite mass, and it is what "already lying there" means when something is put down beside it
   * rather than thrown at it. A piece coming down from above has no business shoving the felt's
   * furniture aside: it gives way, all of it, and what it hit does not stir. Hit by something
   * genuinely travelling, the same furniture is an ordinary body again and gets sent on its way —
   * which is the caller's decision, not this function's.
   */
  fixed: { readonly a: boolean; readonly b: boolean } = BOTH_FREE,
): { readonly a: Body; readonly b: Body } | undefined {
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  const gap = Math.hypot(dx, dy);
  if (gap >= girth) return undefined;
  // DEAD CENTRE IS A DIRECTION TOO. Two bodies at exactly the same point have no line between them
  // to push along, and `0/0` would put them both at NaN and take the scene with it. Any direction
  // will do as long as it is a direction; +x is one, and it is reached only by a throw that put two
  // pieces on the same pixel.
  const ux = gap > 0 ? dx / gap : 1;
  const uy = gap > 0 ? dy / gap : 0;
  const overlap = girth - gap;
  // WHOEVER IS TRAVELLING IS THE ONE WHO GIVES WAY, in proportion to how fast.
  //
  // A body that is not going anywhere cannot be shoved by one that arrives on top of it. Dropped
  // from above, a die comes down with nothing across the desk in it: split the correction evenly and
  // the chip it lands beside is teleported half a chip sideways by a die that was never coming at
  // it — a shove out of nowhere, and one the eye reads as the desk twitching.
  //
  // Thrown, the same die is travelling, the chip is not, and the whole correction lands on the die.
  // What moves the chip then is the EXCHANGE below, which is the throw's own speed arriving — so a
  // throw scatters what it hits and a drop settles in beside it, out of one rule rather than two.
  // Neither of them moving (two pieces put down on one spot by a hand) has no answer in speed, and
  // then even is the only fair split there is.
  // Two fixed bodies have no way of parting and nothing that could make them: they were put where
  // they are, and the desk that put them there is the only thing that can move them again.
  if (fixed.a && fixed.b) return undefined;
  const pushA = fixed.a ? 0 : fixed.b ? overlap : overlap / 2;
  const pushB = overlap - pushA;
  const apart = {
    a: { pos: { x: a.pos.x - ux * pushA, y: a.pos.y - uy * pushA } },
    b: { pos: { x: b.pos.x + ux * pushB, y: b.pos.y + uy * pushB } },
  };
  // ...AND ONLY THEN THE BOUNCE, and only if they were actually closing. Two bodies already moving
  // apart are overlapping because they were PUT there, and swapping their speeds would suck them
  // back together — a pair that trembled against each other for ever instead of leaving.
  const closing = (b.vel.x - a.vel.x) * ux + (b.vel.y - a.vel.y) * uy;
  if (closing >= 0) return { a: { ...a, ...apart.a }, b: { ...b, ...apart.b } };
  // Equal masses share the exchange; against a body that holds its place there is nothing to share,
  // so the whole of it comes back to the one that arrived — which is a bounce off a wall, and a
  // wall is exactly what a piece nothing can move is.
  const swap = -(1 + bounce) * closing * (fixed.a || fixed.b ? 1 : 0.5);
  return {
    a: { ...a, ...apart.a, ...(fixed.a ? {} : { vel: { x: a.vel.x - ux * swap, y: a.vel.y - uy * swap } }) },
    b: { ...b, ...apart.b, ...(fixed.b ? {} : { vel: { x: b.vel.x + ux * swap, y: b.vel.y + uy * swap } }) },
  };
}

/**
 * True once a sliding body has all but stopped moving AND turning — the gate the clock sleeps on.
 * A body still in the air is never at rest, however slowly it is drifting: it has a landing to make.
 */
export function slideRests(b: Body, eps: number, spinEps: number): boolean {
  return Math.hypot(b.vel.x, b.vel.y) <= eps && Math.abs(b.spin) <= spinEps && b.up <= 0 && b.upVel <= 0;
}
