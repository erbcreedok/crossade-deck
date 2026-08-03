// БОРДЫ-ПРЕСЕТЫ — конкретные игры как ДАННЫЕ (BOARDS-DESIGN §5): ни одна не написала ни строчки
// движка. Правил игр тут нет и не будет — смарт-мок даёт честный стол, правила живут в головах
// игроков (решение владельца). Каждая борда — контраст каркасу:
//   шахматы   — не-карточная, константные места, адресный грид, capture с выносом за борт;
//   крестовый — карточная, динамические места, цепочка отбоя, раздача «дилеру меньше»;
//   монополия — кольцо со своим фоном, смешанные элементы (фишки-токены, деньги, карточки).

import { SUITS } from "../card";
import type { BoardSpec, ElementDef } from "./spec";

// ---------------------------------------------------------------------------------------------
// Шахматы
// ---------------------------------------------------------------------------------------------

const BACK_ROW = ["♜", "♞", "♝", "♛", "♚", "♝", "♞", "♜"] as const;

function chessSide(dark: boolean): { pieces: ElementDef[]; setup: Record<string, string[]> } {
  const p = dark ? "d" : "l";
  const backRank = dark ? 0 : 7;
  const pawnRank = dark ? 1 : 6;
  const pieces: ElementDef[] = [];
  const setup: Record<string, string[]> = {};
  BACK_ROW.forEach((glyph, c) => {
    const id = `${p}b${c}`;
    pieces.push({ kind: "piece", id, glyph, dark });
    setup[`r${backRank}c${c}`] = [id];
  });
  for (let c = 0; c < 8; c++) {
    const id = `${p}p${c}`;
    pieces.push({ kind: "piece", id, glyph: "♟", dark });
    setup[`r${pawnRank}c${c}`] = [id];
  }
  return { pieces, setup };
}

export function chessBoard(): BoardSpec {
  const dark = chessSide(true);
  const light = chessSide(false);
  return {
    id: "chess",
    title: "Шахматы",
    elements: [...dark.pieces, ...light.pieces],
    zones: [
      {
        id: "field",
        title: "доска",
        layout: { kind: "grid", cols: 8, rows: 8 },
        cell: { w: 76, h: 76 },
        background: "chessboard",
        policy: { onOccupied: "capture" }, // жертва — за борт (offboard-колонка справа)
        setup: { ...dark.setup, ...light.setup },
      },
    ],
    seats: { count: { fixed: 2 }, show: "none", swap: true },
    actions: [
      { id: "reset", label: "расставить", command: { t: "reset" } },
      { id: "turn", label: "ход сделан", command: { t: "turn" } },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Крестовый (описание владельца, BOARDS-DESIGN §5.2)
// ---------------------------------------------------------------------------------------------

const RANKS_36 = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;

function deck36(): { cards: ElementDef[]; ids: string[] } {
  const cards: ElementDef[] = [];
  for (const s of SUITS) for (const r of RANKS_36) cards.push({ kind: "card", id: `${r}${s}`, face: `${r}${s}` });
  return { cards, ids: cards.map((c) => c.id) };
}

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

// ---------------------------------------------------------------------------------------------
// Монополия
// ---------------------------------------------------------------------------------------------

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

export const BOARD_LIBRARY = {
  chess: chessBoard,
  krestovyi: krestovyiBoard,
  monopoly: monopolyBoard,
} as const;

export type BoardLibraryId = keyof typeof BOARD_LIBRARY;
