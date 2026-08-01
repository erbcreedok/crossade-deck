import { spinAngle } from "../flip";
import { easeOutQuad } from "./easing";
import type { StyleKnob } from "./appearStyles";

// СТИЛИ ПЕРЕВОРОТА — реестр, а не ветки в коде.
//
// Пресеты крутят ЧИСЛА (сколько длится, сколько оборотов, какая задержка волны). Этого мало:
// дизайнер хочет не «тот же переворот, но на 0.2 с быстрее», а ДРУГОЕ ДВИЖЕНИЕ — карту, которая
// уходит петлёй, подбрасывается, откидывается вбок. Числами такого не выразить.
//
// Поэтому стиль — функция прогресса. Она отвечает на один вопрос: где карта и как повёрнута в
// момент `p` ∈ [0,1]. Всё остальное (когда начать, сколько длить, чем закончить) остаётся движку.
//
// КАК ЗАДАТЬ СВОЮ. Просто передать её в пресет объектом — регистрировать НЕ НУЖНО:
//
//   presetById("default", { flip: { style: { label: "баклажан", frame: (p) => ({ … }) } } })
//
// Реестр ниже — список готовых и точка, на которую ссылаются СЕРИАЛИЗУЕМЫЕ конфиги (функцию по
// сети не пошлёшь, имя — да). Требования к функции два:
//   1. ЧИСТАЯ — ни Pixi, ни времени, ни состояния. Тогда её видно юнит-тестом, а Pixi в node не
//      исполняется, и проверить движением иначе нечем.
//   2. При p=0 и p=1 отклонения нулевые (dx=dy=rot=0, scale=1). Иначе карта «прилетит» в свой дом
//      со скачком: движок ставит её ровно в дом, а стиль дорисовывает отклонение ОТ него.

/** Где карта относительно СВОЕГО дома в этот момент переворота. Отклонения, а не координаты. */
export interface FlipFrame {
  /** Угол вокруг вертикальной оси, рад. Из него движок берёт и сжатие по X, и смену стороны. */
  angle: number;
  /** Сдвиг от дома, в долях ширины/высоты карты. */
  dx: number;
  dy: number;
  /** Наклон в плоскости стола, рад. */
  rot: number;
  /** Множитель размера — «ближе к зрителю» на подлёте. */
  scale: number;
}

/**
 * Чем задаётся стиль: САМИМ стилем или именем из реестра.
 *
 * Объект первичен. Строка — сокращение для готовых и для конфигов, которые сериализуются
 * (docs/PORTABILITY.md: конфиг доски обязан быть данными). Требовать регистрации ради того, чтобы
 * подставить свою функцию, было бы прямым запретом на «свою анимацию».
 */
export type FlipStyleRef = FlipStyle | string;

export interface FlipStyle {
  label: string;
  frame: (p: number, halfTurns: number) => FlipFrame;
}

const flat = (angle: number): FlipFrame => ({ angle, dx: 0, dy: 0, rot: 0, scale: 1 });

/** Дуга 0→1→0: ноль на концах, максимум в середине. Общий множитель всех «полётных» стилей. */
function arc(p: number): number {
  return Math.sin(Math.PI * Math.max(0, Math.min(1, p)));
}

export const FLIP_STYLES: Readonly<Record<string, FlipStyle>> = {
  spin: {
    label: "поворот на месте — карта проворачивается, никуда не двигаясь",
    // easeOutQuad, а не линейно: переворот резко начинается и мягко доводится, как настоящий.
    frame: (p, halfTurns) => flat(spinAngle(easeOutQuad(p), halfTurns)),
  },

  loop: {
    label: "петля — карта уходит вверх дугой, проворачиваясь, и возвращается в свой дом",
    frame: (p, halfTurns) => ({
      angle: spinAngle(p, halfTurns), // линейно: на дуге ease читается как рывок в верхней точке
      dx: 0,
      dy: -arc(p) * 0.85,
      rot: Math.sin(Math.PI * 2 * p) * 0.22, // качнулась туда и обратно — ноль на обоих концах
      scale: 1 + arc(p) * 0.12, // выше = ближе к зрителю
    }),
  },

  toss: {
    label: "подброс — карта взлетает, крутится в воздухе и падает обратно",
    frame: (p, halfTurns) => ({
      angle: spinAngle(easeOutQuad(p), halfTurns),
      dx: 0,
      // Взлёт быстрый, падение медленное — как под тяжестью. Не синус: у него подъём и падение
      // симметричны, а брошенная вещь так себя не ведёт.
      dy: -(p < 0.4 ? easeOutQuad(p / 0.4) : 1 - ((p - 0.4) / 0.6) ** 2) * 1.2,
      rot: Math.sin(Math.PI * 2 * p) * 0.35,
      scale: 1 + arc(p) * 0.18,
    }),
  },

  swing: {
    label: "откид — карта уходит вбок, переворачивается и возвращается",
    frame: (p, halfTurns) => ({
      angle: spinAngle(easeOutQuad(p), halfTurns),
      dx: arc(p) * 0.9,
      dy: -arc(p) * 0.2,
      rot: arc(p) * 0.4,
      scale: 1,
    }),
  },
};

export const FLIP_STYLE_IDS: string[] = Object.keys(FLIP_STYLES);

/** Стиль по имени. Неизвестное — «поворот на месте»: опечатка не должна гасить переворот вовсе. */
export function flipStyle(v: FlipStyleRef): FlipStyle {
  // Объект — берём как есть. Реестр НУЖЕН только каталогу и конфигам, которые ссылаются именем;
  // регистрировать свой стиль, чтобы им воспользоваться, не требуется.
  if (typeof v !== "string") return v;
  return FLIP_STYLES[v] ?? FLIP_STYLES.spin!;
}

// ——————————————————————————————————————————————————————————————————————
// СТИЛИ С РЫЧАГАМИ
// ——————————————————————————————————————————————————————————————————————
//
// Выбрать «петля» мало: настраивают высоту подъёма, качание и приближение к зрителю. Поэтому такие
// стили — ФАБРИКИ: числа снаружи, а каталог строит под них панель из `knobs` автоматически.

export interface FlipStyleSpec {
  label: string;
  knobs: Record<string, StyleKnob>;
  make: (v: Record<string, number>) => FlipStyle;
}

export const FLIP_SPECS: Readonly<Record<string, FlipStyleSpec>> = {
  spin: {
    label: "поворот на месте — карта проворачивается, никуда не двигаясь",
    knobs: { ease: { label: "мягкость доводки: 0 — линейно, 1 — резкий старт и мягкий финиш", min: 0, max: 1, step: 0.05, def: 1 } },
    make: (v) => ({
      label: "поворот на месте",
      frame: (p, halfTurns) => flat(spinAngle(p + (easeOutQuad(p) - p) * v.ease!, halfTurns)),
    }),
  },

  loop: {
    label: "петля — карта уходит вверх дугой, проворачиваясь, и возвращается в свой дом",
    knobs: {
      lift: { label: "высота подъёма, в высотах карты", min: 0, max: 2.5, step: 0.05, def: 0.85 },
      sway: { label: "качание вокруг своей оси, рад", min: 0, max: 1, step: 0.02, def: 0.22 },
      zoom: { label: "приближение к зрителю в верхней точке", min: 0, max: 0.6, step: 0.02, def: 0.12 },
    },
    make: (v) => ({
      label: "петля",
      frame: (p, halfTurns) => ({
        // Линейно, а не ease: на дуге доводка читается как рывок в верхней точке.
        angle: spinAngle(p, halfTurns),
        dx: 0,
        dy: -arc(p) * v.lift!,
        // Полный период синуса — ноль на ОБОИХ концах: иначе карта сядет домой наклонённой.
        rot: Math.sin(Math.PI * 2 * p) * v.sway!,
        scale: 1 + arc(p) * v.zoom!,
      }),
    }),
  },

  toss: {
    label: "подброс — карта взлетает, крутится в воздухе и падает обратно",
    knobs: {
      height: { label: "высота подброса, в высотах карты", min: 0.2, max: 3, step: 0.1, def: 1.2 },
      apex: { label: "доля времени до верхней точки: меньше — резче бросок", min: 0.15, max: 0.7, step: 0.05, def: 0.4 },
      sway: { label: "закрутка в воздухе, рад", min: 0, max: 1.2, step: 0.05, def: 0.35 },
    },
    make: (v) => ({
      label: "подброс",
      frame: (p, halfTurns) => ({
        angle: spinAngle(easeOutQuad(p), halfTurns),
        dx: 0,
        // Взлёт быстрый, падение медленное — как под тяжестью. Не синус: у него подъём и падение
        // симметричны, а брошенная вещь так себя не ведёт.
        dy: -(p < v.apex! ? easeOutQuad(p / v.apex!) : 1 - ((p - v.apex!) / (1 - v.apex!)) ** 2) * v.height!,
        rot: Math.sin(Math.PI * 2 * p) * v.sway!,
        scale: 1 + arc(p) * 0.18,
      }),
    }),
  },

  swing: {
    label: "откид — карта уходит вбок, переворачивается и возвращается",
    knobs: {
      reach: { label: "вылет вбок, в ширинах карты", min: 0, max: 2.5, step: 0.05, def: 0.9 },
      rise: { label: "подъём на вылете, в высотах карты", min: 0, max: 1, step: 0.05, def: 0.2 },
      tilt: { label: "наклон на вылете, рад", min: 0, max: 1.2, step: 0.05, def: 0.4 },
    },
    make: (v) => ({
      label: "откид",
      frame: (p, halfTurns) => ({
        angle: spinAngle(easeOutQuad(p), halfTurns),
        dx: arc(p) * v.reach!,
        dy: -arc(p) * v.rise!,
        rot: arc(p) * v.tilt!,
        scale: 1,
      }),
    }),
  },
};

export const FLIP_SPEC_IDS: string[] = Object.keys(FLIP_SPECS);
