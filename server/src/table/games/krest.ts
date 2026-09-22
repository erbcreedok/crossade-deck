// КРЕСТОВЫЙ ДУРАК («мастодонт») — ПРАВИЛА, и ничего кроме.
//
// Здесь нет ни стола, ни сети, ни отрисовки: входят карты и состояние круга, выходит ответ. Поэтому
// вся игра проверяется таблицей случаев, а не глазами, и поэтому же в рантайме стола не появляется
// ни одного `if (крестовый)` — стол получает отсюда `DeskRules` и работает с ними, как с любыми.
//
// ЧТО В ЭТОЙ ИГРЕ СВОЕГО (остальное — обычный дурак):
//   1. Крести бьются ТОЛЬКО крестями: козырь их не берёт.
//   2. Джокер бьёт любую карту, даже другого джокера; джокером можно открыть круг.
//   3. Любая шестёрка бьёт джокера.
// Козырь всегда буби и не выбирается.

import type { Face } from "../contract.js";
import { SANDBOX, type DeskAsk, type DeskRules, type Move } from "../rules.js";
import { no, yes, type Key, type Verdict } from "../access.js";

/** Козырь этой игры. Не настройка: в мастодонте он всегда буби. */
export const TRUMP = "d" as const;

/** Старшинство внутри масти. Джокеры сюда не входят: у них свой закон. */
const ORDER = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];

export const isJoker = (face: Face): boolean => face.suit === "r" || face.suit === "b";
const isSix = (face: Face): boolean => face.rank === "6";

/**
 * БЬЁТ ЛИ `card` КАРТУ `over` — единственное место, где живёт старшинство этой игры.
 *
 * Порядок проверок важен и повторяет порядок законов: сперва шестёрка на джокере (иначе джокер
 * съел бы её как «любую карту»), потом сам джокер, потом крести, и только затем обычный дурак.
 */
export function beats(card: Face, over: Face): boolean {
  // ЛЮБАЯ ШЕСТЁРКА БЬЁТ ДЖОКЕРА — закон сильнее джокерского, поэтому стоит первым.
  if (isJoker(over)) return isSix(card) || isJoker(card);
  // ДЖОКЕР БЬЁТ ЛЮБУЮ КАРТУ. Обратное («чем бить джокера») уже решено строкой выше.
  if (isJoker(card)) return true;
  // КРЕСТИ — ТОЛЬКО КРЕСТЯМИ: козырь их не берёт, и это главное отличие игры от обычного дурака.
  if (over.suit === "c") return card.suit === "c" && higher(card, over);
  if (card.suit === over.suit) return higher(card, over);
  return card.suit === TRUMP;
}

const higher = (card: Face, over: Face): boolean => ORDER.indexOf(card.rank) > ORDER.indexOf(over.rank);

/** Кто ходит первым в партии: у кого шестёрка буби. Ни у кого — первым ходит раздающий. */
export const firstMover = (hands: Record<string, readonly Face[]>): string | null =>
  Object.keys(hands).find((who) => hands[who]!.some((f) => f.suit === TRUMP && isSix(f))) ?? null;

/**
 * КРУГ — то, что живёт от первой положенной карты до закрытия.
 *
 * `threshold` берётся ОДИН раз, при старте: сколько игроков имели карты в этот момент. Внутри круга
 * он не меняется, даже если кто-то остался с пустыми руками, — именно в этом вся трудность выигрыша.
 */
export interface Circle {
  /** Карты на столе снизу вверх: `table[0]` — нижняя, последняя — верхняя. */
  table: readonly Face[];
  /** Сколько игроков имели карты, когда круг начинался. */
  threshold: number;
}

export const openCircle = (first: Face, withCards: number): Circle => ({ table: [first], threshold: withCards });

/**
 * ЗАКРЫЛСЯ ЛИ КРУГ. Два случая, и порог — тот, что взят при старте.
 *
 * Стола не осталось вовсе — разобрали; карт стало ровно по числу игроков, начинавших круг с
 * картами, — набралось. Больше порога быть не может: после каждой положенной карты смотрят сюда.
 */
export const closed = (circle: Circle): boolean => circle.table.length === 0 || circle.table.length >= circle.threshold;

/** Верхняя карта — её и бьёт следующий. Стол пуст — бить нечего. */
export const top = (circle: Circle): Face | undefined => circle.table[circle.table.length - 1];

/** Нижняя карта — её забирает тот, кому нечем бить. Она же точка отсчёта кольца. */
export const bottom = (circle: Circle): Face | undefined => circle.table[0];

/** Положить карту поверх: круг растёт. Бьёт ли она — спрашивают отдельно (`beats`). */
export const lay = (circle: Circle, card: Face): Circle => ({ ...circle, table: [...circle.table, card] });

/** Забрать НИЖНЮЮ. Верхняя остаётся, и бить её должен уже следующий за взявшим. */
export const takeBottom = (circle: Circle): { circle: Circle; card: Face | undefined } => ({
  circle: { ...circle, table: circle.table.slice(1) },
  card: circle.table[0],
});

/** Чем закрылся круг: положенной картой или тем, что стол разобрали. */
export type CircleEnd = { by: "laid"; who: string } | { by: "taken"; who: string };

/**
 * КТО НАЧИНАЕТ СЛЕДУЮЩИЙ КРУГ.
 *
 * Закрыт положенной картой — начинает тот, кто её положил. Закрыт тем, что стол разобрали —
 * начинает СЛЕДУЮЩИЙ по кругу за последним взявшим: сам взявший только что набрал руку.
 */
export function nextOpener(end: CircleEnd, ring: readonly string[]): string | null {
  if (ring.length === 0) return null;
  if (end.by === "laid") return ring.includes(end.who) ? end.who : (ring[0] ?? null);
  const i = ring.indexOf(end.who);
  return i === -1 ? (ring[0] ?? null) : (ring[(i + 1) % ring.length] ?? null);
}

/**
 * КТО ВЫШЕЛ. Только по ЗАКРЫТИИ круга и только с пустыми руками: игрок, опустошивший руку посреди
 * круга, из него не выходит — очередь до него дойдёт, и нечем бить он поднимет нижнюю.
 */
export const leaving = (hands: Record<string, readonly Face[]>): string[] => Object.keys(hands).filter((who) => hands[who]!.length === 0);

/** Проигравший — последний оставшийся с картами. Он же станет раздающим. */
export function loser(hands: Record<string, readonly Face[]>): string | null {
  const left = Object.keys(hands).filter((who) => hands[who]!.length > 0);
  return left.length === 1 ? left[0]! : null;
}

/** Id зоны-кольца в середине сукна. Колоды в этой игре нет, и её место занимает кольцо. */
export const RING = "ring";

/**
 * СТОЛ МАСТОДОНТА — тот же стол, другой конфиг.
 *
 * Кольцо — обычная зона с позой `ring` (`zones`), а не особый случай в отрисовке. Грип живой только
 * у админа и у того, кто ЗАКРЫЛ круг: сгребает тот, кто его закончил.
 */
export function krestDesk(judge: () => { turn: string | null; closer: string | null } | null = () => null): DeskRules {
  return {
    ...SANDBOX,
    kind: "крестовый",
    crew: "krest",
    zones: [{ id: RING, name: "Круг хода", x: 0, y: 0, pose: "ring", forever: true }],
    // КОЛОДЫ В ЭТОЙ ИГРЕ НЕТ КАК МЕСТА: её раздают всю, и пустой контур посреди сукна только мешает.
    deckForever: false,
    // За крестовым столом раздают только по-крестовому.
    deals: ["krest"],
    /**
     * ЧТО ЭТА ИГРА ГОВОРИТ ПРО ХОД. Один ответ на все ключи — и ни одного своего метода.
     *
     * СЕЙЧАС ОНА НЕ ГОВОРИТ НИЧЕГО. Судейство снято целиком — ни очереди, ни старшинства: стол
     * крестового это песочница с удобным кругом посреди сукна, и карты в ней кладут руками, как за
     * настоящим столом.
     *
     * Снято НАРОЧНО и по живой игре: втроём набралось 36 отказов за партию, и каждый выглядел
     * поломкой — человек вёл карту в круг, а она возвращалась. Судья, который спорит с рукой, хуже
     * отсутствия судьи: за настоящим столом никто не отнимает карту со словами «не твой ход».
     *
     * Правила ждут своего часа и вернутся вместе с режимом игры без читерства — тем самым, где стол
     * СУДИТ, а не подсказывает. Что именно вернётся, записано ниже; ничего из этого не потеряно.
     *
     *   • БЬЁТ ЛИ (`card.cover`): своё старшинство этой игры — `beats(one, under)`.
     *   • В КОЛЬЦО КЛАДЁТ ТОЛЬКО ТОТ, ЧЕЙ ХОД: `move.by === judge().turn`.
     *   • КТО СГРЕБАЕТ КОЛЬЦО: только закрывший круг.
     *
     * Структурное — не судейство и остаётся: круг принимает карты ПО ОДНОЙ (охапка стёрла бы его
     * смысл), а охапку в руку принимает только крупье (рука в этой игре — счёт, и стопка одним
     * движением его стирает).
     */
    says(_ask: DeskAsk, _key: Key, move: Move): Verdict {
      // В КРУГ КЛАДУТ ПО ОДНОЙ КАРТЕ. Круг — это ход, а не стопка.
      if (move.whole === true && move.at?.in === "deck" && move.at.pile === RING) return no("full");
      // ОХАПКУ КАРТ ПРИНИМАЕТ ТОЛЬКО РУКА КРУПЬЕ.
      if (move.whole === true && move.at?.in === "hand") {
        return _ask.croupier(move.at.chair ?? "") ? yes : no("not-yours");
      }
      return yes;
    },
  };
}

