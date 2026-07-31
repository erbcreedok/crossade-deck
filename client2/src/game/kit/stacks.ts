import { Stack } from "../board/stack";
import type { Marker, MarkerHost } from "../engine/marker";
import { drawAnchorIcon, drawPinIcon, drawRingIcon } from "./markerIcons";
import type { MarkerLook, Pt, SectionContext, SectionSize } from "./context";

// Стопки: карты внахлёст, каждая сдвинута вправо. Негласное правило стенда — ВЕРХНЯЯ карта СПРАВА
// (правее = выше по z). Без веера, арки и перестановок: это про порядок и захват, а не про красоту.
//
// Демо построено на трёх стопках с РАЗНЫМИ политиками видимости якоря. Драггер (грип) у всех один
// и тот же; разница видна только в движении — унесите пачку и посмотрите, что осталось на месте:
//   away   — якорь появляется, когда цель унесли (место занято, но пусто прямо сейчас);
//   empty  — кольцо, когда в стопке не осталось ничего;
//   always — метка висит всегда (место постоянное, независимо от содержимого).
//
// Порядок/дом/реордер держит Stack (board/stack.ts) — секция его только создаёт и расставляет.

export interface StackDemo {
  stack: Stack;
  dragger: Marker;
  anchor: Marker;
  host: MarkerHost;
  /** Подпись под стопкой — она же объясняет политику её якоря. */
  caption: string;
}

/** Три политики якоря как данные: добавить четвёртую — строка, а не ветка. */
export const STACK_ANCHORS: ReadonlyArray<{ look: MarkerLook; caption: string }> = [
  { look: { draw: drawAnchorIcon, show: "away" }, caption: "якорь: когда унесли" },
  { look: { draw: drawRingIcon, show: "empty" }, caption: "кольцо: когда пусто" },
  { look: { draw: drawPinIcon, show: "always" }, caption: "метка: всегда" },
];

const RANKS = ["6♦", "7♦", "8♦", "9♦", "10♦"];
const STEP_RATIO = 0.4; // сдвиг соседа вправо, в долях ширины карты (перекрытие)
const GAP_RATIO = 0.9; // зазор между соседними стопками

export function stacksSection(ctx: SectionContext, at: Pt, idPrefix = "stk"): SectionSize & { stacks: StackDemo[] } {
  const cy = at.y + ctx.cardH / 2;
  const step = ctx.cardW * STEP_RATIO;
  const footprint = ctx.cardW + (RANKS.length - 1) * step;
  const gap = ctx.cardW * GAP_RATIO;
  const stacks: StackDemo[] = [];

  STACK_ANCHORS.forEach((a, s) => {
    const ox = at.x + s * (footprint + gap);
    const ids = RANKS.map((_, i) => `${idPrefix}${s}c${i}`);
    const stack = new Stack({ left: ox, top: cy - ctx.cardH / 2, cell: { w: ctx.cardW, h: ctx.cardH }, step, ids, reorder: true });
    // Карты левитируют: стопка «в руке», а не лежит на столе — так виден зазор между ней и столом.
    ids.forEach((id, i) => ctx.card({ id, card: RANKS[i]!, rest: "floating" }, stack.homeOf(id), i, i * 0.6 + s));
    const slot = { x: ox + footprint / 2, y: cy }; // центр стопки — дом для меток
    const { dragger, anchor, host } = ctx.pile(ids, slot, a.look);
    stacks.push({ stack, dragger, anchor, host, caption: a.caption });
    ctx.label(a.caption, ox + footprint / 2, cy + ctx.cardH / 2 + 26, 12, 0x9aa89f, footprint);
  });

  const right = at.x + (STACK_ANCHORS.length - 1) * (footprint + gap) + footprint;
  return { bottom: cy + ctx.cardH / 2 + 50, width: right - at.x, stacks };
}
