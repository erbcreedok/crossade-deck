// ДУРАК — грид пар «атака/защита»: слот держит не больше двух карт (maxSize 2 — третьей
// физически некуда), козырь смотрит из-под колоды (мок: отдельный слот «козырь» лицом).

import type { BoardSpec } from "../core/spec";
import { deck36 } from "./decks";

export function durakBoard(): BoardSpec {
  const { cards, ids } = deck36();
  const trump = ids[ids.length - 1]!;
  return {
    id: "durak",
    title: "Дурак",
    elements: cards,
    zones: [
      { id: "table", title: "стол", layout: { kind: "grid", cols: 3, rows: 2 }, policy: { onOccupied: "merge", maxSize: 2 } },
      { id: "deck", title: "колода", layout: { kind: "pile" }, policy: { onOccupied: "merge" }, setup: { 0: ids.slice(0, -1) } },
      { id: "trump", title: "козырь", layout: { kind: "pile" }, policy: { onOccupied: "reject" }, setup: { 0: [trump] } },
      { id: "discard", title: "бито", layout: { kind: "pile" }, policy: { onOccupied: "merge" } },
    ],
    seats: { count: { min: 2, max: 6 }, show: "backs", swap: true },
    hand: { reorder: true },
    actions: [
      { id: "deal", label: "раздать по 6", command: { t: "deal", from: "deck", each: 6 } },
      { id: "draw", label: "добор по 1", command: { t: "deal", from: "deck", each: 1 } },
      { id: "shuffle", label: "перетасовать", command: { t: "shuffle", zone: "deck" } },
      { id: "turn", label: "ход дальше", command: { t: "turn" } },
      { id: "reset", label: "заново", command: { t: "reset" } },
    ],
    mock: { deal: { from: "deck", each: 6 } },
  };
}
