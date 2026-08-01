import { TEX_H, TEX_W } from "../engine/constants";
import { easeOutQuad } from "./easing";
import { NEUTRAL_FRAME, rect, type EffectCtx, type EffectFrame } from "./destroyStyles";

// СТИЛИ ПОЯВЛЕНИЯ карты — реестр, зеркало destroyStyles.ts.
//
// До сих пор карта просто ВОЗНИКАЛА: движок ставил её в дом (`snapTo`) и рисовал первым же кадром.
// Для витрины это терпимо, для стола — нет: раздача, добор, вскрытие сброса и возврат карты в игру
// это РАЗНЫЕ события, и все они выглядели одинаково — то есть никак.
//
// Кадр общий с уничтожением (`EffectFrame`) намеренно: появление и исчезновение — одно движение,
// пройденное в разные стороны. Два одинаковых интерфейса под разными именами разошлись бы при
// первой же правке.
//
// КАК ЗАДАТЬ СВОЙ. Передать объектом в пресет — регистрировать не нужно; реестр ниже это список
// готовых. Требования те же, что у переворота, и второе тут даже важнее:
//   1. Функция ЧИСТАЯ — иначе её нечем проверить (Pixi в node не исполняется).
//   2. В КОНЦЕ (t = dur) кадр обязан быть нейтральным: dx=dy=rot=0, scale=1, alpha=1, mask=null.
//      Появление ЗАКАНЧИВАЕТСЯ обычной картой в своём доме. Не сойдётся — карта останется жить
//      сдвинутой или полупрозрачной навсегда, и заметят это не сразу.

/**
 * Чем задаётся стиль: САМИМ стилем или именем из реестра.
 *
 * Объект первичен. Строка — сокращение для готовых и для конфигов, которые сериализуются
 * (docs/PORTABILITY.md: конфиг доски обязан быть данными). Требовать регистрации ради того, чтобы
 * подставить свою функцию, было бы прямым запретом на «свою анимацию».
 */
export type AppearStyleRef = AppearStyle | string;

export interface AppearStyle {
  label: string;
  /** Своя длительность, сек. Пресет масштабирует её общим `speed`. */
  dur: number;
  frame: (t: number, ctx: EffectCtx) => EffectFrame;
}

/**
 * Рычаг стиля: что у него внутри можно покрутить. ДАННЫЕ, а не код — из них каталог сам строит
 * панель, а конфиг игры сериализует.
 *
 * Зачем: выбрать «падение» мало. Настраивают ВЫСОТУ падения, момент удара и силу сплющивания —
 * иначе единственный способ поправить анимацию это править исходник, а показать заказчику
 * «вот с такими числами» вообще нечем.
 */
export interface StyleKnob {
  label: string;
  min: number;
  max: number;
  step: number;
  def: number;
}

/** Стиль С РЫЧАГАМИ: фабрика плюс описание того, что она принимает. */
export interface AppearStyleSpec {
  label: string;
  knobs: Record<string, StyleKnob>;
  make: (v: Record<string, number>) => AppearStyle;
}

/** Значения рычагов по умолчанию — то, с чем стиль попадает в реестр готовых. */
export function defaults(knobs: Record<string, StyleKnob>): Record<string, number> {
  return Object.fromEntries(Object.entries(knobs).map(([k, v]) => [k, v.def]));
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ——————————————————————————————————————————————————————————————————————
// СТИЛИ С РЫЧАГАМИ
// ——————————————————————————————————————————————————————————————————————
//
// Выбрать «удар об стол» мало: настраивают высоту падения, момент удара, силу сплющивания и
// упругость отыгрыша. Поэтому такие стили — ФАБРИКИ: числа снаружи, а каталог строит под них
// панель из `knobs` автоматически.

export const APPEAR_SPECS: Readonly<Record<string, AppearStyleSpec>> = {
  slam: {
    label: "удар об стол — элемент падает с размаху, расплющивается и отыгрывает обратно",
    knobs: {
      dur: { label: "длительность, сек", min: 0.15, max: 1.5, step: 0.05, def: 0.5 },
      height: { label: "высота падения, в ширинах элемента", min: 0.5, max: 8, step: 0.1, def: 3.4 },
      hitAt: { label: "доля времени до удара", min: 0.2, max: 0.9, step: 0.05, def: 0.55 },
      gravity: { label: "резкость разгона: 1 — равномерно, 3 — свободное падение", min: 1, max: 4, step: 0.1, def: 2.2 },
      squash: { label: "сплющивание при ударе", min: 0, max: 0.6, step: 0.02, def: 0.22 },
      grow: { label: "насколько крупнее в верхней точке (перспектива)", min: 0, max: 1, step: 0.05, def: 0.5 },
    },
    make: (v) => ({
      label: "удар об стол",
      dur: v.dur!,
      frame: (t, ctx) => {
        const p = clamp01(t / v.dur!);
        if (p < v.hitAt!) {
          // Разгон степенью, а не ease-out: у падающей вещи скорость РАСТЁТ к столу, а ease-out
          // наоборот тормозит перед ударом — и удара не читается вовсе.
          const q = (p / v.hitAt!) ** v.gravity!;
          return { ...NEUTRAL_FRAME, dy: -(1 - q) * ctx.width * v.height!, scale: 1 + (1 - q) * v.grow!, alpha: clamp01(p / 0.1), shadow: q };
        }
        // Отыгрыш — ОДНА затухающая волна: двух подскоков у тяжёлой фишки не бывает.
        const q = (p - v.hitAt!) / (1 - v.hitAt!);
        const s = Math.sin(Math.PI * q) * (1 - q) * v.squash!;
        return { ...NEUTRAL_FRAME, scale: 1 - s, dy: s * ctx.width * 0.25 };
      },
    }),
  },
};

export const APPEAR_SPEC_IDS: string[] = Object.keys(APPEAR_SPECS);

export const APPEAR_STYLES: Readonly<Record<string, AppearStyle>> = {
  none: {
    label: "без анимации — карта просто есть (как было до появления реестра)",
    dur: 0.001,
    frame: () => NEUTRAL_FRAME,
  },

  deal: {
    label: "раздача — карта прилетает слева, доворачиваясь и укладываясь в свой дом",
    dur: 0.42,
    frame: (t, ctx) => {
      const p = clamp01(t / 0.42);
      const e = easeOutQuad(p); // резкий бросок и мягкая укладка — как рукой из колоды
      return {
        ...NEUTRAL_FRAME,
        dx: -(1 - e) * ctx.width * 6,
        dy: -(1 - e) * ctx.width * 0.5,
        rot: -(1 - e) * 0.9,
        // Проявляется РАНО: карта должна лететь видимой, а не возникать на подлёте.
        alpha: clamp01(p / 0.25),
        shadow: e,
      };
    },
  },

  drop: {
    label: "падение — карта падает сверху и слегка приминается о стол",
    dur: 0.4,
    frame: (t, ctx) => {
      const p = clamp01(t / 0.4);
      // Ускоряется к столу (падение), потом короткий отскок. Не ease-out: у него удар мягкий, а
      // падающая вещь бьётся резко.
      const fall = p < 0.75 ? (p / 0.75) ** 2 : 1;
      const bounce = p < 0.75 ? 0 : Math.sin(((p - 0.75) / 0.25) * Math.PI) * 0.06;
      return {
        ...NEUTRAL_FRAME,
        dy: -(1 - fall) * ctx.width * 2.2 - bounce * ctx.width * 0.35,
        scale: 1 + (1 - fall) * 0.25 - bounce, // выше = крупнее, при ударе — сплющивание
        alpha: clamp01(p / 0.15),
        shadow: fall,
      };
    },
  },

  grow: {
    label: "разворачивание — карта раскрывается из точки, проворачиваясь",
    dur: 0.35,
    frame: (t) => {
      const p = clamp01(t / 0.35);
      const e = easeOutQuad(p);
      return { ...NEUTRAL_FRAME, scale: e, rot: (1 - e) * -1.4, alpha: clamp01(p / 0.2), shadow: e };
    },
  },

  wipe: {
    label: "проявление сверху вниз — карта «наливается» шторкой, как печать",
    dur: 0.38,
    frame: (t) => {
      const p = clamp01(t / 0.38);
      if (p >= 1) return NEUTRAL_FRAME; // маску обязательно снять, иначе шторка застынет навсегда
      const e = easeOutQuad(p);
      return { ...NEUTRAL_FRAME, mask: [rect(-TEX_W / 2, -TEX_H / 2, TEX_W, TEX_H * e)], shadow: e };
    },
  },

  fade: {
    label: "проявление — карта просто набирает плотность",
    dur: 0.3,
    frame: (t) => {
      const p = clamp01(t / 0.3);
      return { ...NEUTRAL_FRAME, alpha: easeOutQuad(p), scale: 0.94 + 0.06 * easeOutQuad(p), shadow: p };
    },
  },
};

/** Готовые — это фабрики, собранные с их же умолчаниями. Второго описания «как выглядит» нет. */
export const APPEAR_STYLE_IDS: string[] = [...Object.keys(APPEAR_STYLES), ...Object.keys(APPEAR_SPECS)];

/** Стиль по имени. Неизвестное — «без анимации»: появление не должно ломаться от опечатки. */
export function appearStyle(v: AppearStyleRef): AppearStyle {
  // Объект — берём как есть. Реестр НУЖЕН только каталогу и конфигам, которые ссылаются именем;
  // регистрировать свой стиль, чтобы им воспользоваться, не требуется.
  if (typeof v !== "string") return v;
  // Сначала ФАБРИКИ: у стиля с рычагами готовый вариант — это он же, собранный со своими
  // умолчаниями. Второго описания «как выглядит slam» в проекте нет.
  const spec = APPEAR_SPECS[v];
  if (spec) return spec.make(defaults(spec.knobs));
  return APPEAR_STYLES[v] ?? APPEAR_STYLES.none!;
}
