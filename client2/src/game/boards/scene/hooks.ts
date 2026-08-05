// ДЕВ-ХУКИ БОРДЫ — снимок доски для стори и e2e: ЭКРАННАЯ геометрия слотов и жителей плюс то из
// состояния, что проверяют глазами (места, чей ход, кости). Канвас не отдаёт ни DOM-узлов, ни ролей,
// поэтому спросить борду больше нечем.

import type { BoardState } from "../core/state";
import type { BoardTree } from "../geometry/boardTree";
import type { BoardNode } from "./nodeFactory";

export interface BoardHooks {
  slots: Record<string, { x: number; y: number }>;
  cards: Record<string, { x: number; y: number; slot: string | null }>;
  /** Карты ЭКРАННОЙ руки (HUD) по порядку — уже экранные координаты (chrome-слой, вне камеры). */
  hand: { id: string; x: number; y: number }[];
  seats: BoardState["seats"];
  turn: BoardState["turn"];
  dice: number[];
}

export function boardHooks(
  state: BoardState,
  tree: BoardTree,
  nodes: Iterable<[string, BoardNode]>,
  toScreen: (x: number, y: number) => { x: number; y: number },
  hand: { id: string; x: number; y: number }[],
): BoardHooks {
  const slots: BoardHooks["slots"] = {};
  for (const [id, at] of Object.entries(tree.origins)) slots[id] = toScreen(at.x, at.y);
  const cards: BoardHooks["cards"] = {};
  for (const [id, node] of nodes) {
    const p = toScreen(node.body.px, node.body.py);
    cards[id] = { x: p.x, y: p.y, slot: tree.slotOf(id) };
  }
  return { slots, cards, hand, seats: state.seats, turn: state.turn, dice: [...state.dice] };
}
