import { fan, heap, linear, type StackLayout } from "../../game/kit/stackLayout";
import type { StackContent } from "../../game/kit/stacks";
import type { Pose } from "../../game/ui/Card";
import {
  resolveInteraction,
  STACK_INTERACTION_IDS,
  type CardDrag,
  type CardPick,
  type SpreadClose,
  type SpreadConfig,
  type StackDrag,
  type Trigger,
} from "../../game/kit/stackInteraction";

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
  /** Из чего сложена пачка: карты, фишки, фигуры. Раскладка от этого не зависит. */
  content: StackContent;
  /**
   * Механика взаимодействия — готовый пресет (kit/stackInteraction.ts STACK_INTERACTIONS). База
   * для спреда и драга карт; рычаги ниже её ПЕРЕКРЫВАЮТ, а не задают с нуля — так «колода» на
   * панели остаётся колодой, даже когда крутят зазор спреда.
   */
  interaction: string;
  /** Спред включён? Отдельный тумблер, а не «спред есть у пресета»: у стопки его может не быть
   *  вовсе (`plain`), и тогда крутить нечего — этим рычаг и прячется (if). */
  spread: boolean;
  spreadTrigger: Trigger;
  spreadMaxGap: number;
  spreadClose: SpreadClose["kind"];
  spreadCenterX: boolean;
  spreadKeepDiagonal: boolean;
  /** Какую карту тащат: любую под пальцем или только верхнюю. */
  cardPick: CardPick;
  /** Каким жестом берут карту: тап-и-тащи или «подержи». */
  cardDragTrigger: Extract<Trigger, "tap" | "hold">;
  /**
   * Форс-включатель драга ВСЕЙ стопки целиком (kit/stackInteraction.ts StackDrag), поверх того, что
   * даёт пресет `interaction` (у `block` он и так есть). Жест — тот же `cardDragTrigger`.
   */
  stackDrag: boolean;
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
  content: "cards",
  interaction: "plain",
  spread: false,
  spreadTrigger: "always",
  spreadMaxGap: 34,
  spreadClose: "snap",
  spreadCenterX: false,
  spreadKeepDiagonal: true,
  cardPick: "any",
  cardDragTrigger: "tap",
  stackDrag: false,
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
  pose: { name: "pose", description: "поза покоя: rest — лежит на столе, lifted — поднята, held — держат. Не путать с idle-анимацией (дыхание): rest это СОСТОЯНИЕ, idle — АНИМАЦИЯ", control: { type: "select" as const }, options: ["rest", "lifted", "held"] },
  selected: { name: "selected", description: "контур набора (метка outline); подъём — отдельная метка, это pose: lifted", control: { type: "boolean" as const } },
  count: { name: "count", description: "сколько предметов в пачке; от этого зависит и длина волны при перевороте", control: { type: "range" as const, min: 1, max: 10, step: 1 } },
  content: {
    name: "content",
    description: "из чего пачка. Стопка — это ПОРЯДОК и раскладка, а не «много карт»: так же складывают фишки в столбик и сваливают фигуры в кучу",
    control: { type: "select" as const },
    options: ["cards", "chips", "pieces"],
  },
  interaction: {
    name: "interaction",
    description: "механика взаимодействия — готовый пресет (kit/stackInteraction.ts). База для спреда и драга карт; рычаги ниже её ПЕРЕКРЫВАЮТ, а не задают с нуля",
    control: { type: "select" as const },
    options: STACK_INTERACTION_IDS,
  },
  spread: {
    name: "spread",
    description: "спред включён — колесо/скролл по стопке раздвигает её поверх базовой раскладки",
    control: { type: "boolean" as const },
  },
  spreadTrigger: {
    name: "spread.trigger",
    description: "как включается спред-режим: всегда / по тапу-тогглу / пока держат",
    control: { type: "select" as const },
    options: ["always", "tap", "hold"],
    if: { arg: "spread", truthy: true },
  },
  spreadMaxGap: {
    name: "spread.maxGap",
    description: "предел доп. зазора по X на карту, px",
    control: { type: "range" as const, min: 0, max: 120, step: 2 },
    if: { arg: "spread", truthy: true },
  },
  spreadClose: {
    name: "spread.close",
    description: "что делает раскрытая стопка без взаимодействия: infinite — держится сама, timer — схлоп через паузу, snap — липнет к ближайшему стопу, dribble — «пляшет» и на пике собирается",
    control: { type: "select" as const },
    options: ["infinite", "timer", "snap", "dribble"],
    if: { arg: "spread", truthy: true },
  },
  spreadCenterX: {
    name: "spread.centerX",
    description: "центрировать раздвиг по X, а не растить его от первой карты",
    control: { type: "boolean" as const },
    if: { arg: "spread", truthy: true },
  },
  spreadKeepDiagonal: {
    name: "spread.keepDiagonal",
    description: "сохранять диагональный стаггер базовой раскладки поверх спреда",
    control: { type: "boolean" as const },
    if: { arg: "spread", truthy: true },
  },
  cardPick: {
    name: "cardDrag.pick",
    description: "какую карту тащат: any — ту, на которую попал палец, first — только верхнюю",
    control: { type: "select" as const },
    options: ["any", "first"],
    if: { arg: "interaction", neq: "block" },
  },
  cardDragTrigger: {
    name: "cardDrag.trigger",
    description: "каким жестом берут карту: tap — тап-и-тащи, hold — пока держат палец",
    control: { type: "select" as const },
    options: ["tap", "hold"],
    if: { arg: "interaction", neq: "block" },
  },
  stackDrag: {
    name: "stackDrag",
    description: "тащить стопку целиком за любую её карту, поверх пресета — как block, но на любой раскладке",
    control: { type: "boolean" as const },
  },
};

/**
 * Спреду и драгу карт нужен пресет-БАЗА (kit/stackInteraction.ts STACK_INTERACTIONS) — панель
 * его не задаёт с нуля, а перекрывает уровнем рычагов сверху. `spread: false` выключает спред
 * целиком (даже если у пресета он есть), а cardPick/cardDragTrigger применяются, только когда у
 * пресета вообще есть cardDrag (у `block` его нет — стопка тащится целиком).
 */
const DEFAULT_CLOSE: Record<SpreadClose["kind"], SpreadClose> = {
  infinite: { kind: "infinite" },
  timer: { kind: "timer", seconds: 4 },
  snap: { kind: "snap", stops: [0, 0.4, 1] },
  dribble: { kind: "dribble", buildSeconds: 1.4 },
};

export function interactionFrom(a: StackArgs): { spread: SpreadConfig | null; cardDrag: CardDrag | null; stackDrag: StackDrag | null } {
  const base = resolveInteraction(a.interaction);
  const spread: SpreadConfig | null = a.spread
    ? {
        trigger: a.spreadTrigger,
        maxGap: a.spreadMaxGap,
        keepDiagonal: a.spreadKeepDiagonal,
        centerX: a.spreadCenterX,
        // Стопы snap/секунды timer/дриббла берём у пресета, когда выбранный вид совпадает с его
        // собственным (панель тогда лишь подтверждает пресет) — иначе разумные умолчания вида.
        close: base.spread && base.spread.close.kind === a.spreadClose ? base.spread.close : DEFAULT_CLOSE[a.spreadClose],
        spring: base.spread?.spring ?? 12,
      }
    : null;
  const cardDrag: CardDrag | null = base.cardDrag ? { trigger: a.cardDragTrigger, pick: a.cardPick } : null;
  // Форс-рычаг `stackDrag` перекрывает пресет; иначе — как у пресета (только `block` его даёт).
  const stackDrag: StackDrag | null = a.stackDrag ? { trigger: a.cardDragTrigger } : base.stackDrag;
  return { spread, cardDrag, stackDrag };
}

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
export function stackOptsFrom(a: StackArgs): { form: StackLayout; faceUp: boolean; pose: Pose; selected: boolean; count: number; content: StackContent } {
  return { form: layoutFrom(a), faceUp: a.faceUp, pose: a.pose, selected: a.selected, count: a.count, content: a.content };
}
