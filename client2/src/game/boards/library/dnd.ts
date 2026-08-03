// ДнД — поле энкаунтера: большой грид под миниатюры (герои светлые, монстры тёмные), резерв
// мастера и кубики. Правил нет тем более — мастер и есть правила.

import type { BoardSpec, ElementDef } from "../spec";

const HEROES = ["♞", "♝", "♜", "♛"] as const;
const MONSTERS = ["♟", "♟", "♟", "♞", "♜"] as const;

export function dndBoard(): BoardSpec {
  const heroes: ElementDef[] = HEROES.map((glyph, i) => ({ kind: "piece", id: `hero${i + 1}`, glyph, dark: false }));
  const monsters: ElementDef[] = MONSTERS.map((glyph, i) => ({ kind: "piece", id: `mob${i + 1}`, glyph, dark: true }));
  const setup: Record<string, string[]> = {};
  heroes.forEach((h, i) => (setup[`r6c${i + 2}`] = [h.id]));
  monsters.forEach((m, i) => (setup[`r1c${i + 2}`] = [m.id]));
  return {
    id: "dnd",
    title: "ДнД",
    elements: [...heroes, ...monsters],
    zones: [
      { id: "field", title: "энкаунтер", layout: { kind: "grid", cols: 10, rows: 8 }, cell: { w: 64, h: 64 },
        background: "chessboard", policy: { onOccupied: "capture" }, setup },
      { id: "reserve", title: "резерв мастера", layout: { kind: "pile" }, cell: { w: 64, h: 64 }, policy: { onOccupied: "merge" } },
    ],
    seats: { count: { min: 2, max: 6 }, show: "none", swap: true },
    actions: [
      { id: "roll", label: "бросить кубики", command: { t: "roll" } },
      { id: "turn", label: "инициатива дальше", command: { t: "turn" } },
      { id: "reset", label: "заново", command: { t: "reset" } },
    ],
    mock: { dice: 2 },
  };
}
