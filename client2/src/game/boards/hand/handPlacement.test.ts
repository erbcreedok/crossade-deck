import { describe, it, expect } from "vitest";
import { roundTableBoard, durakBoard } from "../library";
import { initialState } from "../core/state";
import { buildBoardTree } from "../geometry/boardTree";
import type { BoardSpec, HudSpec } from "../core/spec";

// Сторож: ГДЕ живёт рука, решает HUD (hudLayout.handOnBoard). Виджет «hand» в любом доке HUD
// убирает руку-зону ИЗ ДЕРЕВА борды (обе компоновки — круглый стол и полоса): карты руки живут
// в экранном доке. Без виджета рука в дереве, как раньше.

const HAND_HUD: HudSpec = { bottom: { widgets: [{ kind: "hand" }] } };

function handInTree(spec: BoardSpec, seats: number): boolean {
  const state = initialState(spec, seats);
  const tree = buildBoardTree(spec, state, "p1", state.free);
  return "hand:p1" in tree.origins;
}

describe("рука: на борде vs виджет HUD", () => {
  it("круглый стол: без HUD рука в дереве, с hand-виджетом — нет", () => {
    const board = roundTableBoard({ seats: 2, dealt: 2 });
    expect(handInTree(board, 2)).toBe(true);
    expect(handInTree({ ...board, hud: HAND_HUD }, 2)).toBe(false);
  });

  it("полоса (без seats): без HUD рука в дереве, с hand-виджетом — нет", () => {
    const board = durakBoard();
    expect(handInTree(board, 2)).toBe(true);
    expect(handInTree({ ...board, hud: HAND_HUD }, 2)).toBe(false);
  });
});
