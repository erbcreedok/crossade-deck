// @vitest-environment jsdom

// The motion runtime, on a fake clock. jsdom has no `requestAnimationFrame` worth trusting, so the
// clock is injected: `tick(t)` sets the time and runs the one scheduled frame. That is also what
// lets a plain test assert a card is HALFWAY — the thing a screenshot can only catch by luck.

import { describe, expect, it } from "vitest";
import { Bounded } from "../core/atoms/bounded.js";
import { Container, registerLayout, resetLayouts } from "../core/atoms/container.js";
import { freeLayout } from "../core/atoms/layouts.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { Transformable } from "../core/atoms/transformable.js";
import { add, compose, node } from "../core/node.js";
import { installStockEasings, resetEasings } from "../core/motion.js";
import { rect } from "../presets/shapes.js";
import { mount } from "./host.js";
import { resetSurfaces } from "./surfaces.js";
import { installStockSurfaces } from "../presets/surfaces.js";
import { attachMotion, type Clock } from "./animator.js";
import { type Painter } from "./painter.js";
import { type Quad } from "./scenePlan.js";

/** A fake clock whose single pending frame the test runs by hand. */
function fakeClock() {
  let now = 0;
  let pending: (() => void) | null = null;
  const clock: Clock = {
    now: () => now,
    frame: (cb) => {
      pending = cb;
      return () => {
        pending = null;
      };
    },
  };
  return {
    clock,
    idle: () => pending === null,
    tick(at: number) {
      now = at;
      const cb = pending;
      pending = null;
      cb?.();
    },
  };
}

/** A desk with one card at the origin, and a painter that keeps the last plan for inspection. */
function bench() {
  resetLayouts();
  registerLayout("free", freeLayout);
  resetSurfaces();
  installStockSurfaces();
  resetEasings();
  installStockEasings();

  const desk = node("desk", Container({ layout: "free" }));
  const card = node("c", Bounded({ bounds: rect(1, 1) }), Surfaced(), Transformable({ at: { x: 0, y: 0 } }));
  add(desk, card);

  let last: readonly Quad[] = [];
  const painter: Painter = {
    ready: Promise.resolve(),
    draw: (plan) => {
      last = plan;
    },
    resize: () => {},
    destroy: () => {},
  };
  const host = mount(document.createElement("div"), desk);
  const xOf = (id: string): number => last.find((q) => q.id === id)!.x;
  return { desk, card, host, painter, xOf };
}

describe("the motion runtime", () => {
  it("motion.settles-to-the-new-pose — a moved node eases across and the loop stops when it lands", () => {
    const b = bench();
    const c = fakeClock();
    attachMotion(b.host, b.painter, { durationMs: 100, ease: "linear", clock: c.clock });

    const restX = b.xOf("c");
    // Move the card and publish the new tree: the settle begins, still drawn at the start.
    compose(b.card, Transformable({ at: { x: 4, y: 0 } }));
    b.host.setRoot(b.desk);
    expect(b.xOf("c")).toBeCloseTo(restX); // frame zero: at `from`, not teleported to `to`

    c.tick(50); // halfway
    const midX = b.xOf("c");
    expect(midX).toBeGreaterThan(restX);

    c.tick(100); // arrived
    const endX = b.xOf("c");
    expect(endX).toBeGreaterThan(midX);
    expect(c.idle()).toBe(true); // idle-gate: no frame is scheduled once nothing is in flight
  });

  it("motion.a-held-node-tracks-its-gesture — a finger-owned node jumps, it does not ease", () => {
    const b = bench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { durationMs: 100, ease: "linear", clock: c.clock });

    m.hold("c");
    compose(b.card, Transformable({ at: { x: 5, y: 0 } }));
    b.host.setRoot(b.desk);
    const heldX = b.xOf("c");
    // A gesture is 1:1: the node is already at its new tree pose, and no loop was started for it.
    compose(b.card, Transformable({ at: { x: 0, y: 0 } }));
    b.host.setRoot(b.desk);
    expect(b.xOf("c")).not.toBeCloseTo(heldX); // tracked the second move too, still no easing
    expect(c.idle()).toBe(true);

    // Released, the next move eases again — a frame is scheduled.
    m.release("c");
    compose(b.card, Transformable({ at: { x: 6, y: 0 } }));
    b.host.setRoot(b.desk);
    expect(c.idle()).toBe(false);
  });

  it("motion.a-new-node-appears-without-flying — a fresh node rests where it is put", () => {
    const b = bench();
    const c = fakeClock();
    attachMotion(b.host, b.painter, { durationMs: 100, ease: "linear", clock: c.clock });

    add(b.desk, node("d", Bounded({ bounds: rect(1, 1) }), Surfaced(), Transformable({ at: { x: 3, y: 0 } })));
    b.host.setRoot(b.desk);
    // It did not fly in from nowhere: no frame scheduled, and it is already at its own rest pose.
    expect(c.idle()).toBe(true);
    const restX = b.xOf("c");
    expect(b.xOf("d")).toBeGreaterThan(restX);
  });
});
