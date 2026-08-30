// THE CATALOG'S DRAG WIRING — the two laws of a REFUSED drop, which is the only kind these desks
// have: nothing on a sandbox accepts anything, so every release falls through to `onReject`.
//
// Both laws are about what a drop must NOT quietly change. They are here because both were broken
// in ways nobody would blame on a drag: a turn that vanished, and a piece that sank under its
// neighbour the moment it was put down.

import { beforeEach, describe, expect, it } from "vitest";
import {
  add,
  Bounded,
  Container,
  Draggable,
  fieldsOf,
  freeLayout,
  node,
  rect,
  remove,
  registerLayout,
  Surfaced,
  Transformable,
  installStockSurfaces,
  DEFAULT_VIEWER,
  type Host,
  type Motions,
  type Node,
  type TransformableFields,
  type Vec,
} from "../../src/index.js";
import { wireDrag } from "./drag.js";
import { type Scene } from "./scene.js";

/** A view that only records its listeners — the wiring asks it for nothing else worth faking. */
function stubView() {
  const listeners = new Map<string, Array<(e: PointerEvent) => void>>();
  const el = {
    style: {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener: (t: string, f: (e: PointerEvent) => void) => void listeners.set(t, [...(listeners.get(t) ?? []), f]),
    removeEventListener: () => undefined,
    setPointerCapture: () => undefined,
  } as unknown as HTMLCanvasElement;
  return {
    el,
    fire: (type: string, x: number, y: number) => {
      const e = { clientX: x, clientY: y, pointerId: 1 } as unknown as PointerEvent;
      for (const f of listeners.get(type) ?? []) f(e);
    },
  };
}

/**
 * TWO PIECES SIDE BY SIDE on an 800×600 view at 100 px/unit, on a canvas that places nobody: the
 * desk's origin is glass (400, 300), so `a` is at glass 300 and `b` at glass 500.
 */
function bench(): { s: Scene; desk: Node; fire: (t: string, x: number, y: number) => void } {
  const desk = node("desk", Container({ layout: "free" }));
  add(desk, node("a", Bounded({ bounds: rect(1, 1) }), Surfaced(), Transformable({ at: { x: -1, y: 0 }, angle: 30, z: 2 }), Draggable({ onReject: "stay" })));
  add(desk, node("b", Bounded({ bounds: rect(1, 1) }), Surfaced(), Transformable({ at: { x: 1, y: 0 } }), Draggable({ onReject: "stay" })));
  const view = stubView();
  const host = {
    view: view.el,
    root: desk,
    unit: () => 100,
    viewport: () => ({ width: 800, height: 600, dpr: 1 }),
    viewer: () => DEFAULT_VIEWER,
    setRoot: () => undefined,
  } as unknown as Host;
  // Only what the wiring actually calls. A stub and not the real clock: these laws are about the
  // TREE the drop leaves behind, and a running runtime would only add frames to wait for.
  const motions = {
    grab: () => undefined,
    dragTo: () => undefined,
    release: () => undefined,
    hold: () => undefined,
    velocity: (): Vec | undefined => undefined,
    poses: () => undefined,
    busy: () => false,
  } as unknown as Motions;
  const s = { el: {} as HTMLElement, host, motions, id: "t", ready: Promise.resolve(), setRoot: () => undefined } as unknown as Scene;
  return { s, desk, fire: view.fire };
}

const poseOf = (n: Node) => fieldsOf<TransformableFields>(n, "Transformable")!;

beforeEach(() => {
  // Registered rather than reset: the seams that CLEAR these registries are the kit's own and do
  // not come through the catalog's door (`guard.catalog-through-the-door`). Naming what this file
  // needs is enough — nothing here reads a name it did not write.
  registerLayout("free", freeLayout);
  installStockSurfaces();
});

describe("a refused drop", () => {
  it("drag.a-refused-drop-keeps-the-pieces-own-pose — the seat changes and nothing else does", () => {
    // `compose` REPLACES an atom outright, so a bare `Transformable({ at })` returns the turn, the
    // height and the size to their defaults. A piece two fingers had just turned would snap upright
    // the next time a hand moved it — and the drag would be blamed for losing the turn.
    const b = bench();
    wireDrag(b.s);
    b.fire("pointerdown", 300, 300);
    b.fire("pointermove", 350, 320);
    b.fire("pointerup", 350, 320);

    const pose = poseOf(b.desk.children[0]!);
    expect(pose.at.x, "the seat is where the finger left it").toBeCloseTo(-0.5, 5);
    expect(pose.at.y).toBeCloseTo(0.2, 5);
    expect(pose.angle, "and the turn the piece already had is still on it").toBe(30);
    expect(pose.z, "as is its height").toBe(2);
  });

  it("drag.the-last-piece-put-down-draws-over-its-neighbours — by tree order", () => {
    // The plan sorts stably and equal heights keep the order of the children, so being last among
    // one's siblings IS being on top.
    const b = bench();
    wireDrag(b.s, { toFront: true });
    expect(b.desk.children.map((c) => c.id)).toEqual(["a", "b"]);
    b.fire("pointerdown", 300, 300);
    b.fire("pointermove", 340, 300);
    b.fire("pointerup", 340, 300);
    expect(b.desk.children.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("drag.a-thing-put-down-on-ITSELF-is-still-news — the game is asked before the refusal", () => {
    // `zoneAt` answers with whatever zone is where the finger let go, and when the thing being
    // carried IS that zone — a pack dragged across the felt and put down — the honest answer is
    // still "the pack". That was refused before the game heard about it, and the refusal took a
    // real event with it: "the pack was set down" is the exact moment a table wants, because a pack
    // set down on loose cards picks them up. The desk asked for that and never got it, and there
    // was nothing on the glass to say why.
    const b = bench();
    const asked: string[] = [];
    wireDrag(b.s, {
      zoneAt: () => b.desk.children[0]!, // whatever is dropped, the zone is `a` — including `a`
      onDrop: ({ lead, target }) => {
        asked.push(`${lead.id}->${target.id}`);
        return false; // and the ordinary drop still stands
      },
    });
    b.fire("pointerdown", 300, 300);
    b.fire("pointermove", 340, 300);
    b.fire("pointerup", 340, 300);
    expect(asked, "put down on itself, and the game heard about it").toEqual(["a->a"]);
    // AND IT IS STILL NOT MOVED INTO ITSELF. The refusal survives — it is only no longer silent.
    expect(b.desk.children.map((c) => c.id)).toEqual(["a", "b"]);
    expect(b.desk.children[0]!.parent).toBe(b.desk);
    expect(poseOf(b.desk.children[0]!).at.x, "the ordinary drop stands: it lies where it was left").toBeCloseTo(-0.6, 5);
  });

  it("drag.raising-a-piece-never-touches-its-height — z is the shadow's, not the painter's", () => {
    // The trap this option exists to avoid. `z` looks like the obvious lever for "draw it on top"
    // and is the wrong one: the shadow law reads it, so a desk that raised by height would slowly
    // fill with pieces apparently hovering above the felt.
    const b = bench();
    wireDrag(b.s, { toFront: true });
    b.fire("pointerdown", 300, 300);
    b.fire("pointermove", 340, 300);
    b.fire("pointerup", 340, 300);
    expect(poseOf(b.desk.children[1]!).z).toBe(2);
  });

  it("drag.raising-a-run-never-reorders-inside-it — a drag must not reshuffle a pack", () => {
    // THE BUG THIS WAS FOUND BY, and it did not look like one: touch the pack, and the top card
    // changes. Raising each carried node in turn walks the pack's OWN order and rewrites it — a
    // drag silently reshuffling a deck. What rises is the run, where the run lives; what is inside
    // it is somebody else's order to keep.
    const b = bench();
    const pack = node("pack", Container({ layout: "free" }), Bounded({ bounds: rect(1, 1) }), Surfaced(), Transformable({ at: { x: -1, y: 0 } }), Draggable({ onReject: "stay" }));
    for (const id of ["c0", "c1", "c2"]) {
      add(pack, node(id, Bounded({ bounds: rect(1, 1) }), Surfaced(), Transformable({ at: { x: 0, y: 0 } })));
    }
    remove(b.desk, b.desk.children[0]!);
    add(b.desk, pack);
    wireDrag(b.s, { toFront: true, runOf: (_r, hit) => (hit.id === "pack" ? [hit, ...hit.children] : [hit]) });

    b.fire("pointerdown", 300, 300);
    b.fire("pointermove", 340, 300);
    b.fire("pointerup", 340, 300);
    expect(pack.children.map((c) => c.id), "the pack came back in the order it went out in").toEqual(["c0", "c1", "c2"]);
    expect(b.desk.children[b.desk.children.length - 1]!.id, "and the pack itself is on top").toBe("pack");
  });

  it("drag.a-run-of-siblings-rises-together-and-in-order — a column is still a column", () => {
    const b = bench();
    add(b.desk, node("c", Bounded({ bounds: rect(1, 1) }), Surfaced(), Transformable({ at: { x: 2, y: 0 } }), Draggable({ onReject: "stay" })));
    wireDrag(b.s, { toFront: true, runOf: (_r, hit) => (hit.id === "a" ? [hit, b.desk.children[1]!] : [hit]) });
    b.fire("pointerdown", 300, 300);
    b.fire("pointermove", 340, 300);
    b.fire("pointerup", 340, 300);
    expect(b.desk.children.map((c) => c.id), "the run went last, keeping the order it had").toEqual(["c", "a", "b"]);
  });

  it("drag.a-desk-that-did-not-ask-keeps-its-order — off by default", () => {
    // A game whose zones own their order says who is on top with the tree it publishes, and a
    // wiring that reordered behind its back would be the finger overruling the rules.
    const b = bench();
    wireDrag(b.s);
    b.fire("pointerdown", 300, 300);
    b.fire("pointermove", 340, 300);
    b.fire("pointerup", 340, 300);
    expect(b.desk.children.map((c) => c.id)).toEqual(["a", "b"]);
  });
});
