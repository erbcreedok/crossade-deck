import { chairId, chairLidId, chairLidSurface, chairSurface, isChair, isHand, roundMap, roundPlaces } from "@game-presets/desks";
import { byId, fieldsOf, fromSpec, resetSurfaces, surfaceRecord, toSpec, type Node, type SurfacedFields } from "game-kit";
import { describe, it, expect } from "vitest";
import { syncSeatChairs } from "./seatChairs.js";

/** Everybody at the desk, as the roster hands them over — the seat the room named, and their name. */
const AT = (...people: readonly (readonly [string, string])[]): { seat: string; name: string }[] =>
  people.map(([seat, name]) => ({ seat, name }));

/** The two slots a card table's rings stand in. */
const PLACES = roundPlaces(2);

/** A round table as a game hands it in — no rings, because the roster is not known yet. */
const table = (): Node => roundMap([]);

function every(n: Node): Node[] {
  return [n, ...n.children.flatMap(every)];
}

describe("syncSeatChairs: the rings, matched to who is actually in the roster", () => {
  it("opens with no rings at all — nobody has been announced yet", () => {
    const desk = table();
    expect(byId(desk, chairId("p1"))).toBeUndefined();
    expect(byId(desk, chairId("p2"))).toBeUndefined();
  });

  it("puts up one ring for a roster of one, and none for the seat nobody sits in", () => {
    const desk = table();
    syncSeatChairs(desk, AT(["p1", "Ana"]), PLACES);
    expect(byId(desk, chairId("p1"))).toBeTruthy();
    expect(byId(desk, chairId("p2"))).toBeUndefined();
  });

  it("adds the second ring once the roster grows", () => {
    const desk = table();
    syncSeatChairs(desk, AT(["p1", "Ana"]), PLACES);
    syncSeatChairs(desk, AT(["p1", "Ana"], ["p2", "Bek"]), PLACES);
    expect(byId(desk, chairId("p1"))).toBeTruthy();
    expect(byId(desk, chairId("p2"))).toBeTruthy();
  });

  it("takes a ring back down once its seat leaves the roster", () => {
    const desk = table();
    syncSeatChairs(desk, AT(["p1", "Ana"], ["p2", "Bek"]), PLACES);
    syncSeatChairs(desk, AT(["p1", "Ana"]), PLACES);
    expect(byId(desk, chairId("p1"))).toBeTruthy();
    expect(byId(desk, chairId("p2"))).toBeUndefined();
  });

  it("hand.a-chair-from-the-wire-wears-its-look — a reload sees a chair already standing, not one it just built", () => {
    // A RELOAD DOES NOT BUILD THE CHAIR — the tree off the wire already has it (rev >= 2, the first
    // move sent it) — so the branch that registers a chair's own paints (`installSeatArt`, inside
    // `seatChairs`) never ran on THIS screen. `syncSeatChairs` must register the look for every seat
    // in the roster on its own, not only for the ones it builds.
    resetSurfaces();
    const built = table();
    syncSeatChairs(built, AT(["p1", "Ana"]), PLACES);
    const wired = fromSpec(toSpec(built));
    resetSurfaces();
    expect(byId(wired, chairId("p1")), "the chair rode over on the wire").toBeTruthy();
    syncSeatChairs(wired, AT(["p1", "Ana"]), PLACES);
    expect(byId(wired, chairId("p1")), "still the one chair — not rebuilt").toBeTruthy();
    expect(surfaceRecord(chairSurface("p1"))).toBeDefined();
    expect(surfaceRecord(chairLidSurface("p1"))).toBeDefined();
  });

  it("hand.no-dashed-outline-at-a-held-place — a place somebody holds wears their ink, never an outline", () => {
    // A DASHED OUTLINE IS WHAT AN UNHELD PLACE LOOKS LIKE (`chairSurface()` — grey and dashed,
    // because a place nobody holds is a drawing OF a place). Standing at a place its owner is
    // actually sitting at, it reads as a second ring round the first, and the desk then says both
    // "somebody sits here" and "nobody does" about one seat.
    const desk = table();
    syncSeatChairs(desk, AT(["p1", "Ана"], ["p2", "Бек"]), PLACES);
    const outlined = every(desk).filter((n) => fieldsOf<SurfacedFields>(n, "Surfaced")?.surface === chairSurface());
    expect(
      outlined.map((n) => n.id),
      "every ring on this desk is somebody's",
    ).toEqual([]);
  });

  it("hand.the-ring-is-the-hand — a place at a card table is the patch its owner's cards lie in", () => {
    // A separate patch of felt beside the ring is gone from the shelf: the ring IS the hand. A desk
    // that grew a second one would be the fixed box the round table was made to be rid of, so the
    // guard is a SCAN — every hand on this desk is a chair, and there is no other kind.
    const desk = table();
    syncSeatChairs(desk, AT(["p1", "Ana"], ["p2", "Bek"]), PLACES);
    const hands = every(desk).filter(isHand);
    expect(hands.length).toBe(2);
    expect(hands.every(isChair)).toBe(true);
  });

  it("hand.the-face-leaves-with-the-chair — an arch left behind is a chair drawn for somebody who got up", () => {
    const desk = table();
    syncSeatChairs(desk, AT(["p1", "Ana"], ["p2", "Bek"]), PLACES);
    expect(byId(desk, chairLidId("p2"))).toBeDefined();
    syncSeatChairs(desk, AT(["p1", "Ana"]), PLACES);
    expect(byId(desk, chairId("p2"))).toBeUndefined();
    expect(byId(desk, chairLidId("p2"))).toBeUndefined();
    expect(byId(desk, chairLidId("p1")), "the one still sitting keeps theirs").toBeDefined();
  });
});
