import { describe, expect, it, vi } from "vitest";
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

  describe("dealStock", () => {
    it("moves the top stock card to waste when stock is non-empty", () => {
      const engine = new SolitaireGameEngine({
        phase: "playing",
        board: { slots: { stock: { members: ["2♠", "3♥"] }, waste: { members: [] } }, onEmpty: "keep" },
      });
      const result = engine.dealStock();
      expect(result).toEqual({ valid: true });
      expect(engine.getState().board.slots.waste?.members).toEqual(["2♠"]);
    });

    it("recycles waste back to stock when stock is empty and waste is not", () => {
      const engine = new SolitaireGameEngine({
        phase: "playing",
        board: { slots: { stock: { members: [] }, waste: { members: ["9♣"] } }, onEmpty: "keep" },
      });
      const result = engine.dealStock();
      expect(result).toEqual({ valid: true });
      expect(engine.getState().board.slots.stock?.members).toEqual(["9♣"]);
      expect(engine.getState().board.slots.waste?.members).toEqual([]);
    });

    it("fails when both stock and waste are empty", () => {
      const engine = new SolitaireGameEngine({
        phase: "playing",
        board: { slots: { stock: { members: [] }, waste: { members: [] } }, onEmpty: "keep" },
      });
      const result = engine.dealStock();
      expect(result).toEqual({ valid: false, error: "No cards to deal" });
    });

    it("fails when phase is not playing", () => {
      const engine = new SolitaireGameEngine({
        phase: "menu",
        board: { slots: { stock: { members: ["2♠"] }, waste: { members: [] } }, onEmpty: "keep" },
      });
      const result = engine.dealStock();
      expect(result.valid).toBe(false);
      expect(engine.getState().board.slots.stock?.members).toEqual(["2♠"]);
    });
  });

  describe("moveCard", () => {
    it("moves a legal card from waste to tableau", () => {
      const engine = new SolitaireGameEngine({
        phase: "playing",
        board: { slots: { waste: { members: ["5♦"] }, "tab:0": { members: ["6♠"] } }, onEmpty: "keep" },
      });
      const result = engine.moveCard("waste", "tab:0", "5♦");
      expect(result).toEqual({ valid: true });
      expect(engine.getState().board.slots["tab:0"]?.members).toEqual(["6♠", "5♦"]);
    });

    it("rejects an illegal move and does not bump movesCount", () => {
      const engine = new SolitaireGameEngine({
        phase: "playing",
        board: { slots: { waste: { members: ["5♦"] }, "tab:0": { members: ["6♦"] } }, onEmpty: "keep" },
      });
      const before = engine.getState().movesCount;
      const result = engine.moveCard("waste", "tab:0", "5♦");
      expect(result.valid).toBe(false);
      expect(engine.getState().movesCount).toBe(before);
    });

    it("rejects a foundation suit mismatch", () => {
      const engine = new SolitaireGameEngine({
        phase: "playing",
        board: { slots: { waste: { members: ["A♥"] }, "found:S": { members: [] } }, onEmpty: "keep" },
      });
      const result = engine.moveCard("waste", "found:S", "A♥");
      expect(result.valid).toBe(false);
    });

    it("fails when phase is not playing", () => {
      const engine = new SolitaireGameEngine({
        phase: "menu",
        board: { slots: { waste: { members: ["5♦"] }, "tab:0": { members: ["6♠"] } }, onEmpty: "keep" },
      });
      const result = engine.moveCard("waste", "tab:0", "5♦");
      expect(result.valid).toBe(false);
    });
  });

  describe("moveStack", () => {
    it("delegates to moveCard when cardIds has a single element", () => {
      const engine = new SolitaireGameEngine({
        phase: "playing",
        board: { slots: { waste: { members: ["5♦"] }, "tab:0": { members: ["6♠"] } }, onEmpty: "keep" },
      });
      const result = engine.moveStack("waste", "tab:0", ["5♦"]);
      expect(result).toEqual({ valid: true });
      expect(engine.getState().board.slots["tab:0"]?.members).toEqual(["6♠", "5♦"]);
    });

    it("moves a valid run of cards to another tableau", () => {
      const engine = new SolitaireGameEngine({
        phase: "playing",
        board: {
          slots: { "tab:0": { members: ["9♦", "8♣"] }, "tab:1": { members: ["10♠"] } },
          onEmpty: "keep",
        },
      });
      const result = engine.moveStack("tab:0", "tab:1", ["9♦", "8♣"]);
      expect(result).toEqual({ valid: true });
      expect(engine.getState().board.slots["tab:1"]?.members).toEqual(["10♠", "9♦", "8♣"]);
    });

    it("rejects a run whose internal ordering is invalid", () => {
      const engine = new SolitaireGameEngine({
        phase: "playing",
        board: {
          slots: { "tab:0": { members: ["9♦", "7♣"] }, "tab:1": { members: ["9♠"] } },
          onEmpty: "keep",
        },
      });
      const result = engine.moveStack("tab:0", "tab:1", ["9♦", "7♣"]);
      expect(result.valid).toBe(false);
    });

    it("rejects a target slot that is not a tableau", () => {
      const engine = new SolitaireGameEngine({
        phase: "playing",
        board: {
          slots: { "tab:0": { members: ["9♦", "8♣"] }, "found:D": { members: [] } },
          onEmpty: "keep",
        },
      });
      const result = engine.moveStack("tab:0", "found:D", ["9♦", "8♣"]);
      expect(result).toEqual({ valid: false, error: "Invalid target slot found:D" });
    });

    it("fails when phase is not playing", () => {
      const engine = new SolitaireGameEngine({
        phase: "menu",
        board: {
          slots: { "tab:0": { members: ["9♦", "8♣"] }, "tab:1": { members: ["9♠"] } },
          onEmpty: "keep",
        },
      });
      const result = engine.moveStack("tab:0", "tab:1", ["9♦", "8♣"]);
      expect(result.valid).toBe(false);
    });
  });

  describe("isWinning / canMakeMove / getPossibleMoves", () => {
    const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    function fullFoundation(suit: string): string[] {
      return RANKS.map((rank) => `${rank}${suit}`);
    }

    it("isWinning is true when all 4 foundations are full", () => {
      const engine = new SolitaireGameEngine({
        phase: "playing",
        board: {
          slots: {
            "found:S": { members: fullFoundation("♠") },
            "found:H": { members: fullFoundation("♥") },
            "found:D": { members: fullFoundation("♦") },
            "found:C": { members: fullFoundation("♣") },
          },
          onEmpty: "keep",
        },
      });
      expect(engine.isWinning()).toBe(true);
    });

    it("canMakeMove is true when stock has cards", () => {
      const engine = new SolitaireGameEngine({
        phase: "playing",
        board: { slots: { stock: { members: ["7♣"] } }, onEmpty: "keep" },
      });
      expect(engine.canMakeMove()).toBe(true);
    });

    it("canMakeMove is false when there is no move available", () => {
      const engine = new SolitaireGameEngine({
        phase: "playing",
        board: {
          slots: { stock: { members: [] }, waste: { members: [] }, "tab:0": { members: ["2♠"] } },
          onEmpty: "keep",
        },
      });
      expect(engine.canMakeMove()).toBe(false);
    });

    it("getPossibleMoves returns at least one move for waste -> tableau", () => {
      const engine = new SolitaireGameEngine({
        phase: "playing",
        board: {
          slots: { waste: { members: ["5♦"] }, "tab:0": { members: ["6♠"] }, stock: { members: [] } },
          onEmpty: "keep",
        },
      });
      expect(engine.getPossibleMoves().length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("events", () => {
    const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    function fullSuitRun(suit: string): string[] {
      return RANKS.map((rank) => `${rank}${suit}`);
    }

    it("fires 'move' once per successful dispatched action", () => {
      const engine = new SolitaireGameEngine({
        phase: "playing",
        board: { slots: { stock: { members: ["2♠", "3♥"] }, waste: { members: [] } }, onEmpty: "keep" },
      });
      const spy = vi.fn();
      engine.on("move", spy);
      engine.dealStock();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith({ type: "dealStock" });
    });

    it("fires 'win' and sets phase to 'won' when the last foundation completes", () => {
      const engine = new SolitaireGameEngine({
        phase: "playing",
        board: {
          slots: {
            "found:S": { members: fullSuitRun("♠") },
            "found:H": { members: fullSuitRun("♥") },
            "found:D": { members: fullSuitRun("♦") },
            "found:C": { members: fullSuitRun("♣").slice(0, 12) },
            waste: { members: ["K♣"] },
          },
          onEmpty: "keep",
        },
      });
      const spy = vi.fn();
      engine.on("win", spy);
      const result = engine.moveCard("waste", "found:C", "K♣");
      expect(result).toEqual({ valid: true });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(engine.getState().phase).toBe("won");
    });

    it("fires 'lose' and sets phase to 'lost' when no legal moves remain after a move", () => {
      const engine = new SolitaireGameEngine({
        phase: "playing",
        board: {
          slots: {
            stock: { members: ["9♣"] },
            waste: { members: [] },
            "tab:0": { members: ["2♠"] },
          },
          onEmpty: "keep",
        },
      });
      const spy = vi.fn();
      engine.on("lose", spy);
      const result = engine.dealStock();
      expect(result).toEqual({ valid: true });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(engine.getState().phase).toBe("lost");
    });

    it("off() unsubscribes a handler so it no longer fires", () => {
      const engine = new SolitaireGameEngine({
        phase: "playing",
        board: { slots: { stock: { members: ["2♠"] }, waste: { members: [] } }, onEmpty: "keep" },
      });
      const spy = vi.fn();
      engine.on("move", spy);
      engine.off("move", spy);
      engine.dealStock();
      expect(spy).not.toHaveBeenCalled();
    });

    it("does not fire 'move' for an illegal moveCard call", () => {
      const engine = new SolitaireGameEngine({
        phase: "playing",
        board: { slots: { waste: { members: ["5♦"] }, "tab:0": { members: ["6♦"] } }, onEmpty: "keep" },
      });
      const spy = vi.fn();
      engine.on("move", spy);
      const result = engine.moveCard("waste", "tab:0", "5♦");
      expect(result.valid).toBe(false);
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
