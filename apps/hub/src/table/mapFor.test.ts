import { chairId } from "@game-presets/desks";
import { byId } from "game-kit";
import { describe, it, expect } from "vitest";
import { isTableGame, mapFor, syncSeatChairs } from "./mapFor.js";

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

  it("opens the round table with no rings — the roster is not known yet", () => {
    const desk = mapFor("cards");
    expect(byId(desk, chairId("p1"))).toBeUndefined();
    expect(byId(desk, chairId("p2"))).toBeUndefined();
  });
});

describe("syncSeatChairs: the round table's rings, matched to who is actually in the roster", () => {
  it("puts up one ring for a roster of one, and none for the seat nobody sits in", () => {
    const desk = mapFor("cards");
    syncSeatChairs(desk, ["p1"]);
    expect(byId(desk, chairId("p1"))).toBeTruthy();
    expect(byId(desk, chairId("p2"))).toBeUndefined();
  });

  it("adds the second ring once the roster grows", () => {
    const desk = mapFor("cards");
    syncSeatChairs(desk, ["p1"]);
    syncSeatChairs(desk, ["p1", "p2"]);
    expect(byId(desk, chairId("p1"))).toBeTruthy();
    expect(byId(desk, chairId("p2"))).toBeTruthy();
  });

  it("takes a ring back down once its seat leaves the roster", () => {
    const desk = mapFor("cards");
    syncSeatChairs(desk, ["p1", "p2"]);
    syncSeatChairs(desk, ["p1"]);
    expect(byId(desk, chairId("p1"))).toBeTruthy();
    expect(byId(desk, chairId("p2"))).toBeUndefined();
  });
});
