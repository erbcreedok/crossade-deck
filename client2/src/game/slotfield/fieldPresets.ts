import type { OnOccupied } from "./fieldZone";
import { cardColor } from "./cardFace";
import { foundationAccepts, tableauAccepts } from "../solitaire/solitaireRules";

export { cardColor, rankOf } from "./cardFace"; // общий re-export (движок берёт rankOf отсюда)

// Пресеты бордов — ЧИСТЫЕ ДАННЫЕ (разные игры = разный конфиг, один движок). Задел под будущий
// BoardFactory (ENGINE-UPGRADE.md): движок лишь читает эти данные и строит зоны.
// layout: стратегия раскладки (grid по умолчанию / ring). slots: ключ слота → лица карт-фигур.
export interface FieldPreset {
  title: string;
  cols: number; // для grid
  rows: number; // для grid
  onOccupied: OnOccupied;
  layout?: "grid" | "ring";
  ringCount?: number; // число слотов кольца (layout: ring)
  maxSize?: number; // потолок стопки в слоте (дурак и т.п.)
  rule?: (figFace: string, topFace: string | null, toKey: string) => boolean; // value-правило приёма (key-aware)
  slots: Record<string, string[]>; // ключ ("r,c" | "ringN") → лица карт-фигур
}

// Правило пасьянса (Клондайк): колонки 0..2 — «стол» (tableau), колонки 3..4 — фундамент. Диспетч
// по ключу слота "r,c" (rules as data, key-aware). Правила — чистые (solitaireRules.ts).
function solitaireRule(fig: string, top: string | null, toKey: string): boolean {
  const col = Number(toKey.split(",")[1]);
  return col >= 3 ? foundationAccepts(fig, top) : tableauAccepts(fig, top);
}

export const FIELD_PRESETS: FieldPreset[] = [
  { title: "свободно (merge)", cols: 3, rows: 2, onOccupied: "merge", slots: { "0,0": ["A♠"], "0,2": ["K♥", "Q♦"], "1,1": ["10♣"] } },
  { title: "дурак — стопка ≤2 (merge+maxSize)", cols: 3, rows: 1, onOccupied: "merge", maxSize: 2, slots: { "0,0": ["6♦"], "0,1": ["7♦"], "0,2": ["8♦"] } },
  { title: "пятнашки (swap)", cols: 3, rows: 2, onOccupied: "swap", slots: { "0,0": ["2♠"], "0,1": ["3♠"], "0,2": ["4♠"], "1,0": ["5♠"], "1,1": ["6♠"] } },
  { title: "шахматы — съесть (capture)", cols: 3, rows: 1, onOccupied: "capture", slots: { "0,0": ["K♣"], "0,2": ["Q♥"] } },
  { title: "монополия — кольцо (ring, swap)", cols: 0, rows: 0, layout: "ring", ringCount: 8, onOccupied: "swap", slots: { ring0: ["A♣"], ring4: ["K♦"] } },
  { title: "правило: клади только свой цвет (rule)", cols: 3, rows: 1, onOccupied: "merge", rule: (fig, top) => top === null || cardColor(fig) === cardColor(top), slots: { "0,0": ["6♥"], "0,1": ["7♠"], "0,2": ["8♦"] } },
  // Пасьянс-правила: стол (кол.0-2, вниз/разноцвет) + фундамент (кол.3-4, вверх/масть). Q♥→K♠, 2♣→A♣.
  { title: "пасьянс: стол вниз-разноцвет, фундамент вверх-масть (rule)", cols: 5, rows: 1, onOccupied: "merge", rule: solitaireRule, slots: { "0,0": ["K♠"], "0,1": ["Q♥"], "0,2": ["2♣"], "0,3": ["A♣"] } },
];
