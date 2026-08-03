// ШАХМАТЫ — контраст каркасу: не-карточная борда, константные места, адресный грид,
// capture с выносом за борт. Правил ходов нет (смарт-мок): фигуры двигаются как угодно.

import type { BoardSpec, ElementDef } from "../spec";

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
