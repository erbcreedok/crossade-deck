import { isHand } from "@game-presets/desks";
import { byId, type Node } from "game-kit";
import { chairId } from "@game-presets/desks";
import { describe, it, expect } from "vitest";
import { isTableGame, mapFor } from "./mapFor.js";

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

  it("opens the round table with no rings — the roster is not known yet", () => {
    const desk = mapFor("cards");
    expect(byId(desk, chairId("p1"))).toBeUndefined();
    expect(byId(desk, chairId("p2"))).toBeUndefined();
  });

  it("hub.a-board-has-no-hands — a man is on a square and nowhere else", () => {
    expect(every(mapFor("chess")).filter(isHand)).toEqual([]);
    expect(every(mapFor("nardy")).filter(isHand)).toEqual([]);
  });
});
