import { describe, expect, it } from "vitest";
import { SolitaireGameEngine } from "./engine";

describe("SolitaireGameEngine", () => {
  it("starts in menu phase by default", () => {
    const engine = new SolitaireGameEngine();
    expect(engine.getState().phase).toBe("menu");
  });

  it("applies partial initial state overrides over the defaults", () => {
    const engine = new SolitaireGameEngine({ movesCount: 5 });
    expect(engine.getState().movesCount).toBe(5);
  });

  it("resetGame(seed) is deterministic across engines", () => {
    const a = new SolitaireGameEngine();
    const b = new SolitaireGameEngine();
    a.resetGame(42);
    b.resetGame(42);
    expect(a.getState().board).toEqual(b.getState().board);
  });

  it("resetGame deals 24 cards to stock and enters playing phase", () => {
    const engine = new SolitaireGameEngine();
    engine.resetGame(1);
    const state = engine.getState();
    expect(state.board.slots.stock?.members.length).toBe(24);
    expect(state.phase).toBe("playing");
  });
});
