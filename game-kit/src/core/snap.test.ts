// The snap: a moving body pulled to a place, and the question asked before the throw of whether a
// throw would pass through a zone at all.

import { describe, expect, it } from "vitest";
import { type Body } from "./ballistic.js";
import { decayGlide } from "./glide.js";
import { crossesZone, snapRests, springOf, stepSnap, type SnapConfig } from "./snap.js";
import { type Vec } from "./transform.js";

const DT = 1 / 60;
const STILL = decayGlide(0.99);

const bodyGoing = (at: Vec, vel: Vec, extra: Partial<Body> = {}): Body => ({
  pos: at,
  vel,
  angle: 0,
  spin: 0,
  up: 0,
  upVel: 0,
  ...extra,
});

function runSnap(b: Body, cfg: SnapConfig, frames: number): Body[] {
  const path = [b];
  for (let i = 0; i < frames; i++) path.push(stepSnap(path[path.length - 1]!, cfg, DT));
  return path;
}

describe("snap", () => {
  it("snap.the-two-numbers-are-swiftui-s — a response is a period and a damping is a fraction of critical", () => {
    // `response` is the period of one full swing: stiffness is `(2π / response)²`, so halving the
    // response quadruples the stiffness and everything happens twice as fast.
    expect(springOf(1, 1).stiffness).toBeCloseTo((2 * Math.PI) ** 2, 9);
    expect(springOf(0.5, 1).stiffness).toBeCloseTo(springOf(1, 1).stiffness * 4, 9);
    // `damping` of 1 is critical — exactly `2·√stiffness`, the line an overshoot starts below.
    const critical = springOf(0.4, 1);
    expect(critical.damping).toBeCloseTo(2 * Math.sqrt(critical.stiffness), 9);
    expect(springOf(0.4, 0.5).damping).toBeCloseTo(critical.damping / 2, 9);
    // A response of zero is a teleport, and it is refused at one frame rather than dividing by zero.
    expect(Number.isFinite(springOf(0, 1).stiffness)).toBe(true);
  });

  it("snap.catches-a-body-at-speed — the momentum is kept, nothing is thrown away at the seam", () => {
    const cfg: SnapConfig = { to: { x: 3, y: 0 }, response: 0.4, damping: 1, spinGlide: STILL };
    const path = runSnap(bodyGoing({ x: 0, y: 0 }, { x: 6, y: 0 }), cfg, 120);
    // The first step carries the speed it arrived with: the snap does not start the body over.
    expect(path[1]!.vel.x).toBeGreaterThan(4);
    expect(path[1]!.pos.x).toBeGreaterThan(0.05);
    const end = path[path.length - 1]!;
    expect(end.pos.x).toBeCloseTo(3, 3);
    expect(end.pos.y).toBeCloseTo(0, 3);
    expect(snapRests(end, cfg, 1e-2, 2)).toBe(true);
  });

  it("snap.tugs-a-body-that-arrived-off-the-mark — barely moving and beside the point, it is drawn the last hair", () => {
    // The other reading of "the zone catches it", and the same behaviour: nothing special is
    // written for a body that fell short.
    const cfg: SnapConfig = { to: { x: 3, y: 0 }, response: 0.4, damping: 1, spinGlide: STILL };
    const end = runSnap(bodyGoing({ x: 2.6, y: 0.3 }, { x: 0.05, y: 0 }), cfg, 120).pop()!;
    expect(end.pos.x).toBeCloseTo(3, 3);
    expect(end.pos.y).toBeCloseTo(0, 3);
  });

  it("snap.damping-decides-whether-it-overshoots — critical arrives clean, half of it swings past", () => {
    const to = { x: 3, y: 0 };
    const hard: SnapConfig = { to, response: 0.4, damping: 1, spinGlide: STILL };
    const soft: SnapConfig = { to, response: 0.4, damping: 0.4, spinGlide: STILL };
    const seed = bodyGoing({ x: 0, y: 0 }, { x: 6, y: 0 });
    expect(Math.max(...runSnap(seed, hard, 120).map((b) => b.pos.x))).toBeLessThanOrEqual(3.001);
    expect(Math.max(...runSnap(seed, soft, 120).map((b) => b.pos.x))).toBeGreaterThan(3.05);
    // Both still end on the mark — an overshoot is a look, not a different destination.
    expect(runSnap(seed, soft, 300).pop()!.pos.x).toBeCloseTo(3, 3);
  });

  it("snap.height-is-pulled-like-everything-else — a dealt card comes down, a returning one never touches the desk", () => {
    const spinGlide = STILL;
    // DEALT: pulled to the seat AND to the desk, so it loses height as it travels. The size follows
    // the height in the plan, so "loses height and size" is one thing and not two.
    const dealt = runSnap(
      bodyGoing({ x: 0, y: 0 }, { x: 6, y: 0 }, { up: 0.6 }),
      { to: { x: 3, y: 0 }, response: 0.4, damping: 1, spinGlide },
      180,
    );
    expect(dealt[1]!.up).toBeLessThan(0.6);
    expect(dealt.pop()!.up).toBeCloseTo(0, 3);
    // HOME: pulled back to the pack and to a height ABOVE the desk. It never reaches the felt at
    // any point of the way — the boomerang the owner asked for, stated as a target and not as a
    // curve somebody drew.
    const home = runSnap(
      bodyGoing({ x: 2, y: 0 }, { x: 5, y: 0 }, { up: 0.6 }),
      { to: { x: 0, y: 0 }, up: 0.3, response: 0.5, damping: 1, spinGlide },
      240,
    );
    expect(Math.min(...home.map((b) => b.up))).toBeGreaterThan(0.05);
    const back = home.pop()!;
    expect(back.pos.x).toBeCloseTo(0, 3);
    expect(back.up).toBeCloseTo(0.3, 3);
  });

  it("snap.the-turn-is-not-aimed — it runs out under the glide law and the flight waits for it", () => {
    const cfg: SnapConfig = { to: { x: 1, y: 0 }, response: 0.3, damping: 1, spinGlide: decayGlide(0.99) };
    const path = runSnap(bodyGoing({ x: 0, y: 0 }, { x: 2, y: 0 }, { spin: 360 }), cfg, 60);
    // It kept turning the whole way and stopped nowhere in particular — as it fell, so it lies.
    expect(path.pop()!.angle).toBeGreaterThan(30);
    // Arrived but still turning is NOT rested: ending the flight there throws the last of the turn
    // away, which reads as the card being snatched into place at the very last moment.
    const arrived = bodyGoing({ x: 1, y: 0 }, { x: 0, y: 0 }, { spin: 200 });
    expect(snapRests(arrived, cfg, 1e-2, 2)).toBe(false);
    expect(snapRests({ ...arrived, spin: 0 }, cfg, 1e-2, 2)).toBe(true);
  });

  it("snap.crossing-is-asked-before-the-throw — the run is where the glide law says it ends, and a zone behind it is not crossed", () => {
    const glide = decayGlide(0.998); // the platform's normal rate: a flick of six covers three units
    const from = { x: 0, y: 0 };
    const reach = glide.project(6); // how far a flick of six units a second actually gets
    const on = { at: { x: reach * 0.5, y: 0 }, radius: 0.3 };
    expect(crossesZone(from, { x: 6, y: 0 }, glide, on)).toBe(true);
    // Sideways of the run by more than its radius: aimed badly, and the answer is no.
    expect(crossesZone(from, { x: 6, y: 0 }, glide, { at: { x: reach * 0.5, y: 0.9 }, radius: 0.3 })).toBe(false);
    // BEHIND the throw. Without clamping the run to its own ends an infinite line would call this
    // a hit, and a card flicked away from a player would be dealt to that player.
    expect(crossesZone(from, { x: 6, y: 0 }, glide, { at: { x: -reach * 0.5, y: 0 }, radius: 0.3 })).toBe(false);
    // PAST THE END of it: thrown badly rather than aimed badly, and told apart from it because a
    // player can tell the two apart.
    expect(crossesZone(from, { x: 6, y: 0 }, glide, { at: { x: reach * 2, y: 0 }, radius: 0.3 })).toBe(false);
    // The same zone, with strength behind the throw, IS reached — the reach is the whole test.
    expect(crossesZone(from, { x: 12, y: 0 }, glide, { at: { x: reach * 2, y: 0 }, radius: 0.3 })).toBe(true);
    // A dead throw reaches only what it is already standing in.
    expect(crossesZone(from, { x: 0, y: 0 }, glide, { at: { x: 0.2, y: 0 }, radius: 0.3 })).toBe(true);
    expect(crossesZone(from, { x: 0, y: 0 }, glide, { at: { x: 2, y: 0 }, radius: 0.3 })).toBe(false);
  });
});
