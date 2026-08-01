// Отбор-визуал набора (SELECTION-DESIGN §4.A) — рычаги как ДАННЫЕ. Что МОЖНО выбрать (eligible),
// подсвечивать ли выбираемые (hintEligible) и КАК метить выбранное (mark: подъём/контур/оба).
// Предикат eligible приходит ИЗ КОНФИГА игры (tagQuery), движок только ВЫЧИСЛЯЕТ — тут никаких
// перечислений видов элементов, только словарь готовых именованных предикатов (данные песочницы).

import { any, hasAllTags, hasTag, type TagPredicate, type TagSet } from "./tagQuery";

/** Как помечать ВЫБРАННЫЙ элемент: подъём (lifted), контур (акцентная рамка) или оба. */
export type Mark = "lift" | "outline" | "both";

export interface SelectVisualConfig {
  eligible: TagPredicate; // что можно взять в набор (предикат над тегами)
  hintEligible: boolean; // подсвечивать выбираемые-невыбранные, когда в наборе ≥1
  mark: Mark; // как метить выбранное
}

/** Именованные предикаты выбираемости КАК ДАННЫЕ (переиспользуют tagQuery, не хардкод). */
export const ELIGIBLE: Record<string, TagPredicate> = {
  any, // выбирать можно всё
  cards: hasTag("card"), // только карты
  diamonds: hasAllTags(["card", "suit:♦"]), // только буби
};

/** Имя предиката для e2e-хука (движок держит его рядом с самим предикатом). */
export type EligibleName = "cards" | "diamonds" | "any";

/** Можно ли взять элемент в набор — просто применение предиката к его тегам. */
export const canSelect = (tags: TagSet, eligible: TagPredicate): boolean => eligible(tags);

/** Поднимать ли выбранное во lifted (mark ≠ «только контур»). */
export const shouldLift = (mark: Mark): boolean => mark !== "outline";

/** Рисовать ли контур вокруг выбранного (mark ≠ «только подъём»). */
export const shouldOutline = (mark: Mark): boolean => mark !== "lift";
