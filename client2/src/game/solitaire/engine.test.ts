import { describe, it, expect, vi } from "vitest";
import type { Board } from "../board/board";
import type { SolitaireGameState, SolitaireAction } from "../board/solitaireState";
import { SolitaireGameEngine } from "./engine";

// E2-T1..E2-T4 — engine skeleton, validated action methods, query delegates, event bus.
// RED until client2/src/game/solitaire/engine.ts exists.

const ALL_SLOT_KEYS = ["stock", "waste", "found:S", "found:H", "found:D", "found:C", "tab:0", "tab:1", "tab:2", "tab:3", "tab:4", "tab:5", "tab:6"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function boardWith(slots: Record<string, string[]>): Board {
  const base: Record<string, { members: string[] }> = {};
  for (const k of ALL_SLOT_KEYS) base[k] = { members: [] };
  for (const k of Object.keys(slots)) base[k] = { members: [...slots[k]] };
  return { slots: base, onEmpty: "keep" };
}

/** Partial state carrying a "playing" board with the given slot members. */
function playing(slots: Record<string, string[]>, extra: Partial<SolitaireGameState> = {}): Partial<SolitaireGameState> {
  return { phase: "playing", board: boardWith(slots), movesCount: 0, ...extra };
}

function members(engine: SolitaireGameEngine, key: string): string[] {
  return engine.getState().board.slots[key]?.members ?? [];
}

function fullFoundation(sym: string): string[] {
  return RANKS.map((r) => r + sym);
}

// ------------------------------------------------------------------ E2-T1
describe("SolitaireGameEngine — skeleton (E2-T1)", () => {
  it("a fresh engine starts in the menu phase", () => {
    expect(new SolitaireGameEngine().getState().phase).toBe("menu");
  });

  it("partial initial state overrides defaults", () => {
    expect(new SolitaireGameEngine({ movesCount: 5 }).getState().movesCount).toBe(5);
  });

  it("resetGame(seed) is deterministic across engines", () => {
    const a = new SolitaireGameEngine();
    const b = new SolitaireGameEngine();
    a.resetGame(42);
    b.resetGame(42);
    expect(a.getState().board).toEqual(b.getState().board);
  });

  it("after resetGame the deal has 24 in stock and enters playing", () => {
    const e = new SolitaireGameEngine();
    e.resetGame(1);
    expect(e.getState().board.slots["stock"].members.length).toBe(24);
    expect(e.getState().phase).toBe("playing");
  });

  it("after resetGame the tableau holds 28 cards", () => {
    const e = new SolitaireGameEngine();
    e.resetGame(1);
    const total = ["tab:0", "tab:1", "tab:2", "tab:3", "tab:4", "tab:5", "tab:6"].reduce(
      (sum, k) => sum + e.getState().board.slots[k].members.length,
      0,
    );
    expect(total).toBe(28);
  });
});

// ------------------------------------------------------------------ E2-T2
describe("SolitaireGameEngine — validated action methods (E2-T2)", () => {
  it("dealStock on a non-empty stock flips one card to waste and returns valid", () => {
    const e = new SolitaireGameEngine(playing({ stock: ["2♠", "3♥"] }));
    const res = e.dealStock();
    expect(res.valid).toBe(true);
    expect(members(e, "waste")[members(e, "waste").length - 1]).toBe("2♠");
  });

  it("dealStock on empty stock + non-empty waste recycles", () => {
    const e = new SolitaireGameEngine(playing({ stock: [], waste: ["9♣"] }));
    const res = e.dealStock();
    expect(res.valid).toBe(true);
    expect(members(e, "stock")).toEqual(["9♣"]);
    expect(members(e, "waste")).toEqual([]);
  });

  it("dealStock with empty stock + empty waste returns an error", () => {
    const e = new SolitaireGameEngine(playing({ stock: [], waste: [] }));
    expect(e.dealStock()).toEqual({ valid: false, error: "No cards to deal" });
  });

  it("legal moveCard returns valid and applies", () => {
    const e = new SolitaireGameEngine(playing({ waste: ["5♦"], "tab:0": ["6♠"] }));
    const res = e.moveCard("waste", "tab:0", "5♦");
    expect(res.valid).toBe(true);
    expect(members(e, "tab:0")[members(e, "tab:0").length - 1]).toBe("5♦");
  });

  it("illegal moveCard (same color) returns invalid and leaves movesCount unchanged", () => {
    const e = new SolitaireGameEngine(playing({ waste: ["5♦"], "tab:0": ["6♦"] }));
    const before = e.getState().movesCount;
    const res = e.moveCard("waste", "tab:0", "5♦");
    expect(res.valid).toBe(false);
    expect(e.getState().movesCount).toBe(before);
  });

  it("foundation suit mismatch returns invalid", () => {
    const e = new SolitaireGameEngine(playing({ waste: ["A♥"], "found:S": [] }));
    expect(e.moveCard("waste", "found:S", "A♥").valid).toBe(false);
  });

  it("any action while not in playing phase returns invalid and does not change state", () => {
    const e = new SolitaireGameEngine({ phase: "menu", board: boardWith({ stock: ["2♠"] }) });
    const snapshot = JSON.stringify(e.getState());
    expect(e.dealStock().valid).toBe(false);
    expect(JSON.stringify(e.getState())).toBe(snapshot);
  });
});

// ------------------------------------------------------------------ E2-T3
describe("SolitaireGameEngine — query delegates (E2-T3)", () => {
  it("isWinning returns true with four full foundations", () => {
    const e = new SolitaireGameEngine(
      playing({
        "found:S": fullFoundation("♠"),
        "found:H": fullFoundation("♥"),
        "found:D": fullFoundation("♦"),
        "found:C": fullFoundation("♣"),
      }),
    );
    expect(e.isWinning()).toBe(true);
  });

  it("canMakeMove is true when stock is non-empty", () => {
    const e = new SolitaireGameEngine(playing({ stock: ["7♣"] }));
    expect(e.canMakeMove()).toBe(true);
  });

  it("canMakeMove is false with empty stock/waste and a locked tableau", () => {
    const e = new SolitaireGameEngine(playing({ stock: [], waste: [], "tab:0": ["2♠"] }));
    expect(e.canMakeMove()).toBe(false);
  });

  it("getPossibleMoves finds at least one move when a waste→tableau move exists", () => {
    const e = new SolitaireGameEngine(playing({ stock: [], waste: ["5♦"], "tab:0": ["6♠"] }));
    expect(e.getPossibleMoves().length).toBeGreaterThanOrEqual(1);
  });
});

// ------------------------------------------------------------------ E2-T4
describe("SolitaireGameEngine — event bus (E2-T4)", () => {
  it("a move handler fires once per successful action with the action", () => {
    const e = new SolitaireGameEngine(playing({ stock: ["2♠", "3♥"] }));
    const spy = vi.fn();
    e.on("move", spy);
    e.dealStock();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ type: "dealStock" } satisfies SolitaireAction);
  });

  it("win fires and phase becomes won when a move completes the 4th foundation", () => {
    const e = new SolitaireGameEngine(
      playing({
        stock: [],
        waste: ["K♣"],
        "found:S": fullFoundation("♠"),
        "found:H": fullFoundation("♥"),
        "found:D": fullFoundation("♦"),
        "found:C": fullFoundation("♣").slice(0, 12), // A♣..Q♣
      }),
    );
    const spy = vi.fn();
    e.on("win", spy);
    e.moveCard("waste", "found:C", "K♣");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(e.getState().phase).toBe("won");
  });

  it("lose fires and phase becomes lost when the last legal move leaves no options", () => {
    // After moving 5♦ onto 6♠ (covering it), stock+waste are empty and every
    // tableau/foundation top is dead → no legal move remains.
    const e = new SolitaireGameEngine(playing({ stock: [], waste: ["5♦"], "tab:0": ["6♠"] }));
    const spy = vi.fn();
    e.on("lose", spy);
    e.moveCard("waste", "tab:0", "5♦");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(e.getState().phase).toBe("lost");
  });

  it("off unsubscribes a handler so it no longer fires", () => {
    const e = new SolitaireGameEngine(playing({ stock: ["2♠", "3♥"] }));
    const spy = vi.fn();
    e.on("move", spy);
    e.off("move", spy);
    e.dealStock();
    expect(spy).not.toHaveBeenCalled();
  });

  it("an invalid engine call does not emit move", () => {
    const e = new SolitaireGameEngine(playing({ waste: ["5♦"], "tab:0": ["6♦"] }));
    const spy = vi.fn();
    e.on("move", spy);
    e.moveCard("waste", "tab:0", "5♦"); // same color → invalid
    expect(spy).not.toHaveBeenCalled();
  });
});
