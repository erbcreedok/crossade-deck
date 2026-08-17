// The pure ballistics — a fall down the screen and a slide across the desk, stepped by hand.

import { describe, expect, it } from "vitest";
import { bodyAt, polar, slideRests, stepFall, stepSlide, velocityOf, type Body } from "./ballistic.js";

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
    const start: Body = { pos: { x: 0, y: 0 }, vel: velocityOf(3, 0), angle: 0, spin: 360 };
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

  it("ballistic.a-wall-reflects — the crossing component flips and scales, the body stays inside", () => {
    const start: Body = { pos: { x: 0, y: 0 }, vel: velocityOf(4, 0), angle: 0, spin: 0 };
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
});
