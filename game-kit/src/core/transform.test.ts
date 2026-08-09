// The transform is one value used by four things that used to each write their own arithmetic.
// These are the properties every one of those four silently relied on.

import { describe, expect, it } from "vitest";
import { apply, chain, compose, IDENTITY, invert, move, pose, rotate, scale } from "./transform.js";

const near = (a: { x: number; y: number }, b: { x: number; y: number }): void => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
};

describe("transform", () => {
  it("transform.identity-changes-nothing", () => {
    near(apply(IDENTITY, { x: 3, y: -2 }), { x: 3, y: -2 });
  });

  it("transform.compose-is-outer-after-inner — the owner chain reads that way", () => {
    // A child's own pose first, then its owner's. Written the other way round, a card in a
    // turned hand rotates about the desk's centre — a bug that looks like physics and is
    // ordering.
    const inner = move(1, 0);
    const outer = rotate(90);
    near(apply(compose(outer, inner), { x: 0, y: 0 }), { x: 0, y: 1 });
    // And the opposite order is genuinely a different map, which is why the name says which.
    near(apply(compose(inner, outer), { x: 0, y: 0 }), { x: 1, y: 0 });
  });

  it("transform.a-pose-scales-then-turns-then-moves", () => {
    // Any other order turns "twice as big" into "twice as far away", and the two are told
    // apart only by looking.
    near(apply(pose({ x: 10, y: 0 }, 0, 2), { x: 1, y: 0 }), { x: 12, y: 0 });
    near(apply(pose({ x: 10, y: 0 }, 90, 2), { x: 1, y: 0 }), { x: 10, y: 2 });
  });

  it("transform.rotation-is-clockwise-on-screen", () => {
    // Screen `y` grows downward, so +90° takes the x axis onto the y axis. Getting this
    // backwards is invisible in a symmetric shape and obvious in every other one.
    near(apply(rotate(90), { x: 1, y: 0 }), { x: 0, y: 1 });
  });

  it("transform.chain-applies-left-last", () => {
    const t = chain([move(0, 5), scale(2)]);
    near(apply(t, { x: 1, y: 0 }), { x: 2, y: 5 });
  });

  it("transform.invert-undoes — and refuses when there is nothing to undo", () => {
    // A pointer in view pixels asking which node it landed on goes this way.
    const t = pose({ x: 3, y: -1 }, 30, 2);
    const back = invert(t)!;
    near(apply(back, apply(t, { x: 0.5, y: 0.25 })), { x: 0.5, y: 0.25 });
    // A scale of zero has no inverse, and the honest answer is nothing rather than a matrix
    // full of infinities that fails somewhere far away.
    expect(invert(scale(0))).toBeUndefined();
  });
});
