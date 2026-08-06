// УНО — колода + открытый сброс, направление круга меняется постоянно (реверсы) — ровно то,
// зачем у мока есть reverse. Карты — обычные (кастом-лица УНО придут с ассетами).

import { handZone } from "./strips";
import type { BoardSpec } from "../core/spec";
import { deck36 } from "./decks";

export function unoBoard(): BoardSpec {
  const { cards, ids } = deck36();
  return {
    id: "uno",
    title: "УНО",
    elements: cards,
    zones: [
      { id: "deck", title: "колода", layout: { kind: "pile" }, policy: { onOccupied: "merge" }, setup: { 0: ids } },
      { id: "discard", title: "сброс", layout: { kind: "pile" }, policy: { onOccupied: "merge" } },
      handZone(),
    ],
    seats: { count: { min: 2, max: 8 }, show: "backs", swap: true },
    actions: [
      { id: "deal", label: "раздать по 7", command: { t: "deal", from: "deck", each: 7 } },
      { id: "shuffle", label: "перетасовать", command: { t: "shuffle", zone: "deck" } },
      { id: "turn", label: "ход дальше", command: { t: "turn" } },
      { id: "reverse", label: "реверс", command: { t: "reverse" } },
      { id: "reset", label: "заново", command: { t: "reset" } },
    ],
    mock: { deal: { from: "deck", each: 7 } },
  };
}
