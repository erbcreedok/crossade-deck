// ПАМЯТЬ СТОЛА — то, что помнит внимательный игрок, а со стола уже не считать.
//
// Карты на столе видит каждый; помнить, что Боря дважды не побил крести и ни разу не потратил
// козырь, — это и есть игра. Такое из физики не прочесть: оно накапливается ходами, и поэтому
// живёт здесь, а не в `Board`.
//
// СЧИТАЕТ СЕРВЕР, ЧИСЛАМИ. Мозгам — и скриптовым, и языковым — отдаётся готовое: они плохо считают,
// и заставлять их выводить «сколько червей уже вышло» из списка ходов значит платить за ошибки.
//
// Чистый модуль: входит история ходов, выходит сводка. Ни стола, ни сети, ни часов.

import type { Face } from "../contract.js";
import { isJoker, TRUMP } from "./krest.js";

/** Ход, каким его запомнил стол. `card` у взятия — та, что поднята из круга. */
export interface Deed {
  who: string;
  how: "laid" | "taken";
  card: Face;
  /** Что лежало сверху, когда он клал: по этому видно, чем он бил. */
  over?: Face;
  /** Закрылся ли круг этим ходом. */
  closed?: boolean;
}

/** Что известно про одного игрока. */
export interface Known {
  /** Сколько карт у него сейчас — считается по столу, а не отсюда. */
  cards: number;
  /** Сколько раз брал из круга: берёт часто — рука слабая. */
  took: number;
  /** Масти, которых у него заведомо нет старше названной карты: он не побил, когда мог бы. */
  lacks: { suit: Face["suit"]; over: Face }[];
  /** Бил ли он козырем хоть раз. Не бил — либо бережёт, либо нет. */
  spentTrump: boolean;
  /** Клал ли крести: в этой игре они бьются только крестями, и это важнее прочего. */
  laidClubs: boolean;
  /** Ходил ли джокером. */
  laidJoker: boolean;
}

export interface Facts {
  /** По стулу. */
  who: Readonly<Record<string, Known>>;
  /** Что уже вышло из игры — по мастям, сколько карт видано. */
  seen: Readonly<Record<string, number>>;
  /** Сколько козырей уже показано за столом. */
  trumpsSeen: number;
  /** Сколько джокеров показано. Всего их два. */
  jokersSeen: number;
  /** Сколько шестёрок показано: шестёрка бьёт джокера, и счёт им ведут отдельно. */
  sixesSeen: number;
}

const empty = (): Known => ({ cards: 0, took: 0, lacks: [], spentTrump: false, laidClubs: false, laidJoker: false });

/**
 * СВЕСТИ ИСТОРИЮ В СВОДКУ.
 *
 * @param deeds ходы партии по порядку
 * @param cards сколько карт у кого сейчас — со стола, потому что админ мог выдать карту руками
 */
export function krestMemory(deeds: readonly Deed[], cards: Readonly<Record<string, number>>): Facts {
  const who: Record<string, Known> = {};
  const seen: Record<string, number> = {};
  let trumpsSeen = 0;
  let jokersSeen = 0;
  let sixesSeen = 0;
  const mine = (key: string): Known => (who[key] ??= empty());

  for (const deed of deeds) {
    const one = mine(deed.who);
    if (deed.how === "taken") {
      one.took += 1;
      // ВЗЯЛ, А СВЕРХУ ЛЕЖАЛО ВОТ ЭТО — значит побить было нечем. Самый ценный вывод за столом.
      if (deed.over !== undefined) one.lacks.push({ suit: deed.over.suit, over: deed.over });
      continue;
    }
    seen[deed.card.suit] = (seen[deed.card.suit] ?? 0) + 1;
    if (isJoker(deed.card)) {
      jokersSeen += 1;
      one.laidJoker = true;
    } else {
      if (deed.card.suit === TRUMP) {
        trumpsSeen += 1;
        // Козырь СЧИТАЕТСЯ потраченным только когда им били: открыть круг козырем — другое дело.
        if (deed.over !== undefined) one.spentTrump = true;
      }
      if (deed.card.suit === "c") one.laidClubs = true;
      if (deed.card.rank === "6") sixesSeen += 1;
    }
  }
  for (const [key, count] of Object.entries(cards)) mine(key).cards = count;
  return { who, seen, trumpsSeen, jokersSeen, sixesSeen };
}

/** Есть ли у этого игрока заведомая дыра под эту карту: он уже не побил такую же или старше. */
export function lacksAgainst(facts: Facts, key: string, over: Face): boolean {
  const known = facts.who[key];
  if (!known) return false;
  return known.lacks.some((hole) => hole.suit === over.suit && rankAtMost(over, hole.over));
}

const ORDER = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const rankAtMost = (card: Face, than: Face): boolean => ORDER.indexOf(card.rank) <= ORDER.indexOf(than.rank);
