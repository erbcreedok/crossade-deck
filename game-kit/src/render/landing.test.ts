import { describe, expect, it } from "vitest";
import { add, node, Bounded, Container, pileLayout, rect, registerLayout, Transformable, fieldsOf, extentOf, type Node, type BoundedFields } from "../../src/index.js";
import { landingBox, landingAt, landingMark, throwGate } from "./landing.js";

const piece = (w: number, h: number): Node => node("p", Bounded({ bounds: rect(w, h) }));

describe("landing", () => {
  it("landing.the-shape-of-the-silhoutte-is-the-run-swept-by-the-box", () => {
    // landingBox for 1 seat
    const run1 = [piece(1, 1.4)];
    const seats1 = [{ x: 1, y: 2 }];
    const box1 = landingBox(run1, seats1);
    expect(box1.at).toEqual({ x: 1, y: 2 });
    expect(box1.w).toBeCloseTo(1);
    expect(box1.h).toBeCloseTo(1.4);

    // landingBox for 3 seats
    const run3 = [piece(1, 1.4), piece(1, 1.4), piece(1, 1.4)];
    const seats3 = [{ x: 0, y: 0 }, { x: 0.2, y: 0.1 }, { x: 0.4, y: 0.2 }];
    const box3 = landingBox(run3, seats3);
    expect(box3.at.x).toBeCloseTo(0.2);
    expect(box3.at.y).toBeCloseTo(0.1);
    expect(box3.w).toBeCloseTo(1.4);
    expect(box3.h).toBeCloseTo(1.6);
  });

  it("landing.the-picture-aimed-at-a-zone-moves-into-it", () => {
    // landingAt without zone
    expect(landingAt({ x: 10, y: 10 }, { x: 1, y: 2 }, undefined)).toEqual({ x: 11, y: 12 });

    // landingAt with zone
    const zone = node("z", Transformable({ at: { x: 50, y: 50 } }));
    expect(landingAt({ x: 10, y: 10 }, { x: 1, y: 2 }, zone)).toEqual({ x: 50, y: 50 });
  });

  it("landing.in-a-zone-that-lays-out-the-picture-takes-the-next-seat — on top of the pile, not in the middle", () => {
    // A nardy point two checkers deep: the third lands on top of the second, and that is where the
    // picture stands. A zone with a layout but no box for the picture, or with no layout, keeps
    // its middle — the answer every zone gave before piles could be aimed at.
    registerLayout("landing.point", pileLayout({ direction: "up" }));
    const zone = node("zp", Container({ layout: "landing.point" }), Bounded({ bounds: rect(1, 5) }), Transformable({ at: { x: 50, y: 50 } }));
    add(zone, node("zp-a", Bounded({ bounds: rect(1, 1) }), Transformable({ at: { x: 0, y: 0 } })));
    add(zone, node("zp-b", Bounded({ bounds: rect(1, 1) }), Transformable({ at: { x: 0, y: 0 } })));
    expect(landingAt({ x: 10, y: 10 }, { x: 0, y: 0 }, zone, { w: 1, h: 1 })).toEqual({ x: 50, y: 50 });
    expect(landingAt({ x: 10, y: 10 }, { x: 0, y: 0 }, zone)).toEqual({ x: 50, y: 50 });
    const empty = node("zq", Container({ layout: "landing.point" }), Bounded({ bounds: rect(1, 5) }), Transformable({ at: { x: 0, y: 0 } }));
    expect(landingAt({ x: 10, y: 10 }, { x: 0, y: 0 }, empty, { w: 1, h: 1 })).toEqual({ x: 0, y: 2 });
  });

  it("landing.hysteresis-stops-the-picture-from-flickering", () => {
    let speed = 0;
    const gate = throwGate((v) => speed >= 10, 5); // threshold 10, restBelow 5

    // above threshold -> true
    speed = 10;
    expect(gate({ x: 10, y: 0 })).toBe(true);

    // between threshold and half -> still true
    speed = 7;
    expect(gate({ x: 7, y: 0 })).toBe(true);

    // below half -> false
    speed = 4;
    expect(gate({ x: 4, y: 0 })).toBe(false);
  });
});

describe("landing mark shape", () => {
  it("landing.the-mark-has-a-shape-to-draw — its outline starts somewhere, and its extent is the box it was asked for", () => {
    // The mark's outline was copied here without its `start`, and the first frame that drew a
    // mark died reading the first point of nothing. The outline is asked for the same way the
    // painter asks for it, so a shape that cannot be walked fails here and not on the desk.
    const mark = landingMark({ x: 0, y: 0 }, { w: 1, h: 1.4 }, 0);
    const shape = fieldsOf<BoundedFields>(mark, "Bounded")?.bounds;
    expect(shape?.start).toBeDefined();
    const ext = extentOf(shape!);
    expect(ext.w).toBeCloseTo(1, 6);
    expect(ext.h).toBeCloseTo(1.4, 6);
  });
});
