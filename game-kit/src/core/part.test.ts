// THE GAP A HAND OPENS — what a hover shows before anything is dropped.
//
// The spec is `docs/scenarios/hand-accept.md` §A: hold a card over a hand and its cards STEP APART,
// freeing a place for the neighbour-to-be — at the position the finger is pointing at, not at the
// end of the row. Let go and the card falls into that place, which is the point of showing it.

import { beforeEach, describe, expect, it } from "vitest";
import { add, node } from "./node.js";
import { Bounded } from "./atoms/bounded.js";
import { Container, registerLayout, resetLayouts } from "./atoms/container.js";
import { freeLayout, rowLayout } from "./atoms/layouts.js";
import { rect } from "../presets/shapes.js";
import { partAt } from "./part.js";

/** A hand of three equal cards in a row, one unit wide each, no gap — seats at −1, 0 and 1. */
function hand(layout = "row") {
  const h = node("hand", Container({ layout }));
  for (const id of ["a", "b", "c"]) add(h, node(id, Bounded({ bounds: rect(1, 1.4) })));
  return h;
}

const CARD = rect(1, 1.4);

describe("the gap a hand opens", () => {
  beforeEach(() => {
    resetLayouts();
    registerLayout("row", rowLayout({ gap: 0 }));
    registerLayout("free", freeLayout);
  });

  it("part.the-gap-opens-where-the-finger-points — not at the end of the row", () => {
    const parted = partAt(hand(), { x: -1, y: 0 }, CARD)!;
    expect(parted.before).toBe("a"); // the finger is over the first seat: the gap opens BEFORE it
    expect(parted.poses.get("a")!.x).toBeGreaterThan(-1); // and everyone from there on steps aside
  });

  it("part.the-neighbours-part-and-nobody-overlaps", () => {
    const parted = partAt(hand(), { x: 0, y: 0 }, CARD)!;
    const xs = ["a", "b", "c"].map((id) => parted.poses.get(id)!.x).concat(parted.gap.x).sort((p, q) => p - q);
    for (let i = 1; i < xs.length; i += 1) expect(xs[i]! - xs[i - 1]!, `${xs}`).toBeGreaterThanOrEqual(1);
  });

  it("part.the-gap-is-where-the-card-would-land — the preview is the promise", () => {
    // The whole reason to show it: what the hand opens IS where the card falls. A preview that
    // pointed anywhere else would be a lie told at the moment a player is deciding.
    const parted = partAt(hand(), { x: -1, y: 0 }, CARD)!;
    expect(parted.gap.x).toBeLessThan(parted.poses.get("a")!.x);
  });

  it("part.past-the-last-seat-the-gap-is-the-end", () => {
    const parted = partAt(hand(), { x: 9, y: 0 }, CARD)!;
    expect(parted.before).toBeUndefined();
    expect(parted.gap.x).toBeGreaterThan(parted.poses.get("c")!.x);
  });

  it("part.an-empty-hand-parts-into-one-seat", () => {
    const empty = node("hand", Container({ layout: "row" }));
    const parted = partAt(empty, { x: 0, y: 0 }, CARD)!;
    expect(parted.before).toBeUndefined();
    expect(parted.gap).toEqual({ x: 0, y: 0 });
  });

  it("part.a-layout-with-no-seats-does-not-part", () => {
    // A free desk keeps no addresses: a point on it is a POSITION, not a seat, so there is nothing
    // to step aside from and nothing to promise. Silence is the honest answer.
    expect(partAt(hand("free"), { x: 0, y: 0 }, CARD)).toBeUndefined();
  });

  it("part.an-unknown-layout-does-not-part-and-does-not-throw", () => {
    expect(partAt(hand("story.nobody-registered-this"), { x: 0, y: 0 }, CARD)).toBeUndefined();
  });

  it("part.the-tree-is-not-touched — a preview promises, it does not move", () => {
    const h = hand();
    partAt(h, { x: -1, y: 0 }, CARD);
    expect(h.children.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
});
