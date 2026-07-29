import type { PileIdentity } from "./pileIdentity";
import type { TagPredicate, TagSet } from "./tagQuery";

// Дроп-резолюция как ПОЛИТИКА (SELECTION-DESIGN §4.F, §6, issue #61/#63). Всё как ДАННЫЕ:
//   1) дроп МИМО зон — ДВЕ ортогональные оси (merge + keepSelection) + якорь сшивки (#63);
//   2) цепочка приоритета правил приёма: элемент (нельзя нарушить) → зона → engine;
//   3) слепые зоны — через идентичность Pile (#59): зона со способностью-требованием принимает набор,
//      только если ВЕСЬ набор её несёт (гибрид карты+фишки в «подглядеть» → не Peekable → мимо).
// Чистый модуль — тестируется без Pixi; движок лишь применяет результат.

// ——— дроп мимо зон: две оси (issue #63, развитие #61) ———

/** Режим оси: off (никогда) | on (всегда) | custom (предикат игры над тегами карты). */
export type DropMode = "off" | "on" | "custom";

/** Где оседает сшитая стопка при merge. `primary` — дроп-позиция ведущей/правой карты (GroupDrag.lead).
 *  Расширяемо позже (словарь anchor SELECTION-DESIGN §4.C): "first" | "latest" | "zone" | "point". */
export type MergeAnchor = "primary";

export interface DropOutsidePolicy {
  merge: DropMode; // сшивать ли набор, отпущенный мимо зон (off → карты домой)
  keepSelection: DropMode; // оставить ли выделение после дропа
  mergeAnchor: MergeAnchor; // куда садится сшитая стопка (при merge)
}

// Дефолты ОБЯЗАТЕЛЬНЫ: домой + выделение сохраняется + якорь по ведущей. Старые состояния #61 —
// комбинации: домой=(off,on) · остаться=(on,on) · распустить=(on,off).
export const DEFAULT_DROP_POLICY: DropOutsidePolicy = { merge: "off", keepSelection: "on", mergeAnchor: "primary" };

/**
 * Разрешить ось для ОДНОЙ карты: off→false, on→true, custom→предикат над её тегами. true = «активное»
 * поведение оси (merge: карта сшивается, иначе домой; keepSelection: карта остаётся выделенной). custom
 * без предиката трактуется как off — некому решать, безопасный дефолт.
 */
export function resolveMode(mode: DropMode, tags: TagSet, custom?: TagPredicate): boolean {
  if (mode === "on") return true;
  if (mode === "off") return false;
  return custom ? custom(tags) : false;
}

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
