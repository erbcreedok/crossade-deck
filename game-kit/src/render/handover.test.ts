// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  add,
  attachMotion,
  Bounded,
  Container,
  freeLayout,
  mount,
  node,
  rect,
  registerLayout,
  Transformable,
  Valued,
  type Painter,
} from "../index.js";
import { handOver } from "./handover.js";

function stubPainter(): Painter {
  return { ready: Promise.resolve(), draw: () => {}, resize: () => {}, destroy: () => {} };
}

describe("handOver", () => {
  it("handover.a-run-moves-into-the-zone-but-the-landing-picture-stays", () => {
    registerLayout("handover.free", freeLayout);

    const root = node("desk", Container({ layout: "handover.free" }));
    const zone = node("zone", Bounded({ bounds: rect(2, 2) }), Container({ layout: "handover.free" }), Transformable({ at: { x: 5, y: 0 } }));
    const cardA = node("cardA", Bounded({ bounds: rect(1, 1.4) }), Transformable({ at: { x: 0, y: 0 } }));
    const cardB = node("cardB", Bounded({ bounds: rect(1, 1.4) }), Transformable({ at: { x: 1, y: 0 } }));
    // The landing picture — a grip's tab — never belongs to the run itself; `handOver` skips it.
    const mark = node("mark", Bounded({ bounds: rect(1, 1.4) }), Valued({ values: { grip: "cardA" } }));
    add(root, zone);
    add(root, cardA);
    add(root, cardB);
    add(root, mark);

    const div = document.createElement("div");
    const host = mount(div, root, { hudUnit: 64, theme: "dark" });
    const motions = attachMotion(host, stubPainter());
    const scene = { host, motions };

    handOver(scene, zone, [
      { id: "cardA", offset: { x: 0, y: 0 } },
      { id: "cardB", offset: { x: 0, y: 0 } },
      { id: "mark", offset: { x: 0, y: 0 } },
    ]);

    const newRoot = host.root;
    const newZone = newRoot.children.find((n) => n.id === "zone")!;
    expect(newZone.children.map((n) => n.id).sort()).toEqual(["cardA", "cardB"]);
    expect(newRoot.children.some((n) => n.id === "mark"), "the landing picture stays where it was").toBe(true);
  });
});
