import type { Board } from "../board/board";

// Статичная схема поля пасьянса (Клондайк): 13 слотов, все пустые контейнеры-«сумки». onEmpty:
// "keep" — в отличие от свободных досок (boardPresets.ts), слоты пасьянса СТРУКТУРНЫЕ: сток,
// отбой и 4 фундамента не должны пропадать, когда карты из них разобраны — иначе рендереру/хосту
// было бы негде их снова нарисовать. Чистые данные: движок лишь читает конфиг и строит зоны.
const SUITS = ["S", "H", "D", "C"] as const;
const TABLEAU_COLS = 7;

function emptySlots(): Record<string, { members: string[] }> {
  const slots: Record<string, { members: string[] }> = {
    stock: { members: [] },
    waste: { members: [] },
  };
  for (const suit of SUITS) slots[`found:${suit}`] = { members: [] };
  for (let i = 0; i < TABLEAU_COLS; i++) slots[`tab:${i}`] = { members: [] };
  return slots;
}

export const SOLITAIRE_BOARD_CONFIG: Board = {
  slots: emptySlots(),
  onEmpty: "keep",
};
