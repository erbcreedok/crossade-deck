// ВНЕШНИЙ ИГРОК — агент, который садится за стол через MCP и ходит, как человек.
//
// Он не бот стола: своего мозга у комнаты для него нет, и толчок по тишине его не касается. Он
// СПРАШИВАЕТ стол («что видно», «что можно») и СХОДИТ, когда решит. Всё остальное — те же двери, те
// же отказы, тот же журнал.
//
// ЧУЖИХ КАРТ ЕМУ НЕ ВИДНО ПО ТОЙ ЖЕ ПРИЧИНЕ, ЧТО И БОТУ: он получает `BotView`, где их нет. Внешний
// игрок со зрением сквозь рубашку не соперник, а испорченная партия.

import type { BotView, Move } from "./brain.js";
import { moveSays } from "./say.js";

/** Что внешний игрок видит, спросив стол. */
export interface Looked {
  /** Чей сейчас ход — ключ человека или бота. */
  turn: string | null;
  /** Мой ли это ход. */
  mine: boolean;
  /** Стол моими глазами. Не мой ход или партии нет — `null`. */
  view: BotView | null;
  /** Что я могу сделать, с номерами: их и называют в `play`. */
  moves: { n: number; says: string }[];
}

/** Чем ответил стол на попытку сходить. */
export type Played =
  | { ok: true; did: string }
  | { ok: false; why: "not-your-turn" | "no-such-move" | "no-match" | "refused"; says: string };

/** Собрать ответ на «посмотреть»: одно место, чтобы MCP и HTTP говорили одинаково. */
export function looked(turn: string | null, mine: boolean, legal: readonly Move[], view: BotView | null): Looked {
  return {
    turn,
    mine,
    view: mine ? view : null,
    moves: mine ? legal.map((one, i) => ({ n: i + 1, says: moveSays(one) })) : [],
  };
}

/**
 * КАКОЙ ХОД ОН НАЗВАЛ. Номер из списка — и никак иначе: имена карт агент пишет по-своему, а номер
 * не даёт ошибиться ни ему, ни нам.
 */
export function chosen(legal: readonly Move[], n: unknown): Move | null {
  return Number.isInteger(n) && (n as number) >= 1 && (n as number) <= legal.length ? legal[(n as number) - 1]! : null;
}
