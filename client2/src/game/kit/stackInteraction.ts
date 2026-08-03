import type { StackOffset } from "./stackLayout";

// АТОМАРНЫЕ МЕХАНИКИ ВЗАИМОДЕЙСТВИЯ СО СТЕКОМ — как ДАННЫЕ (типизированные, без stringly-typed).
//
// Каждая механика самостоятельна и композируется с другими; у каждой свой ТРИГГЕР включения.
// Конфликты механик друг с другом — на совести гейм-дизайнера (не гейтим их здесь). Вся матчасть —
// ЧИСТЫЕ функции без Pixi и без рандома (детерминизм для мультиплеера и тестов); Pixi-исполнение и
// колесо/жесты живут в сцене, сюда не протекают. Готовые наборы — ИМЕНОВАННЫЕ пресеты (ниже),
// экспортируются и переиспользуются; в Storybook разворачиваются в контроли.

/** Как включается механика: всегда / тап-тоггл / пока зажат. */
export type Trigger = "always" | "tap" | "hold";
export const TRIGGERS: readonly Trigger[] = ["always", "tap", "hold"];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ———————————————————————————————————————————————————————————————————————————————————————————
// СПРЕД: горизонтальный раздвиг стека ПОВЕРХ базовой раскладки (диагональ стаггера сохраняется).
// ———————————————————————————————————————————————————————————————————————————————————————————

/** Поведение раскрытого стека без взаимодействия (возврат/закрытие). Дискриминированный юнион. */
export type SpreadClose =
  | { kind: "infinite" } // держится, пока сам не вернёшь
  | { kind: "timer"; seconds: number } // авто-схлоп через N секунд простоя
  | { kind: "dribble"; buildSeconds: number } // простой → карты «танцуют» всё быстрее, на пике собираются
  | { kind: "snap"; stops: readonly number[] }; // не висит между: цель липнет к ближайшему стопу (доли 0..1 от maxGap)

export interface SpreadConfig {
  trigger: Trigger; // как включается спред-режим
  maxGap: number; // предел ДОП. зазора по X на карту, px (небольшой — карты внахлёст, не вплотную)
  keepDiagonal: boolean; // сохранять исходный диагональный стаггер базовой раскладки
  centerX: boolean; // центрировать раздвиг по X (сдвиг на половину полного зазора)
  close: SpreadClose;
  spring: number; // скорость подтяжки amount→target (1/сек); больше — резче
}

/** Доп. смещение i-й карты от раздвига `amount` (px/карта по X). centerX — вычесть половину. */
export function spreadOffset(i: number, n: number, amount: number, centerX: boolean): number {
  return amount * i - (centerX ? (amount * (n - 1)) / 2 : 0);
}

/** Полное смещение карты = база (раскладка) + раздвиг + (в дриббле) покачивание. keepDiagonal=false
 *  гасит вертикаль базы, оставляя чистый горизонтальный ряд. Чистая. */
export function offsetWithSpread(base: StackOffset, i: number, n: number, amount: number, cfg: SpreadConfig, wobble = 0): StackOffset {
  return {
    dx: base.dx + spreadOffset(i, n, amount, cfg.centerX),
    dy: (cfg.keepDiagonal ? base.dy : 0) + wobble * ((i % 2 ? -1 : 1) * 6),
    rot: base.rot + wobble * ((i % 2 ? -1 : 1) * 0.08),
  };
}

// ——— живое состояние спреда + чистый шаг (анимация amount→target + поведение close при простое) ———

export interface SpreadState {
  amount: number; // текущий зазор (px/карта), анимируется к target
  target: number; // целевой зазор
  idle: number; // секунд без взаимодействия
  phase: number; // фаза дриббла (растёт в простое при close.kind==="dribble")
}

export const SPREAD_STATE0: SpreadState = { amount: 0, target: 0, idle: 0, phase: 0 };

/** Скролл/колесо по стеку: сдвинуть цель на deltaGap, зажать в [0, maxGap], сбросить простой. */
export function spreadInput(st: SpreadState, deltaGap: number, cfg: SpreadConfig): SpreadState {
  return { amount: st.amount, target: clamp(st.target + deltaGap, 0, cfg.maxGap), idle: 0, phase: 0 };
}

/** Ближайший стоп (в px) для snap: стопы — доли 0..1 от maxGap. */
function nearestSnap(target: number, cfg: SpreadConfig & { close: { kind: "snap"; stops: readonly number[] } }): number {
  const px = cfg.close.stops.map((s) => clamp(s, 0, 1) * cfg.maxGap);
  return px.reduce((best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best), px[0] ?? 0);
}

/** Покачивание дриббла для i-й карты по фазе: частота и амплитуда растут с фазой (карты «танцуют»
 *  всё быстрее). Детерминированно. amp затухает к 0 на пике (перед сбором) — см. spreadTick. */
export function dribbleWobble(i: number, phase: number): number {
  const freq = 2 + phase * 6; // ускоряемся
  const amp = Math.min(1, phase); // разгон амплитуды
  return Math.sin(i * 1.7 + phase * freq) * amp;
}

/**
 * Шаг за dt: тянем amount к target и решаем судьбу target по close при простое.
 *  • infinite — держим; • timer — простой ≥ seconds → target 0; • snap — в простое цель липнет к
 *  ближайшему стопу; • dribble — фаза растёт, на пике buildSeconds цель схлопывается (карты собрались).
 * Возвращает новое состояние. Чистая: рандома и Pixi нет.
 */
export function spreadTick(st: SpreadState, dt: number, cfg: SpreadConfig): SpreadState {
  const idle = st.idle + dt;
  let target = st.target;
  let phase = st.phase;
  const settling = Math.abs(st.amount - st.target) < 0.5; // почти доехали — можно применять close
  if (cfg.close.kind === "timer") {
    if (idle >= cfg.close.seconds) target = 0;
  } else if (cfg.close.kind === "snap") {
    if (settling && idle > 0.08) target = nearestSnap(st.target, cfg as SpreadConfig & { close: { kind: "snap"; stops: readonly number[] } });
  } else if (cfg.close.kind === "dribble") {
    if (target > 0) {
      phase = st.phase + dt / Math.max(0.1, cfg.close.buildSeconds);
      if (phase >= 1) {
        target = 0; // пик — собираемся
        phase = 0;
      }
    }
  }
  const k = Math.min(1, dt * cfg.spring);
  const amount = st.amount + (target - st.amount) * k;
  return { amount, target, idle, phase };
}

// ———————————————————————————————————————————————————————————————————————————————————————————
// ДРАГ: какую карту тащим и каким жестом; и тащится ли ВЕСЬ стек как один.
// ———————————————————————————————————————————————————————————————————————————————————————————

export type CardPick = "any" | "first"; // any — та, на которую попал палец; first — только верхняя
export interface CardDrag {
  trigger: Extract<Trigger, "tap" | "hold">; // по тапу-и-тащи или по зажатию
  pick: CardPick;
}
export interface StackDrag {
  trigger: Extract<Trigger, "tap" | "hold">;
}

// ———————————————————————————————————————————————————————————————————————————————————————————
// Композиция механик у одного стека. null — механика выключена.
// ———————————————————————————————————————————————————————————————————————————————————————————

export interface StackInteraction {
  spread: SpreadConfig | null;
  cardDrag: CardDrag | null;
  stackDrag: StackDrag | null;
}

// ——— именованные ПРЕСЕТЫ (экспортируются; в Storybook — select по id) ———

const SPREAD_BASE: SpreadConfig = { trigger: "always", maxGap: 34, keepDiagonal: true, centerX: false, close: { kind: "snap", stops: [0, 0.4, 1] }, spring: 12 };

/** Готовые механики по типу стека. Дефолт драга — «тап, любая карта» (как в стенде и сейчас). */
export const STACK_INTERACTIONS: Readonly<Record<string, { label: string; make: () => StackInteraction }>> = {
  deck: {
    label: "колода — спред по скроллу (снэп), тащим верхнюю",
    make: () => ({ spread: { ...SPREAD_BASE }, cardDrag: { trigger: "tap", pick: "first" }, stackDrag: null }),
  },
  discard: {
    label: "сброс — спред крупнее, тащим ту, на которую попал палец",
    make: () => ({ spread: { ...SPREAD_BASE, maxGap: 46, close: { kind: "timer", seconds: 4 } }, cardDrag: { trigger: "tap", pick: "any" }, stackDrag: null }),
  },
  hand: {
    label: "рука — раскрыта, тащим любую, спред-дриббл в простое",
    make: () => ({ spread: { ...SPREAD_BASE, maxGap: 40, close: { kind: "dribble", buildSeconds: 1.4 } }, cardDrag: { trigger: "tap", pick: "any" }, stackDrag: null }),
  },
  block: {
    label: "блок — тащим весь стек целиком, без спреда",
    make: () => ({ spread: null, cardDrag: null, stackDrag: { trigger: "tap" } }),
  },
  plain: {
    label: "простой — только тащим любую карту (дефолт)",
    make: () => ({ spread: null, cardDrag: { trigger: "tap", pick: "any" }, stackDrag: null }),
  },
};

export const STACK_INTERACTION_IDS: string[] = Object.keys(STACK_INTERACTIONS);

/** Чем задано взаимодействие: САМИМ объектом или именем готового. */
export type StackInteractionRef = StackInteraction | string;

export function resolveInteraction(v: StackInteractionRef): StackInteraction {
  if (typeof v !== "string") return v;
  return (STACK_INTERACTIONS[v] ?? STACK_INTERACTIONS.plain!).make();
}
