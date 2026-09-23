// КАК ОБЪЯСНИТЬ СТОЛ СЛОВАМИ — один раз, для всех языковых мозгов сразу.
//
// Модель не должна ни считать, ни вспоминать правила: всё посчитано (`krestMemory`), все законные
// ходы перечислены (`legalMoves`). От неё нужен ОДИН НОМЕР из списка. Чем короче вопрос, тем дешевле
// ход и тем реже ответ приходит не в том виде.
//
// Ответ разбирается терпимо: модель почти всегда добавляет слово от себя, и ронять из-за этого ход
// нельзя — первое число в ответе и есть выбор.

import type { Face } from "../contract.js";
import type { BotView, Move, Profile } from "./brain.js";

const SUITS: Record<string, string> = { s: "пик", h: "черв", d: "буби", c: "крест", r: "красный", b: "чёрный" };
const card = (f: Face): string => (f.suit === "r" || f.suit === "b" ? `джокер ${SUITS[f.suit]}` : `${f.rank} ${SUITS[f.suit] ?? f.suit}`);

/** Ход человеческими словами — так его называют за столом. */
export const moveSays = (move: Move): string => (move.t === "lay" ? `положить ${card(move.card)}` : `взять из круга ${card(move.card)}`);

/**
 * ВЕСЬ ВОПРОС МОДЕЛИ — стол, характер и пронумерованный список ходов.
 *
 * Чужих карт здесь нет и быть не может: всё берётся из `BotView`, где их нет (`bots/view.ts`).
 */
export function ask(legal: readonly Move[], view: BotView, profile: Profile): string {
  const круг = view.ring.length === 0 ? "пусто" : view.ring.map(card).join(", ");
  const рука = view.hand.map((one) => card(one.face)).join(", ") || "пусто";
  const соседи = view.others.map((one) => `${one.name}: ${one.cards} карт`).join("; ") || "никого";
  const память = [
    view.facts.trumpsSeen > 0 ? `козырей вышло ${view.facts.trumpsSeen}` : "",
    view.facts.jokersSeen > 0 ? `джокеров вышло ${view.facts.jokersSeen}` : "",
    ...Object.entries(view.facts.who)
      .filter(([, one]) => one.took > 0)
      .map(([who, one]) => `${who} брал из круга ${one.took} раз`),
  ].filter(Boolean).join("; ");

  return [
    "Ты играешь в крестового дурака (мастодонт). Козырь — буби. Крести бьются только крестями.",
    "Джокер бьёт всё, но любая шестёрка бьёт джокера.",
    `Твой характер: ${profile.says}`,
    "",
    `Круг снизу вверх: ${круг}`,
    `Твоя рука: ${рука}`,
    `Соседи по ходу: ${соседи}`,
    view.closesIfLay ? "Если положишь — круг закроется, и следующий круг открываешь ты." : "",
    память ? `Память стола: ${память}` : "",
    "",
    "Твои ходы:",
    ...legal.map((one, i) => `${i + 1}. ${moveSays(one)}`),
    "",
    `Ответь ОДНИМ числом от 1 до ${legal.length} — номером хода. Без слов, без объяснений.`,
  ].filter((line) => line !== "").join("\n");
}

/**
 * ЧТО МОДЕЛЬ ВЫБРАЛА. Берётся ПЕРВОЕ число в ответе: «3», «3.», «Я выберу 3» — всё это выбор номер
 * три. Числа вне списка и ответы без чисел — `null`, и комната возьмёт запасной мозг.
 */
export function pick(legal: readonly Move[], said: string): Move | null {
  const found = /-?\d+/.exec(said);
  if (found === null) return null;
  const n = Number(found[0]);
  return Number.isInteger(n) && n >= 1 && n <= legal.length ? legal[n - 1]! : null;
}
