import { describe, it, expect } from "vitest";
import { roundTableBoard, durakBoard } from "../library";
import { initialState } from "../core/state";
import { buildBoardTree } from "../geometry/boardTree";
import type { BoardSpec } from "../core/spec";

// Сторож: placement:"screen" убирает руку-зону ИЗ ДЕРЕВА борды (обе компоновки — круглый стол и
// полоса) — карты руки живут только в экранном HUD. Дефолт (board) руку в дереве сохраняет.

function handInTree(spec: BoardSpec, seats: number): boolean {
  const state = initialState(spec, seats);
  const tree = buildBoardTree(spec, state, "p1", state.free);
  return "hand:p1" in tree.origins;
}

describe("рука: placement board vs screen в дереве борды", () => {
  it("круглый стол: по умолчанию рука в дереве, при screen — нет", () => {
    const board = roundTableBoard({ seats: 2, dealt: 2 });
    expect(handInTree(board, 2)).toBe(true);
    expect(handInTree({ ...board, hand: { reorder: true, placement: "screen" } }, 2)).toBe(false);
  });

  it("полоса (без seats): по умолчанию рука в дереве, при screen — нет", () => {
    const board = durakBoard();
    expect(handInTree(board, 2)).toBe(true);
    expect(handInTree({ ...board, hand: { reorder: true, placement: "screen" } }, 2)).toBe(false);
  });
});
