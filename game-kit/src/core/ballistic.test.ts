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

  it("ballistic.air-makes-a-card-fall-slower-than-a-die — gravity only accelerates, so the law that ENDS the acceleration is the card", () => {
    // A die is a stone: it falls faster and faster until the desk stops it. A card is nearly all
    // surface and hardly any mass — it reaches a terminal speed almost at once and comes down at
    // that speed however far it has to go. Gravity alone cannot say the second thing at all.
    const flat = decayGlide(1);
    const seed: Body = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, angle: 0, spin: 0, up: 2, upVel: 0 };
    const die = { glide: flat, spinGlide: flat, bounce: 0, gravity: 9 };
    const card = { ...die, airGlide: decayGlide(0.99) };
    const fall = (cfg: Parameters<typeof stepSlide>[1]): { frames: number; fastest: number } => {
      let b = seed;
      let fastest = 0;
      let frames = 0;
      while (b.up > 0 && frames < 2000) {
        b = stepSlide(b, cfg, DT);
        fastest = Math.max(fastest, -b.upVel);
        frames++;
      }
      return { frames, fastest };
    };
    const stone = fall(die);
    const leaf = fall(card);
    expect(leaf.frames, "the card is still coming down when the die has landed").toBeGreaterThan(stone.frames * 1.5);
    expect(leaf.fastest, "and it never goes as fast, because it stopped accelerating").toBeLessThan(stone.fastest * 0.6);
    // TERMINAL, and that is the word. The fall has a ceiling — `gravity` over the law's own rate
    // constant — which it approaches and never passes, and the acceleration dies as it gets there.
    // A stone has no ceiling at all, which is the entire difference being asserted.
    const terminal = 9 / (-Math.log(0.99) * 1000);
    let b = seed;
    for (let i = 0; i < 15; i++) b = stepSlide(b, card, DT);
    const first = -b.upVel;
    for (let i = 0; i < 15; i++) b = stepSlide(b, card, DT);
    const second = -b.upVel;
    for (let i = 0; i < 15; i++) b = stepSlide(b, card, DT);
    const third = -b.upVel;
    expect(third).toBeLessThan(terminal);
    expect(third - second, "each quarter second adds less than the one before").toBeLessThan((second - first) * 0.75);
    expect(third, "and by three quarters of a second it is all but there").toBeGreaterThan(terminal * 0.9);
  });

  it("ballistic.a-field-leans-on-a-run-without-taking-it — inside its reach it gathers, outside it there is nothing at all", () => {
    // A seat saying "that one was meant for me" — `UIFieldBehavior`, not a target. The throw stays
    // the player's; the field leans on it.
    const glide = decayGlide(0.998);
    const bare = { glide, spinGlide: glide, bounce: 0 };
    const seat = { x: 3, y: 0.8 };
    const run = (cfg: Parameters<typeof stepSlide>[1]): Body => {
      let b: Body = { pos: { x: 0, y: 0 }, vel: velocityOf(6, 0), angle: 0, spin: 0, up: 0, upVel: 0 };
      for (let i = 0; i < 600; i++) b = stepSlide(b, cfg, DT);
      return b;
    };
    const free = run(bare);
    const pulled = run({ ...bare, pull: { to: seat, strength: 8, radius: 1.5 } });
    const gapTo = (b: Body): number => Math.hypot(b.pos.x - seat.x, b.pos.y - seat.y);
    expect(gapTo(pulled), "it ends nearer the seat than the same throw left alone").toBeLessThan(gapTo(free));
    expect(pulled.pos.y, "and it leaned toward the seat rather than ruling a line").toBeGreaterThan(0.1);
    // OUTSIDE THE REACH THERE IS NOTHING. A field with a radius the run never enters leaves the
    // throw bit-for-bit alone — which is what makes it a field and not an attractor that quietly
    // curves every card home.
    const far = run({ ...bare, pull: { to: { x: 3, y: 40 }, strength: 8, radius: 1.5 } });
    expect(far).toEqual(free);
  });

  it("ballistic.a-spinning-body-curves — the Magnus arc, and it dies with the spin", () => {
    // A card flicked with a twist of the wrist arcs; the same card thrown flat rules a line. The
    // sideways push is proportional to BOTH the turn and the speed, so it fades as the throw does
    // instead of curling a body that has already stopped.
    const glide = decayGlide(0.998);
    const cfg = { glide, spinGlide: decayGlide(0.999), bounce: 0, magnus: 0.35 };
    const seed: Body = { pos: { x: 0, y: 0 }, vel: velocityOf(6, 0), angle: 0, spin: 0, up: 0, upVel: 0 };
    const run = (spin: number): Body => {
      let b = { ...seed, spin };
      for (let i = 0; i < 400; i++) b = stepSlide(b, cfg, DT);
      return b;
    };
    expect(run(0).pos.y, "no twist, no arc").toBeCloseTo(0, 9);
    const right = run(500);
    const left = run(-500);
    expect(Math.abs(right.pos.y), "a twist really bends the run").toBeGreaterThan(0.2);
    expect(Math.sign(right.pos.y), "and which way follows which way it was twisted").toBe(-Math.sign(left.pos.y));
    expect(right.pos.y).toBeCloseTo(-left.pos.y, 6);
    // Without a grip on the air the same spin does nothing to the path at all.
    let flat = { ...seed, spin: 500 };
    for (let i = 0; i < 400; i++) flat = stepSlide(flat, { ...cfg, magnus: 0 }, DT);
    expect(flat.pos.y).toBeCloseTo(0, 9);
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
