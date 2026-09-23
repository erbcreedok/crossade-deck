// ВНЕШНИЙ ИГРОК. Два закона, и оба про то, что агент — соперник, а не хозяин стола.
//
// Первый: не его ход — не видно ничего. Не «видно, но нельзя»: карты соперника, показанные тому, кто
// сейчас не ходит, — это и есть чит, просто отложенный.
// Второй: ход называется НОМЕРОМ из списка. Имена карт агент пишет по-своему, а номер не даёт
// ошибиться ни ему, ни нам.

import { describe, expect, it } from "vitest";
import type { Face } from "../contract.js";
import { krestMemory } from "../games/krestMemory.js";
import type { BotView, Move } from "./brain.js";
import { chosen, looked } from "./outside.js";

const c = (rank: string, suit: Face["suit"]): Face => ({ rank, suit });
const id = (f: Face) => `${f.rank}${f.suit}`;
const lay = (f: Face): Move => ({ t: "lay", id: id(f), card: f, to: { in: "deck", pile: "ring" } });
const take = (f: Face): Move => ({ t: "take", id: id(f), card: f, to: { in: "hand", chair: "a", i: 0 } });

const view = (): BotView => ({
  ring: [c("6", "c")],
  hand: [{ id: id(c("7", "c")), face: c("7", "c") }],
  others: [{ chair: "b", name: "Боря", cards: 5 }],
  closesIfLay: false,
  openerIfTake: null,
  facts: krestMemory([], { a: 1, b: 5 }),
});
const legal: Move[] = [lay(c("7", "c")), take(c("6", "c"))];

describe("outside.an-agent-sees-only-on-its-turn", () => {
  it("его ход — виден стол и пронумерованные ходы", () => {
    const seen = looked("agent:я", true, legal, view());
    expect(seen.mine).toBe(true);
    expect(seen.view).not.toBe(null);
    expect(seen.moves).toEqual([
      { n: 1, says: "положить 7 крест" },
      { n: 2, says: "взять из круга 6 крест" },
    ]);
  });

  it("НЕ ЕГО ХОД — ни стола, ни ходов: подглядеть между ходами тоже нельзя", () => {
    const seen = looked("кто:другой", false, legal, view());
    expect(seen.turn, "чей ход — говорим: это не тайна").toBe("кто:другой");
    expect(seen.view, "а вот стол — нет").toBe(null);
    expect(seen.moves).toEqual([]);
  });

  it("партии нет — смотреть не на что, и это не ошибка", () => {
    const seen = looked(null, false, [], null);
    expect(seen).toEqual({ turn: null, mine: false, view: null, moves: [] });
  });
});

describe("outside.a-move-is-a-number-from-the-list", () => {
  it("номер из списка — тот самый ход", () => {
    expect(chosen(legal, 1)).toEqual(legal[0]);
    expect(chosen(legal, 2)).toEqual(legal[1]);
  });

  it("всё, что не номер из списка, — не ход", () => {
    for (const мимо of [0, 3, -1, 1.5, "1", null, undefined, {}, []]) {
      expect(chosen(legal, мимо), String(мимо)).toBe(null);
    }
  });

  it("ходов нет — назвать нечего", () => {
    expect(chosen([], 1)).toBe(null);
  });
});
