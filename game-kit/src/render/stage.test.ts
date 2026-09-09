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
import { ShadowCaster } from "../core/atoms/shadow.js";
import { Transformable } from "../core/atoms/transformable.js";
import { node, add } from "../core/node.js";
import { IDENTITY } from "../core/transform.js";
import { mount } from "./host.js";
import { attachPainter, type PaintOptions } from "./stage.js";
import { resetSurfaces } from "./surfaces.js";
import { installStockSurfaces } from "../presets/surfaces.js";
import { type Painter } from "./painter.js";
import { type Quad } from "./scenePlan/index.js";

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

describe("what a frame costs", () => {
  it("stage.a-frame-walks-the-tree-once — sixteen times the nodes is about sixteen times the frame, never a hundred", () => {
    // The bake predicate is asked per quad, and it needs the quad's OWNER. Looked up by id, each
    // answer was a walk of the whole tree — two hundred walks of two hundred nodes on every frame,
    // which under a carried piece was the single largest thing the page did. One walk builds the
    // map, and the frame grows with the tree, not with its square.
    resetLayouts();
    registerLayout("free", freeLayout);
    resetSurfaces();
    installStockSurfaces();
    const painter: Painter = { ready: Promise.resolve(), draw: () => {}, resize: () => {}, destroy: () => {} };
    const frameOf = (count: number): number => {
      const root = node("desk", Container({ layout: "free" }));
      for (let i = 0; i < count; i += 1) add(root, node(`n${i}`, Bounded(), Surfaced(), Bakeable(), Transformable({ at: { x: i % 20, y: Math.floor(i / 20) } })));
      const host = mount(document.createElement("div"), root);
      const stop = attachPainter(host, painter);
      // The least of several, so a stray pause of the machine does not decide the law.
      let best = Number.POSITIVE_INFINITY;
      for (let k = 0; k < 5; k += 1) {
        const t0 = performance.now();
        host.setRoot(root);
        best = Math.min(best, performance.now() - t0);
      }
      stop();
      host.unmount();
      return best;
    };
    frameOf(100); // warm the code paths once
    const small = frameOf(100);
    const large = frameOf(1600);
    // Sixteen times the nodes. A linear frame is about sixteen times the small one; a frame with a
    // square law in it is a hundred times and more, and the window between them is wide enough
    // that no stray pause of the machine can carry a square law across it.
    expect(large / small, "sixteen times the nodes: about sixteen times the frame, never a hundred").toBeLessThan(40);
  });
});

describe("who bakes what", () => {
  it("stage.what-the-finger-holds-paints-over-the-screen — a carried piece and its shadow come after the glass's furniture", () => {
    // THE SCREEN COMES SECOND AND THEREFORE ON TOP, always — except for what a finger is holding: a
    // card carried down over the hand on the glass must be above the pictures of the cards already
    // there, or it reads as slipped in behind them. What rides the piece (its shadow) comes with it;
    // what is merely in flight (a settle, a throw) does not — it is not in the hand.
    resetLayouts();
    registerLayout("free", freeLayout);
    resetSurfaces();
    installStockSurfaces();
    const root = node("desk", Container({ layout: "free" }));
    add(root, node("card", Bounded(), Surfaced(), ShadowCaster(), Transformable({ at: { x: 0, y: 0 } })));
    add(root, node("other", Bounded(), Surfaced(), Transformable({ at: { x: 2, y: 0 } })));
    const screen = node("screen", Container({ layout: "free" }));
    add(screen, node("picture", Bounded(), Surfaced(), Transformable({ at: { x: 0, y: 1 } })));
    let last: readonly Quad[] = [];
    const painter: Painter = { ready: Promise.resolve(), draw: (plan) => void (last = plan), resize: () => {}, destroy: () => {} };
    const host = mount(document.createElement("div"), root);
    host.setHudRoot(screen);
    const order = (options: PaintOptions): string[] => {
      const stop = attachPainter(host, painter, options);
      stop();
      return last.map((q) => q.id);
    };
    const resting = order({});
    expect(resting.indexOf("picture"), "at rest: the screen over the desk").toBeGreaterThan(resting.indexOf("card"));
    const raised = order({ raised: new Set(["card"]) });
    expect(raised.indexOf("picture"), "in flight but not in hand: still under the screen").toBeGreaterThan(raised.indexOf("card"));
    const held = order({ raised: new Set(["card"]), carried: new Set(["card"]) });
    expect(held.indexOf("card"), "in the hand: over the screen").toBeGreaterThan(held.indexOf("picture"));
    expect(held.indexOf("card::shadow"), "…and its shadow with it").toBeGreaterThan(held.indexOf("picture"));
    expect(held.indexOf("other"), "…the rest of the desk where it was").toBeLessThan(held.indexOf("picture"));
    host.unmount();
  });

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
