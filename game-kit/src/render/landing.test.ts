import { describe, expect, it } from "vitest";
import { add, byId, circle, node, outlineOf, Bounded, Container, pileLayout, rect, registerLayout, Transformable, fieldsOf, extentOf, type Node, type BoundedFields, type TransformableFields } from "../../src/index.js";
import { landingBox, landingAt, landingMark, landingPicture, throwGate } from "./landing.js";
import { type Host } from "./host.js";

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

describe("landing picture across a networked tree", () => {
  it("landing.a-net-tree-carries-the-picture-with-it — hide reaches the node that just arrived, not the one that lifted", () => {
    const piece = node("card", Bounded({ bounds: rect(1, 1.4) }));
    let root = node("root");
    const host = {
      get root() {
        return root;
      },
      setRoot: (n: Node) => {
        root = n;
      },
      viewer: () => ({}) as ReturnType<Host["viewer"]>,
    } as unknown as Host;
    const pic = landingPicture({ host }, { shown: true });

    pic.mark([piece], [{ x: 0, y: 0 }], { x: 0, y: 0 });
    const markId = pic.current!.node.id;
    expect(byId(host.root, markId), "the mark stands on the tree it was drawn into").toBeDefined();

    // A NETWORKED TREE ARRIVES MID-GESTURE — same id, a node this screen never built (a parse off
    // the wire, standing for what `liveTable.setRoot(next, "net")` hands `retree`).
    const arrived = node("root");
    add(arrived, node(markId));
    pic.retree(arrived);
    host.setRoot(arrived);

    pic.hide();
    expect(byId(host.root, markId), "hide took out the node actually on the glass, not a stale one").toBeUndefined();
  });

  it("landing.a-net-tree-without-the-mark-forgets-it — not the picture that was", () => {
    const piece = node("card", Bounded({ bounds: rect(1, 1.4) }));
    let root = node("root");
    const host = {
      get root() {
        return root;
      },
      setRoot: (n: Node) => {
        root = n;
      },
      viewer: () => ({}) as ReturnType<Host["viewer"]>,
    } as unknown as Host;
    const pic = landingPicture({ host }, { shown: true });

    pic.mark([piece], [{ x: 0, y: 0 }], { x: 0, y: 0 });
    expect(pic.current).toBeDefined();

    pic.retree(node("root"));
    expect(pic.current, "gone from the tree that arrived, gone from this screen too").toBeUndefined();
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

  it("landing.the-mark-takes-the-shape-of-what-lands — a round man leaves a round outline, a pile a box", () => {
    // A CHECKER IS NOT A CARD. The picture is of what will BE lying there, and a rectangle drawn
    // under a disc is a picture of some other game's piece: the one job an outline has is being
    // recognised as the thing it stands for.
    const man = node("m", Bounded({ bounds: circle(0.5) }));
    const round = landingBox([man], [{ x: 0, y: 0 }]);
    const drawn = fieldsOf<BoundedFields>(landingMark(round.at, round, 0), "Bounded")?.bounds;
    // A CIRCLE HAS NO CORNERS, and that is what tells the two paths apart without reading a tag off
    // either: the farthest point of a circle is its own radius, while a box reaches past that into
    // its diagonal. Measured against the outline's own extent, so the size of the piece is not in it.
    const corners = (shape: typeof drawn): number => {
      const points = outlineOf(shape!);
      const ext = extentOf(shape!);
      return Math.max(...points.map((p) => Math.hypot(p.x, p.y))) / (Math.max(ext.w, ext.h) / 2);
    };
    expect(corners(drawn), "the outline of a round man is round").toBeLessThan(1.02);

    // ...AND A RUN THAT SWEEPS IS A PILE. There is no one piece left to take the shape from, so the
    // silhouette is the box the sweep takes — the answer this always gave.
    const pile = landingBox([man, man, man], [{ x: 0, y: 0 }, { x: 0, y: 0.2 }, { x: 0, y: 0.4 }]);
    expect(corners(fieldsOf<BoundedFields>(landingMark(pile.at, pile, 1), "Bounded")?.bounds), "a pile is a box, not a circle").toBeGreaterThan(1.1);
  });

  it("landing.the-mark-wears-the-turn-the-drop-will-write — the picture is of the landing, not of north", () => {
    // A card let go of under a turned camera lands at the holder's own turn (`holderTurn`), and the
    // picture of that landing has to be drawn at the same angle or it is a picture of a drop that is
    // not about to happen.
    const mark = landingMark({ x: 0, y: 0 }, { w: 1, h: 1.4 }, 0, undefined, 270);
    expect(fieldsOf<TransformableFields>(mark, "Transformable")?.angle).toBe(270);
    expect(fieldsOf<TransformableFields>(landingMark({ x: 0, y: 0 }, { w: 1, h: 1.4 }, 1), "Transformable")?.angle ?? 0).toBe(0);
  });
});
