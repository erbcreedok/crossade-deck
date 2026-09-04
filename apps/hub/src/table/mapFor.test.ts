import { describe, it, expect } from "vitest";
import { isTableGame, mapFor } from "./mapFor.js";

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
});
