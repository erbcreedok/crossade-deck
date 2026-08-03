// МАНЧКИН — две колоды (двери/сокровища) + общий сброс + фишки уровней в банке: игрок сам
// берёт себе уровень (или «помогает» соседу — мок не запрещает, как и сама игра местами).

import type { BoardSpec, ElementDef } from "../spec";
import { deck36 } from "./decks";

export function munchkinBoard(): BoardSpec {
  const { cards, ids } = deck36();
  const doors = ids.slice(0, 18);
  const treasures = ids.slice(18);
  const levels: ElementDef[] = Array.from({ length: 12 }, (_, i) => ({ kind: "chip", id: `lvl${i + 1}`, denom: 1 }));
  return {
    id: "munchkin",
    title: "Манчкин",
    elements: [...cards, ...levels],
    zones: [
      { id: "doors", title: "двери", layout: { kind: "pile" }, policy: { onOccupied: "merge" }, setup: { 0: doors } },
      { id: "treasures", title: "сокровища", layout: { kind: "pile" }, policy: { onOccupied: "merge" }, setup: { 0: treasures } },
      { id: "discard", title: "сброс", layout: { kind: "pile" }, policy: { onOccupied: "merge" } },
      { id: "levels", title: "уровни", layout: { kind: "pile" }, policy: { onOccupied: "merge" }, setup: { 0: levels.map((l) => l.id) } },
    ],
    seats: { count: { min: 2, max: 6 }, show: "backs", swap: true },
    hand: { reorder: true },
    actions: [
      { id: "deal", label: "раздать 4+4", command: { t: "deal", from: "doors", each: 4 } },
      { id: "dealT", label: "сокровища по 4", command: { t: "deal", from: "treasures", each: 4 } },
      { id: "turn", label: "ход дальше", command: { t: "turn" } },
      { id: "reset", label: "заново", command: { t: "reset" } },
    ],
    mock: { deal: { from: "doors", each: 4 } },
  };
}
