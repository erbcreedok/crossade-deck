import type { StackOffset } from "./stackLayout";

// АТОМАРНЫЕ МЕХАНИКИ ВЗАИМОДЕЙСТВИЯ СО СТЕКОМ — как ДАННЫЕ (типизированные, без stringly-typed).
//
// Каждая механика самостоятельна и композируется с другими; у каждой свой ТРИГГЕР включения.
// Конфликты механик друг с другом — на совести гейм-дизайнера (не гейтим их здесь). Вся матчасть —
// ЧИСТЫЕ функции без Pixi и без рандома (детерминизм для мультиплеера и тестов); Pixi-исполнение и
// колесо/жесты живут в сцене, сюда не протекают. Готовые наборы — ИМЕНОВАННЫЕ пресеты (ниже),
// экспортируются и переиспользуются; в Storybook разворачиваются в контроли.

/** Жест-триггер драга: тап-и-тащи или пока зажат. Спред триггерится ИНАЧЕ (по устройству/жесту —
 *  см. PointerSpread/TouchSpread ниже), поэтому «always» тут нет: у драга его смысла не было. */
export type DragTrigger = "tap" | "hold";
export const DRAG_TRIGGERS: readonly DragTrigger[] = ["tap", "hold"];

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

/** Чем на ДЕСКТОПЕ (указатель: мышь/тачпад) двигается спред: зум-жестом (Ctrl/⌘-колесо, тачпад-
 *  пинч), обычным колесом/скроллом (`pan`) или ничем (`false`). Камере достаётся то, что спред НЕ
 *  взял (не тот жест / предел). `pan` — альтернатива `zoom`, НЕ спреду. */
export type PointerSpread = false | "zoom" | "pan";
export const POINTER_SPREADS: readonly PointerSpread[] = [false, "zoom", "pan"];
/** Чем на ТАЧСКРИНЕ двигается спред: двухпальцевым пинчем (`zoom`) или ничем (`false`). Пан одним
 *  пальцем — всегда камере/драгу, поэтому `pan` тут нет. */
export type TouchSpread = false | "zoom";
export const TOUCH_SPREADS: readonly TouchSpread[] = [false, "zoom"];

export interface SpreadConfig {
  pointerTrigger: PointerSpread; // десктоп: зум-жест / обычное колесо / ничего двигают спред
  touchTrigger: TouchSpread; // тач: двухпальцевый пинч / ничего двигают спред
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
  dir: number; // направление последнего ввода: -1 закрывали, +1 открывали, 0 ещё не трогали
}

export const SPREAD_STATE0: SpreadState = { amount: 0, target: 0, idle: 0, phase: 0, dir: 0 };

/** Ввод спреда (жест по стеку, безразлично каким устройством): сдвинуть цель на deltaGap, зажать в
 *  [0, maxGap], сбросить простой, ЗАПОМНИТЬ направление (нужно снэпу — см. snapStop). Нулевую дельту
 *  не считаем сменой направления (держим прежнее). */
export function spreadInput(st: SpreadState, deltaGap: number, cfg: SpreadConfig): SpreadState {
  const dir = Math.sign(deltaGap) || st.dir;
  return { amount: st.amount, target: clamp(st.target + deltaGap, 0, cfg.maxGap), idle: 0, phase: 0, dir };
}

/**
 * Стоп для снэпа (в px) С УЧЁТОМ НАПРАВЛЕНИЯ последнего ввода.
 *  • закрывали (dir<0) — ближайший стоп НА ИЛИ НИЖЕ цели (никогда не отбрасывает вверх к open);
 *  • открывали (dir>0) — на или выше; • без направления (0) — геометрически ближайший.
 * Почему направленный, а не «ближайший»: от полного стопа геометрически ближайший — сам полный, и
 * недотянутый откат назад липнул обратно в open («улетает обратно»). Направленный роняет к closed за
 * решительный откат и НЕ борется с трекпадными паузами между фликами. Стопы — доли 0..1 от maxGap.
 */
function snapStop(target: number, stopsPx: readonly number[], dir: number): number {
  const EPS = 1e-6;
  if (dir < 0) {
    const below = stopsPx.filter((v) => v <= target + EPS);
    return below.length ? Math.max(...below) : Math.min(...stopsPx);
  }
  if (dir > 0) {
    const above = stopsPx.filter((v) => v >= target - EPS);
    return above.length ? Math.min(...above) : Math.max(...stopsPx);
  }
  return stopsPx.reduce((best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best), stopsPx[0] ?? 0);
}

function nearestSnap(st: SpreadState, cfg: SpreadConfig & { close: { kind: "snap"; stops: readonly number[] } }): number {
  const px = cfg.close.stops.map((s) => clamp(s, 0, 1) * cfg.maxGap);
  return snapStop(st.target, px, st.dir);
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
    if (settling && idle > 0.08) target = nearestSnap(st, cfg as SpreadConfig & { close: { kind: "snap"; stops: readonly number[] } });
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
  return { amount, target, idle, phase, dir: st.dir };
}

// ———————————————————————————————————————————————————————————————————————————————————————————
// ДРАГ: какую карту тащим и каким жестом; и тащится ли ВЕСЬ стек как один.
// ———————————————————————————————————————————————————————————————————————————————————————————

/** Контекст выбора карты под драг: её id и позиция в стопке (0 — низ, n-1 — верх). */
export interface PickCtx {
  id: string;
  i: number;
  n: number;
}
/** Какие карты стопки хватаются под драг. ПРЕДИКАТ (true — эту тащим): клиент пишет свой (только
 *  пики, только цифры, кроме джокеров…). Готовые — ниже. Не строка-перечисление: это capability,
 *  а не закрытый список типов. */
export type CardPick = (c: PickCtx) => boolean;
/** Любая карта под пальцем (базовое поведение). */
export const PICK_ANY: CardPick = () => true;
/** Только верхняя карта (последняя в порядке). */
export const PICK_FIRST: CardPick = ({ i, n }) => i === n - 1;

export interface CardDrag {
  pick: CardPick; // какие карты хватаются
  trigger: DragTrigger; // тап-и-тащи или пока зажат
}
export interface StackDrag {
  trigger: DragTrigger;
}

/** Нормализовать авторскую запись драга карт `boolean | предикат` в конфиг (или null — выключен).
 *  `true` → любая карта; `false` → нет драга; предикат → он сам. Так пресеты/клиенты пишут коротко. */
export function cardDragFrom(pick: boolean | CardPick, trigger: DragTrigger): CardDrag | null {
  if (pick === false) return null;
  return { pick: pick === true ? PICK_ANY : pick, trigger };
}

/** Нормализовать драг всей стопки `boolean` в конфиг (или null — выключен). */
export function stackDragFrom(on: boolean, trigger: DragTrigger): StackDrag | null {
  return on ? { trigger } : null;
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

// База спреда: на обоих устройствах спред двигает ЗУМ-жест (тач-пинч / десктоп Ctrl-колесо/тачпад).
const SPREAD_BASE: SpreadConfig = { pointerTrigger: "zoom", touchTrigger: "zoom", maxGap: 34, keepDiagonal: true, centerX: false, close: { kind: "snap", stops: [0, 0.4, 1] }, spring: 12 };

/** Готовые механики по типу стека. Дефолт драга — «тап, любая карта» (как в стенде и сейчас). */
export const STACK_INTERACTIONS: Readonly<Record<string, { label: string; make: () => StackInteraction }>> = {
  deck: {
    label: "колода — спред зум-жестом (снэп), тащим верхнюю",
    make: () => ({ spread: { ...SPREAD_BASE }, cardDrag: { pick: PICK_FIRST, trigger: "tap" }, stackDrag: null }),
  },
  discard: {
    label: "сброс — спред крупнее, тащим ту, на которую попал палец",
    make: () => ({ spread: { ...SPREAD_BASE, maxGap: 46, close: { kind: "timer", seconds: 4 } }, cardDrag: { pick: PICK_ANY, trigger: "tap" }, stackDrag: null }),
  },
  hand: {
    label: "рука — раскрыта, тащим любую, спред-дриббл в простое",
    make: () => ({ spread: { ...SPREAD_BASE, maxGap: 40, close: { kind: "dribble", buildSeconds: 1.4 } }, cardDrag: { pick: PICK_ANY, trigger: "tap" }, stackDrag: null }),
  },
  block: {
    label: "блок — тащим весь стек целиком, без спреда",
    make: () => ({ spread: null, cardDrag: null, stackDrag: { trigger: "tap" } }),
  },
  plain: {
    label: "простой — только тащим любую карту (дефолт)",
    make: () => ({ spread: null, cardDrag: { pick: PICK_ANY, trigger: "tap" }, stackDrag: null }),
  },
};

export const STACK_INTERACTION_IDS: string[] = Object.keys(STACK_INTERACTIONS);

/** Чем задано взаимодействие: САМИМ объектом или именем готового. */
export type StackInteractionRef = StackInteraction | string;

export function resolveInteraction(v: StackInteractionRef): StackInteraction {
  if (typeof v !== "string") return v;
  return (STACK_INTERACTIONS[v] ?? STACK_INTERACTIONS.plain!).make();
}
