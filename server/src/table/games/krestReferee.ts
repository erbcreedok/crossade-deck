// СУДЬЯ КРЕСТОВОГО — обёртка над тенью партии (`match.ts`): переводит жесты стола в ходы партии.
//
// СУДЬЯ СМОТРИТ НА КРУГ. Круг хода — основа игры: по нему видно, чем бьют, что осталось и чей ход
// следующий. Поэтому ход здесь — это ИЗМЕНЕНИЕ КРУГА, и ничего кроме: карта из своей руки в круг
// (`lay`) или из круга в свою руку (`take`).
//
// Всё остальное, что делают со столом руками (админ вернул карту, дал игроку недостающую, переложил
// из чужой руки, человек поправил карты у себя в руке), — УБОРКА: круг от неё не меняется, значит и
// очередь стоит. Сюда же сбор и возврат круга крупье: крупье не игрок и не ходит.
//
// И судья НЕ СПОРИТ СО СТОЛОМ. Сходил не тот, кого ждали, — значит ждали неверно: карта уже в круге,
// её видят все, отменить её нечем. Очередь переезжает к тому, кто сходил на самом деле. Однажды
// судья спорил — и круг на столе разошёлся с кругом в его памяти на всю партию.

import type { DealDir, Face, Intent, Play, Where } from "../contract.js";
import type { Referee, Seats } from "../referee.js";
import { RING } from "./krest.js";
import { advance, allowed, start, type Board, type Match } from "./match.js";
import type { Deed } from "./krestMemory.js";
import { botView, legalMoves } from "../bots/view.js";

const ownerOf = (seats: Seats, chair: string | null): string | null => (chair === null ? null : (seats.chairs.find((c) => c.id === chair)?.owner ?? null));

/** СТОЛ ГЛАЗАМИ ТЕНИ — читается заново перед каждым ответом, ни одна карта не кэшируется. */
/**
 * СТУЛЬЯ ПО КРУГУ СТОЛА, в сторону раздачи.
 *
 * Угол стула считается от шести часов ПО ЧАСОВОЙ, и по-настоящему по часовой стол обходят, УБЫВАЯ
 * по этому углу: шесть → девять → двенадцать → три. Против часовой — наоборот.
 */
const seatOrder = (seats: Seats, dir: DealDir): string[] =>
  seats.chairs
    .filter((chair) => !chair.croupier)
    .slice()
    .sort((a, b) => (dir === "ccw" ? a.angle - b.angle : b.angle - a.angle))
    .map((chair) => chair.id);

function boardOf(seats: Seats, dir: DealDir = "cw"): Board {
  const hands: Record<string, readonly Face[]> = {};
  for (const chair of seats.chairs) {
    if (chair.croupier) continue;
    hands[chair.id] = chair.hand.map((id) => seats.faceOf(id)).filter((f): f is Face => f !== undefined);
  }
  const circle = seats.pile(RING).map((id) => seats.faceOf(id)).filter((f): f is Face => f !== undefined);
  return { hands, circle, order: seatOrder(seats, dir) };
}

export function krestReferee(): Referee {
  let match: Match | null = null;
  // ИСТОРИЯ ХОДОВ — единственное, что судья копит сверх тени. Со стола её не прочесть: карты
  // показывают, что лежит, а не кто чем бил и кто брал, не сумев побить.
  let deeds: Deed[] = [];
  /**
   * В какую сторону раздали — туда же идёт и очередь. Нужна ровно при постройке кольца: дальше
   * порядок живёт в самой тени, и слепку эта сторона не нужна.
   */
  let way: DealDir = "cw";
  return {
    start(seats, dealer, dir = "cw") {
      // СТОРОНА ЗАПОМИНАЕТСЯ НА ВСЮ ПАРТИЮ: раздали один раз, а стол перечитывается перед каждым
      // ответом, и без памяти очередь на втором круге пошла бы по умолчанию.
      way = dir;
      const board = boardOf(seats, way);
      deeds = [];
      match = Object.values(board.hands).filter((h) => h.length > 0).length > 1 ? start(board, dealer) : null;
    },
    stop() {
      match = null;
      deeds = [];
    },
    follow(seats, by, intent: Intent, from = null) {
      if (match === null || intent.t !== "drop") return false;
      const chair = seats.chairs.find((c) => c.owner === by);
      // КРУПЬЕ НЕ ХОДИТ. Он собирает круг и возвращает его — это уборка стола, а не ход партии,
      // сколько бы карт при этом ни уехало из круга.
      if (!chair || chair.croupier) return false;

      // ХОД — ЭТО ИЗМЕНЕНИЕ КРУГА, и ничего больше. Круг — основа игры: по нему видно, чем бьют и
      // что осталось, и только он решает, случился ход или нет.
      //
      // Судят ОБА КОНЦА жеста. Пока смотрели на один («куда легла карта»), ходом становилось любое
      // движение в свою руку — и первой под это попала самая частая привычка за столом: человек
      // поправляет карты в собственной руке, ожидая очереди. Судья закрывал на этом круг, уводил
      // очередь, а настоящий ход потом отвергал как чужой — и тень расходилась со столом навсегда.
      const вКруг = (w: Where | null): boolean => w?.in === "deck" && w.pile === RING;
      const вРуку = (w: Where | null): string | null => (w?.in === "hand" ? w.chair : null);
      const laid = вКруг(intent.to) && вРуку(from) === chair.id && seats.faceOf(intent.id) !== undefined;
      const took = вКруг(from) && вРуку(intent.to) === chair.id;
      if (!laid && !took) return false;

      // ЧТО ЛЕЖАЛО СВЕРХУ ДО ХОДА — по этому потом видно, чем он бил и чего у него не было. Круг
      // уже изменился, поэтому верх считается обратным ходом: положил — предпоследняя, взял — верхняя.
      const circle = boardOf(seats, way).circle;
      const card = seats.faceOf(intent.id);
      const over = laid ? circle[circle.length - 2] : circle[circle.length - 1];
      // ТЕНЬ ИДЁТ ЗА СТОЛОМ, А НЕ СПОРИТ С НИМ. Сходил не тот, кого ждали, — значит ждали неверно:
      // карта уже в круге, все её видят, и отменить её судье нечем. Очередь переезжает к тому, кто
      // сходил на самом деле, и партия остаётся цела. Спор здесь стоил бы ровно того же, чем уже
      // кончился однажды: круг на столе один, а у судьи другой.
      const идёт: Match = chair.id === match.turn ? match : { ...match, turn: chair.id };
      match = advance(идёт, boardOf(seats, way), chair.id, laid ? "laid" : "taken");
      if (card !== undefined) deeds.push({ who: chair.id, how: laid ? "laid" : "taken", card, ...(over === undefined ? {} : { over }) });
      return true;
    },
    view(seats) {
      if (match === null) return null;
      const out = match.out.map((chair) => ownerOf(seats, chair)).filter((one): one is string => one !== null);
      return { turn: ownerOf(seats, match.turn), closer: ownerOf(seats, match.closer), out };
    },
    play(seats, viewer): Play | null {
      if (match === null) return null;
      const seat = seats.chairs.find((c) => c.owner === viewer);
      const can = seat ? allowed(match, boardOf(seats, way), seat.id) : { lay: [], take: false };
      // Тень говорит лицами карт, а экран знает их по id — переводим здесь, у самой руки.
      const left = [...can.lay];
      const lay: string[] = [];
      for (const id of seat?.hand ?? []) {
        const face = seats.faceOf(id);
        const at = face === undefined ? -1 : left.findIndex((one) => one.rank === face.rank && one.suit === face.suit);
        if (at !== -1) {
          left.splice(at, 1);
          lay.push(id);
        }
      }
      return { turn: ownerOf(seats, match.turn), closer: ownerOf(seats, match.closer), lay, take: can.take, loser: ownerOf(seats, match.loser) };
    },
    told() {
      return match === null ? { идёт: false } : { идёт: true, ход: match.turn, закрыл: match.closer, порог: match.threshold, вышли: [...match.out] };
    },
    dump() {
      // Слепок несёт и историю: после перезапуска бот должен помнить партию, а не сесть за стол заново.
      //
      // СТОРОНЫ ЗДЕСЬ НЕТ НАРОЧНО. Она нужна ровно один раз — когда строится кольцо; дальше порядок
      // живёт в самой тени (`Match.ring`) и переживает перезапуск вместе с ней. Записать сторону
      // ещё и сюда значило бы завести второй источник правды об одном и том же.
      return match === null ? null : { match, deeds };
    },
    load(kept) {
      if (!kept || typeof kept !== "object") {
        match = null;
        deeds = [];
        return;
      }
      // Старые слепки — это сама тень без истории; новые — пара. Разбираем оба, чтобы рестор не падал.
      const pair = kept as { match?: Match; deeds?: Deed[] };
      match = (pair.match ?? (kept as Match)) || null;
      deeds = pair.deeds ?? [];
    },
    bot(seats, chair) {
      if (match === null || match.turn !== chair) return null;
      const legal = legalMoves(seats, match, chair);
      return legal.length === 0 ? null : { legal, view: botView(seats, match, chair, deeds) };
    },
  };
}
