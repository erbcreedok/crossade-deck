import type { StackLayout, StackOffset } from "./stackLayout";

interface Cell {
  w: number;
  h: number;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

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

/** Чем на ДЕСКТОПЕ (указатель: мышь/тачпад) ДВИГАЮТ спред: зум-жестом (Ctrl/⌘-колесо, тачпад-пинч),
 *  обычным колесом/скроллом (`pan`) или ничем (`false`). Камере достаётся то, что спред НЕ взял (не
 *  тот жест / предел). `pan` — альтернатива `zoom`, НЕ спреду. */
export type PointerSpread = false | "zoom" | "pan";
export const POINTER_SPREADS: readonly PointerSpread[] = [false, "zoom", "pan"];
/** Чем на ТАЧСКРИНЕ двигают спред: двухпальцевым пинчем (`zoom`) или ничем (`false`). Пан одним
 *  пальцем — всегда камере/драгу, поэтому `pan` тут нет. */
export type TouchSpread = false | "zoom";
export const TOUCH_SPREADS: readonly TouchSpread[] = [false, "zoom"];
/** Какой осью колеса/скролла двигать спред на pan-пути: auto — доминирующая (горизонталь при равенстве),
 *  x/y — жёстко. (Раздвиг обычно горизонтальный, поэтому auto = «горизонталь ведёт».) */
export type SpreadAxis = "auto" | "x" | "y";
export const SPREAD_AXES: readonly SpreadAxis[] = ["auto", "x", "y"];
/** Чувствительность по умолчанию: прогресс спреда (0..1) на пиксель ввода. */
export const DEFAULT_SPREAD_SENSITIVITY = 0.009;

/** ВВОД спреда — ОТДЕЛЬНО от геометрии: каким жестом двигать и как маппить (ось/инверсия/чувствит.).
 *  Одна геометрия (gain/target) — разные способы её гнать. */
export interface SpreadInput {
  pointerTrigger: PointerSpread; // десктоп: зум-жест / обычное колесо / ничего
  touchTrigger: TouchSpread; // тач: двухпальцевый пинч / ничего
  axis?: SpreadAxis; // pan-путь: какой осью (по умолчанию auto — горизонталь-приоритет)
  invert?: boolean; // инвертировать знак направления
  sensitivity?: number; // прогресс на пиксель (по умолчанию DEFAULT_SPREAD_SENSITIVITY)
}

/** Точка отброса спреда (pivot): откуда расходятся фигуры. bottom — якорь (нижняя, index 0), center —
 *  центр стопки, top — верхняя, right — самая правая. Влияет на radial/circle/spiral. Для inherit
 *  неактуально — центрирование там задаёт сама раскладка. */
export type SpreadOrigin = "bottom" | "center" | "top" | "right";
export const SPREAD_ORIGINS: readonly SpreadOrigin[] = ["bottom", "center", "top", "right"];

/**
 * СПРЕД параметризуется ФОРМОЙ (`shape`, шаблон) — как раскладка выражается функцией, а не именем.
 * Дефолт `inherit` растит НАТУРАЛЬНЫЙ параметр раскладки (fan по центру, linear по углу, heap
 * радиально) — направление/центр даром. Клиент переопределяет любой формой (radial/linear/circle/
 * spiral/своя). `gain` — усиление на полном спреде; `origin` — точка отброса; `angleDeg` — направление
 * для linear-формы. Ввод (жест/ось/инверсия/чувствит.) — отдельно, в `input`.
 */
export interface SpreadConfig {
  gain: number; // усиление на полном спреде (множитель параметра/разлёта)
  shape?: SpreadShapeRef; // форма спреда (шаблон); по умолчанию inherit — растит параметр раскладки
  origin?: SpreadOrigin; // точка отброса для radial/circle/spiral (по умолчанию bottom = якорь)
  angleDeg?: number; // направление для shape="linear" (град; по умолчанию 0 — вправо)
  close: SpreadClose;
  spring: number; // скорость подтяжки amount→target (1/сек); больше — резче
  input: SpreadInput;
}

// ——— ФОРМЫ СПРЕДА (шаблоны) — именованные, экспортируемые; в Storybook select по id ———
// Форма = полная позиция фигуры i при прогрессе amount (0..1). Клиент даёт свою; готовые ниже.

export interface SpreadShapeCtx {
  i: number;
  n: number;
  cell: Cell;
  gain: number;
  base: StackOffset; // rest-офсет фигуры (раскладка при strength=1)
  pivot: StackOffset; // точка отброса (см. SpreadOrigin), в координатах base
  layout: StackLayout; // сама раскладка (для inherit — зовём с усилением)
  angleDeg: number; // направление для linear-формы
}
export type SpreadShape = (ctx: SpreadShapeCtx, amount: number) => StackOffset;

function lerpOff(a: StackOffset, b: StackOffset, t: number): StackOffset {
  return { dx: lerp(a.dx, b.dx, t), dy: lerp(a.dy, b.dy, t), rot: lerp(a.rot, b.rot, t) };
}

/** inherit — растит НАТУРАЛЬНЫЙ параметр раскладки (зовём layout с усилением 1→gain). Направление и
 *  центрирование — от самой раскладки (fan по центру, linear по углу, heap радиально). */
const inheritShape: SpreadShape = (ctx, amount) => ctx.layout(ctx.i, ctx.n, ctx.cell, 1 + (ctx.gain - 1) * amount);

/** radial — фигуры разлетаются от pivot наружу по своим лучам (rest×gain вокруг pivot). Хорош для heap. */
const radialShape: SpreadShape = (ctx, amount) => {
  const k = 1 + (ctx.gain - 1) * amount;
  return { dx: ctx.pivot.dx + (ctx.base.dx - ctx.pivot.dx) * k, dy: ctx.pivot.dy + (ctx.base.dy - ctx.pivot.dy) * k, rot: ctx.base.rot };
};

/** linear — выстраивает фигуры в ПРЯМУЮ линию по углу angleDeg от pivot (веер → ряд). Игнорит базу. */
const linearShape: SpreadShape = (ctx, amount) => {
  const a = (ctx.angleDeg * Math.PI) / 180;
  const len = Math.abs(Math.cos(a)) * ctx.cell.w + Math.abs(Math.sin(a)) * ctx.cell.h;
  const s = 0.6 * len; // шаг ряда на полном спреде (доля карты)
  const full: StackOffset = { dx: ctx.pivot.dx + Math.cos(a) * s * ctx.i, dy: ctx.pivot.dy + Math.sin(a) * s * ctx.i, rot: 0 };
  return lerpOff(ctx.base, full, amount);
};

/** circle — фигуры уходят в кольцо вокруг pivot (радиус вмещает n штук). */
const circleShape: SpreadShape = (ctx, amount) => {
  const theta = ctx.n > 1 ? (2 * Math.PI * ctx.i) / ctx.n : 0;
  const R = (ctx.n * ctx.cell.w * 0.5) / (2 * Math.PI) + ctx.cell.w * 0.5;
  const full: StackOffset = { dx: ctx.pivot.dx + R * Math.cos(theta), dy: ctx.pivot.dy + R * Math.sin(theta), rot: 0 };
  return lerpOff(ctx.base, full, amount);
};

/** spiral — фигуры по спирали (золотой угол) от pivot. */
const spiralShape: SpreadShape = (ctx, amount) => {
  const GOLDEN = 2.399963229728653;
  const theta = ctx.i * GOLDEN;
  const r = 0.55 * Math.sqrt(ctx.i) * Math.max(ctx.cell.w, ctx.cell.h);
  const full: StackOffset = { dx: ctx.pivot.dx + r * Math.cos(theta), dy: ctx.pivot.dy + r * Math.sin(theta), rot: 0 };
  return lerpOff(ctx.base, full, amount);
};

export const SPREAD_SHAPES: Readonly<Record<string, { label: string; make: () => SpreadShape }>> = {
  inherit: { label: "как раскладка — растит её параметр (fan по центру, linear по углу, heap радиально)", make: () => inheritShape },
  radial: { label: "разлёт от точки отброса наружу", make: () => radialShape },
  linear: { label: "в прямую линию по углу (веер → ряд)", make: () => linearShape },
  circle: { label: "в кольцо вокруг точки отброса", make: () => circleShape },
  spiral: { label: "по спирали (золотой угол)", make: () => spiralShape },
};
export const SPREAD_SHAPE_IDS: string[] = Object.keys(SPREAD_SHAPES);

/** Чем задана форма спреда: САМОЙ функцией или именем готовой. */
export type SpreadShapeRef = SpreadShape | string;
export function resolveShape(v: SpreadShapeRef): SpreadShape {
  if (typeof v !== "string") return v;
  return (SPREAD_SHAPES[v] ?? SPREAD_SHAPES.inherit!).make();
}

/** Точка отброса (pivot) из origin и rest-офсетов всех фигур. Чистая. */
export function pivotFrom(origin: SpreadOrigin, rests: readonly StackOffset[]): StackOffset {
  if (rests.length === 0) return { dx: 0, dy: 0, rot: 0 };
  if (origin === "bottom") return rests[0]!;
  if (origin === "top") return rests[rests.length - 1]!;
  if (origin === "right") return rests.reduce((m, o) => (o.dx > m.dx ? o : m), rests[0]!);
  const sx = rests.reduce((s, o) => s + o.dx, 0) / rests.length; // center — среднее
  const sy = rests.reduce((s, o) => s + o.dy, 0) / rests.length;
  return { dx: sx, dy: sy, rot: 0 };
}

/** Позиция фигуры i при прогрессе amount ПО ФОРМЕ (без рецентровки/покачивания — их накладывает сцена,
 *  т.к. рецентровка нужна по ВСЕМ фигурам сразу). Чистая. */
export function spreadOffsetAt(cfg: SpreadConfig, ctx: SpreadShapeCtx, amount: number): StackOffset {
  return resolveShape(cfg.shape ?? "inherit")(ctx, amount);
}

/** Сдвиг, удерживающий точку `origin` НА МЕСТЕ при спреде: origin по rest-офсетам должен совпасть с
 *  origin по спред-офсетам. Так fan/линия/кольцо расширяются вокруг выбранной точки (центр не уезжает).
 *  `spreads` — офсеты формы для ВСЕХ фигур при текущем amount. Чистая. */
export function recenterShift(origin: SpreadOrigin, rests: readonly StackOffset[], spreads: readonly StackOffset[]): { dx: number; dy: number } {
  const rp = pivotFrom(origin, rests);
  const sp = pivotFrom(origin, spreads);
  return { dx: rp.dx - sp.dx, dy: rp.dy - sp.dy };
}

/** Покачивание дриббла для фигуры i (dy/rot) по чётности индекса. Сцена добавляет поверх позиции. */
export function wobbleOffset(i: number, wobble: number): { dy: number; rot: number } {
  const par = i % 2 ? -1 : 1;
  return { dy: wobble * par * 6, rot: wobble * par * 0.08 };
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

/** Ввод спреда (жест по стеку, безразлично каким устройством): сдвинуть ПРОГРЕСС-цель на dProgress,
 *  зажать в [0, 1], сбросить простой, ЗАПОМНИТЬ направление (нужно снэпу — см. snapStop). Нулевую
 *  дельту не считаем сменой направления (держим прежнее). */
export function spreadInput(st: SpreadState, dProgress: number, _cfg?: SpreadConfig): SpreadState {
  const dir = Math.sign(dProgress) || st.dir;
  return { amount: st.amount, target: clamp(st.target + dProgress, 0, 1), idle: 0, phase: 0, dir };
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
  // Стопы уже доли 0..1 — а amount/target тоже 0..1 (прогресс), так что стопы и есть цели снэпа.
  const stops = cfg.close.stops.map((s) => clamp(s, 0, 1));
  return snapStop(st.target, stops, st.dir);
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
// ДРАГ: какую ФИГУРУ стека тащим и каким жестом; и тащится ли ВЕСЬ стек как один. «Фигура» — любой
// элемент стека: карта, фишка, тайл (стек generic, не только карточный).
// ———————————————————————————————————————————————————————————————————————————————————————————

/** Контекст выбора фигуры под драг: её id и позиция в стопке (0 — низ, n-1 — верх). */
export interface PickCtx {
  id: string;
  i: number;
  n: number;
}
/** Какие фигуры стопки хватаются под драг. ПРЕДИКАТ (true — эту тащим): клиент пишет свой (только
 *  верхняя, по чётности позиции, свои правила…). Готовые — ниже. Не строка-перечисление: это
 *  capability, а не закрытый список типов. */
export type PiecePick = (c: PickCtx) => boolean;
/** Любая фигура под пальцем (базовое поведение). */
export const PICK_ANY: PiecePick = () => true;
/** Только верхняя фигура (последняя в порядке). */
export const PICK_FIRST: PiecePick = ({ i, n }) => i === n - 1;

export interface PieceDrag {
  pick: PiecePick; // какие фигуры хватаются
  trigger: DragTrigger; // тап-и-тащи или пока зажат
}
export interface StackDrag {
  trigger: DragTrigger;
}

/** Нормализовать авторскую запись драга фигур `boolean | предикат` в конфиг (или null — выключен).
 *  `true` → любая фигура; `false` → нет драга; предикат → он сам. Так пресеты/клиенты пишут коротко. */
export function pieceDragFrom(pick: boolean | PiecePick, trigger: DragTrigger): PieceDrag | null {
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
  pieceDrag: PieceDrag | null;
  stackDrag: StackDrag | null;
}

// ——— именованные ПРЕСЕТЫ (экспортируются; в Storybook — select по id) ———

// База спреда: на обоих устройствах спред двигает ЗУМ-жест (тач-пинч / десктоп Ctrl-колесо/тачпад).
// gain — во сколько растянуть rest-раскладку от якоря в полном спреде (направление берётся из неё).
const spreadBase = (over: Partial<SpreadConfig> = {}): SpreadConfig => ({
  gain: 10,
  close: { kind: "snap", stops: [0, 0.4, 1] },
  spring: 12,
  input: { pointerTrigger: "zoom", touchTrigger: "zoom" },
  ...over,
});

/** Готовые механики по типу стека. Дефолт драга — «тап, любая фигура» (как в стенде и сейчас). */
export const STACK_INTERACTIONS: Readonly<Record<string, { label: string; make: () => StackInteraction }>> = {
  deck: {
    label: "колода — спред зум-жестом (снэп), тащим верхнюю",
    make: () => ({ spread: spreadBase(), pieceDrag: { pick: PICK_FIRST, trigger: "tap" }, stackDrag: null }),
  },
  discard: {
    label: "сброс — спред крупнее, тащим ту, на которую попал палец",
    make: () => ({ spread: spreadBase({ gain: 13, close: { kind: "timer", seconds: 4 } }), pieceDrag: { pick: PICK_ANY, trigger: "tap" }, stackDrag: null }),
  },
  hand: {
    label: "рука — раскрыта, тащим любую, спред-дриббл в простое",
    make: () => ({ spread: spreadBase({ gain: 12, close: { kind: "dribble", buildSeconds: 1.4 } }), pieceDrag: { pick: PICK_ANY, trigger: "tap" }, stackDrag: null }),
  },
  block: {
    label: "блок — тащим весь стек целиком, без спреда",
    make: () => ({ spread: null, pieceDrag: null, stackDrag: { trigger: "tap" } }),
  },
  plain: {
    label: "простой — только тащим любую фигуру (дефолт)",
    make: () => ({ spread: null, pieceDrag: { pick: PICK_ANY, trigger: "tap" }, stackDrag: null }),
  },
};

export const STACK_INTERACTION_IDS: string[] = Object.keys(STACK_INTERACTIONS);

/** Чем задано взаимодействие: САМИМ объектом или именем готового. */
export type StackInteractionRef = StackInteraction | string;

export function resolveInteraction(v: StackInteractionRef): StackInteraction {
  if (typeof v !== "string") return v;
  return (STACK_INTERACTIONS[v] ?? STACK_INTERACTIONS.plain!).make();
}
