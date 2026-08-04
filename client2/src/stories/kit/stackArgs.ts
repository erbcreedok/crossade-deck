import { fan, heap, linear, type StackLayout } from "../../game/kit/stackLayout";
import type { StackContent } from "../../game/kit/stacks";
import type { Pose } from "../../game/ui/Card";
import {
  pieceDragFrom,
  PICK_ANY,
  PICK_FIRST,
  resolveInteraction,
  stackDragFrom,
  STACK_INTERACTION_IDS,
  type PieceDrag,
  type DragTrigger,
  type PointerSpread,
  type SpreadAxis,
  type SpreadClose,
  type SpreadConfig,
  type StackDrag,
  type TouchSpread,
} from "../../game/kit/stackInteraction";

/** Именованные режимы выбора фигуры для ПАНЕЛИ (предикат в контроль не передать): any/first
 *  разворачиваются в PICK_ANY/PICK_FIRST в interactionFrom. Клиент в коде даёт свой предикат. */
export type PiecePickMode = "any" | "first";

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
   * для спреда и драга фигур; рычаги ниже её ПЕРЕКРЫВАЮТ, а не задают с нуля — так «колода» на
   * панели остаётся колодой, даже когда крутят зазор спреда.
   */
  interaction: string;
  /** Спред включён? Отдельный тумблер, а не «спред есть у пресета»: у стопки его может не быть
   *  вовсе (`plain`), и тогда крутить нечего — этим рычаг и прячется (if). */
  spread: boolean;
  /** Чем двигают спред на десктопе: зум-жестом (Ctrl/тачпад), обычным колесом (pan) или ничем. */
  spreadPointerTrigger: PointerSpread;
  /** Чем двигают спред на тачскрине: двухпальцевым пинчем (zoom) или ничем. */
  spreadTouchTrigger: TouchSpread;
  /** Во сколько растянуть rest-раскладку от якоря в полном спреде (направление берётся из раскладки). */
  spreadGain: number;
  spreadClose: SpreadClose["kind"];
  /** pan-путь: какой осью двигать спред (auto — горизонталь-приоритет). */
  spreadAxis: SpreadAxis;
  /** Инвертировать направление скролла спреда. */
  spreadInvert: boolean;
  /** Чувствительность: прогресс спреда (0..1) на пиксель ввода. */
  spreadSensitivity: number;
  /** Драг фигуры включён? На панели — тумблер (в коде поле принимает и предикат «какие фигуры»). */
  pieceDrag: boolean;
  /** Какую фигуру тащат: любую под пальцем или только верхнюю (панель разворачивает в предикат). */
  piecePick: PiecePickMode;
  /** Каким жестом берут фигуру: тап-и-тащи или «подержи». */
  pieceDragTrigger: DragTrigger;
  /** Драг ВСЕЙ стопки целиком (kit/stackInteraction.ts StackDrag) — тащим за любую её фигуру. */
  stackDrag: boolean;
  /** Каким жестом берут всю стопку: тап-и-тащи или «подержи». */
  stackDragTrigger: DragTrigger;
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
  spreadPointerTrigger: "zoom",
  spreadTouchTrigger: "zoom",
  spreadGain: 10,
  spreadClose: "snap",
  spreadAxis: "auto",
  spreadInvert: false,
  spreadSensitivity: 0.009,
  pieceDrag: true,
  piecePick: "any",
  pieceDragTrigger: "tap",
  stackDrag: false,
  stackDragTrigger: "tap",
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
    description: "механика взаимодействия — готовый пресет (kit/stackInteraction.ts). База для спреда и драга фигур; рычаги ниже её ПЕРЕКРЫВАЮТ, а не задают с нуля",
    control: { type: "select" as const },
    options: STACK_INTERACTION_IDS,
  },
  spread: {
    name: "spread",
    description: "спред включён — стопка раздвигается ВДОЛЬ СВОЕЙ раскладки (растёт её шаг от якоря); направление берётся из layout.angleDeg. Каким жестом двигать — spread.pointerTrigger/touchTrigger; на пределе жест переходит камере",
    control: { type: "boolean" as const },
  },
  spreadPointerTrigger: {
    name: "spread.pointerTrigger",
    description: "чем двигать спред на ПК (указатель): zoom — Ctrl-колесо/тачпад-пинч, pan — обычное колесо/скролл, false — ничем (жест уходит камере)",
    control: { type: "select" as const },
    options: [false, "zoom", "pan"],
    if: { arg: "spread", truthy: true },
  },
  spreadTouchTrigger: {
    name: "spread.touchTrigger",
    description: "чем двигать спред на телефоне: zoom — двухпальцевый пинч, false — ничем (пинч уходит в зум камеры). Пан одним пальцем всегда у камеры",
    control: { type: "select" as const },
    options: [false, "zoom"],
    if: { arg: "spread", truthy: true },
  },
  spreadGain: {
    name: "spread.gain",
    description: "во сколько растянуть раскладку от якоря (нижней фигуры) в полном спреде: множитель rest-офсетов. Направление/центр — из самой раскладки, поэтому отдельного угла/centerX/keepDiagonal нет",
    control: { type: "range" as const, min: 1, max: 20, step: 0.5 },
    if: { arg: "spread", truthy: true },
  },
  spreadClose: {
    name: "spread.close",
    description: "что делает раскрытая стопка без взаимодействия: infinite — держится сама, timer — схлоп через паузу, snap — липнет к ближайшему стопу, dribble — «пляшет» и на пике собирается",
    control: { type: "select" as const },
    options: ["infinite", "timer", "snap", "dribble"],
    if: { arg: "spread", truthy: true },
  },
  spreadAxis: {
    name: "spread.input.axis",
    description: "pan-путь (обычный скролл): какой осью двигать спред — auto (доминирующая, горизонталь при равенстве), x, y",
    control: { type: "select" as const },
    options: ["auto", "x", "y"],
    if: { arg: "spread", truthy: true },
  },
  spreadInvert: {
    name: "spread.input.invert",
    description: "инвертировать направление скролла/жеста спреда",
    control: { type: "boolean" as const },
    if: { arg: "spread", truthy: true },
  },
  spreadSensitivity: {
    name: "spread.input.sensitivity",
    description: "чувствительность: прогресс спреда (0..1) на пиксель ввода",
    control: { type: "range" as const, min: 0.001, max: 0.05, step: 0.001 },
    if: { arg: "spread", truthy: true },
  },
  pieceDrag: {
    name: "pieceDrag",
    description: "драг отдельной фигуры включён. В коде поле принимает и предикат «какие фигуры хватаются» (только верхняя, по правилу…); на панели — тумблер + режим ниже",
    control: { type: "boolean" as const },
  },
  piecePick: {
    name: "pieceDrag.pick",
    description: "какую фигуру тащат: any — ту, на которую попал палец, first — только верхнюю",
    control: { type: "select" as const },
    options: ["any", "first"],
    if: { arg: "pieceDrag", truthy: true },
  },
  pieceDragTrigger: {
    name: "pieceDrag.trigger",
    description: "каким жестом берут фигуру: tap — тап-и-тащи, hold — пока держат палец",
    control: { type: "select" as const },
    options: ["tap", "hold"],
    if: { arg: "pieceDrag", truthy: true },
  },
  stackDrag: {
    name: "stackDrag",
    description: "тащить стопку целиком за любую её фигуру, поверх пресета — как block, но на любой раскладке",
    control: { type: "boolean" as const },
  },
  stackDragTrigger: {
    name: "stackDrag.trigger",
    description: "каким жестом берут всю стопку: tap — тап-и-тащи, hold — пока держат палец",
    control: { type: "select" as const },
    options: ["tap", "hold"],
    if: { arg: "stackDrag", truthy: true },
  },
};

/**
 * Спреду и драгу нужен пресет-БАЗА (kit/stackInteraction.ts STACK_INTERACTIONS) — панель его не
 * задаёт с нуля, а перекрывает уровнем рычагов сверху. `spread`/`pieceDrag`/`stackDrag` — тумблеры,
 * каждый перекрывает соответствующую часть пресета; форма спреда (maxGap/close/…) и способ выбора
 * карты (pick) берутся с панели, spring — у пресета.
 */
const DEFAULT_CLOSE: Record<SpreadClose["kind"], SpreadClose> = {
  infinite: { kind: "infinite" },
  timer: { kind: "timer", seconds: 4 },
  snap: { kind: "snap", stops: [0, 0.4, 1] },
  dribble: { kind: "dribble", buildSeconds: 1.4 },
};

export function interactionFrom(a: StackArgs): { spread: SpreadConfig | null; pieceDrag: PieceDrag | null; stackDrag: StackDrag | null } {
  const base = resolveInteraction(a.interaction);
  const spread: SpreadConfig | null = a.spread
    ? {
        gain: a.spreadGain,
        // target (override спред-цели раскладкой) — код-левел (пресеты/клиенты), в панель функцию не
        // положишь; у пресета берём, если он его задал.
        ...(base.spread?.target !== undefined ? { target: base.spread.target } : {}),
        // Стопы snap/секунды timer/дриббла берём у пресета, когда выбранный вид совпадает с его
        // собственным (панель тогда лишь подтверждает пресет) — иначе разумные умолчания вида.
        close: base.spread && base.spread.close.kind === a.spreadClose ? base.spread.close : DEFAULT_CLOSE[a.spreadClose],
        spring: base.spread?.spring ?? 12,
        input: {
          pointerTrigger: a.spreadPointerTrigger,
          touchTrigger: a.spreadTouchTrigger,
          axis: a.spreadAxis,
          invert: a.spreadInvert,
          sensitivity: a.spreadSensitivity,
        },
      }
    : null;
  // Режим панели (any/first) разворачиваем в готовый предикат; в коде клиент даёт свой напрямую.
  const pieceDrag: PieceDrag | null = pieceDragFrom(a.pieceDrag && (a.piecePick === "first" ? PICK_FIRST : PICK_ANY), a.pieceDragTrigger);
  const stackDrag: StackDrag | null = stackDragFrom(a.stackDrag, a.stackDragTrigger);
  return { spread, pieceDrag, stackDrag };
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
