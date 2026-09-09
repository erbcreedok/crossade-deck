import { chairId, chairLidId, chairSurface, isChair, isHand } from "@game-presets/desks";
import { byId, fieldsOf, type Node, type SurfacedFields } from "game-kit";
import { describe, it, expect } from "vitest";
import { isTableGame, mapFor, syncSeatChairs } from "./mapFor.js";

/** Everybody at the desk, as the roster hands them over — the seat the room named, and their name. */
const AT = (...people: readonly (readonly [string, string])[]): { seat: string; name: string }[] =>
  people.map(([seat, name]) => ({ seat, name }));

function every(n: Node): Node[] {
  return [n, ...n.children.flatMap(every)];
}

describe("mapFor: which board a table game id builds", () => {
  it("builds the chess board for 'chess'", () => {
    expect(mapFor("chess").id).toBe("common zone");
  });

  it("builds the nardy board for 'nardy'", () => {
    expect(mapFor("nardy").id).toBe("nardy desk");
  });

  it("builds the live card table for 'cards'", () => {
    expect(mapFor("cards").id).toBeTruthy();
  });

  it("falls back to the card table for an unknown id", () => {
    expect(mapFor(undefined).id).toBeTruthy();
  });

  it("recognises exactly the three table games", () => {
    expect(isTableGame("cards")).toBe(true);
    expect(isTableGame("chess")).toBe(true);
    expect(isTableGame("nardy")).toBe(true);
    expect(isTableGame("klondike")).toBe(false);
    expect(isTableGame(undefined)).toBe(false);
  });

  it("hub.no-dashed-outline-at-a-held-place — a place somebody holds wears their ink, never an outline", () => {
    // A DASHED OUTLINE IS WHAT AN UNHELD PLACE LOOKS LIKE (`chairSurface()` — grey and dashed,
    // because a place nobody holds is a drawing OF a place). Standing at a place its owner is
    // actually sitting at, it reads as a second ring round the first, and the desk then says both
    // "somebody sits here" and "nobody does" about one seat.
    const desk = mapFor("cards");
    syncSeatChairs(desk, AT(["p1", "Ана"], ["p2", "Бек"]));
    const outlined = every(desk).filter(
      (n) => fieldsOf<SurfacedFields>(n, "Surfaced")?.surface === chairSurface(),
    );
    expect(outlined.map((n) => n.id), "every ring on this desk is somebody's").toEqual([]);
  });

  it("opens the round table with no rings — the roster is not known yet", () => {
    const desk = mapFor("cards");
    expect(byId(desk, chairId("p1"))).toBeUndefined();
    expect(byId(desk, chairId("p2"))).toBeUndefined();
  });
});

describe("syncSeatChairs: the round table's rings, matched to who is actually in the roster", () => {
  it("puts up one ring for a roster of one, and none for the seat nobody sits in", () => {
    const desk = mapFor("cards");
    syncSeatChairs(desk, AT(["p1", "Ana"]));
    expect(byId(desk, chairId("p1"))).toBeTruthy();
    expect(byId(desk, chairId("p2"))).toBeUndefined();
  });

  it("adds the second ring once the roster grows", () => {
    const desk = mapFor("cards");
    syncSeatChairs(desk, AT(["p1", "Ana"]));
    syncSeatChairs(desk, AT(["p1", "Ana"], ["p2", "Bek"]));
    expect(byId(desk, chairId("p1"))).toBeTruthy();
    expect(byId(desk, chairId("p2"))).toBeTruthy();
  });

  it("takes a ring back down once its seat leaves the roster", () => {
    const desk = mapFor("cards");
    syncSeatChairs(desk, AT(["p1", "Ana"], ["p2", "Bek"]));
    syncSeatChairs(desk, AT(["p1", "Ana"]));
    expect(byId(desk, chairId("p1"))).toBeTruthy();
    expect(byId(desk, chairId("p2"))).toBeUndefined();
  });
});

describe("the ring the hub puts up is the shelf's own ring", () => {
  it("hub.the-ring-is-the-hand — a place at the card table is the patch its owner's cards lie in", () => {
    // `handZone` as a separate patch of felt beside the ring is gone from the shelf: the ring IS the
    // hand. A desk that grew a second one would be the fixed box the round table was made to be rid
    // of, so the guard is a SCAN — every hand on this desk is a chair, and there is no other kind.
    const desk = mapFor("cards");
    syncSeatChairs(desk, AT(["p1", "Ana"], ["p2", "Bek"]));
    const hands = every(desk).filter(isHand);
    expect(hands.length).toBe(2);
    expect(hands.every(isChair)).toBe(true);
  });

  it("hub.a-board-has-no-hands — a man is on a square and nowhere else", () => {
    expect(every(mapFor("chess")).filter(isHand)).toEqual([]);
    expect(every(mapFor("nardy")).filter(isHand)).toEqual([]);
  });

  it("hub.the-face-leaves-with-the-chair — an arch left behind is a chair drawn for somebody who got up", () => {
    const desk = mapFor("cards");
    syncSeatChairs(desk, AT(["p1", "Ana"], ["p2", "Bek"]));
    expect(byId(desk, chairLidId("p2"))).toBeDefined();
    syncSeatChairs(desk, AT(["p1", "Ana"]));
    expect(byId(desk, chairId("p2"))).toBeUndefined();
    expect(byId(desk, chairLidId("p2"))).toBeUndefined();
    expect(byId(desk, chairLidId("p1")), "the one still sitting keeps theirs").toBeDefined();
  });
});
