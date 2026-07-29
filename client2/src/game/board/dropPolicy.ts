import type { PileIdentity } from "./pileIdentity";

// Дроп-резолюция как ПОЛИТИКА (SELECTION-DESIGN §4.F, §6, issue #61). Три вещи, все как ДАННЫЕ:
//   1) onDropOutside — что делать с набором, отпущенным МИМО зон (домой/остаться/распустить);
//   2) цепочка приоритета правил приёма: элемент (нельзя нарушить) → зона → engine;
//   3) слепые зоны — через идентичность Pile (#59): зона со способностью-требованием принимает набор,
//      только если ВЕСЬ набор её несёт (гибрид карты+фишки в «подглядеть» → не Peekable → мимо).
// Чистый модуль — тестируется без Pixi; движок лишь применяет результат.

export type OnDropOutside = "return-home" | "dissolve" | "stay";

export interface DropPolicyConfig {
  onDropOutside: OnDropOutside;
}

export const DEFAULT_DROP_POLICY: DropPolicyConfig = { onDropOutside: "return-home" };

/** Вернуть ли набор на исходные места (иначе — оставить там, где отпущен). */
export const returnsHome = (p: OnDropOutside): boolean => p === "return-home";
/** Распустить ли набор (снять выделение — карты перестают быть набором). return-home/stay его сохраняют. */
export const clearsSet = (p: OnDropOutside): boolean => p === "dissolve";

// ——— цепочка правил приёма: элемент → зона → engine ———

/** Решение одного слоя: принять / отказать / передать ниже. */
export type DropDecision = "accept" | "reject" | "pass";
export type DropRule<P> = (payload: P) => DropDecision;

/**
 * Пройти цепочку слоёв в порядке приоритета (элемент, затем зона, затем engine). Первый слой,
 * вынесший РЕШЕНИЕ (accept|reject), — финал; pass передаёт дальше. Элемент-reject НЕ перебивается
 * нижними слоями — потому он первый. Все pass → fallback (по умолчанию отказ: некому принять).
 */
export function resolveDropChain<P>(payload: P, layers: readonly DropRule<P>[], fallback = false): boolean {
  for (const rule of layers) {
    const d = rule(payload);
    if (d === "accept") return true;
    if (d === "reject") return false;
  }
  return fallback;
}

// ——— слепые зоны через идентичность Pile ———

/** Требует ли зона способности cap — принимает набор, только если её несёт ВЕСЬ набор (Pile). */
export function pileHasCapability(pile: PileIdentity, cap: keyof PileIdentity["capabilities"]): boolean {
  return pile.capabilities[cap];
}

/**
 * Правило-слой зоны, требующей способность (напр. «подглядеть» → peekable): accept, если весь набор
 * её несёт, иначе pass (зона прозрачна — груз летит к следующей цели / к onDropOutside). НЕ reject:
 * зона не вправе запрещать дроп в другое место, лишь не принимать к себе.
 */
export function capabilityZoneRule<P>(pile: PileIdentity, cap: keyof PileIdentity["capabilities"]): DropRule<P> {
  return () => (pileHasCapability(pile, cap) ? "accept" : "pass");
}
