// Ids follow docs/test-plan.md — a failing id names the scenario and the state.

import { beforeEach, describe, expect, it } from "vitest";
import { defineAtom, resetAtoms } from "./atom.js";
import {
  add,
  byId,
  caps,
  chainOf,
  compose,
  decompose,
  isRoot,
  localIds,
  node,
  remove,
  rootOf,
  starved,
  walk,
} from "./node.js";

// Stand-ins declared per suite: slice 1 ships no concrete atoms, but the MECHANISM is what
// these cases are about. A requirement that is an ALTERNATIVE is the interesting one.
function declareAtoms() {
  return {
    Bounded: defineAtom({ name: "Bounded", requires: [], defaults: { size: "1x1" } }),
    Container: defineAtom({ name: "Container", requires: [], defaults: { layout: "center" } }),
    // An area comes from an own size OR from the extent of the content.
    Surfaced: defineAtom({ name: "Surfaced", requires: [["Bounded", "Container"]], defaults: { surface: "plate" } }),
    Flippable: defineAtom({ name: "Flippable", requires: ["Surfaced"], defaults: { reverse: "back" } }),
  };
}

let Bounded: ReturnType<typeof declareAtoms>["Bounded"];
let Container: ReturnType<typeof declareAtoms>["Container"];
let Surfaced: ReturnType<typeof declareAtoms>["Surfaced"];
let Flippable: ReturnType<typeof declareAtoms>["Flippable"];

beforeEach(() => {
  resetAtoms();
  ({ Bounded, Container, Surfaced, Flippable } = declareAtoms());
});

describe("node.compose", () => {
  it("node.compose.empty — a bare node is valid and has no capabilities", () => {
    const n = node("n1");
    expect(caps(n).size).toBe(0);
    expect(n.children).toEqual([]);
    expect(isRoot(n)).toBe(true);
  });

  it("compose.add-atom — a composed atom is present", () => {
    const n = node("n16", Bounded());
    expect(caps(n).has("Bounded")).toBe(true);
  });

  it("compose.remove-atom — a removed atom is ABSENT, never disabled", () => {
    const n = node("n17", Bounded());
    decompose(n, "Bounded");
    expect(caps(n).has("Bounded")).toBe(false);
    expect(starved(n)).toEqual([]); // gone entirely, not lingering as inert
  });

  it("compose.commut — order does not change the node", () => {
    const a = node("n18", Bounded(), Container());
    const b = node("n19", Container(), Bounded());
    expect([...caps(a)].sort()).toEqual([...caps(b)].sort());
  });

  it("compose.dedupe — the same atom twice is present once", () => {
    const n = node("n20", Bounded());
    compose(n, Bounded({ size: "2x2" }));
    expect(caps(n).size).toBe(1);
    expect(n.atoms.get("Bounded")!.fields).toEqual({ size: "2x2" });
  });

  it("node.id.given — a node is NAMED, it does not name itself", () => {
    // The id is an input because the same node is read from more than one place: another
    // device, a save reopened tomorrow, a live mock. A counter hidden in `node()` is unique
    // inside one tab and nowhere else.
    expect(node("discard").id).toBe("discard");
  });

  it("node.id.local-allocator — an instance answering to nobody mints its own, explicitly", () => {
    const ids = localIds();
    expect(ids.next()).not.toBe(ids.next());
  });

  it("node.id.allocators-are-independent — two worlds do not share a counter", () => {
    // Which is exactly why the allocator may never be a module-level global again: two of
    // them WILL produce the same name, and that has to be visible rather than assumed away.
    expect(localIds().next()).toBe(localIds().next());
  });
});

describe("requirement chains", () => {
  it("req.direct — an atom whose requirement is missing does not exist", () => {
    const n = node("n21", Surfaced()); // no Bounded, no Container
    expect(caps(n).has("Surfaced")).toBe(false);
    expect(starved(n).map((d) => d.name)).toEqual(["Surfaced"]);
  });

  it("req.alternative — an area may come from Bounded OR from Container", () => {
    expect(caps(node("n22", Bounded(), Surfaced())).has("Surfaced")).toBe(true);
    expect(caps(node("n23", Container(), Surfaced())).has("Surfaced")).toBe(true);
  });

  it("req.alternative-none — with neither source of area, there is nothing to paint on", () => {
    expect(caps(node("n24", Surfaced())).has("Surfaced")).toBe(false);
  });

  it("req.transitive — removing the root of a chain takes the whole branch in one step", () => {
    const n = node("n25", Bounded(), Surfaced(), Flippable());
    expect(caps(n).size).toBe(3);
    decompose(n, "Bounded");
    expect([...caps(n)]).toEqual([]);
    expect(starved(n).map((d) => d.name).sort()).toEqual(["Flippable", "Surfaced"]);
  });

  it("req.no-disabled-path — an absent atom exposes no fields at all", () => {
    const n = node("n26", Surfaced());
    expect(n.atoms.has("Surfaced")).toBe(true); // the author asked for it
    expect(caps(n).has("Surfaced")).toBe(false); // and it is not there
  });
});

describe("the tree and the root", () => {
  it("root.is-just-a-node — a root is an ordinary node that nobody placed", () => {
    const root = node("n2");
    expect(isRoot(root)).toBe(true);
    expect(caps(root).size).toBe(0);
  });

  it("root.cannot-be-a-child-twice — a placed node has exactly one owner", () => {
    const root = node("n3");
    const a = node("n4");
    add(root, a);
    expect(isRoot(a)).toBe(false);
    expect(() => add(node("n5"), a)).toThrow(/already has an owner/);
  });

  it("tree.no-cycles — a node cannot own its own owner", () => {
    const root = node("n6");
    const child = node("n7");
    add(root, child);
    expect(() => add(child, root)).toThrow(/cycle/);
    expect(() => add(root, root)).toThrow(/itself/);
  });

  it("chain — owners run from the root down to the node, inclusive", () => {
    const root = node("n8");
    const mid = node("n9");
    const leaf = node("n10");
    add(root, mid);
    add(mid, leaf);
    expect(chainOf(leaf)).toEqual([root, mid, leaf]);
    expect(rootOf(leaf)).toBe(root);
  });

  it("tree.duplicate-id-is-loud — two things claiming to be one is an error, not a merge", () => {
    const root = node("root");
    add(root, node("hand"));
    expect(() => add(root, node("hand"))).toThrow(/already in this tree/);
    // And nothing was half-done: the rejected node did not acquire an owner on the way out.
    expect(root.children).toHaveLength(1);
  });

  it("tree.duplicate-deep — the check covers the whole incoming subtree, not just its top", () => {
    const root = node("root");
    add(root, node("hand"));
    const incoming = node("board");
    add(incoming, node("hand"));
    expect(() => add(root, incoming)).toThrow(/already in this tree/);
  });

  it("tree.same-id-in-another-tree — uniqueness is per tree, not global", () => {
    // Two separate worlds may each hold a `hand`; they only have to agree inside one tree.
    const a = node("root");
    add(a, node("hand"));
    const b = node("root");
    expect(() => add(b, node("hand"))).not.toThrow();
  });

  it("root.byid-derived — a node that left the tree is not findable", () => {
    const root = node("n11");
    const child = node("n12");
    add(root, child);
    expect(byId(root, child.id)).toBe(child);
    remove(root, child);
    expect(byId(root, child.id)).toBeUndefined();
    expect(isRoot(child)).toBe(true); // detached, so it is a root again
  });

  it("walk — every node is visited once, with its depth", () => {
    const root = node("n13");
    const a = node("n14");
    const b = node("n15");
    add(root, a);
    add(a, b);
    const seen: Array<[string, number]> = [];
    walk(root, (n, d) => seen.push([n.id, d]));
    expect(seen.map(([, d]) => d)).toEqual([0, 1, 2]);
  });
});
