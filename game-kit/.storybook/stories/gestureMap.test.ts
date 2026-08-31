// The gesture map's own arithmetic: the border a carried piece is kept inside.
//
// Pure and headless — the walls are the map's rect inset by the piece's own half, and that is a
// sum, not a picture. It is worth its own guard because the inset is the whole of the rule: clamp
// the wrong thing and the border still LOOKS enforced, with half a card hanging over the side.

import { describe, expect, it } from "vitest";
import { add, Bounded, Container, freeLayout, node, rect, registerLayout, type Node } from "../../src/index.js";
import { dropOf, gestureMap, MAP, mapWalls, toFront } from "./gestureMap.js";

const piece = (w: number, h: number): Node => node("p", Bounded({ bounds: rect(w, h) }));

describe("the gesture map", () => {
  it("map.walls-inset-by-the-piece — the anchor is clamped, so the BODY is what must stay in", () => {
    // A card 1×1.4 on an 8×8 map: its origin may reach 3.5 across and 3.3 down, and not a unit
    // further. Clamping the origin to the map's own edge instead would leave half a card outside,
    // which is the version that looks right until somebody drags to the corner.
    const w = mapWalls(piece(1, 1.4));
    expect(w).toEqual({ x0: -3.5, y0: -3.3, x1: 3.5, y1: 3.3 });
    // A square piece answers the same on both axes — the inset is the piece's own extent and not
    // one number standing in for four.
    expect(mapWalls(piece(0.9, 0.9))).toEqual({ x0: -3.55, y0: -3.55, x1: 3.55, y1: 3.55 });
  });

  it("map.walls-count-the-pop — a piece drawn bigger is bigger at the border too", () => {
    // The carry holds a piece at `lift`, so what the eye sees cross the line is the LIFTED body.
    // Ignore it and exactly that sliver — six percent of the card — goes over the edge.
    const lifted = mapWalls(piece(1, 1.4), 1.06);
    expect(lifted.x1).toBeCloseTo(3.47, 6);
    expect(lifted.y1).toBeCloseTo(3.258, 6);
    expect(lifted.x1).toBeLessThan(mapWalls(piece(1, 1.4)).x1);
  });

  it("map.walls-never-turn-inside-out — a piece bigger than the map stands in the middle", () => {
    // A negative half would make `x0 > x1`, and a clamp between crossed bounds is whichever of them
    // the arithmetic reaches last: the piece would be flung to one edge rather than held.
    const huge = mapWalls(piece(MAP.w * 2, MAP.h * 2));
    expect(huge).toEqual({ x0: 0, y0: 0, x1: 0, y1: 0 });
  });

  it("map.a-piece-with-no-box-is-a-point — the border is still the map's own", () => {
    // Nothing on this desk is boxless, but `Bounded` is optional in the model and a missing box
    // must read as "no size", never as a crash inside a debug scene.
    expect(mapWalls(node("bare"))).toEqual({ x0: -4, y0: -4, x1: 4, y1: 4 });
  });

  it("map.drop-feel-is-read-off-what-the-piece-is — never off its name", () => {
    // A die is the thing whose faces go over, a card is the thing with a back to turn to, and a
    // carved piece is neither — so the answer comes from the model. Off the id it would be a list
    // somebody has to remember to add the fifth piece to, and `guard.id-is-opaque` forbids reading
    // one anyway: an id says WHICH, never WHAT.
    const by = Object.fromEntries(gestureMap().children.map((n) => [n.id, dropOf(n)]));
    const die = by["die"]!;
    const knight = by["knight"]!;
    const card = Object.entries(by).find(([id]) => id !== "die" && id !== "knight")![1];
    // The card is the slow one, and the only one that does not come back up.
    expect(card.gravity).toBeLessThan(die.gravity);
    expect(card.gravity).toBeLessThan(knight.gravity);
    expect(card.bounce).toBe(0);
    // The die is the one the desk throws back; the carved piece does not bounce at all — a tenth of
    // a percent, which is "not at all" written down. Written down rather than left at zero so the
    // ORDER of the three still says something: it is the end of the scale, not a piece the scale
    // forgot about.
    expect(die.bounce).toBeGreaterThan(knight.bounce);
    expect(knight.bounce).toBeGreaterThan(0);
    expect(knight.bounce, "a carved piece does not bounce").toBeLessThan(0.01);
    expect(knight.wallBounce, "and not off a rail either").toBeLessThan(0.01);
    // And the two heavy ones fall at about the same rate — what tells them apart is the landing.
    expect(Math.abs(die.gravity - knight.gravity) / die.gravity).toBeLessThan(0.3);
    // A WALL IS ITS OWN MATERIAL. The die is the liveliest off a rail and the carved piece the
    // deadest, which is the opposite order to nothing else here — and the card, dead on the cloth,
    // still comes back off a border. On one number that last pair could not be said at all.
    expect(die.wallBounce).toBeGreaterThan(card.wallBounce);
    expect(card.wallBounce).toBeGreaterThan(knight.wallBounce);
    expect(card.wallBounce).toBeGreaterThan(card.bounce);
  });

  it("map.the-last-dropped-is-on-top — and it is a place in the list, not a height", () => {
    // Equal `z` keeps tree order (the plan sorts stably), so "in front" is the end of the children.
    // As a height it would be a lie about the third dimension: the piece is ON the desk, and every
    // drop would raise the pile a little further off the felt forever.
    registerLayout("gesture.map.free", freeLayout);
    const desk = node("desk", Container({ layout: "gesture.map.free" }));
    for (const id of ["a", "b", "c"]) add(desk, node(id, Bounded({ bounds: rect(1, 1) })));
    const at = (): string[] => desk.children.map((n) => n.id);
    toFront(desk.children[0]!);
    expect(at()).toEqual(["b", "c", "a"]);
    // The one already on top is left exactly where it is — no shuffling for a no-op.
    toFront(desk.children[2]!);
    expect(at()).toEqual(["b", "c", "a"]);
    // And nothing is lost or duplicated on the way, whichever one is raised.
    toFront(desk.children[1]!);
    expect(at()).toEqual(["b", "a", "c"]);
    // A piece with no owner is not an error — it is simply already the only thing there is.
    expect(() => toFront(node("loose"))).not.toThrow();
  });

  it("map.carries-four-pieces-of-three-kinds — a carry that only ever holds a card teaches the card", () => {
    const desk = gestureMap();
    expect(desk.children).toHaveLength(4);
    expect(desk.children.map((n) => n.id)).toContain("knight");
    expect(desk.children.map((n) => n.id)).toContain("die");
  });
});
