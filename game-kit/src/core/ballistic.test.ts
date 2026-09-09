// The pure ballistics — a fall down the screen and a slide across the desk, stepped by hand.

import { describe, expect, it } from "vitest";
import { bodyAt, insideWalls, polar, separate, slideRests, stepFall, stepSlide, velocityOf, type Body } from "./ballistic.js";

const DT = 1 / 60;

function runFall(b: Body, cfg: Parameters<typeof stepFall>[1], frames: number): Body[] {
  const path = [b];
  for (let i = 0; i < frames; i++) path.push(stepFall(path[path.length - 1]!, cfg, DT));
  return path;
}
function runSlide(b: Body, cfg: Parameters<typeof stepSlide>[1], frames: number): Body[] {
  const path = [b];
  for (let i = 0; i < frames; i++) path.push(stepSlide(path[path.length - 1]!, cfg, DT));
  return path;
}

describe("ballistic", () => {
  it("ballistic.polar-round-trips — speed and heading to a velocity and back", () => {
    const v = velocityOf(5, 90); // straight down the screen (+y)
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(5);
    const p = polar({ x: 3, y: 4 });
    expect(p.speed).toBeCloseTo(5);
    expect(p.angle).toBeCloseTo(53.13, 1);
    const back = velocityOf(p.speed, p.angle);
    expect(back.x).toBeCloseTo(3);
    expect(back.y).toBeCloseTo(4);
  });

  it("ballistic.a-fall-accelerates-and-bounces — gravity pulls +y, the floor gives it back scaled", () => {
    const start = { ...bodyAt({ x: 0, y: 0 }), vel: { x: 1, y: 0 } };
    const path = runFall(start, { gravity: 10, floor: 1, bounce: 0.5 }, 120);
    // It goes down: y grows and grows faster (a rising vy) until the floor.
    expect(path[10]!.pos.y).toBeGreaterThan(path[5]!.pos.y);
    expect(path[10]!.vel.y).toBeGreaterThan(path[5]!.vel.y);
    // It never sinks below the floor.
    for (const b of path) expect(b.pos.y).toBeLessThanOrEqual(1 + 1e-9);
    // Somewhere it bounced: a frame with vy pointing UP after one pointing down.
    const bounced = path.some((b, i) => i > 0 && path[i - 1]!.vel.y > 0 && b.vel.y < 0);
    expect(bounced).toBe(true);
    // The rebound is scaled by restitution: the first upward speed is about half the impact speed.
    const i = path.findIndex((b, k) => k > 0 && path[k - 1]!.vel.y > 0 && b.vel.y < 0);
    expect(-path[i]!.vel.y).toBeCloseTo(path[i - 1]!.vel.y * 0.5 + 10 * DT * 0.5, 0);
    // x drifts at constant speed; dt 0 moves nothing.
    expect(path[60]!.pos.x).toBeCloseTo(1, 1);
    expect(stepFall(start, { gravity: 10, bounce: 0.5 }, 0)).toEqual(start);
  });

  it("ballistic.no-floor-falls-forever — absent a floor the body keeps going", () => {
    const path = runFall(bodyAt({ x: 0, y: 0 }), { gravity: 10, bounce: 0.5 }, 200);
    expect(path[200]!.pos.y).toBeGreaterThan(5);
    expect(path.every((b) => b.vel.y >= 0)).toBe(true); // never reflected
  });

  it("ballistic.a-slide-bleeds-to-a-stop — friction takes speed and spin, and never pushes through zero", () => {
    const start: Body = { pos: { x: 0, y: 0 }, vel: velocityOf(3, 0), angle: 0, spin: 360, up: 0, upVel: 0 };
    const cfg = { friction: 6, spinFriction: 720, bounce: 0.5 };
    const path = runSlide(start, cfg, 120);
    // Speed only ever drops; it reaches zero and stays there — no reversal.
    for (let i = 1; i < path.length; i++) {
      expect(Math.hypot(path[i]!.vel.x, path[i]!.vel.y)).toBeLessThanOrEqual(Math.hypot(path[i - 1]!.vel.x, path[i - 1]!.vel.y) + 1e-9);
      expect(path[i]!.vel.x).toBeGreaterThanOrEqual(0);
    }
    const end = path[path.length - 1]!;
    expect(slideRests(end, 1e-3, 1)).toBe(true);
    // It travelled about v²/(2a) = 9/12 = 0.75 units and turned about 360²/(2·720) = 90° — a hair
    // under both, the semi-implicit step's own discretisation (velocity first, then position).
    expect(end.pos.x).toBeCloseTo(0.75, 1);
    expect(end.angle).toBeGreaterThan(85);
    expect(end.angle).toBeLessThanOrEqual(90);
    expect(end.spin).toBe(0);
    expect(stepSlide(start, cfg, 0)).toEqual(start);
  });

  it("ballistic.a-hopping-slide-bounces-and-wanders — it leaves the desk, lands turned a little, and a wall throws it higher", () => {
    // A thrown die does not skate. It comes off the desk, and every touch-down turns its run a
    // little — which is why a real one wanders instead of running a line to the wall.
    const start: Body = { pos: { x: 0, y: 0 }, vel: velocityOf(4, 0), angle: 0, spin: 0, up: 0, upVel: 3 };
    const cfg = { friction: 2, spinFriction: 0, bounce: 0.5, gravity: 9 };
    const path = runSlide(start, cfg, 200);
    expect(Math.max(...path.map((b) => b.up))).toBeGreaterThan(0.3); // it really left the desk
    const landings = path.filter((b, i) => i > 0 && b.up === 0 && path[i - 1]!.up > 0).length;
    expect(landings).toBeGreaterThan(1); // and came back more than once
    const end = path[path.length - 1]!;
    expect(end.up).toBe(0); // it is lying down at the end, not trembling in the air
    // ...and it left the line it started on: a landing turns the run, so a body launched straight
    // along +x picks up a sideways component it never had.
    expect(Math.max(...path.map((b) => Math.abs(b.vel.y)))).toBeGreaterThan(0.05);
    expect(Math.abs(end.pos.y)).toBeGreaterThan(0.02);
    // A WALL THROWS IT UP: the same throw into a border leaves the desk higher than it ever did free.
    const free = Math.max(...path.map((b) => b.up));
    const boxed = Math.max(
      ...runSlide(start, { ...cfg, walls: { x0: -1, y0: -1, x1: 0.35, y1: 1 } }, 200).map((b) => b.up),
    );
    expect(boxed).toBeGreaterThan(free);
    // And a body with no hop in it is a puck: the wall reflects it and nothing lifts.
    const flat = runSlide({ ...start, upVel: 0 }, { ...cfg, walls: { x0: -1, y0: -1, x1: 0.35, y1: 1 } }, 200);
    expect(Math.max(...flat.map((b) => b.up))).toBe(0);
    // THE POP IS THE TRAY'S, NOT THE WALL'S: `wallKick: 0` and a border only reflects. A die in the
    // rail of its own tray pops and that is worth having; a piece coming DOWN from a hand — which is
    // every release on a desk people play on — would be thrown back up into the air it was falling
    // out of, and nothing about that reads as a thing hitting a wall.
    const dead = Math.max(
      ...runSlide(start, { ...cfg, wallKick: 0, walls: { x0: -1, y0: -1, x1: 0.35, y1: 1 } }, 200).map((b) => b.up),
    );
    expect(dead).toBeLessThanOrEqual(free);
  });

  it("ballistic.a-wall-has-its-own-restitution — a felt and a rail are not the same material", () => {
    // One number for both made every such pair unsayable: a card is DEAD on the cloth and still
    // comes off a border, and a carved piece is the other way about. `wallBounce` absent still means
    // the desk's own, which is right for a die and only for a die.
    const cfg = { friction: 0, spinFriction: 0, bounce: 0, walls: { x0: -1, y0: -1, x1: 1, y1: 1 } };
    const start: Body = { pos: { x: 0, y: 0 }, vel: velocityOf(4, 0), angle: 0, spin: 0, up: 0, upVel: 0 };
    // Dead on the desk (`bounce: 0`) and still lively off the wall.
    const off = runSlide(start, { ...cfg, wallBounce: 0.5 }, 60);
    const hit = off.findIndex((b) => b.vel.x < 0);
    expect(hit).toBeGreaterThan(0);
    expect(off[hit]!.vel.x).toBeCloseTo(-2);
    // Absent, the wall is the desk's: a body with `bounce: 0` stops dead against it.
    const flat = runSlide(start, cfg, 60);
    expect(flat.every((b) => b.vel.x >= 0), "nothing came back").toBe(true);
    expect(flat[flat.length - 1]!.pos.x).toBeCloseTo(1, 5);
    // And a LANDING still reads the desk's own number, not the wall's: the two never swapped.
    const dropped: Body = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, angle: 0, spin: 0, up: 1, upVel: 0 };
    const rigid = runSlide(dropped, { friction: 0, spinFriction: 0, bounce: 0, wallBounce: 0.9, gravity: 10 }, 60);
    expect(Math.max(...rigid.map((b) => b.upVel)), "a wall's bounce is not the desk's").toBeLessThanOrEqual(0);
  });

  it("ballistic.a-wall-reflects — the crossing component flips and scales, the body stays inside", () => {
    const start: Body = { pos: { x: 0, y: 0 }, vel: velocityOf(4, 0), angle: 0, spin: 0, up: 0, upVel: 0 };
    const cfg = { friction: 0, spinFriction: 0, bounce: 0.5, walls: { x0: -1, y0: -1, x1: 1, y1: 1 } };
    const path = runSlide(start, cfg, 60);
    for (const b of path) {
      expect(b.pos.x).toBeLessThanOrEqual(1 + 1e-9);
      expect(b.pos.x).toBeGreaterThanOrEqual(-1 - 1e-9);
    }
    const hit = path.findIndex((b) => b.vel.x < 0);
    expect(hit).toBeGreaterThan(0);
    expect(path[hit]!.vel.x).toBeCloseTo(-2); // 4 → −2 at half restitution
  });

  it("ballistic.a-round-wall-reflects — a disc has one wall and its normal turns with the body", () => {
    // A felt with no corners cannot be said with four numbers, and a throw aimed off the middle is
    // where the difference shows: the box would let it out along the diagonal, the disc turns it.
    const start: Body = { pos: { x: 0, y: 0 }, vel: velocityOf(6, 30), angle: 0, spin: 0, up: 0, upVel: 0 };
    const cfg = { friction: 2, spinFriction: 0, bounce: 0.5, walls: { cx: 0, cy: 0, r: 2 } };
    const path = runSlide(start, cfg, 300);
    for (const b of path) expect(Math.hypot(b.pos.x, b.pos.y)).toBeLessThanOrEqual(2 + 1e-9);
    // ...and it comes to REST inside, not pinned trembling against the edge.
    const last = path[path.length - 1]!;
    expect(slideRests(last, 0.01, 0.01)).toBe(true);
    expect(Math.hypot(last.pos.x, last.pos.y)).toBeLessThanOrEqual(2 + 1e-9);
    // The bounce is about the line from the middle: the outward component flips and scales.
    const hit = path.findIndex((b, i) => i > 0 && Math.hypot(b.pos.x, b.pos.y) >= 2 - 1e-9);
    expect(hit).toBeGreaterThan(0);
    const before = path[hit - 1]!;
    const after = path[hit]!;
    const nx = after.pos.x / 2;
    const ny = after.pos.y / 2;
    expect(before.vel.x * nx + before.vel.y * ny).toBeGreaterThan(0);
    expect(after.vel.x * nx + after.vel.y * ny).toBeLessThan(0);
  });

  it("ballistic.a-trap-lets-a-body-in-and-never-out — outside, the box holds it; inside the ring, the ring does", () => {
    // A ROUND FELT ON A PAGE: a card thrown on the page bounces off the page's edge and may fly in
    // over the felt's rim; once on the felt it bounces off the felt's edge from inside and never
    // leaves — a throw cannot take it off the felt, only a hand can (`insideWalls`).
    const trap = { outer: { x0: -6, y0: -6, x1: 6, y1: 6 }, inner: { cx: 0, cy: 0, r: 2 } };
    const cfg = { friction: 2, spinFriction: 0, bounce: 0.5, walls: trap };
    // 1. OUTSIDE, THROWN AWAY FROM THE FELT: the page's edge turns it, the ring is nothing to it.
    const away: Body = { pos: { x: 4, y: 0 }, vel: velocityOf(8, 0), angle: 0, spin: 0, up: 0, upVel: 0 };
    const out = runSlide(away, cfg, 300);
    for (const b of out) expect(b.pos.x).toBeLessThanOrEqual(6 + 1e-9);
    expect(out.some((b) => b.pos.x >= 6 - 1e-9), "it reached the page's edge").toBe(true);
    // 2. OUTSIDE, THROWN AT THE FELT: it flies in over the rim...
    const at: Body = { pos: { x: 4, y: 0 }, vel: velocityOf(8, 180), angle: 0, spin: 0, up: 0, upVel: 0 };
    const inward = runSlide(at, cfg, 300);
    const entered = inward.findIndex((b) => Math.hypot(b.pos.x, b.pos.y) <= 2);
    expect(entered, "…the rim is nothing from outside").toBeGreaterThan(0);
    // ...AND NEVER OUT AGAIN: from the step after it entered, it is inside the ring, whatever it does.
    for (const b of inward.slice(entered)) expect(Math.hypot(b.pos.x, b.pos.y)).toBeLessThanOrEqual(2 + 1e-9);
    expect(inward.slice(entered).some((b) => Math.hypot(b.pos.x, b.pos.y) >= 2 - 1e-9), "it met the far edge from inside").toBe(true);
    // 2b. SHOVED A HAIR PAST THE RING — by a neighbour it landed on, or by one long frame — it is
    //     still the ring's: pulled back onto the rail, never handed to the box and let slide off.
    const shoved: Body = { pos: { x: 2.3, y: 0 }, vel: velocityOf(3, 0), angle: 0, spin: 0, up: 0, upVel: 0 };
    const back = runSlide(shoved, cfg, 300);
    expect(back[1]!.pos.x, "the first step already puts it back on the rail").toBeLessThanOrEqual(2 + 1e-9);
    for (const b of back.slice(1)) expect(Math.hypot(b.pos.x, b.pos.y)).toBeLessThanOrEqual(2 + 1e-9);
    // 3. THE HAND IS HELD BY THE PAGE ALONE: clamped, a point on the page is not moved, one off it
    //    comes back to the page's edge — the ring is not a wall to a carry.
    expect(insideWalls(trap, { x: 4, y: 1 })).toEqual({ x: 4, y: 1 });
    expect(insideWalls(trap, { x: 9, y: 1 })).toEqual({ x: 6, y: 1 });
  });

  it("ballistic.a-clamp-knows-both-trays — a point outside comes back to the border it crossed", () => {
    // The one answer a carried run is held to, and the one a wall-check measures from.
    expect(insideWalls({ x0: -1, y0: -1, x1: 1, y1: 1 }, { x: 5, y: 0.5 })).toEqual({ x: 1, y: 0.5 });
    const ring = { cx: 0, cy: 0, r: 3 };
    // A point outside lands ON the circle, on the same line out of the middle.
    const held = insideWalls(ring, { x: 8, y: 6 });
    expect(Math.hypot(held.x, held.y)).toBeCloseTo(3);
    expect(held.x / held.y).toBeCloseTo(8 / 6);
    // ...and a point already inside is not moved at all.
    expect(insideWalls(ring, { x: 1, y: -1 })).toEqual({ x: 1, y: -1 });
  });
});

describe("two bodies on one desk", () => {
  const at = (x: number, y: number, vx = 0, vy = 0): Body => ({
    pos: { x, y },
    vel: { x: vx, y: vy },
    angle: 0,
    spin: 0,
    up: 0,
    upVel: 0,
  });

  it("ballistic.two-bodies-never-share-a-place — the push is even and along the line between them", () => {
    // Two dice that arrived on the same spot are one die with a shadow, and the second result is
    // unreadable. Apart is not a preference here: it is what makes the pair a pair.
    const out = separate(at(0, 0), at(0.6, 0), 1, 0.5)!;
    expect(out, "well inside each other, so there is something to do").toBeTruthy();
    const gap = Math.hypot(out.b.pos.x - out.a.pos.x, out.b.pos.y - out.a.pos.y);
    expect(gap, "exactly touching, not merely less overlapped").toBeCloseTo(1, 6);
    // Evenly: neither of them is the one that has to move, and a solve that pushed only one would
    // make the answer depend on which was asked about first.
    expect(out.a.pos.x).toBeCloseTo(-0.2, 6);
    expect(out.b.pos.x).toBeCloseTo(0.8, 6);
    // Along the line between them and nowhere else — nothing sideways appears out of a head-on push.
    expect(out.a.pos.y).toBe(0);
    expect(out.b.pos.y).toBe(0);
    // And two that are simply apart are left entirely alone, which is nearly every frame.
    expect(separate(at(0, 0), at(3, 0), 1, 0.5)).toBeUndefined();
  });

  it("ballistic.a-body-bounces-off-a-body-that-is-coming-at-it — and never off one that is leaving", () => {
    // CLOSING: an equal-mass exchange along the line between them. Head-on and equal, they swap.
    const hit = separate(at(0, 0, 2, 0), at(0.9, 0, -2, 0), 1, 1)!;
    expect(hit.a.vel.x).toBeCloseTo(-2, 6);
    expect(hit.b.vel.x).toBeCloseTo(2, 6);
    // ...and the tangent is untouched, so a glancing blow glances instead of stopping.
    const glance = separate(at(0, 0, 0, 3), at(0.9, 0, 0, 3), 1, 1)!;
    expect(glance.a.vel.y).toBeCloseTo(3, 6);
    expect(glance.b.vel.y).toBeCloseTo(3, 6);
    // LEAVING: overlapping and already moving apart, they are pushed clear and NOT traded. Bodies
    // laid on the same spot by a hand are exactly this case, and swapping their speeds would suck
    // them back together — a pair trembling against each other for ever instead of leaving.
    const parting = separate(at(0, 0, -1, 0), at(0.5, 0, 1, 0), 1, 1)!;
    expect(parting.a.vel.x).toBe(-1);
    expect(parting.b.vel.x).toBe(1);
    expect(parting.b.pos.x - parting.a.pos.x).toBeCloseTo(1, 6);
  });

  it("ballistic.a-body-that-holds-its-place-is-a-wall — a landing gives way, the furniture does not", () => {
    // WHAT IS ALREADY LYING THERE, when something is PUT DOWN beside it rather than thrown at it.
    // Split the correction evenly and the chip a die lands next to is teleported half a chip
    // sideways by a body that was never coming at it — a shove out of nowhere, which the eye reads
    // as the desk twitching.
    const landing = separate(at(0, 0), at(0.6, 0), 1, 0.5, { a: false, b: true })!;
    expect(landing.b.pos.x, "the furniture did not stir").toBeCloseTo(0.6, 6);
    expect(landing.a.pos.x, "the arriving one gave way, all of it").toBeCloseTo(-0.4, 6);
    expect(landing.b.pos.x - landing.a.pos.x, "and they are apart, which is the promise that never bends").toBeCloseTo(1, 6);

    // ...AND IT IS A WALL, not a hole: something genuinely travelling comes back off it with the
    // whole of the exchange rather than half, because there is nobody to share it with.
    const hit = separate(at(0, 0, 4, 0), at(0.6, 0), 1, 1, { a: false, b: true })!;
    expect(hit.a.vel.x, "the thrower is turned round by it").toBeCloseTo(-4, 6);
    expect(hit.b.vel.x, "and the wall keeps its own speed, which is none").toBe(0);

    // Two of them holding their places have no way of parting and nothing that could make them:
    // they were put where they are, and only the desk that put them there can move them again.
    expect(separate(at(0, 0), at(0.6, 0), 1, 0.5, { a: true, b: true })).toBeUndefined();

    // Free on both sides is the ordinary case and the default — half the correction each.
    const even = separate(at(0, 0), at(0.6, 0), 1, 0.5)!;
    expect(even.a.pos.x).toBeCloseTo(-0.2, 6);
    expect(even.b.pos.x).toBeCloseTo(0.8, 6);
  });

  it("ballistic.dead-centre-is-a-direction-too — two bodies on one pixel still get apart", () => {
    // There is no line between them to push along, and `0/0` would put both at NaN and take the
    // scene with it. Any direction will do as long as it IS one.
    const out = separate(at(1, 1), at(1, 1), 0.8, 0.5)!;
    const gap = Math.hypot(out.b.pos.x - out.a.pos.x, out.b.pos.y - out.a.pos.y);
    expect(Number.isFinite(gap)).toBe(true);
    expect(gap).toBeCloseTo(0.8, 6);
  });
});
