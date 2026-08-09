// @vitest-environment jsdom

// The seam between a host and a painter. jsdom has no WebGL, so the painter is a stub that
// records what it was asked to draw — which is also the only way to assert WHICH quads were
// baked, since baking is invisible in the picture until something is scaled.

import { describe, expect, it } from "vitest";
import { Bakeable, bakeable } from "../core/atoms/bakeable.js";
import { Bounded } from "../core/atoms/bounded.js";
import { Container } from "../core/atoms/container.js";
import { freeLayout } from "../core/atoms/layouts.js";
import { registerLayout, resetLayouts } from "../core/atoms/container.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { Transformable } from "../core/atoms/transformable.js";
import { node, add } from "../core/node.js";
import { IDENTITY } from "../core/transform.js";
import { mount } from "./host.js";
import { attachPainter, type PaintOptions } from "./stage.js";
import { installStockSurfaces, resetSurfaces } from "./surfaces.js";
import { type Painter } from "./painter.js";
import { type Quad } from "./scenePlan.js";

/** A desk holding a node that says it rests and one that says nothing. Both scaled, so a fold shows. */
const desk = () => {
  const root = node("desk", Container({ layout: "free" }));
  add(root, node("still", Bounded(), Surfaced(), Bakeable(), Transformable({ scale: 2 })));
  add(root, node("moving", Bounded(), Surfaced(), Transformable({ scale: 2 })));
  return root;
};

function paint(options: PaintOptions = {}): Map<string, Quad> {
  resetLayouts();
  registerLayout("free", freeLayout);
  resetSurfaces();
  installStockSurfaces();

  let last: readonly Quad[] = [];
  const painter: Painter = {
    ready: Promise.resolve(),
    draw: (plan) => {
      last = plan;
    },
    resize: () => {},
    destroy: () => {},
  };
  const host = mount(document.createElement("div"), desk());
  const stop = attachPainter(host, painter, options);
  stop();
  host.unmount();
  return new Map(last.map((q) => [q.id, q]));
}

/** Baked is exactly "the matrix was spent" — the quad carries the identity afterwards. */
const wasBaked = (quads: Map<string, Quad>, id: string): boolean => quads.get(id)!.transform === IDENTITY;

describe("who bakes what", () => {
  it("stage.bake-asks-the-node — the default takes no configuring at all", () => {
    // The whole shape of the decision: a fact about a card lives ON the card, and a consumer
    // who writes nothing still gets the right answer for both.
    const quads = paint();
    expect(wasBaked(quads, "still")).toBe(true);
    expect(wasBaked(quads, "moving")).toBe(false);
  });

  it("stage.bake-all-or-none — the ends of the range are ordinary predicates", () => {
    // There is no enum here on purpose: "everyone" and "nobody" are two functions among many,
    // and the interesting ones — everything but the card in flight — are not namable in advance.
    const all = paint({ bake: () => true });
    expect(wasBaked(all, "still") && wasBaked(all, "moving")).toBe(true);
    const none = paint({ bake: () => false });
    expect(wasBaked(none, "still") || wasBaked(none, "moving")).toBe(false);
  });

  it("stage.bake-the-predicate-wins — a scene may overrule every node in it", () => {
    // Asked of what a node IS, and stronger than what it says: here the rule is the exact
    // inverse of the tree's own opinion, and the tree does not get a vote. That is what makes
    // "the nodes, except the one in flight" expressible without editing the tree mid-animation.
    const quads = paint({ bake: (n) => !bakeable(n) });
    expect(wasBaked(quads, "still")).toBe(false);
    expect(wasBaked(quads, "moving")).toBe(true);
  });
});
