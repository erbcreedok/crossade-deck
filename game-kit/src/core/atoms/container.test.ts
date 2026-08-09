import { beforeEach, describe, expect, it } from "vitest";
import { add, caps, node } from "../node.js";
import { Bounded } from "./bounded.js";
import { Container, contentExtent, placeChildren, registerLayout, resetLayouts } from "./container.js";
import { freeLayout, rowLayout } from "./layouts.js";
import { Transformable } from "./transformable.js";
import { rect } from "../shapes.js";

const box = (w: number, h: number) => Bounded({ bounds: rect(w, h) });

beforeEach(() => {
  resetLayouts();
  registerLayout("free", freeLayout);
  registerLayout("row", rowLayout({ gap: 0 }));
});

describe("Container", () => {
  it("atom.container.is-the-arrangement — that link is BASE and needs no atom", () => {
    // This is the whole argument for the atom's existence. A root holds children with nothing
    // composed on it at all; if `Container` only carried "has children", it would carry
    // nothing. It is the arrangement, and that is why it is an atom.
    const root = node("c1");
    add(root, node("c2"));
    expect(root.children).toHaveLength(1);
    expect(caps(root).has("Container")).toBe(false);
  });

  it("atom.container.free-places-nobody — the layout that places nobody", () => {
    // The "canvas you can put things anywhere on" is not a mode: it is the cheapest layout
    // record there is, one that declines to place.
    const root = node("c3", Container({ layout: "free" }));
    add(root, node("c4", Transformable({ at: { x: 3, y: -2 } })));
    expect(placeChildren(root).get("c4")).toEqual({ x: 3, y: -2 });
  });

  it("atom.container.row-places-everyone — a layout that places, places", () => {
    const root = node("c5", Container({ layout: "row" }));
    add(root, node("c6", box(1, 1), Transformable({ at: { x: 99, y: 99 } })));
    add(root, node("c7", box(1, 1)));
    expect(placeChildren(root).get("c6")).toEqual({ x: -0.5, y: 0 });
    expect(placeChildren(root).get("c7")).toEqual({ x: 0.5, y: 0 });
  });

  it("atom.container.row-measures-footprints — width comes from the footprint, not a constant", () => {
    const root = node("c8", Container({ layout: "row" }));
    add(root, node("c9", box(2, 1)));
    add(root, node("c10", box(1, 1)));
    // Total 3 wide, centred: the first spans −1.5…0.5, the second 0.5…1.5.
    expect(placeChildren(root).get("c9")).toEqual({ x: -0.5, y: 0 });
    expect(placeChildren(root).get("c10")).toEqual({ x: 1, y: 0 });
  });

  it("atom.container.gap-is-the-record — spacing belongs to the arrangement, not the node", () => {
    // A gap means something in a row and nothing in a free layout. A field on the container
    // would be a field four arrangements out of five cannot use.
    registerLayout("row", rowLayout({ gap: 1 }));
    const root = node("c11", Container({ layout: "row" }));
    add(root, node("c12", box(1, 1)));
    add(root, node("c13", box(1, 1)));
    expect(placeChildren(root).get("c12")).toEqual({ x: -1, y: 0 });
    expect(placeChildren(root).get("c13")).toEqual({ x: 1, y: 0 });
  });

  it("atom.container.boxless-child — but is still placed", () => {
    // Removing a box must not silently shuffle the neighbours out from under the reader.
    const root = node("c14", Container({ layout: "row" }));
    add(root, node("c15"));
    add(root, node("c16", box(1, 1)));
    expect(placeChildren(root).get("c15")).toEqual({ x: -0.5, y: 0 });
  });

  it("atom.container.unknown-layout — a bad name is not a dead scene", () => {
    // A missing record is a content mistake. Taking the whole tree down over one would hide
    // every node that was perfectly fine.
    const root = node("c17", Container({ layout: "carousel" }));
    add(root, node("c18", Transformable({ at: { x: 7, y: 0 } })));
    expect(placeChildren(root).get("c18")).toEqual({ x: 7, y: 0 });
  });

  it("atom.container.no-atom-still-children — children still sit where they were put", () => {
    const root = node("c19");
    add(root, node("c20", Transformable({ at: { x: 1, y: 2 } })));
    expect(placeChildren(root).get("c20")).toEqual({ x: 1, y: 2 });
  });

  it("atom.container.content-extent — the other source of area, for a node with no box", () => {
    // This is what lets the desk carry a surface: it has something to paint and no
    // footprint of its own.
    const root = node("c21", Container({ layout: "row" }));
    add(root, node("c22", box(1, 2)));
    add(root, node("c23", box(1, 2)));
    expect(contentExtent(root)).toEqual({ w: 2, h: 2 });
  });

  it("atom.container.content-extent-empty — zero, never infinity", () => {
    expect(contentExtent(node("c24", Container()))).toEqual({ w: 0, h: 0 });
  });

  it("atom.container.content-extent-boxless — nothing to measure, nothing counted", () => {
    const root = node("c25", Container({ layout: "free" }));
    add(root, node("c26"));
    expect(contentExtent(root)).toEqual({ w: 0, h: 0 });
  });

  it("layout.reserves-room-for-the-scaled-child — a card at twice the size is twice as wide", () => {
    // A layout reserves room for what it is going to SEE. Measured at one and drawn at two, the
    // card overlaps its neighbour — which looks like a broken layout and is a forgotten
    // multiplication. It looked exactly like that on the canvas the day scale arrived.
    const row = node("c40", Container({ layout: "row" }));
    add(row, node("c41", Bounded({ bounds: rect(1, 1) }), Transformable({ scale: 2 })));
    add(row, node("c42", Bounded({ bounds: rect(1, 1) })));
    const [first, second] = [...placeChildren(row).values()];
    // Half of the big one plus half of the small one, with the row's gap of zero: 1 + 0.5.
    expect(second!.x - first!.x).toBeCloseTo(1.5, 9);
  });
});
