// THE MOTIONS REGISTRY — the laws a look has to obey, and the one that cannot be broken by data.
//
// A recipe is a pure function, so all of this is arithmetic: no clock, no host, no GPU. What the
// runtime does with a recipe is `runtime.test.ts`'s business; this file is about the recipes.

import { beforeEach, describe, expect, it } from "vitest";
import { installStockEasings, resetEasings } from "../core/motion.js";
import { IDENTITY, apply, compose, move, pose, type Transform } from "../core/transform.js";
import {
  BOUNCE_BY,
  SHIVER_BY,
  bounceMotion,
  installStockMotions,
  keyframeMotion,
  motionNames,
  motionRecipe,
  registerMotion,
  resetMotions,
  shiverMotion,
  spinMotion,
  type MotionRecipe,
} from "./motions.js";

/** Where the piece's own origin lands under a pose — the only thing a look moves. */
const originOf = (t: Transform) => apply(t, { x: 0, y: 0 });
const REST: Transform = pose({ x: 3, y: -2 }, 0);

beforeEach(() => {
  resetMotions();
  resetEasings();
  installStockEasings();
});

describe("the registry", () => {
  it("motions.registry-round-trip — a name in, the same recipe out, and the names listable", () => {
    const mine: MotionRecipe = { durMs: 100, poseAt: (_i, _n, _t, rest) => rest };
    registerMotion("mine", mine);
    expect(motionRecipe("mine")).toBe(mine);
    expect(motionNames()).toContain("mine");
    resetMotions();
    expect(motionNames()).toEqual([]);
  });

  it("motions.unknown-name-is-nothing — a typo plays no look rather than the wrong one", () => {
    // The deliberate departure from the shuffles registry, where an unknown name falls back to
    // riffle: every reorder must look like something, but there is no stock look for "cheer".
    // A shiver appearing where a cheer was asked for is a bug that hides itself.
    installStockMotions();
    expect(motionRecipe("cheer")).toBeUndefined();
  });

  it("motions.every-stock-look-ends-on-the-seat — the law, over the whole registry", () => {
    // The law that lets the runtime hand a recipe to any node without a correction step after it.
    installStockMotions();
    expect(motionNames().length, "and the sweep is over something").toBeGreaterThan(0);
    for (const name of motionNames()) {
      const end = motionRecipe(name)!.poseAt(0, 1, 1, REST);
      expect(originOf(end), `${name} at t=1`).toEqual(originOf(REST));
      expect(end, `${name} at t=1 is the seat itself, turn and size included`).toEqual(REST);
    }
  });
});

describe("the stock looks", () => {
  it("motions.shiver-swings-sideways-and-decays — a buzz, not a wobble", () => {
    const r = shiverMotion({ durMs: 400, by: 0.5, cycles: 2 });
    const at = (t: number) => originOf(r.poseAt(0, 1, t, REST)).x - originOf(REST).x;
    expect(at(0), "zero at the first frame").toBeCloseTo(0, 6);
    // A quarter into the first cycle is its crest; the same phase one cycle later is the second.
    expect(Math.abs(at(0.5 / 4))).toBeGreaterThan(0);
    expect(Math.abs(at(0.5 + 0.5 / 4))).toBeLessThan(Math.abs(at(0.5 / 4)));
    expect(r.rides, "it stays on its seat, so there is no travel to ride").toBeUndefined();
  });

  it("motions.shivers-default-swing-is-visible — sized against a card, not left to eye", () => {
    const r = shiverMotion();
    const crest = Math.abs(originOf(r.poseAt(0, 1, 1 / 3 / 4, REST)).x - originOf(REST).x);
    expect(crest, "under a twentieth of a unit is an animation nobody sees").toBeGreaterThan(0.05);
    expect(crest, "over a fifth and the card looks like it JUMPED").toBeLessThan(0.2);
    expect(SHIVER_BY).toBeGreaterThan(0.05);
  });

  it("motions.bounce-goes-up-the-screen-and-rides — negative y, and the shadow comes along", () => {
    const r = bounceMotion({ durMs: 500, by: 1, bounces: 1 });
    const dy = originOf(r.poseAt(0, 1, 0.5, REST)).y - originOf(REST).y;
    expect(dy, "up the screen is where y gets smaller").toBeLessThan(0);
    expect(Math.abs(dy)).toBeCloseTo(0.5, 5); // |sin(pi/2)| * 1 * (1 - 0.5)
    expect(r.rides, "it never leaves the felt, so its shadow travels with it").toBe(true);
    expect(BOUNCE_BY).toBeGreaterThan(0.5);
  });

  it("motions.spin-lands-facing-home — whole turns are what make it a look and not a move", () => {
    const r = spinMotion({ durMs: 300, turns: 2, hop: 1.5 });
    expect(r.poseAt(0, 1, 1, REST)).toEqual(REST);
    // Halfway through two turns is a whole turn: back to facing home, but swollen by the hop.
    const half = r.poseAt(0, 1, 0.5, REST);
    expect(half.a).toBeCloseTo(1.5, 5);
    expect(originOf(half), "and it turns and grows in place, it does not travel").toEqual(originOf(REST));
  });
});

describe("a motion the designer wrote as a table", () => {
  it("keyframe.keys-are-offsets-from-the-seat — the same table plays anywhere on the desk", () => {
    const r = keyframeMotion({ durMs: 100, ease: "linear", keys: [{ at: 0.5, move: { x: 2, y: -1 } }] });
    const here = originOf(r.poseAt(0, 1, 0.5, REST));
    const there = originOf(r.poseAt(0, 1, 0.5, pose({ x: -40, y: 17 })));
    expect(here.x - 3).toBeCloseTo(2, 5);
    expect(here.y + 2).toBeCloseTo(-1, 5);
    expect(there.x + 40).toBeCloseTo(2, 5);
    expect(there.y - 17).toBeCloseTo(-1, 5);
  });

  it("keyframe.ends-on-the-seat-whatever-was-typed — the law survives a bad table", () => {
    // A designer who ends their table far from the seat gets a motion that still lands on it: the
    // rest anchors are put in by construction, so the first law cannot be typed away.
    const r = keyframeMotion({ durMs: 100, keys: [{ at: 1, move: { x: 9, y: 9 }, turn: 45, scale: 3 }] });
    expect(r.poseAt(0, 1, 1, REST)).toEqual(REST);
  });

  it("keyframe.a-pause-is-two-keys-the-same — no second word for a hold", () => {
    const r = keyframeMotion({
      durMs: 100,
      ease: "linear",
      keys: [
        { at: 0.25, move: { x: 1, y: 0 } },
        { at: 0.75, move: { x: 1, y: 0 } },
      ],
    });
    const x = (t: number) => originOf(r.poseAt(0, 1, t, REST)).x - 3;
    expect(x(0.25)).toBeCloseTo(1, 5);
    expect(x(0.5), "held through the middle").toBeCloseTo(1, 5);
    expect(x(0.75)).toBeCloseTo(1, 5);
    expect(x(0.9), "and on its way home after it").toBeLessThan(1);
  });

  it("keyframe.keys-are-read-in-order-however-they-were-typed", () => {
    const jumbled = keyframeMotion({
      durMs: 100,
      ease: "linear",
      keys: [
        { at: 0.75, move: { x: 0, y: 0 } },
        { at: 0.25, move: { x: 1, y: 0 } },
      ],
    });
    expect(originOf(jumbled.poseAt(0, 1, 0.25, REST)).x - 3).toBeCloseTo(1, 5);
    expect(originOf(jumbled.poseAt(0, 1, 0.75, REST)).x - 3).toBeCloseTo(0, 5);
  });

  it("keyframe.a-segment-may-name-its-own-easing — the feel is set once and argued with per segment", () => {
    const linear = keyframeMotion({ durMs: 100, ease: "linear", keys: [{ at: 1 - 1e-9, move: { x: 1, y: 0 } }] });
    const eased = keyframeMotion({
      durMs: 100,
      ease: "linear",
      keys: [{ at: 1 - 1e-9, move: { x: 1, y: 0 }, ease: "easeOut" }],
    });
    const halfway = 0.5;
    expect(originOf(linear.poseAt(0, 1, halfway, REST)).x - 3).toBeCloseTo(0.5, 3);
    expect(
      originOf(eased.poseAt(0, 1, halfway, REST)).x - 3,
      "easeOut is most of the way there by the middle",
    ).toBeGreaterThan(0.8);
  });

  it("keyframe.a-zero-width-segment-is-a-jump — the far side wins", () => {
    const r = keyframeMotion({
      durMs: 100,
      ease: "linear",
      keys: [
        { at: 0.5, move: { x: 1, y: 0 } },
        { at: 0.5, move: { x: -1, y: 0 } },
      ],
    });
    expect(originOf(r.poseAt(0, 1, 0.5, REST)).x - 3).toBeCloseTo(-1, 5);
  });

  it("keyframe.carries-the-phases-it-was-given — a commit and its beats reach the runtime", () => {
    const r = keyframeMotion({ durMs: 100, keys: [{ at: 0.5, scale: 0 }], commitAt: 0.5, beats: [0.5], rides: true });
    expect(r.commitAt).toBe(0.5);
    expect(r.beats).toEqual([0.5]);
    expect(r.rides).toBe(true);
    // And a plain look carries none of them — the runtime fills its own defaults.
    const plain = keyframeMotion({ keys: [{ at: 0.5, scale: 0.5 }] });
    expect(plain.commitAt).toBeUndefined();
    expect(plain.beats).toBeUndefined();
  });
});

describe("a recipe is entity-agnostic", () => {
  it("motions.a-look-never-asks-what-it-is-moving — index and count are all it gets", () => {
    // The property that lets one registered look play on a card, a die and a tile. A recipe that
    // wanted to know would have to be handed a node, and nothing here ever is.
    const seen: Array<[number, number]> = [];
    registerMotion("nosy", { durMs: 10, poseAt: (i, n, _t, rest) => (seen.push([i, n]), rest) });
    motionRecipe("nosy")!.poseAt(2, 5, 0.5, IDENTITY);
    expect(seen).toEqual([[2, 5]]);
    expect(compose(IDENTITY, move(0, 0))).toEqual(IDENTITY);
  });
});
