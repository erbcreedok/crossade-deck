import { Stack, type StackConfig } from "../board/stack";
import type { Marker, MarkerHost } from "../engine/marker";
import type { AnchorIconId, ShowPolicy } from "../engine/markerPolicy";
import { ANCHOR_ICONS } from "./markerIcons";
import type { ControlsResult, Pt, SectionContext, SectionSize } from "./context";

// Стопки: карты внахлёст, каждая сдвинута вправо. Негласное правило стенда — ВЕРХНЯЯ карта СПРАВА
// (правее = выше по z). Без веера, арки и перестановок: это про порядок и захват, а не про красоту.
//
// Всё, что у стопки настраивается, объявлено в ОДНОМ месте — `StackConfig` (board/stack.ts), и
// оттуда же берутся живые рычаги (`Stack.params()`). Своей конфигурации у раздела стенда нет и быть
// не должно: он только расставляет стопки и подписывает их.

export interface StackDemo {
  stack: Stack;
  dragger: Marker;
  anchor: Marker;
  host: MarkerHost;
  /** Подпись под стопкой. */
  caption: string;
}

const RANKS = ["6♦", "7♦", "8♦", "9♦", "10♦"];
const STEP_RATIO = 0.4; // шаг соседа вправо, в долях ширины карты (нахлёст)
const GAP_RATIO = 0.9; // зазор между соседними стопками

/**
 * Три политики видимости якоря как данные. Драггер (грип) у всех один и тот же; разница видна
 * ТОЛЬКО в движении — унесите пачку и посмотрите, что осталось на месте:
 *   away   — якорь появляется, когда цель унесли (место занято, но пусто прямо сейчас);
 *   empty  — кольцо, когда в стопке не осталось ничего;
 *   always — метка висит всегда (место постоянное, независимо от содержимого).
 */
export const STACK_ANCHORS: ReadonlyArray<{ icon: AnchorIconId; show: ShowPolicy; caption: string }> = [
  { icon: "anchor", show: "away", caption: "якорь: когда унесли" },
  { icon: "ring", show: "empty", caption: "кольцо: когда пусто" },
  { icon: "pin", show: "always", caption: "метка: всегда" },
];

/** Одна стопка по конфигу: карты, метки, габарит. Общий кирпич всех витрин раздела. */
export function stackAt(
  ctx: SectionContext,
  at: Pt,
  idPrefix: string,
  cfg: Partial<StackConfig> = {},
  count = RANKS.length,
  phase = 0,
): StackDemo & SectionSize {
  const step = cfg.step ?? ctx.cardW * STEP_RATIO;
  const ids = Array.from({ length: count }, (_, i) => `${idPrefix}c${i}`);
  const stack = new Stack({ left: at.x, top: at.y, cell: { w: ctx.cardW, h: ctx.cardH }, ids, ...cfg, step });
  // Карты левитируют: стопка «в руке», а не лежит на столе — так виден зазор между ней и столом.
  ids.forEach((id, i) => ctx.card({ id, card: RANKS[i % RANKS.length]!, rest: "floating" }, stack.homeOf(id), i, i * 0.6 + phase));
  const footprint = ctx.cardW + (count - 1) * step;
  const slot = { x: at.x + footprint / 2, y: at.y + ctx.cardH / 2 }; // центр стопки — дом для меток
  const { dragger, anchor, host } = ctx.pile(ids, slot, { draw: ANCHOR_ICONS[stack.anchor.icon], show: stack.anchor.show });
  return { stack, dragger, anchor, host, caption: "", bottom: at.y + ctx.cardH, width: footprint };
}

/**
 * Применить конфиг к живой стопке после правки рычага: метке — новые вид и политика, картам — новые
 * дома. Дома развозим командой move (порт команд), а не прямой мутацией тела: та же дверь, та же
 * пружина, и работает одинаково в песочнице и в витрине каталога.
 */
export function applyStackConfig(ctx: SectionContext, demo: StackDemo): void {
  demo.anchor.setIcon(ANCHOR_ICONS[demo.stack.anchor.icon]);
  demo.anchor.setShow(demo.stack.anchor.show);
  for (const id of demo.stack.ids) {
    const home = demo.stack.homeOf(id);
    ctx.dispatch({ t: "move", id, x: home.x, y: home.y });
  }
  ctx.wake();
}

/** Ряд из трёх стопок с разными политиками якоря — раздел «Стопки» стенда. */
export function stacksSection(ctx: SectionContext, at: Pt, idPrefix = "stk"): SectionSize & { stacks: StackDemo[] } {
  const step = ctx.cardW * STEP_RATIO;
  const footprint = ctx.cardW + (RANKS.length - 1) * step;
  const gap = ctx.cardW * GAP_RATIO;
  const stacks: StackDemo[] = [];

  STACK_ANCHORS.forEach((a, s) => {
    const ox = at.x + s * (footprint + gap);
    const d = stackAt(ctx, { x: ox, y: at.y }, `${idPrefix}${s}`, { reorder: true, anchor: { icon: a.icon, show: a.show } }, RANKS.length, s);
    stacks.push({ ...d, caption: a.caption });
    ctx.label(a.caption, ox + footprint / 2, at.y + ctx.cardH + 26, 12, 0x9aa89f, footprint);
  });

  const right = at.x + (STACK_ANCHORS.length - 1) * (footprint + gap) + footprint;
  return { bottom: at.y + ctx.cardH + 50, width: right - at.x, stacks };
}

/**
 * ОДНА стопка со всеми своими рычагами рядом — витрина конфигурации.
 *
 * Рычаги строятся из `stack.params()`, то есть из самой стопки: список в панели не может разойтись
 * с тем, что стопка на самом деле умеет. Живьём меняются все четыре — включая нахлёст и вид якоря,
 * которые до этого задавались только при сборке и требовали пересборки сцены.
 */
export function configurableStackSection(ctx: SectionContext, at: Pt, idPrefix = "cfg"): SectionSize & { demo: StackDemo; controls: ControlsResult } {
  const demo = stackAt(ctx, at, idPrefix, { reorder: true });
  const controls = ctx.controls(demo.stack, { x: at.x, y: at.y + ctx.cardH + 22 }, () => applyStackConfig(ctx, demo));
  const width = Math.max(demo.width, controls.steppers[0]?.w ?? 0, controls.toggles[0]?.w ?? 0, ...controls.segments.map((sg) => sg.w));
  return { bottom: controls.bottom, width, demo, controls };
}
