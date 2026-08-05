// ПРАВИЛА ДРАГА И ДРОПА СЕТЕВОГО СТОЛА — чистая логика без Pixi и без сцены: «что можно взять»,
// «куда подсветить» и «что значит дроп из слота A в слот B». Один модуль на ОБА стола: у Crossade
// и у дебаг-стола Multiplayer правила совпадают, а расходятся ДЕРЕВЬЯ (multiplayer/tree.ts не
// раскладывает ни колоды, ни фаз) — значит ветка про колоду на дебаг-столе просто недостижима, а
// не «другая». Отсюда и форма функций: они спрашивают, ЕСТЬ ли слот, а не какой это стол.
//
// Легальность хода остаётся за сервером (см. crossade/net.ts): здесь только то, что нужно пальцу
// до ответа — что вообще поднимается и какие зоны зажигаются подсказкой.

import { selfSeatOf, type CrossadeState } from "./state";
import type { MoveIntent } from "./moveIntent";

function topOf(arr: readonly string[]): string | undefined {
  return arr[arr.length - 1];
}

export interface DragRules {
  slot: string | null;
  card: string;
  state: CrossadeState;
}

/**
 * Что поднимается пальцем: карта своей руки — всегда; верх колоды — либо в freeMode («взять
 * себе»), либо в лобби ДИЛЕРУ («раздать драгом», только верхнюю — колода вслепую, см. CLAUDE.md
 * «Dealing is always on»); верх сброса и верх play-кучки — только в freeMode.
 *
 * Дебаг-стол проходит те же ворота: его снимок всегда freeMode (localTable.ts), колоды в дереве
 * нет — остаются рука, сброс и кучки, ровно как было у него до объединения.
 *
 * Дилерство не аргумент, а вывод из снимка (state.ts#selfSeatOf): второй источник этого факта — и
 * рано или поздно он разойдётся с тем, что показывает HUD.
 */
export function canDragFrom({ slot, card, state }: DragRules): boolean {
  if (slot === "hand") return true;
  if (!slot) return false;
  if (slot === "deck") {
    if (topOf(state.deck) !== card) return false;
    if (state.freeMode) return true;
    return state.phase === "lobby" && (selfSeatOf(state)?.isDealer ?? false);
  }
  if (!state.freeMode) return false;
  if (slot === "discard") return topOf(state.discard) === card;
  if (slot.startsWith("play:") && slot !== "play:new") {
    const stack = state.play[Number(slot.slice(5))];
    return stack ? topOf(stack) === card : false;
  }
  return false;
}

/**
 * Зоны, готовые принять груз из слота `from` — подсказка «куда можно», не проверка правил.
 * Спрашивает состав слотов ДЕРЕВА (`slotIds`), а не стол: сброса на дебаг-столе нет — он и не
 * зажжётся, seat-слоты вне лобби дропзонами не бывают — их и не перечислит.
 *
 * «hand» в наборе руки — легальный переход (реордер), просто контур рука не носит: рисуется
 * только то, что перечислит paintBoard (см. crossade/slotPaint.ts).
 */
export function armedTargets(from: string, slotIds: readonly string[], phase: CrossadeState["phase"]): ReadonlySet<string> {
  const out = new Set<string>();
  if (from === "hand") {
    out.add("hand");
    if (slotIds.includes("discard")) out.add("discard");
    for (const id of slotIds) if (id.startsWith("play:")) out.add(id);
  } else if (from === "deck" && phase === "lobby") {
    for (const id of slotIds) if (id.startsWith("seat:")) out.add(id);
  } else if (from === "deck" || from === "discard" || from.startsWith("play:")) {
    out.add("hand");
  }
  return out;
}

export interface DropRoute {
  from: string | null;
  to: string | null;
  card: string;
  /** Индекс внутри целевой группы — нужен только реордеру руки (null: цель не спрашивали). */
  index: number | null;
  freeMode: boolean;
}

/**
 * Что значит дроп. null — «ничего не значит»: карта летит на прежнее место и на сервер ничего не
 * уходит (напр. play:0 → play:1 напрямую — не MVP, см. CROSSADE-DESIGN.md §4).
 *
 * Дроп МИМО слота над колодой — это её «тап»: колода caps.drop не носит (crossade/tree.ts#deckSlot),
 * поэтому дроп вообще где угодно над ней резолвится в `to === null`, а отличить «тапнул» от
 * «подвинул на миллиметр и передумал» InputRouter не умеет (canDrag решает жест целиком на
 * pointerdown). Тянуть верхнюю карту мимо любого слота читается так же, как тап: «взять».
 */
export function routeDrop({ from, to, card, index, freeMode }: DropRoute): MoveIntent | null {
  if (from === "hand" && to === "hand") {
    return index === null ? null : { kind: "reorder_hand", card, toIndex: index };
  }
  if (!to) return from === "deck" && freeMode ? { kind: "take_card" } : null;
  if (from === "hand" && to === "discard") return { kind: "discard_card", card };
  if (from === "hand" && to.startsWith("play:")) {
    return to === "play:new" ? { kind: "play_card", card } : { kind: "play_card", card, stack: Number(to.slice(5)) };
  }
  // Раздача драгом: сервер сам решит, ready ли получатель — сюда прилетит action_rejected, если нет.
  if (from === "deck" && to.startsWith("seat:")) return { kind: "deal_card", card, seat: to.slice(5) };
  if (from === "deck" && to === "hand") return { kind: "take_card" };
  if (from === "discard" && to === "hand") return { kind: "take_discard" };
  if (from?.startsWith("play:") && to === "hand") return { kind: "take_play", card };
  return null;
}
