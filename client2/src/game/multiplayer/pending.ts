// ОЖИДАНИЕ ОДОБРЕНИЯ — правила «карта висит, пока сервер не ответил», чистая логика без Pixi.
//
// Зачем: дроп на этом столе — команда серверу, а не локальный ход. Без ожидания drag.release()
// возвращал карту ДОМОЙ, и при заметной задержке она успевала долететь до руки и только потом
// прыгала в зону — читалось как «не приняли, а потом передумали». Правильная картина: карта
// остаётся В ТОЧКЕ ДРОПА в поднятой позе (дыхание сохраняется — поза lifted дышит сама, см.
// ui/Card.ts#idleBobs), а затянувшийся запрос помечается индикатором — чтобы человек знал, что
// идёт запрос, а не «карта зависла».
//
// Исходы ожидания:
//   • одобрено — карта появилась в целевой зоне снимка (approvedIn), сцена кладёт её как обычно;
//   • отказ — action_rejected несёт карту (rejectedCards): «стоп»-покачивание и домой;
//   • молчание — PENDING_TIMEOUT_S (сервер умер): то же, что отказ, плюс надпись.

export type PendingKind = "play_card" | "take_play" | "discard_card" | "take_discard";

/** Кусок снимка, по которому решается одобрение — не весь CrossadeState, а ровно три зоны. */
export interface PendingZones {
  play: readonly (readonly string[])[];
  discard: readonly string[];
  selfHand: readonly string[];
}

/** Ход одобрен, когда карта ПОЯВИЛАСЬ там, куда просилась: мастер применяет сообщение атомарно,
 *  так что эхо-снимок уже несёт её в целевой зоне. Проверять «ушла из исходной» нельзя — при
 *  отказе она тоже никуда не уходила, а при одобрении исходная зона меняется тем же снимком. */
export function approvedIn(kind: PendingKind, card: string, zones: PendingZones): boolean {
  if (kind === "play_card") return zones.play.some((stack) => stack.includes(card));
  if (kind === "discard_card") return zones.discard.includes(card);
  return zones.selfHand.includes(card);
}

/** Какие из ожидающих карт задел отказ. action_rejected адресный (мастер шлёт только автору),
 *  но карты в нём перечислены списком — фильтруем по своим ожиданиям. */
export function rejectedCards(signalCards: readonly string[], pending: Iterable<string>): string[] {
  const hit = new Set(signalCards);
  return [...pending].filter((c) => hit.has(c));
}

/** Через сколько секунд молчания запрос считается «затянувшимся» и получает индикатор
 *  (спиннер в точке касания + оверлей-притемнение карты). Быстрый ответ (локальный мастер без
 *  latency, хороший сокет) индикатора не заслуживает — мигание на каждый дроп читалось бы как
 *  нервный тик стола. */
export const PENDING_SLOW_AFTER_S = 0.4;
/** Скорость спиннера, рад/с (оборот ~0.9 с — быстрее читается как нервозность, медленнее — как зависание). */
export const PENDING_SPINNER_SPEED = (Math.PI * 2) / 0.9;
/** Молчание дольше этого — считаем, что ответа не будет: карта возвращается домой. */
export const PENDING_TIMEOUT_S = 5;

/** Пора ли показывать индикатор: до порога — рано, запрос ещё не «затянувшийся». */
export function pendingIndicatorVisible(elapsedS: number): boolean {
  return elapsedS >= PENDING_SLOW_AFTER_S;
}
