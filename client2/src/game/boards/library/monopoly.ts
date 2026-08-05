// МОНОПОЛИЯ — контраст: кольцевая раскладка, смешанные элементы (фишки-токены, деньги,
// карточки шанс/казна), кубики; у мест не рука с картами, а видимое имущество.

import type { BoardSpec, ElementDef } from "../core/spec";

const TOKEN_COLORS = [0xe05555, 0x4c9ae0, 0x5ec46a, 0xe0a24c, 0xb06ae0, 0x4cc8c8];

export function monopolyBoard(): BoardSpec {
  const tokens: ElementDef[] = TOKEN_COLORS.map((_, i) => ({ kind: "chip", id: `tok${i + 1}`, denom: i + 1 }));
  const money: ElementDef[] = Array.from({ length: 18 }, (_, i) => ({ kind: "chip", id: `m${i + 1}`, denom: 100 }));
  const chance: ElementDef[] = Array.from({ length: 4 }, (_, i) => ({ kind: "card", id: `ch${i + 1}`, face: "J♦" }));
  const treasury: ElementDef[] = Array.from({ length: 4 }, (_, i) => ({ kind: "card", id: `tr${i + 1}`, face: "Q♣" }));
  return {
    id: "monopoly",
    title: "Монополия",
    elements: [...tokens, ...money, ...chance, ...treasury],
    zones: [
      {
        id: "track",
        title: "круг",
        layout: { kind: "ring", count: 24 },
        cell: { w: 54, h: 54 },
        policy: { onOccupied: "merge" }, // фишки соседствуют на клетке
        setup: { 0: tokens.map((t) => t.id) },
      },
      { id: "chance", title: "шанс", layout: { kind: "pile" }, policy: { onOccupied: "merge" }, setup: { 0: chance.map((c) => c.id) } },
      { id: "treasury", title: "казна", layout: { kind: "pile" }, policy: { onOccupied: "merge" }, setup: { 0: treasury.map((c) => c.id) } },
      { id: "bank", title: "банк", layout: { kind: "pile" }, policy: { onOccupied: "merge" }, setup: { 0: money.map((m) => m.id) } },
    ],
    seats: { count: { min: 2, max: 6 }, show: "chips", swap: true },
    hand: { reorder: false }, // «рука» тут — деньги игрока
    actions: [
      { id: "roll", label: "бросить кубики", command: { t: "roll" } },
      { id: "deal", label: "раздать деньги", command: { t: "deal", from: "bank", each: 3 } },
      { id: "turn", label: "ход дальше", command: { t: "turn" } },
      { id: "reset", label: "заново", command: { t: "reset" } },
    ],
    mock: { deal: { from: "bank", each: 3 }, dice: 2 },
  };
}
