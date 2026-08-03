// БЕЛКА — карточная БЕЗ колоды на столе: вся колода всегда на руках (раздаётся целиком при
// старте), в центре одна взятка, собранные взятки копятся стопкой. Мест ровно четыре.

import type { BoardSpec } from "../spec";
import { deck36 } from "./decks";

export function belkaBoard(): BoardSpec {
  const { cards, ids } = deck36();
  return {
    id: "belka",
    title: "Белка",
    elements: cards,
    zones: [
      { id: "trick", title: "взятка", layout: { kind: "pile" }, policy: { onOccupied: "merge", maxSize: 4 } },
      { id: "taken", title: "взятки", layout: { kind: "pile" }, policy: { onOccupied: "merge" } },
      // Колода существует только как источник раздачи — на столе её слот пуст всю игру.
      { id: "deck", title: "", layout: { kind: "pile" }, policy: { onOccupied: "reject" }, setup: { 0: ids } },
    ],
    seats: { count: { fixed: 4 }, show: "count", swap: true },
    hand: { reorder: true },
    actions: [
      { id: "turn", label: "ход дальше", command: { t: "turn" } },
      { id: "reset", label: "заново", command: { t: "reset" } },
    ],
    mock: { deal: { from: "deck", each: "all-even-dealer-last" } },
  };
}
