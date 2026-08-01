import { Button } from "../ui/Button";
import type { Card } from "../ui/Card";
import { DANCE_DEFAULT, DUST_FLICKER, dustParams, type DanceParams } from "../censorConfig";
import type { Configurable, Param } from "../ui/controls";
import { SB_ITEM_GAP } from "../engine/sandboxLayout";
import type { Pt, SectionContext, SectionSize } from "./context";

// ДВИЖЕНИЕ — всё, что на столе шевелится, собранное в одном месте.
//
// Раздел намеренно разделён на ДВА, потому что «анимация» тут — два разных явления, и рычаги у них
// разной природы:
//
//   ПЕРЕХОД   — конечный: есть начало, длительность и конец. Переворот, «сжечь», полёт по команде,
//               разворот стопки. Его ЗАПУСКАЮТ, и он заканчивается сам. Рычаги перехода — про
//               время и форму кривой; отвечать на него уместно событием («долетело»).
//   СОСТОЯНИЕ — бесконечное: крутится, пока включено. Цензурная пыль, idle-дыхание, левитация,
//               покачивание «подглядел». Его ВКЛЮЧАЮТ. Рычаги состояния — про интенсивность, и
//               никакого «конца» у него нет.
//
// Мешать их в один список нельзя: у половины пунктов кнопка «запустить» бессмысленна, у другой
// половины бессмысленны ползунки интенсивности.
//
// ЧЕЙ ЭТО КОД. Рычаги пыли берутся из `censorConfig` — того же модуля, который крутит стенд
// `/motion` (см. `censorDemo.ts`). Второй набор значений тут заводить нельзя: разъедется ровно
// так же, как уже разъезжался конфиг стопки. Когда до `/motion` дойдут руки, его секции надо
// переселить сюда же — тогда стенд и каталог станут одним кодом, как это уже сделано с песочницей.

/** Всё, что можно покрутить в разделе. Один объект — одна точка правды для панели и для сцены. */
export interface MotionLevers {
  dance: DanceParams;
  flicker: boolean;
  /** Флаги доступности живут у СЦЕНЫ, а не у карты: их выставляет ОС/пользователь на всё сразу. */
  reduceMotion: boolean;
  reduceFlash: boolean;
}

export function makeMotionLevers(): MotionLevers {
  return { dance: { ...DANCE_DEFAULT }, flicker: DUST_FLICKER, reduceMotion: false, reduceFlash: false };
}

/**
 * Рычаги как `Configurable` — из них строятся и канвасные виджеты стенда, и панель каталога.
 * `apply` зовётся после каждой правки: сцена сама решает, что с новым значением делать.
 */
export function motionConfigurable(l: MotionLevers, apply: () => void): Configurable {
  const num = (id: string, label: string, min: number, max: number, get: () => number, set: (v: number) => void): Param => ({
    kind: "number",
    id,
    label,
    min,
    max,
    get,
    set: (v) => (set(v), apply()),
  });
  return {
    params: () => [
      num("block", "размер частицы", 2, 10, () => l.dance.block, (v) => (l.dance.block = v)),
      num("swapsPerSec", "темп обновления", 0, 120, () => l.dance.swapsPerSec, (v) => (l.dance.swapsPerSec = v)),
      num("jitterAmp", "разлёт", 0, 4, () => l.dance.jitterAmp, (v) => (l.dance.jitterAmp = v)),
      num("jitterFreq", "частота мерцания", 0, 14, () => l.dance.jitterFreq, (v) => (l.dance.jitterFreq = v)),
      { kind: "bool", id: "flicker", label: "мерцание", get: () => l.flicker, set: (v) => ((l.flicker = v), apply()) },
      { kind: "bool", id: "reduceMotion", label: "уменьшить движение", get: () => l.reduceMotion, set: (v) => ((l.reduceMotion = v), apply()) },
      { kind: "bool", id: "reduceFlash", label: "без вспышек", get: () => l.reduceFlash, set: (v) => ((l.reduceFlash = v), apply()) },
    ],
  };
}

/** Применить рычаги пыли к живым картам. Карты берём по id — те, что секция сама и расставила. */
export function applyMotionLevers(ctx: SectionContext, l: MotionLevers, ids: readonly string[]): void {
  const p = dustParams(l.dance, l.flicker);
  for (const id of ids) (ctx.element(id) as Card | undefined)?.setDustParams?.(p);
  ctx.wake();
}

// ——————————————————————————————————————————————————————————————————————
// ПЕРЕХОДЫ
// ——————————————————————————————————————————————————————————————————————

/** Один переход: карта, кнопка запуска и что она делает. Список — данные, а не ветки в коде. */
interface Transition {
  id: string;
  caption: string;
  action: string;
  run: (ctx: SectionContext, id: string) => void;
}

const TRANSITIONS: readonly Transition[] = [
  {
    id: "mo-flip",
    caption: "переворот — настоящий поворот на 180°, а не подмена текстуры",
    action: "перевернуть",
    run: (ctx, id) => ctx.dispatch({ t: "flip", id }),
  },
  {
    id: "mo-move",
    caption: "полёт по команде — та же пружина, что при драге; телепорта быть не должно",
    action: "отправить и вернуть",
    run: () => {}, // подменяется при сборке: нужны координаты, известные только там
  },
  {
    id: "mo-burn",
    caption: "«сжечь» — замирание с дрожью, потом расход волнистым фронтом снизу вверх",
    action: "сжечь",
    run: (ctx, id) => {
      const c = ctx.element(id) as Card | undefined;
      c?.burn();
      ctx.wake();
    },
  },
];

export function transitionsSection(ctx: SectionContext, at: Pt): SectionSize & { ids: string[] } {
  const stepX = ctx.cardW * 2.4;
  const ids: string[] = [];
  let maxBottom = at.y;

  TRANSITIONS.forEach((tr, i) => {
    const cx = at.x + ctx.cardW / 2 + i * stepX;
    const cy = at.y + ctx.cardH / 2;
    ctx.card({ id: tr.id, card: ["A♠", "K♥", "Q♦"][i] ?? "A♠", rest: "idle" }, { x: cx, y: cy }, i);
    ids.push(tr.id);

    const home = { x: cx, y: cy };
    const away = { x: cx, y: cy + ctx.cardH * 0.75 };
    let out = false;
    const run =
      tr.id === "mo-move"
        ? () => {
            const to = out ? home : away;
            out = !out;
            ctx.dispatch({ t: "move", id: tr.id, x: to.x, y: to.y });
          }
        : () => tr.run(ctx, tr.id);

    const b = new Button({ label: tr.action, variant: "secondary", size: "sm", onClick: run });
    const by = cy + ctx.cardH * 1.35;
    ctx.button(b, { x: cx, y: by });
    const cap = ctx.label(tr.caption, cx, by + b.h / 2 + 10, 12, 0x9aa89f, stepX * 0.92);
    maxBottom = Math.max(maxBottom, by + b.h / 2 + 10 + cap.height);
  });

  return { bottom: maxBottom, width: TRANSITIONS.length * stepX, ids };
}

// ——————————————————————————————————————————————————————————————————————
// СОСТОЯНИЯ
// ——————————————————————————————————————————————————————————————————————

/** Состояние = карта, которая уже чем-то живёт. Запускать нечего — оно идёт само. */
const STATES: ReadonlyArray<{ id: string; caption: string; opts: Parameters<SectionContext["card"]>[0] }> = [
  { id: "mo-idle", caption: "покой: лежит на столе, дышит еле заметно", opts: { card: "7♣", rest: "idle" } },
  { id: "mo-float", caption: "левитирует («в руке»): качается, тень уходит дальше", opts: { card: "8♦", rest: "floating" } },
  { id: "mo-dust", caption: "цензура: пыль — смаз настоящего лица, крутится бесконечно", opts: { card: "9♠", censored: true } },
  { id: "mo-held", caption: "держат: приподнята и увеличена, тень самая длинная", opts: { card: "10♥", rest: "held" } },
];

export function statesSection(ctx: SectionContext, at: Pt): SectionSize & { ids: string[] } {
  const stepX = ctx.cardW * 2.2;
  let maxBottom = at.y;
  const ids: string[] = [];
  STATES.forEach((st, i) => {
    const cx = at.x + ctx.cardW / 2 + i * stepX;
    const cy = at.y + ctx.cardH / 2;
    ctx.card({ ...st.opts, id: st.id }, { x: cx, y: cy }, i, i * 0.7);
    ids.push(st.id);
    const cap = ctx.label(st.caption, cx, cy + ctx.cardH / 2 + 12, 12, 0x9aa89f, stepX * 0.92);
    maxBottom = Math.max(maxBottom, cy + ctx.cardH / 2 + 12 + cap.height);
  });
  return { bottom: maxBottom + SB_ITEM_GAP, width: STATES.length * stepX, ids };
}
