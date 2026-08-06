import { describe, it, expect } from "vitest";
import { roundTableBoard, durakBoard } from "../library";
import { initialState } from "../core/state";
import { buildBoardTree } from "../geometry/boardTree";
import type { BoardSpec, HudSpec } from "../core/spec";
import { region, zoneW } from "../core/hudSpec";

// Сторож: ГДЕ живёт лента, решает HUD (hudLayout.zoneOnBoard). Виджет {kind:"zone"} в любой
// ОБЛАСТИ HUD убирает СВОЙ экземпляр зоны ИЗ ДЕРЕВА борды (обе компоновки — круглый стол и
// полоса): его жители живут в экранной области. Чужие экземпляры остаются в дереве всегда (для
// других это обычные зоны у мест). Без виджета лента в дереве, как раньше.

const HAND_HUD: HudSpec = { areas: [region("bottom", "start", [zoneW("hand")])] };

function keysInTree(spec: BoardSpec, seats: number): string[] {
  const state = initialState(spec, seats);
  const tree = buildBoardTree(spec, state, "p1", state.free);
  return Object.keys(tree.origins);
}

describe("лента: на борде vs док HUD", () => {
  it("круглый стол: без HUD своя лента в дереве, с виджетом — нет; чужая — всегда в дереве", () => {
    const board = roundTableBoard({ seats: 2, dealt: 2 });
    expect(keysInTree(board, 2)).toContain("hand:p1");
    const docked = keysInTree({ ...board, hud: HAND_HUD }, 2);
    expect(docked).not.toContain("hand:p1");
    expect(docked).toContain("hand:p2");
  });

  it("полоса (без seats): без HUD лента в дереве, с виджетом — нет", () => {
    const board = durakBoard();
    expect(keysInTree(board, 2)).toContain("hand:p1");
    expect(keysInTree({ ...board, hud: HAND_HUD }, 2)).not.toContain("hand:p1");
  });
});
