// БИБЛИОТЕКА БОРД — файл на игру, борда = данные (BOARDS-DESIGN §5). Новая игра = новый файл
// с одной фабрикой BoardSpec + строка здесь; движок не трогается.

import { chessBoard } from "./chess";
import { krestovyiBoard } from "./krestovyi";
import { monopolyBoard } from "./monopoly";
import { durakBoard } from "./durak";
import { belkaBoard } from "./belka";
import { unoBoard } from "./uno";
import { munchkinBoard } from "./munchkin";
import { pokerBoard } from "./poker";
import { dndBoard } from "./dnd";

export { chessBoard, krestovyiBoard, monopolyBoard, durakBoard, belkaBoard, unoBoard, munchkinBoard, pokerBoard, dndBoard };

export const BOARD_LIBRARY = {
  chess: chessBoard,
  krestovyi: krestovyiBoard,
  monopoly: monopolyBoard,
  durak: durakBoard,
  belka: belkaBoard,
  uno: unoBoard,
  munchkin: munchkinBoard,
  poker: pokerBoard,
  dnd: dndBoard,
} as const;

export type BoardLibraryId = keyof typeof BOARD_LIBRARY;
