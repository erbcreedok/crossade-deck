// ТЕНЬ ПАРТИИ КРЕСТОВОГО — кто сейчас ходит, что ему можно, и что случилось после его хода.
//
// ТЕНЬ НЕ ХРАНИТ КАРТЫ. Руки и круг лежат на СТОЛЕ, и стол — единственная правда о них: админ волен
// переложить что угодно руками, вернуть карту в круг, отдать соседу, снять лок. Пока партия держала
// свою копию рук, любая такая правка разводила её со столом навсегда, и разойдясь однажды, она
// начинала судить по выдуманному столу. Поэтому здесь остаётся только то, чего на столе не видно:
// чья очередь, каким был порог круга, кто его закрыл, кто уже вышел.
//
// Чистота при этом не теряется: стол входит аргументом (`Board`), а не читается изнутри, — вся
// партия по-прежнему проверяется таблицей случаев за миллисекунду, без стола, сети и часов.
//
// ГЛАВНОЕ, ЧТО ЗДЕСЬ ЛЕГКО СДЕЛАТЬ НЕВЕРНО: игрок с пустой рукой ВНУТРИ незакрытого круга остаётся
// участником этого круга. Очередь до него доходит, бить ему нечем, и он поднимает нижнюю — снова с
// картами. Именно на этом держится трудность выигрыша, и именно это ломается первым, если считать
// «пустая рука — значит вышел».

import type { Face } from "../contract.js";
import { beats, closed, firstMover, nextOpener, top, type Circle } from "./krest.js";

/** Что тень помнит. Ничего из этого на столе не написано — потому и помнит. */
export interface Match {
  /** Кто ещё в партии, в порядке хода. Вышедшие отсюда убраны. */
  ring: readonly string[];
  /** Чей ход. `null` — партия кончена. */
  turn: string | null;
  /** Кто закрыл последний круг — у него живой грип кольца. */
  closer: string | null;
  /**
   * Сколько игроков имели карты, когда нынешний круг начинался. `0` — круга нет, его ещё откроют.
   * Внутри круга не меняется, даже если кто-то опустошил руку: в этом вся трудность выигрыша.
   */
  threshold: number;
  /**
   * С КАКОГО МЕСТА В КОЛЬЦЕ НАЧАЛСЯ НЫНЕШНИЙ КРУГ. Карты ниже — прошлые круги: их закрывший ещё не
   * сгрёб, и они лежат в том же кольце.
   *
   * Без этого числа тень считала кругом ВСЮ кучу. Несгребённых карт быстро становилось больше, чем
   * игроков, — и круг оказывался закрытым всегда: положил, круг «закрыт», открываешь снова ты же,
   * снова закрыт… За живой партией это выглядело так, что один бот выкладывает восемь карт подряд,
   * а остальные не ходят вовсе.
   *
   * На столе этого не написано — обе кучи лежат в одном кольце, — потому и помнит тень.
   */
  opened: number;
  /** Вышедшие, в порядке выхода: первый — первый победитель. */
  out: readonly string[];
  /** Кто раздавал эту партию. Партия кончилась — раздаёт проигравший. */
  dealer: string | null;
  /** Проигравший: последний оставшийся с картами. Партия идёт — `null`. */
  loser: string | null;
}

/** СТОЛ СЕЙЧАС — то, что тень перечитывает перед каждым ответом. */
export interface Board {
  /** Руки по стульям. Кого нет в списке — у того пусто. */
  hands: Readonly<Record<string, readonly Face[]>>;
  /** Круг снизу вверх: `circle[0]` — нижняя, последняя — верхняя. */
  circle: readonly Face[];
  /**
   * СТУЛЬЯ ПО КРУГУ СТОЛА — в том же порядке, в каком по ним идёт раздача.
   *
   * Без этого очередь шла по ИМЕНАМ стульев (`c3, c4, c5, c6`), а имена к рассадке отношения не
   * имеют: стулья двигают, пересаживают, добавляют. За живой партией ход метался через стол —
   * «шесть часов → двенадцать → три → девять» — и понять его было нельзя.
   */
  order: readonly string[];
}

export type Move = { t: "lay"; id: string } | { t: "take" };
export type Refusal = "не-твой-ход" | "не-бьёт" | "нечего-брать" | "партия-кончена" | "круг-надо-открыть";

const handOf = (board: Board, who: string): readonly Face[] => board.hands[who] ?? [];
const withCards = (board: Board, ring: readonly string[]): string[] => ring.filter((p) => handOf(board, p).length > 0);

/** КАРТЫ НЫНЕШНЕГО КРУГА — без тех, что закрывший ещё не сгрёб. */
export const liveCircle = (m: Match, board: Board): readonly Face[] => board.circle.slice(m.opened);

/** Круг таким, каким его видит `krest.ts`: карты нынешнего круга, порог из памяти. */
const circleOf = (m: Match, board: Board): Circle | null => {
  const table = liveCircle(m, board);
  return m.threshold === 0 && table.length === 0 ? null : { table, threshold: m.threshold };
};

/** Начало партии: ходит тот, у кого шестёрка буби, иначе раздающий. */
export function start(board: Board, dealer: string | null): Match {
  // КОЛЬЦО — ПО РАССАДКЕ, а не по именам стульев: очередь обходит стол, а не скачет по нему.
  const ring = board.order.filter((who) => handOf(board, who).length > 0);
  return {
    ring,
    turn: firstMover(board.hands as Record<string, readonly Face[]>) ?? dealer ?? ring[0] ?? null,
    closer: null,
    threshold: 0,
    opened: board.circle.length,
    out: [],
    dealer,
    loser: null,
  };
}

/** Следующий по кругу за этим. Его самого в кольце нет — берём начало. */
const after = (ring: readonly string[], who: string): string | null => {
  if (ring.length === 0) return null;
  const i = ring.indexOf(who);
  return i === -1 ? (ring[0] ?? null) : (ring[(i + 1) % ring.length] ?? null);
};

/**
 * МОЖНО ЛИ ЭТОТ ХОД — по столу, каким он стоит СЕЙЧАС.
 *
 * Отказ здесь не отнимает карту у человека: стол крестового по-прежнему никого не судит
 * (`krestDesk.says`). Это ответ для того, кто спрашивает ДО хода, — подсказки экрана и боты.
 */
export function may(m: Match, board: Board, who: string, mv: Move, faceOf: (id: string) => Face | undefined): true | { refused: Refusal } {
  if (m.turn === null) return { refused: "партия-кончена" };
  if (who !== m.turn) return { refused: "не-твой-ход" };
  if (mv.t === "take") {
    if (m.threshold === 0) return { refused: "круг-надо-открыть" };
    return liveCircle(m, board).length === 0 ? { refused: "нечего-брать" } : true;
  }
  const face = faceOf(mv.id);
  if (face === undefined) return { refused: "не-бьёт" };
  const live = liveCircle(m, board);
  const over = live[live.length - 1];
  if (m.threshold === 0 || over === undefined) return true;
  return beats(face, over) ? true : { refused: "не-бьёт" };
}

/**
 * ХОД УЖЕ СЛУЧИЛСЯ НА СТОЛЕ — сдвинуть тень. `board` здесь ПОСЛЕ хода: тень идёт следом за столом,
 * а не ведёт его.
 *
 * `how`: `laid` — карта легла в круг, `taken` — нижняя ушла в руку ходившего.
 */
export function advance(m: Match, board: Board, who: string, how: "laid" | "taken"): Match {
  // КРУГ ОТКРЫЛСЯ ЭТИМ ХОДОМ — порог берётся один раз и держится до закрытия. Положивший считается
  // имевшим карты, даже если положил последнюю: он участник круга, который сам и открыл.
  const открыт = how === "laid" && m.threshold === 0;
  const threshold = открыт ? new Set([...withCards(board, m.ring), who]).size : m.threshold;
  // КРУГ ОТКРЫЛСЯ ЭТОЙ КАРТОЙ — значит он начинается с неё, а всё, что лежало ниже, прошлое.
  const grown: Match = { ...m, threshold, ...(открыт ? { opened: Math.max(0, board.circle.length - 1) } : {}) };
  const circle = circleOf(grown, board);
  if (circle === null || !closed(circle)) return { ...grown, turn: after(m.ring, who) };

  // КРУГ ЗАКРЫТ. Сгребает тот, кто его закончил; следующий круг открывает он же, а если стол
  // разобрали — следующий за последним взявшим: сам взявший только что набрал руку.
  const left = withCards(board, m.ring);
  const gone = m.ring.filter((p) => handOf(board, p).length === 0);
  const opener = nextOpener(how === "laid" ? { by: "laid", who } : { by: "taken", who }, m.ring);
  // ЗАКРЫТЫЙ КРУГ ОСТАЁТСЯ ЛЕЖАТЬ, пока закрывший его не сгребёт руками. Граница переедет сама,
  // когда откроется следующий: она считается от того, что в кольце на тот миг.
  const shut: Match = { ...grown, threshold: 0, ring: left, out: [...m.out, ...gone], closer: who };

  // Партия кончается, когда с картами остался один: он проигравший и он же раздаёт следующую.
  if (left.length <= 1) return { ...shut, turn: null, loser: left[0] ?? null, dealer: left[0] ?? m.dealer };
  const turn = opener !== null && left.includes(opener) ? opener : after(left, opener ?? left[0]!);
  return { ...shut, turn: turn ?? left[0]! };
}

/** Что этот игрок может прямо сейчас — по этому стол зажигает зоны и подсказки, и из этого же выбирает бот. */
export function allowed(m: Match, board: Board, who: string): { lay: Face[]; take: boolean } {
  if (m.turn !== who) return { lay: [], take: false };
  const hand = handOf(board, who);
  if (m.threshold === 0) return { lay: [...hand], take: false };
  const circle = circleOf(m, board);
  const over = circle === null ? undefined : top(circle);
  return { lay: over === undefined ? [...hand] : hand.filter((f) => beats(f, over)), take: liveCircle(m, board).length > 0 };
}
