import { Stack, type StackConfig } from "../slotfield/stack";
import { Button } from "../ui/Button";
import type { Marker, MarkerHost } from "../engine/marker";
import type { AnchorIconId, ShowPolicy } from "../engine/markerPolicy";
import { ANCHOR_ICONS } from "./markerIcons";
import type { PieceSpec } from "../ui/pieceKinds";
import type { Pt, SectionContext, SectionSize } from "./context";
import { resolveLayout, type StackLayoutRef } from "./stackLayout";
import { scaleForState } from "../ui/plane";
import type { Pose } from "../ui/Card";

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
  /** Донастроить стопку ДО рождения карт. Нужно тем, кто задаёт конфиг не литералом, а извне
   *  (панель контролов каталога): иначе карты родились бы по старым домам и поехали пружиной
   *  при первом же кадре — витрина открывалась бы «на глазах собирающейся». */
  tune?: (stack: Stack) => void,
): StackDemo & SectionSize {
  const step = cfg.step ?? ctx.cardW * STEP_RATIO;
  const ids = Array.from({ length: count }, (_, i) => `${idPrefix}c${i}`);
  const stack = new Stack({ left: at.x, top: at.y, cell: { w: ctx.cardW, h: ctx.cardH }, ids, ...cfg, step });
  tune?.(stack);
  // Карты левитируют: стопка «в руке», а не лежит на столе — так виден зазор между ней и столом.
  ids.forEach((id, i) => ctx.card({ id, card: RANKS[i % RANKS.length]!, pose: "lifted" }, stack.homeOf(id), i, i * 0.6 + phase));
  const footprint = ctx.cardW + (count - 1) * stack.step; // после tune шаг мог измениться
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

// ——————————————————————————————————————————————————————————————————————
// СОСТОЯНИЕ СТОПКИ — ОДНА стопка, разные параметры
// ——————————————————————————————————————————————————————————————————————
//
// Витрины «всё сразу» тут намеренно НЕТ. Сравнивать варианты — работа боковой навигации каталога:
// она для того и есть, чтобы смотреть их по одному и крупно. Ряд из восьми уменьшенных стопок
// дублирует навигацию и при этом не даёт разглядеть ни одну.
//
// Раскладка стопки — ТРИ независимые оси, и сочетаются они свободно (лежащая закрытая раскрытая
// стопка — законное сочетание, а не описка):
//
//   ЧТО ВИДНО   лицом вверх / рубашкой вверх            — `faceUp`;
//   КАК ЛЕЖИТ   тонкая (нахлёст) / раскрытая / веер      — ГЕОМЕТРИЯ (шаг, а у веера ещё и наклон);
//   ГДЕ ЛЕЖИТ   на столе / поднята / в руке / выделена   — поза покоя плюс метка выделения.
//
// Про последнюю ось стоит сказать прямо: меток выделения ДВЕ и они самостоятельны
// (SELECTION-DESIGN §4.A, `Mark`) — подъём (`lift`) и контур (`outline`). Стенд до сих пор рисовал
// все стопки поднятыми, то есть по умолчанию показывал их выделенными, нигде этого не называя.

/** Чем задана раскладка стопки — функцией или именем готовой (kit/stackLayout.ts). */
export type StackForm = StackLayoutRef;

export interface StackStateOpts {
  /**
   * КАК разложена. Функция «где i-я карта относительно первой» либо имя готовой.
   *
   * Раньше тут был закрытый список из трёх имён, и чтобы разложить колоду вниз или влево, надо
   * было регистрировать новое имя. Направление и шаг — параметры, а не разные сущности.
   */
  form: StackForm;
  faceUp: boolean;
  pose: Pose;
  /** Дышит ли стопка (idle-покачивание). Не задано — по позе: поднятая дышит, лежащая нет. */
  idle?: boolean;
  /** Контур набора (метка `outline`). Подъём — отдельная метка, это `pose: "lifted"`. */
  selected: boolean;
  count: number;
  /**
   * ИЗ ЧЕГО стопка. Пачка — это порядок и раскладка, а не «много карт»: так же складывают фишки в
   * столбик и сваливают фигуры в кучу. Раскладка от содержимого не зависит вовсе — меняется только
   * размер ячейки и то, какой предмет в ней стоит.
   */
  content?: StackContent;
}

/** Из чего сложена стопка. */
export type StackContent = "cards" | "chips" | "pieces";

const CHIP_COLORS = [0xc0392b, 0x2e8b57, 0x2f4f8f, 0x7d3cc0, 0xc79a3e];
const CHIP_DENOMS = ["5", "25", "100", "500", "1000"];
const PIECE_GLYPHS = ["♞", "♜", "♝", "♛", "♚", "♟"];

export const STACK_STATE_DEFAULTS: StackStateOpts = { form: "tight", faceUp: true, pose: "rest", selected: false, count: 5 };

export function stackState(ctx: SectionContext, at: Pt, o: Partial<StackStateOpts> = {}, idPrefix = "st"): SectionSize & { ids: string[] } {
  const { form, faceUp, pose, idle, selected, count } = { ...STACK_STATE_DEFAULTS, ...o };
  const content = o.content ?? "cards";
  const ids = Array.from({ length: count }, (_, i) => `${idPrefix}-${i}`);
  const layout = resolveLayout(form);
  // Ячейка — по ПРЕДМЕТУ, а не по карте: столбик фишек, разложенный в карточной сетке, разъезжается
  // на полкарты, и «стопка» перестаёт читаться как стопка.
  const pieceR = ctx.cardH * 0.26;
  const cell = content === "cards" ? { w: ctx.cardW, h: ctx.cardH } : { w: pieceR * 2, h: pieceR * 2 };
  const offs = ids.map((_, i) => layout(i, count, cell));

  // Габарит считаем ПО ФАКТУ раскладки: она может уйти в любую сторону, в том числе влево и вверх,
  // а содержимое витрины живёт в положительной четверти — камера обрезает всё, что левее нуля.
  const half = (o2: { rot: number }) => ({
    hw: (Math.abs(Math.cos(o2.rot)) * cell.w + Math.abs(Math.sin(o2.rot)) * cell.h) / 2,
    hh: (Math.abs(Math.sin(o2.rot)) * cell.w + Math.abs(Math.cos(o2.rot)) * cell.h) / 2,
  });
  const scale = scaleForState(pose);
  const minX = Math.min(...offs.map((o2, i) => o2.dx - half(o2).hw * (i === 0 ? scale : 1)));
  const maxX = Math.max(...offs.map((o2, i) => o2.dx + half(o2).hw * (i === 0 ? scale : 1)));
  const minY = Math.min(...offs.map((o2) => o2.dy - half(o2).hh * scale));
  const maxY = Math.max(...offs.map((o2) => o2.dy + half(o2).hh * scale));

  // Первая карта ставится так, чтобы САМЫЙ ЛЕВЫЙ и САМЫЙ ВЕРХНИЙ края раскладки легли в at.
  const ox = at.x - minX;
  const oy = at.y - minY;
  ids.forEach((id, i) => {
    const o2 = offs[i]!;
    const at2 = { x: ox + o2.dx, y: oy + o2.dy };
    if (content === "cards") {
      ctx.card({ id, card: RANKS[i % RANKS.length]!, faceUp, pose, idle, selected }, { ...at2, rot: o2.rot }, i, i * 0.6);
      return;
    }
    // Доворот раскладки предметам не передаётся: `ctx.piece` его не принимает, и врать поворотом,
    // которого не будет, хуже, чем показать пачку без него. Веер из фишек — отдельный разговор.
    const spec: PieceSpec =
      content === "chips"
        ? { kind: "chip", color: CHIP_COLORS[i % CHIP_COLORS.length]!, denom: CHIP_DENOMS[i % CHIP_DENOMS.length]! }
        : { kind: "chess", dark: i % 2 === 0, glyph: PIECE_GLYPHS[i % PIECE_GLYPHS.length]! };
    ctx.piece(id, at2, spec, pieceR, i, { pose, idle });
  });

  return { bottom: at.y + (maxY - minY), width: maxX - minX, ids };
}

/**
 * Стопка с кнопкой «перевернуть» — витрина ПРЕСЕТА анимации.
 *
 * Переворот пачки идёт через общий `flipGroup` движка: что именно произойдёт (все разом или волной,
 * развернётся ли порядок, с какой задержкой), решает расписание пресета, а не эта функция. Поэтому
 * новый фил здесь — другой пресет, а не другая ветка кода.
 */
export function flipDemo(ctx: SectionContext, at: Pt, o: Partial<StackStateOpts> = {}, label = ""): SectionSize {
  const r = stackState(ctx, at, o, "flip");
  const b = new Button({ label: "перевернуть", variant: "secondary", size: "sm", onClick: () => ctx.flipStack(r.ids) });
  const by = r.bottom + 34;
  ctx.button(b, { x: at.x + r.width / 2, y: by });
  let bottom = by + b.h / 2;
  if (label) {
    const cap = ctx.label(label, at.x + r.width / 2, bottom + 12, 12, 0x9aa89f, Math.max(r.width, ctx.cardW * 3));
    bottom += 12 + cap.height;
  }
  return { bottom, width: Math.max(r.width, ctx.cardW * 3) };
}
