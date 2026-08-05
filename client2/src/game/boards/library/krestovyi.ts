// КРЕСТОВЫЙ — игра владельца (BOARDS-DESIGN §5.2): цепочка отбоя вереницей, две общие зоны,
// динамические места, раздача всей колоды «дилеру последним — и меньше». Правила отбоя
// (6 бьётся 8, взял — круг не закрыт) живут в головах игроков, борда даёт честный стол.

import type { BoardSpec } from "../core/spec";
import { deck36 } from "./decks";

export function krestovyiBoard(): BoardSpec {
  const { cards, ids } = deck36();
  return {
    id: "krestovyi",
    title: "Крестовый",
    elements: cards,
    zones: [
      // Цепочка отбоя: ход продолжается вереницей (6 → бьётся 8 → бьют 8ку …), отбой ложится
      // ПОВЕРХ звена (merge), новое звено открывается в конце само (chain).
      { id: "chain", title: "цепочка", layout: { kind: "chain" }, policy: { onOccupied: "merge" } },
      { id: "discard", title: "сброс", layout: { kind: "pile" }, policy: { onOccupied: "merge" } },
      { id: "deck", title: "колода", layout: { kind: "pile" }, policy: { onOccupied: "merge" }, setup: { 0: ids } },
    ],
    seats: { count: { min: 2, max: 8 }, show: "backs", swap: true },
    hand: { reorder: true },
    actions: [
      { id: "deal", label: "раздать", command: { t: "deal", from: "deck", each: "all-even-dealer-last" } },
      { id: "shuffle", label: "перетасовать", command: { t: "shuffle", zone: "deck" } },
      { id: "turn", label: "ход дальше", command: { t: "turn" } },
      { id: "reverse", label: "направление", command: { t: "reverse" } },
      { id: "reset", label: "заново", command: { t: "reset" } },
    ],
    // Вся колода раздаётся поровну, дилеру последним — у него на карту меньше при нехватке.
    mock: { deal: { from: "deck", each: "all-even-dealer-last" } },
  };
}
