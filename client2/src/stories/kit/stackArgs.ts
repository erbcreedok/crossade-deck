import { fan, heap, linear, type StackLayout } from "../../game/kit/stackLayout";
import type { Pose } from "../../game/ui/Card";

// РЫЧАГИ СТОПКИ — ОДНО описание на все разделы, где стопка вообще встречается.
//
// Их было два: свой набор в «UI-kit/Stack» и другой, урезанный, в «Анимациях». Одна и та же вещь
// показывалась с разными крутилками, и разойтись им было негде — они уже разошлись. Тот же приём,
// что у `cardArgs`/`buttonArgs`: описание одно, разделы берут его целиком или подмножеством.
//
// Раскладка описана ПАРАМЕТРАМИ, а не списком имён: «колода», «столбец Косынки» и «ряд» — это одна
// линейная функция с разными углом и шагом, а не три разные сущности (см. kit/stackLayout.ts).

export interface StackArgs {
  /** Вид раскладки. Направление и плотность — отдельные рычаги: это ПАРАМЕТРЫ, а не разные виды. */
  layout: "linear" | "fan" | "heap";
  angleDeg: number;
  step: number;
  rotStep: number;
  fanStepDeg: number;
  fanRadius: number;
  heapSpread: number;
  faceUp: boolean;
  pose: Pose;
  selected: boolean;
  count: number;
}

export const STACK_ARGS: StackArgs = {
  layout: "linear",
  angleDeg: 0,
  step: 0.06,
  rotStep: 0,
  fanStepDeg: 10,
  fanRadius: 2.6,
  heapSpread: 0.22,
  faceUp: true,
  pose: "rest",
  selected: false,
  count: 5,
};

export const STACK_ARG_TYPES = {
  layout: {
    name: "layout",
    description: "вид раскладки. linear — прямая в ЛЮБУЮ сторону: колода, столбец Косынки и ряд — это она с разными углом и шагом; fan — дуга; heap — куча сброса",
    control: { type: "select" as const },
    options: ["linear", "fan", "heap"],
  },
  angleDeg: { name: "linear.angleDeg", description: "направление: 0 — вправо, 90 — вниз, 180 — влево", control: { type: "range" as const, min: 0, max: 359, step: 5 }, if: { arg: "layout", eq: "linear" } },
  step: { name: "linear.step", description: "шаг соседа в долях карты: 0.06 — колода, 0.72 — раскрытая, 1.12 — ряд без нахлёста", control: { type: "range" as const, min: 0, max: 1.4, step: 0.02 }, if: { arg: "layout", eq: "linear" } },
  rotStep: { name: "linear.rot", description: "доворот каждой следующей карты, рад — лесенка", control: { type: "range" as const, min: -0.3, max: 0.3, step: 0.01 }, if: { arg: "layout", eq: "linear" } },
  fanStepDeg: { name: "fan.step", description: "угол между соседями в веере, град", control: { type: "range" as const, min: 1, max: 30, step: 1 }, if: { arg: "layout", eq: "fan" } },
  fanRadius: { name: "fan.radiusMult", description: "радиус дуги в ширинах карты: больше — площе веер", control: { type: "range" as const, min: 1, max: 8, step: 0.1 }, if: { arg: "layout", eq: "fan" } },
  heapSpread: { name: "heap.spread", description: "разброс кучи в долях карты", control: { type: "range" as const, min: 0, max: 0.8, step: 0.02 }, if: { arg: "layout", eq: "heap" } },
  faceUp: { name: "faceUp", description: "лицом или рубашкой. У закрытой пачки волна переворота читается только геометрией", control: { type: "boolean" as const } },
  pose: { name: "pose", description: "план покоя: rest — лежит на столе, lifted — поднята, held — держат. Не путать с idle-анимацией (дыхание): rest это СОСТОЯНИЕ, idle — АНИМАЦИЯ", control: { type: "select" as const }, options: ["rest", "lifted", "held"] },
  selected: { name: "selected", description: "контур набора (метка outline); подъём — отдельная метка, это pose: lifted", control: { type: "boolean" as const } },
  count: { name: "count", description: "сколько карт в пачке; от этого зависит и длина волны при перевороте", control: { type: "range" as const, min: 1, max: 10, step: 1 } },
};

/**
 * Раскладка из аргументов панели. Направление, шаг и доворот — параметры ОДНОЙ линейной функции:
 * «колода», «столбец» и «ряд» это она же с разными числами.
 */
export function layoutFrom(a: StackArgs): StackLayout {
  if (a.layout === "fan") return fan({ step: (a.fanStepDeg * Math.PI) / 180, radiusMult: a.fanRadius });
  if (a.layout === "heap") return heap({ spread: a.heapSpread });
  return linear({ angleDeg: a.angleDeg, step: a.step, rot: a.rotStep });
}

/** То, что уходит в `stackState`: раскладка-функция плюс остальные поля как есть. */
export function stackOptsFrom(a: StackArgs): { form: StackLayout; faceUp: boolean; pose: Pose; selected: boolean; count: number } {
  return { form: layoutFrom(a), faceUp: a.faceUp, pose: a.pose, selected: a.selected, count: a.count };
}
