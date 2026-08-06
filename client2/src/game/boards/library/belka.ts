// БЕЛКА — круглый стол на ЧЕТЫРЁХ, места напротив друг друга. Колода 36, но шестёрки в игре не
// участвуют: четыре из них лежат ОТДЕЛЬНО рядом (пары «красные»/«чёрные» — заготовка счётчика
// очков), а на руки раздаётся 32 карты — по 8 каждому. На столе перед КАЖДЫМ местом ровно один
// слот (policy reject — «одна карта от игрока»); стол относителен зрителя — своя карта ложится
// перед тобой снизу (boardTree kind "seats"). Правил нет (смарт-мок, BOARDS-DESIGN §3).

import { handZone } from "./strips";
import type { BoardSpec } from "../core/spec";
import { deck36 } from "./decks";

const SIXES = ["6♠", "6♥", "6♦", "6♣"] as const;
const RED_SIXES = ["6♥", "6♦"]; // красная пара счётчика
const BLACK_SIXES = ["6♠", "6♣"]; // чёрная пара счётчика

export function belkaBoard(): BoardSpec {
  const { cards, ids } = deck36();
  const deckIds = ids.filter((id) => !SIXES.includes(id as (typeof SIXES)[number])); // 32 без шестёрок

  return {
    id: "belka",
    title: "Белка",
    elements: cards, // все 36 существуют, но шестёрки живут в боковых зонах, не в колоде
    zones: [
      // Стол: слот на каждое место вокруг центра, относительно зрителя; одна карта от игрока.
      { id: "table", title: "", layout: { kind: "seats" }, policy: { onOccupied: "reject" } },
      // Шестёрки «отдельно рядом»: красная пара и чёрная — как две дорожки счёта (перекрытие
      // задаёт очки; пока лежат стопками — точный пип-счётчик 0..12 будет отдельным шагом).
      { id: "score-red", title: "красные", layout: { kind: "pile" }, policy: { onOccupied: "merge" }, setup: { 0: RED_SIXES } },
      { id: "score-black", title: "чёрные", layout: { kind: "pile" }, policy: { onOccupied: "merge" }, setup: { 0: BLACK_SIXES } },
      // Колода — только источник раздачи (32 карты без шестёрок), на столе её слот пуст.
      { id: "deck", title: "", layout: { kind: "pile" }, policy: { onOccupied: "reject" }, setup: { 0: deckIds } },
      handZone(),
    ],
    seats: { count: { fixed: 4 }, show: "backs", swap: true },
    actions: [
      { id: "turn", label: "ход дальше", command: { t: "turn" } },
      { id: "reset", label: "заново", command: { t: "reset" } },
    ],
    mock: { deal: { from: "deck", each: "all-even-dealer-last" } }, // 32 / 4 = по 8
  };
}
