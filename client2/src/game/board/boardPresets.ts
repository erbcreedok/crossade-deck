import type { OnOccupied } from "./boardZone";

// Пресеты бордов — ЧИСТЫЕ ДАННЫЕ (разные игры = разный конфиг, один движок). Задел под будущий
// BoardFactory (ENGINE-UPGRADE.md): движок лишь читает эти данные и строит зоны.
// layout: стратегия раскладки (grid по умолчанию / ring). slots: ключ слота → лица карт-фигур.
export interface BoardPreset {
  title: string;
  cols: number; // для grid
  rows: number; // для grid
  onOccupied: OnOccupied;
  layout?: "grid" | "ring";
  ringCount?: number; // число слотов кольца (layout: ring)
  maxSize?: number; // потолок стопки в слоте (дурак и т.п.)
  rule?: (figFace: string, topFace: string | null) => boolean; // value-правило приёма (rules as data)
  slots: Record<string, string[]>; // ключ ("r,c" | "ringN") → лица карт-фигур
}

// Цвет карты по масти — для value-правил (напр. «клади только свой цвет»).
export const cardColor = (face: string): "red" | "black" => (face.endsWith("♥") || face.endsWith("♦") ? "red" : "black");

// Ранг карты по лицу (для сорта набора «по номиналу»): 6..10 / J=11 / Q=12 / K=13 / A=14.
export function rankOf(face: string): number {
  const r = face.slice(0, -1); // без масти
  const named = ({ J: 11, Q: 12, K: 13, A: 14 } as Record<string, number>)[r];
  if (named !== undefined) return named;
  const n = Number(r);
  return Number.isNaN(n) ? 0 : n;
}

export const BOARD_PRESETS: BoardPreset[] = [
  { title: "свободно (merge)", cols: 3, rows: 2, onOccupied: "merge", slots: { "0,0": ["A♠"], "0,2": ["K♥", "Q♦"], "1,1": ["10♣"] } },
  { title: "дурак — стопка ≤2 (merge+maxSize)", cols: 3, rows: 1, onOccupied: "merge", maxSize: 2, slots: { "0,0": ["6♦"], "0,1": ["7♦"], "0,2": ["8♦"] } },
  { title: "пятнашки (swap)", cols: 3, rows: 2, onOccupied: "swap", slots: { "0,0": ["2♠"], "0,1": ["3♠"], "0,2": ["4♠"], "1,0": ["5♠"], "1,1": ["6♠"] } },
  { title: "шахматы — съесть (capture)", cols: 3, rows: 1, onOccupied: "capture", slots: { "0,0": ["K♣"], "0,2": ["Q♥"] } },
  { title: "монополия — кольцо (ring, swap)", cols: 0, rows: 0, layout: "ring", ringCount: 8, onOccupied: "swap", slots: { ring0: ["A♣"], ring4: ["K♦"] } },
  { title: "правило: клади только свой цвет (rule)", cols: 3, rows: 1, onOccupied: "merge", rule: (fig, top) => top === null || cardColor(fig) === cardColor(top), slots: { "0,0": ["6♥"], "0,1": ["7♠"], "0,2": ["8♦"] } },
];
