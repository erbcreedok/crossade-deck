import { beforeEach, describe, expect, it } from "vitest";
import { add, caps, fieldsOf, node, remove } from "../node.js";
import { Bounded } from "./bounded.js";
import { Container, contentExtent, placeChildren, registerLayout, resetLayouts } from "./container.js";
import { freeLayout, rowLayout } from "./layouts.js";
import { Transformable, type TransformableFields } from "./transformable.js";
import { rect } from "../../presets/shapes.js";

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

  it("atom.container.padding-is-the-record — room grows around the tight wrap, not the children", () => {
    // A field on `Container` would be the same mistake `gap` already avoided: padding means
    // something for a layout that packs and nothing for one that never touches its children.
    registerLayout("row", rowLayout({ gap: 0, padding: 0.5 }));
    const root = node("c30", Container({ layout: "row" }));
    add(root, node("c31", box(1, 2)));
    add(root, node("c32", box(1, 2)));
    // Tight wrap is 2×2 (see `content-extent` above); padding adds 0.5 on every side.
    expect(contentExtent(root)).toEqual({ w: 3, h: 3 });
    // The children themselves did not move: padding grows the AREA, not the row.
    expect(placeChildren(root).get("c31")).toEqual({ x: -0.5, y: 0 });
    expect(placeChildren(root).get("c32")).toEqual({ x: 0.5, y: 0 });
  });

  it("atom.container.padding-is-optional — an unknown layout has no padding to read, not a crash", () => {
    const root = node("c33", Container({ layout: "carousel" }));
    add(root, node("c34", box(1, 2)));
    // Unplaced children still sit at the origin (`unknown-layout`, above) and still measure —
    // padding just falls back to zero rather than throwing on a record that is not there.
    expect(contentExtent(root)).toEqual({ w: 1, h: 2 });
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

  it("atom.container.gap-stands-between — N children get N−1 gaps, and the edges get none", () => {
    // The classic fencepost: gap×N instead of gap×(N−1) survives every two-child test ever
    // written, because there it is off by a constant the centring hides. One child is where it
    // shows — a lone card with an outer gap would sit off-centre.
    registerLayout("row", rowLayout({ gap: 1 }));
    const root = node("f1", Container({ layout: "row" }));
    add(root, node("f2", box(1, 1)));
    expect(placeChildren(root).get("f2")).toEqual({ x: 0, y: 0 });
  });

  it("atom.container.neighbours-adjoin — each child starts where the last one ended, plus the gap", () => {
    // Totals can be right while the seams drift: an accumulation bug redistributes the same
    // total width unevenly. The claim is PAIRWISE — right edge to left edge, every seam.
    registerLayout("row", rowLayout({ gap: 0.25 }));
    const widths = [2, 1, 0.5];
    const root = node("f3", Container({ layout: "row" }));
    widths.forEach((w, i) => add(root, node(`f3c${i}`, box(w, 1))));
    const xs = widths.map((_, i) => placeChildren(root).get(`f3c${i}`)!.x);
    for (let i = 1; i < widths.length; i += 1) {
      expect(xs[i]! - widths[i]! / 2).toBeCloseTo(xs[i - 1]! + widths[i - 1]! / 2 + 0.25, 9);
    }
  });

  it("atom.container.order-is-the-tree — the row reads the slot, never the ids or the sizes", () => {
    // The same two cards inserted both ways give mirrored pictures: position follows insertion
    // order and nothing else. A layout sorting by id or by width would pass any single-order test.
    const wide = () => box(2, 1);
    const slim = () => box(1, 1);
    const ab = node("f4", Container({ layout: "row" }));
    add(ab, node("f5", wide()));
    add(ab, node("f6", slim()));
    const ba = node("f7", Container({ layout: "row" }));
    add(ba, node("f6b", slim()));
    add(ba, node("f5b", wide()));
    expect(placeChildren(ab).get("f5")).toEqual({ x: -0.5, y: 0 });
    expect(placeChildren(ab).get("f6")).toEqual({ x: 1, y: 0 });
    expect(placeChildren(ba).get("f6b")).toEqual({ x: -1, y: 0 });
    expect(placeChildren(ba).get("f5b")).toEqual({ x: 0.5, y: 0 });
  });

  it("atom.container.placing-is-pure — the answer is a map, and the tree is not written to", () => {
    // A layout is GIVEN data and returns points; the day a shared code path "helpfully" writes
    // the answer back into `at`, free stops meaning "the pose stands" — because the pose it
    // keeps would be the one the last row wrote.
    const root = node("f8", Container({ layout: "row" }));
    const child = node("f9", box(1, 1), Transformable({ at: { x: 7, y: 7 } }));
    add(root, child);
    expect(placeChildren(root).get("f9")).toEqual({ x: 0, y: 0 }); // the row placed it…
    expect(fieldsOf<TransformableFields>(child, "Transformable")?.at).toEqual({ x: 7, y: 7 }); // …and wrote nothing
  });

  it("atom.container.placing-twice-is-the-same-place — no feedback loop through what it wrote", () => {
    // A layout that reads a position it itself computed converges nowhere; asking twice must be
    // asking once. Cheap to hold today, and exactly the kind of promise that breaks silently.
    registerLayout("row", rowLayout({ gap: 0.3 }));
    const root = node("f12", Container({ layout: "row" }));
    add(root, node("f13", box(2, 1), Transformable({ at: { x: 9, y: 9 } })));
    add(root, node("f14", box(1, 1)));
    expect(placeChildren(root)).toEqual(placeChildren(root));
  });

  it("atom.container.removal-closes-the-aisle — the row heals by exactly a width and a gap", () => {
    // Stale cached measurement is the bug this catches: after a removal the survivors must
    // adjoin again, and the total must shrink by the departed width plus ONE gap.
    registerLayout("row", rowLayout({ gap: 0.5 }));
    const root = node("f15", Container({ layout: "row" }));
    const middle = node("f17", box(1, 1));
    add(root, node("f16", box(1, 1)));
    add(root, middle);
    add(root, node("f18", box(1, 1)));
    const before = placeChildren(root);
    const spanBefore = before.get("f18")!.x - before.get("f16")!.x;
    remove(root, middle);
    const after = placeChildren(root);
    const spanAfter = after.get("f18")!.x - after.get("f16")!.x;
    expect(spanBefore - spanAfter).toBeCloseTo(1 + 0.5, 9);
    expect(spanAfter).toBeCloseTo(1 + 0.5, 9); // and the survivors adjoin: one width, one gap
  });

  it("atom.container.content-extent-spans-negatives — the wrap is a union, not a size from zero", () => {
    // Konva's classic: an empty-safe bounds routine that quietly anchors at the origin. A child
    // sitting entirely in the negatives must widen the wrap exactly as far as it sits.
    const root = node("f19", Container({ layout: "free" }));
    add(root, node("f20", box(1, 2), Transformable({ at: { x: -3, y: 1 } })));
    add(root, node("f21", box(1, 2), Transformable({ at: { x: 2, y: 0 } })));
    expect(contentExtent(root).w).toBeCloseTo(6, 9); // −3.5 … 2.5
    expect(contentExtent(root).h).toBeCloseTo(3, 9); // −1 … 2
  });

  it("atom.container.spreading-does-not-recurse — a boxless container inside occupies nothing", () => {
    // The wrap unions BOXES, and a container with none contributes none — its derived area is
    // what `Surfaced` may paint on, never a footprint the outer desk must reserve. If nesting is
    // ever to occupy room, it will arrive as a stated law, not leak in through a measurement.
    const outer = node("f22", Container({ layout: "free" }));
    const inner = node("f23", Container({ layout: "free" }));
    add(inner, node("f24", box(4, 4)));
    add(outer, inner);
    expect(contentExtent(outer)).toEqual({ w: 0, h: 0 });
  });

  it("atom.container.an-empty-row-is-a-no-op — no children, no places, no throw", () => {
    // Flutter runs every alignment against the zero-child tree before asserting sizes, and for
    // the same reason: the degenerate case is where a `total/(n-1)` divides by nothing.
    registerLayout("row", rowLayout({ gap: 1, padding: 0.5 }));
    const root = node("f25", Container({ layout: "row" }));
    expect(placeChildren(root).size).toBe(0);
    // Nothing inside means nothing to pad, either — zero, not padding×2.
    expect(contentExtent(root)).toEqual({ w: 0, h: 0 });
  });
});
