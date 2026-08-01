import type { DanceParams } from "../censorConfig";
import { DANCE_DEFAULT } from "../censorConfig";
import type { AppearStyleRef } from "./appearStyles";
import type { DestroyStyleRef } from "./destroyStyles";
import type { FlipStyleRef } from "./flipStyles";
import type { MoveStyleRef } from "./moveStyles";
import { SHADOW_TUNING, type ShadowTuning } from "../ui/shadow";
import type { SpringConfig } from "./config";
import { anim } from "./config";

// ПРЕСЕТЫ АНИМАЦИИ — «фил» стола как ДАННЫЕ, а не как код.
//
// Зачем отдельно от `anim/config.ts`. Тот конфиг — единственный ДЕФОЛТ: он собирает тайминги и
// пружины в одном месте, и это уже хорошо. Но переключить набор целиком нельзя, наложить свой
// поверх нельзя, и дать двум стопкам на одном столе разный фил нельзя — а колоде и сбросу это
// нужно (колода складывается сухо и быстро, сброс — вальяжно).
//
// Поэтому пресет здесь — ПЕРЕКРЫТИЕ поверх дефолта, а не его замена. `anim` остаётся тем, чем был;
// всё, чего в пресете не сказано, продолжает браться оттуда. Это же и делает слой безопасным:
// новый канал добавляется полем, старые потребители не ломаются.
//
// Уровни владения взяты из `docs/animation-levers.md` §1–3: движок/профиль → скоуп (создатель
// правил) → пользователь. Пресет — это ровно СКОУП, средний уровень. Там же записано главное
// правило: рычаги даются на уровне пресета, а НЕ на слот. Никто не настраивает анимацию покарточно.

/** Как переворачивается ПАЧКА карт. */
export type StackFlipMode =
  /** Все разом. Пачка ведёт себя как один физический объект. */
  | "whole"
  /** Волной слева направо: каждая карта переворачивается сама, с задержкой от соседа. */
  | "cascade";

export interface FlipTiming {
  /** Длительность переворота ОДНОЙ карты, сек. */
  dur: number;
  /** Сколько полуоборотов. 1 — обычный переворот; 3 — «фокусный», с прокрутом. */
  halfTurns: number;
  /**
   * ЧТО за движение — САМ СТИЛЬ (объект с функцией кадра) либо имя готового из реестра.
   *
   * Объект первичен. Регистрировать свою анимацию, чтобы ею воспользоваться, не нужно: передали
   * `{ label, frame }` — работает. Реестр остаётся списком готовых и точкой, на которую ссылаются
   * СЕРИАЛИЗУЕМЫЕ конфиги: функцию по сети не пошлёшь, а имя — да (docs/PORTABILITY.md).
   */
  style: FlipStyleRef;
}

export interface StackFlipTiming {
  mode: StackFlipMode;
  /** Задержка между соседями в каскаде, сек. У `whole` игнорируется — там задержек нет вовсе. */
  stagger: number;
  /**
   * Переворачивать ли ПОРЯДОК карт.
   *
   * Отдельно от `mode` намеренно. Перевернули пачку как предмет — низ стал верхом, порядок
   * обязан развернуться. Перевернули каждую карту на месте — порядок сохраняется. Обычно это
   * идёт парой с mode, но сочетания законны («веером показать всем, не сбивая порядок»), и
   * зашить их внутрь mode значило бы потерять половину вариантов.
   */
  reverse: boolean;
}

/** Как элемент ЛЕТИТ, когда его двигает программа. Драг сюда не входит — там путь задаёт рука. */
export interface MoveTiming {
  /** Сам стиль или имя готового. */
  style: MoveStyleRef;
}

/** Как карта ПОЯВЛЯЕТСЯ на столе. Раздача, добор, возврат — разные события, см. `anim/appearStyles.ts`. */
export interface AppearTiming {
  /** Сам стиль или имя готового. */
  style: AppearStyleRef;
  /** Множитель к собственной длительности стиля. */
  scale: number;
}

/** Как карта уходит со стола. «Сжечь» — лишь один из способов, см. `anim/destroyStyles.ts`. */
export interface DestroyTiming {
  /** Сам стиль или имя готового. */
  style: DestroyStyleRef;
  /** Множитель к собственной длительности стиля. 1 — как задизайнено. */
  scale: number;
}

export interface IdleTiming {
  /** Скорость покачивания парящей карты, рад/сек. */
  speed: number;
  /** Размах покачивания в долях высоты карты. 0 — дыхания нет вовсе. */
  amp: number;
}

export interface Springs {
  pos: SpringConfig;
  rot: SpringConfig;
  scale: SpringConfig;
}

/**
 * Полный набор рычагов фила. Все поля обязательны — это РАЗРЕШЁННЫЙ пресет, то, с чем работает
 * движок. Частичный (то, что пишет автор) — `PresetOverride` ниже.
 */
export interface AnimPreset {
  flip: FlipTiming;
  stackFlip: StackFlipTiming;
  move: MoveTiming;
  appear: AppearTiming;
  destroy: DestroyTiming;
  /** Пыль цензуры. Тип общий с `censorConfig` — второго описания «как крутится пыль» быть не должно. */
  dust: DanceParams;
  springs: Springs;
  /** Дыхание парящей карты. Первое, что режется на слабом железе (animation-levers.md §2A). */
  idle: IdleTiming;
  /** Модель тени: как высота над столом переводится в смещение и размер (ui/plane.ts). */
  shadow: ShadowTuning;
  /**
   * Инерционный крен: карта кренится в сторону полёта. 1 — как задизайнено, 0 — выключен.
   * Множитель поверх `anim.tilt`, а не замена: сама физика крена остаётся в конфиге стола.
   */
  tilt: number;
  /**
   * Общий множитель скорости. 2 — вдвое быстрее, 0.5 — вдвое медленнее. Множит длительности и
   * задержки; жёсткость пружин НЕ трогает — там «быстрее» задаётся stiffness, и попытка ускорить
   * пружину множителем дала бы не ускорение, а другой характер движения.
   */
  speed: number;
}

/**
 * Что пишет автор: любое подмножество. Пружины расписаны явно, а не выведены mapped-типом —
 * тому пришлось бы уйти на два уровня вглубь, и `{ pos: { stiffness } }` он бы отверг: жёсткость
 * без затухания это законное перекрытие, а не половина записи.
 */
export interface PresetOverride {
  flip?: Partial<FlipTiming>;
  stackFlip?: Partial<StackFlipTiming>;
  move?: Partial<MoveTiming>;
  appear?: Partial<AppearTiming>;
  destroy?: Partial<DestroyTiming>;
  dust?: Partial<DanceParams>;
  springs?: { pos?: Partial<SpringConfig>; rot?: Partial<SpringConfig>; scale?: Partial<SpringConfig> };
  idle?: Partial<IdleTiming>;
  shadow?: Partial<ShadowTuning>;
  tilt?: number;
  speed?: number;
}

/** База — ровно то, что стол делает СЕЙЧАС. Меняя её, вы меняете дефолт игры, а не пресет. */
export const BASE_PRESET: AnimPreset = {
  // 0.45 и 1 полуоборот — то, что было зашито в Card.ts. Теперь это значение, а не число в коде.
  flip: { dur: 0.45, halfTurns: 1, style: "spin" },
  stackFlip: { mode: "whole", stagger: 0.06, reverse: true },
  // «deal» дефолтом: карта, ВОЗНИКАЮЩАЯ из ничего, — это отсутствие анимации, а не выбор в её пользу.
  move: { style: "spring" },
  appear: { style: "deal", scale: 1 },
  destroy: { style: "burn", scale: 1 },
  dust: { ...DANCE_DEFAULT },
  springs: { pos: anim.posSpring, rot: anim.rotSpring, scale: anim.scaleSpring },
  // 2.2 и 0.05 — то, что было зашито в Card.ts константой BOB_SPEED и множителем высоты.
  idle: { speed: 2.2, amp: 0.05 },
  shadow: { ...SHADOW_TUNING },
  tilt: 1,
  speed: 1,
};

/**
 * Именованные пресеты. Это ДАННЫЕ: новый фил — запись в таблице, а не ветка в коде.
 *
 * Каждый описан перекрытием, а не целиком, и это принципиально: видно РОВНО ТО, чем он отличается
 * от стола по умолчанию. Пресет, переписанный целиком, через полгода расходится с базой молча.
 */
export const PRESETS: Readonly<Record<string, { label: string; over: PresetOverride }>> = {
  default: { label: "по умолчанию — как стол ведёт себя сейчас", over: {} },
  snappy: {
    label: "сухо и быстро: короткий флип, жёсткие пружины, пачка разом",
    over: { flip: { dur: 0.26 }, stackFlip: { mode: "whole", stagger: 0 }, springs: { pos: { stiffness: 220, damping: 22 } }, idle: { amp: 0.03 }, speed: 1.25, appear: { style: "drop" }, move: { style: "slide" }, destroy: { style: "shred" } },
  },
  cascade: {
    label: "волной: пачка переворачивается слева направо, порядок сохраняется",
    over: { stackFlip: { mode: "cascade", stagger: 0.07, reverse: false } },
  },
  lazy: {
    label: "вальяжно: долгий флип, мягкие пружины, длинная волна",
    over: { flip: { dur: 0.7 }, stackFlip: { mode: "cascade", stagger: 0.14, reverse: false }, springs: { pos: { stiffness: 80, damping: 12 } }, idle: { speed: 1.4, amp: 0.07 }, tilt: 1.4, speed: 0.8, appear: { style: "fade" }, move: { style: "arc" }, destroy: { style: "fade" } },
  },
  showman: {
    label: "с прокрутом: полтора оборота на карту, волна внахлёст",
    over: { flip: { dur: 0.62, halfTurns: 3, style: "loop" }, stackFlip: { mode: "cascade", stagger: 0.05, reverse: false }, appear: { style: "grow" }, move: { style: "swoop" }, destroy: { style: "flyRight" } },
  },
  instant: {
    label: "без анимации: всё мгновенно (не то же, что reduce-motion — тот гасит только фон)",
    over: { flip: { dur: 0.001 }, stackFlip: { mode: "whole", stagger: 0 }, appear: { style: "none" }, destroy: { style: "fade", scale: 0.05 }, idle: { amp: 0 }, tilt: 0, speed: 4 },
  },
};

export type PresetId = keyof typeof PRESETS & string;
export const PRESET_IDS: string[] = Object.keys(PRESETS);

/**
 * Слить перекрытие с базой. Глубина ровно два уровня — больше в `AnimPreset` и нет, а
 * универсальный deep-merge пришлось бы сторожить тестами на случаи, которых тут не бывает.
 */
export function resolvePreset(over: PresetOverride = {}, base: AnimPreset = BASE_PRESET): AnimPreset {
  return {
    flip: { ...base.flip, ...over.flip },
    stackFlip: { ...base.stackFlip, ...over.stackFlip },
    move: { ...base.move, ...over.move },
    appear: { ...base.appear, ...over.appear },
    destroy: { ...base.destroy, ...over.destroy },
    dust: { ...base.dust, ...over.dust },
    springs: {
      pos: { ...base.springs.pos, ...over.springs?.pos },
      rot: { ...base.springs.rot, ...over.springs?.rot },
      scale: { ...base.springs.scale, ...over.springs?.scale },
    },
    idle: { ...base.idle, ...over.idle },
    shadow: { ...base.shadow, ...over.shadow },
    tilt: over.tilt ?? base.tilt,
    speed: over.speed ?? base.speed,
  };
}

/** Пресет по имени. Неизвестное имя — база: каталог и конфиг игры не должны падать из-за опечатки. */
export function presetById(id: string, extra: PresetOverride = {}): AnimPreset {
  const named = PRESETS[id]?.over ?? {};
  // Порядок важен: `extra` — перекрытие ПОВЕРХ выбранного пресета (стопка правит фил под себя).
  return resolvePreset(extra, resolvePreset(named));
}

/** Длительность с учётом общего множителя. Один способ применить `speed` на весь движок. */
export function scaled(seconds: number, speed: number): number {
  return speed > 0 ? seconds / speed : seconds;
}

/** Человеческое имя стиля для подписи: у готового — его id, у своего — его label. */
export function styleName(v: { label: string } | string): string {
  return typeof v === "string" ? v : v.label;
}
