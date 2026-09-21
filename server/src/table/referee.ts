// СУДЬЯ ПАРТИИ — то, что у игры есть сверх правил стола: очередь, кто закрыл круг, кто вышел.
//
// Комната про игру не знает. Она знает одно: у рода стола МОЖЕТ быть судья (`desks.ts`), и зовёт его
// в четырёх местах — раздали, сходили, спросили «что сейчас в игре», пишем слепок. Нет судьи — стол
// ведёт себя как песочница. Новая игра со своей партией — это новый судья в `games/`, и ни одной
// строки в комнате.
//
// Чистый модуль: судья видит стол только через `Seats` и ничего не меняет в нём сам.

import type { Face, Intent, Play } from "./contract.js";

/** Что судья видит на столе: стулья с руками и лицо любой карты. */
export interface Seats {
  chairs: readonly { id: string; owner: string | null; hand: readonly string[]; croupier?: true }[];
  faceOf(card: string): Face | undefined;
}

export interface Referee {
  /** Раздача кончилась — партия начинается с того, что легло в руки. `dealer` — стул раздавшего. */
  start(seats: Seats, dealer: string | null): void;
  /** Партии больше нет: сменили род стола. */
  stop(): void;
  /** Стол уже пропустил этот ход — догнать его. `true` — партия сдвинулась. */
  follow(seats: Seats, by: string, intent: Intent): boolean;
  /** Что правам нужно знать о партии — в ключах людей. Партии нет — `null`. */
  view(seats: Seats): { turn: string | null; closer: string | null } | null;
  /** Что сейчас в игре глазами этого человека. Партии нет — `null`. */
  play(seats: Seats, viewer: string): Play | null;
  /** Строка для журнала: как партия стоит сейчас. */
  told(): Record<string, unknown>;
  /** Партия как простое значение — в слепок комнаты и обратно. */
  dump(): unknown;
  load(kept: unknown): void;
}
