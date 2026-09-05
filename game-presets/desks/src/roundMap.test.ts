// THE ROUND DESK — what a table with no corners and no hand areas has to be before anybody sits at
// it. The physics of the border is the kit's (`ballistic.a-round-wall-reflects`); what is only ever
// true HERE is the desk: one felt, one deck, no zones, and an edge nothing can be taken past.

import { describe, expect, it } from "vitest";
import { caps, extentOf, fieldsOf, footprint, heapOf, insideWalls, surfaceRecord, type Node, type SurfacedFields, type TransformableFields } from "game-kit";
import { LIVE } from "./liveMap.js";
import { ROUND_R, roundMap, roundRoom, roundWalls } from "./roundMap.js";

const cards = (desk: Node): Node[] => desk.children.filter((n) => heapOf(n) === "card");
const seatOf = (n: Node) => fieldsOf<TransformableFields>(n, "Transformable")!.at!;

describe("the round desk", () => {
  it("round.one-felt-and-no-hand-areas — a shared table has nowhere that is somebody's", () => {
    const desk = roundMap();
    // Not one zone: an area on this desk would be an owner, and this desk has no owners.
    expect(desk.children.filter((n) => caps(n).has("Acceptor"))).toEqual([]);
    // ...and the felt is ROUND. Measured off the drawn shape rather than the number, because the
    // number is what the wall is built from and a felt drawn to a different one is the bug.
    const box = footprint(desk)!;
    const { w, h } = extentOf(box);
    expect(w).toBeCloseTo(ROUND_R * 2);
    expect(h).toBeCloseTo(ROUND_R * 2);
    // A felt with no edge drawn is a wall the eye cannot see it reach.
    const named = fieldsOf<SurfacedFields>(desk, "Surfaced")?.surface;
    expect(surfaceRecord(named!)?.stroke?.color).toBeTruthy();
  });

  it("round.the-deck-stands-in-the-middle — the one place on a round table equally far from everybody", () => {
    const desk = roundMap();
    expect(cards(desk).length).toBe(LIVE.cards);
    for (const card of cards(desk)) {
      const at = seatOf(card);
      expect(Math.hypot(at.x, at.y), "a card of the deck is at the middle, not off toward a seat").toBeLessThan(0.6);
      expect(caps(card).has("ShadowCaster"), "height is invisible from above without a shadow").toBe(true);
    }
    // The felt itself says what a touch takes off it, or no drag on this desk is possible at all.
    expect(caps(desk).has("Grabber")).toBe(true);
  });

  it("round.the-border-holds-a-card-in — a point outside comes back onto the circle", () => {
    const desk = roundMap();
    const card = cards(desk)[0]!;
    const tray = roundWalls(card);
    // INSET BY THE CARD'S OWN REACH: the wall holds the card, not the point it is drawn from.
    const { w, h } = extentOf(footprint(card)!);
    expect(tray.r).toBeCloseTo(ROUND_R - Math.hypot(w, h) / 2);
    const held = insideWalls(tray, { x: 20, y: -5 });
    expect(Math.hypot(held.x, held.y)).toBeCloseTo(tray.r);
    // ...and the whole card is inside the felt where the wall stopped it.
    expect(tray.r + Math.hypot(w, h) / 2).toBeLessThanOrEqual(ROUND_R + 1e-9);
    // A point already on the felt is not moved: the border is a wall, not a magnet.
    expect(insideWalls(tray, { x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
  });

  it("round.the-room-is-the-felt-and-a-rim — the camera has somewhere to stand off the table", () => {
    const room = roundRoom();
    expect(room.w).toBe(room.h);
    expect(room.w / 2).toBeGreaterThan(ROUND_R);
    // Centred on the felt: a room laid out from a corner would hold the view in one quarter of it.
    expect(room.x).toBeCloseTo(-room.w / 2);
    expect(room.y).toBeCloseTo(-room.h / 2);
  });
});
