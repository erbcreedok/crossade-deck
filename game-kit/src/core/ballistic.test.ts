// The pure ballistics — a fall down the screen and a slide across the desk, stepped by hand.

import { describe, expect, it } from "vitest";
import { bodyAt, polar, slideRests, stepFall, stepSlide, velocityOf, type Body } from "./ballistic.js";
import { decayGlide } from "./glide.js";

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

  it("ballistic.a-slide-bleeds-to-a-stop — the glide law takes a fraction of speed and spin, and never crosses zero", () => {
    const start: Body = { pos: { x: 0, y: 0 }, vel: velocityOf(3, 0), angle: 0, spin: 360, up: 0, upVel: 0 };
    const glide = decayGlide(0.99); // the fast rate, so a hundred frames really is the whole run
    const cfg = { glide, spinGlide: glide, bounce: 0.5 };
    const path = runSlide(start, cfg, 600);
    // Speed only ever drops; it decays towards zero and never reverses.
    for (let i = 1; i < path.length; i++) {
      expect(Math.hypot(path[i]!.vel.x, path[i]!.vel.y)).toBeLessThanOrEqual(Math.hypot(path[i - 1]!.vel.x, path[i - 1]!.vel.y) + 1e-9);
      expect(path[i]!.vel.x).toBeGreaterThanOrEqual(0);
    }
    const end = path[path.length - 1]!;
    expect(slideRests(end, 1e-3, 1)).toBe(true);
    // WHERE IT LANDS IS WHAT WAS PROMISED BEFORE THE THROW. This is the whole reason the law
    // replaced a friction: `project` and the stepping are one integral, so a throw can be AIMED.
    expect(end.pos.x).toBeCloseTo(glide.project(3), 6);
    expect(end.angle).toBeCloseTo(glide.project(360), 4);
    expect(stepSlide(start, cfg, 0)).toEqual(start);
  });

  it("ballistic.the-landing-is-known-in-advance — projection holds at any frame rate, and against a coarse one too", () => {
    // The same throw stepped at 60 Hz, at 15 Hz and at 240 Hz has to end in the SAME place. A
    // position moved by `v·dt` would not: it would undershoot more the coarser the frames, and a
    // card aimed at a seat would land short on a slow phone and long on a fast one.
    const glide = decayGlide(0.99);
    const cfg = { glide, spinGlide: glide, bounce: 0.5 };
    const seed: Body = { pos: { x: 0, y: 0 }, vel: velocityOf(6, 0), angle: 0, spin: 0, up: 0, upVel: 0 };
    const runAt = (dt: number, secs: number): number => {
      let b = seed;
      for (let t = 0; t < secs; t += dt) b = stepSlide(b, cfg, dt);
      return b.pos.x;
    };
    const want = glide.project(6);
    expect(runAt(1 / 60, 8)).toBeCloseTo(want, 6);
    expect(runAt(1 / 15, 8)).toBeCloseTo(want, 6);
    expect(runAt(1 / 240, 8)).toBeCloseTo(want, 6);
    // And read the other way up: a throw launched at `speedFor(d)` covers exactly `d`.
    let aimed: Body = { ...seed, vel: velocityOf(glide.speedFor(2.5), 0) };
    for (let i = 0; i < 900; i++) aimed = stepSlide(aimed, cfg, 1 / 60);
    expect(aimed.pos.x).toBeCloseTo(2.5, 6);
  });

  it("ballistic.a-hopping-slide-bounces-and-wanders — it leaves the desk, lands turned a little, and a wall throws it higher", () => {
    // A thrown die does not skate. It comes off the desk, and every touch-down turns its run a
    // little — which is why a real one wanders instead of running a line to the wall.
    const start: Body = { pos: { x: 0, y: 0 }, vel: velocityOf(4, 0), angle: 0, spin: 0, up: 0, upVel: 3 };
    const cfg = { glide: decayGlide(0.9995), spinGlide: decayGlide(0.99), bounce: 0.5, gravity: 9 };
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
  });

  it("ballistic.a-wall-reflects — the crossing component flips and scales, the body stays inside", () => {
    const start: Body = { pos: { x: 0, y: 0 }, vel: velocityOf(4, 0), angle: 0, spin: 0, up: 0, upVel: 0 };
    const cfg = { glide: decayGlide(1), spinGlide: decayGlide(1), bounce: 0.5, walls: { x0: -1, y0: -1, x1: 1, y1: 1 } };
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
