// ПОКЕР — борд из пяти адресных слотов (флоп/тёрн/ривер ложатся на СВОИ места), банк фишек в
// центре, у игроков по две карты и стек. Колода 52.

import type { BoardSpec, ElementDef } from "../spec";
import { deck52 } from "./decks";

export function pokerBoard(): BoardSpec {
  const { cards, ids } = deck52();
  const chips: ElementDef[] = Array.from({ length: 24 }, (_, i) => ({ kind: "chip", id: `chip${i + 1}`, denom: 25 }));
  return {
    id: "poker",
    title: "Покер",
    elements: [...cards, ...chips],
    zones: [
      { id: "board", title: "борд", layout: { kind: "grid", cols: 5, rows: 1 }, policy: { onOccupied: "reject" } },
      { id: "pot", title: "банк", layout: { kind: "pile" }, policy: { onOccupied: "merge" } },
      { id: "deck", title: "колода", layout: { kind: "pile" }, policy: { onOccupied: "merge" }, setup: { 0: ids } },
      { id: "bank", title: "фишки", layout: { kind: "pile" }, policy: { onOccupied: "merge" }, setup: { 0: chips.map((c) => c.id) } },
    ],
    seats: { count: { min: 2, max: 6 }, show: "chips", swap: true },
    hand: { reorder: true },
    actions: [
      { id: "deal", label: "раздать по 2", command: { t: "deal", from: "deck", each: 2 } },
      { id: "chips", label: "стеки по 3", command: { t: "deal", from: "bank", each: 3 } },
      { id: "shuffle", label: "перетасовать", command: { t: "shuffle", zone: "deck" } },
      { id: "turn", label: "ход дальше", command: { t: "turn" } },
      { id: "reset", label: "заново", command: { t: "reset" } },
    ],
    mock: { deal: { from: "deck", each: 2 } },
  };
}
