// WHAT ONE SEAT IS SHOWN — the tree, minus whatever its eyes are denied.
//
// The truth is one tree. A seat gets a PROJECTION of it, and the projection is a copy: two screens
// looking at one board would otherwise take turns destroying each other's view, since cutting a
// hand out for the north seat would cut it out of the board itself.

import { beforeEach, describe, expect, it } from "vitest";
import { add, byId, cloneTree, compose, node, walk } from "./node.js";
import { Private } from "./atoms/private.js";
import { Transformable } from "./atoms/transformable.js";
import { Bounded } from "./atoms/bounded.js";
import { rect } from "../presets/shapes.js";
import { project } from "./project.js";
import { Container } from "./atoms/container.js";
import { facing, Flippable } from "./atoms/flippable.js";
import { installStockGrains, keep, Poser, resetGrains } from "./atoms/pose.js";

/** A desk with two private hands and a public pile. */
function board() {
  const desk = node("desk");
  const north = node("north", Private({ access: ["north"] }));
  const south = node("south", Private({ access: ["south"] }));
  add(north, node("n1"));
  add(south, node("s1"));
  add(desk, north);
  add(desk, south);
  add(desk, node("pile"));
  return desk;
}

const ids = (root: ReturnType<typeof node>): string[] => {
  const out: string[] = [];
  walk(root, (n) => out.push(n.id));
  return out;
};

describe("the seat's view", () => {
  beforeEach(() => {
    resetGrains();
    installStockGrains();
  });

  it("project.a-seat-sees-its-own-hand-and-not-the-others", () => {
    expect(ids(project(board(), "north")).sort()).toEqual(["desk", "n1", "north", "pile"]);
    expect(ids(project(board(), "south")).sort()).toEqual(["desk", "pile", "s1", "south"]);
  });

  it("project.the-truth-is-not-touched — a projection is a copy, not a cut", () => {
    // The whole reason this is not the story's old in-place walk: with several screens on one
    // board, projecting for one seat would take the other seat's hand off the board itself.
    const truth = board();
    project(truth, "north");
    project(truth, "south");
    expect(ids(truth).sort()).toEqual(["desk", "n1", "north", "pile", "s1", "south"]);
  });

  it("project.two-seats-hold-two-trees — neither is the other's, and neither is the truth's", () => {
    const truth = board();
    const north = project(truth, "north");
    expect(north).not.toBe(truth);
    expect(byId(north, "pile")).not.toBe(byId(truth, "pile"));
    expect(byId(north, "pile")?.id).toBe("pile"); // the same NAME: a move names a node, and both agree
  });

  it("project.a-stranger-sees-neither-hand", () => {
    expect(ids(project(board(), "watcher")).sort()).toEqual(["desk", "pile"]);
  });

  it("clone.a-copy-carries-the-atoms-and-the-shape", () => {
    const one = node("one", Bounded({ bounds: rect(1, 1.4) }), Transformable({ at: { x: 2, y: 3 } }));
    add(one, node("kid"));
    const copy = cloneTree(one);
    expect(copy).not.toBe(one);
    expect([...copy.atoms.keys()].sort()).toEqual(["Bounded", "Transformable"]);
    expect(copy.children.map((c) => c.id)).toEqual(["kid"]);
    expect(byId(copy, "kid")?.parent?.id).toBe("one"); // the copy is a whole tree, wired to itself
  });

  it("clone.writing-on-the-copy-leaves-the-original-alone", () => {
    // Atoms are immutable data and are SHARED rather than deep-copied; what must not be shared is
    // the node's own atom map, or a projection's rewrite would land on the truth.
    const one = node("one", Transformable({ at: { x: 0, y: 0 } }));
    const copy = cloneTree(one);
    compose(copy, Transformable({ at: { x: 9, y: 9 } }));
    expect(one.atoms.get("Transformable")!.fields).toEqual({ at: { x: 0, y: 0 }, z: 0, angle: 0, scale: 1 });
  });

  // ── what the OTHERS are shown ───────────────────────────────────────────────────────────────
  //
  // The second axis of facing, and it is not privacy. Privacy answers "is the card in your picture
  // at all"; this answers "which side of it do you see" — a hand may be perfectly visible to the
  // whole table and still show its owner faces and everyone else backs.
  //
  // A pure function of the owner's side and who is looking, applied to the PROJECTION alone. The
  // truth keeps one side per card; what differs between seats is only what was drawn for them.

  /** A hand with a facing rule, holding one face-up card. Public: privacy is a separate question. */
  function handOn(others: string, owner: string) {
    const desk = node("desk", Container({ layout: "free" }));
    const hand = node("hand", Container({ layout: "free" }), Poser({ side: keep(), others, owner }));
    add(hand, node("card", Flippable({ turns: 0 })));
    add(desk, hand);
    return desk;
  }

  it("facing.same-shows-everyone-what-the-owner-sees", () => {
    for (const seat of ["north", "south"]) {
      expect(facing(byId(project(handOn("same", "north"), seat), "card")!)).toBe("up");
    }
  });

  it("facing.back-hides-the-face-from-everyone-but-the-owner", () => {
    // The strict game: the owner reads their hand, the table sees a row of backs.
    expect(facing(byId(project(handOn("back", "north"), "north"), "card")!)).toBe("up");
    expect(facing(byId(project(handOn("back", "north"), "south"), "card")!)).toBe("down");
  });

  it("facing.opposite-shows-the-table-the-other-side", () => {
    // The owner always sees their own side; everyone else sees its inverse. Held that way round a
    // whole hand reads outwards — and it differs from `back` the moment a single card is turned,
    // where a back-rule table still sees a back and this one sees a face.
    expect(facing(byId(project(handOn("opposite", "north"), "north"), "card")!)).toBe("up");
    expect(facing(byId(project(handOn("opposite", "north"), "south"), "card")!)).toBe("down");
  });

  it("facing.the-odd-card-stays-odd — the two bits do not mix", () => {
    // Turn ONE card in an outward-facing hand and it is strange from BOTH sides, forever: the
    // owner sees a back among faces, the table a face among backs. Not programmed — it follows
    // from the card's own bit and the zone's rule being separate things.
    const truth = handOn("opposite", "north");
    const hand = byId(truth, "hand")!;
    add(hand, node("odd", Flippable({ turns: 1 })));
    const own = project(truth, "north");
    const onlooker = project(truth, "south");
    expect([facing(byId(own, "card")!), facing(byId(own, "odd")!)]).toEqual(["up", "down"]);
    expect([facing(byId(onlooker, "card")!), facing(byId(onlooker, "odd")!)]).toEqual(["down", "up"]);
  });

  it("facing.a-zone-with-no-rule-shows-what-is-there", () => {
    const desk = node("desk", Container({ layout: "free" }));
    const pile = node("pile", Container({ layout: "free" }));
    add(pile, node("card", Flippable({ turns: 1 })));
    add(desk, pile);
    expect(facing(byId(project(desk, "anyone"), "card")!)).toBe("down");
  });

  it("facing.the-truth-keeps-one-side — the seats differ, the board does not", () => {
    const truth = handOn("back", "north");
    project(truth, "south");
    expect(facing(byId(truth, "card")!)).toBe("up");
  });
});
