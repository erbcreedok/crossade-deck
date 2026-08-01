import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Card } from "../../game/ui/Card";
import { boardZoneScene, BOARD_SCENE_DEFAULTS, type BoardSceneOpts } from "../../game/kit/boardZoneScene";
import { CanvasStage } from "../harness/CanvasStage";

// ДОСКА — размеченный стол: слоты, в которые фигуры ВСТАЮТ, а не лежат где попало.
//
// В движке это `BoardZone` (board/boardZone.ts): состояние доски плюс правила приёма, БЕЗ Pixi.
// Раскладка у неё ПОДКЛЮЧАЕМАЯ — зона получает готовый список позиционированных слотов и про
// стратегию не знает вовсе (board/layout/slots.ts). Поэтому «шахматы», «монополия» и «карточный
// планшет» отличаются не кодом зоны, а тем, какой список слотов ей дали.
//
// Проверяется только МЫШЬЮ: перетащите фигуру. Скриншот не отличит «встала в слот» от «осталась
// там, где отпустили» — а это и есть единственное, что здесь важно.

interface Args extends BoardSceneOpts {}

const meta: Meta<Args> = {
  title: "Mechanics/Board",
  args: BOARD_SCENE_DEFAULTS,
  argTypes: {
    layout: {
      name: "layout",
      description: "стратегия раскладки слотов: grid — сетка (шахматы, планшет); ring — по окружности (монополия, круговой ход). Зона про стратегию не знает — ей дают готовый список слотов",
      control: { type: "select" },
      options: ["grid", "ring"],
    },
    cols: { name: "grid.cols", description: "колонок", control: { type: "range", min: 1, max: 8, step: 1 }, if: { arg: "layout", eq: "grid" } },
    rows: { name: "grid.rows", description: "строк", control: { type: "range", min: 1, max: 6, step: 1 }, if: { arg: "layout", eq: "grid" } },
    ringCount: { name: "ring.count", description: "слотов по окружности", control: { type: "range", min: 3, max: 20, step: 1 }, if: { arg: "layout", eq: "ring" } },
    onOccupied: {
      name: "onOccupied",
      description:
        "что делать при дропе на ЗАНЯТЫЙ слот — и это четыре разные игры: merge — сложить в стопку; swap — обменять местами; capture — взятие (вытесненный уходит с доски); reject — нельзя",
      control: { type: "select" },
      options: ["merge", "swap", "capture", "reject"],
    },
    rule: {
      name: "rule",
      description:
        "правило приёма ПОВЕРХ onOccupied — последний гейт, нарушить его нельзя ничем. sameColor: фигура встаёт только на клетку своего цвета, на чужую возвращается домой. Зона про цвета не знает: правило приходит снаружи функцией",
      control: { type: "select" },
      options: ["none", "sameColor"],
    },
    figures: { name: "figures", description: "сколько фигур расставить", control: { type: "range", min: 1, max: 8, step: 1 } },
  },
  parameters: {
    code: (a: Record<string, unknown>) => `import { BoardZone } from "../../game/board/boardZone";
import { gridSlots, ringSlots } from "../../game/board/layout/slots";

// 1. РАСКЛАДКА — отдельно от зоны. Стратегий несколько, зона про них не знает.
const slots = ${a.layout === "ring" ? `ringSlots(${a.ringCount}, { cx, cy, radius, cell })` : `gridSlots({ cols: ${a.cols}, cell, gap, origin }, ${a.rows})`};

// 2. ЗОНА — состояние доски плюс правила приёма. Pixi внутри нет вовсе.
const zone = new BoardZone({
  slots,
  board,                        // что в каком слоте лежит
  bounds,                       // рамка: за неё фигуру не вытащить
  onOccupied: ${JSON.stringify(a.onOccupied)},   // merge | swap | capture | reject${
    a.rule === "sameColor"
      ? `
  // Правило приёма — ФУНКЦИЯ снаружи (board/boardRules.ts). Зона про цвета и ранги не знает.
  rule: sameColorRule(figureDark, slotDark),`
      : ""
  }
});

// 3. ДРОП идёт в зону, а не в точку: она сама резолвит целевой слот и решает исход. Координата —
//    ПАЛЬЦА: тело фигуры едет пружиной и в момент отпускания отстаёт от него на пол-клетки.
const res = zone.dropAt(figureId, dropX, dropY);
if (res.moved) for (const id of ids) ctx.dispatch({ t: "move", id, ...zone.figureHome(id) });`,
  },
  render: (a) => (
    <CanvasStage<Card, Args>
      args={a}
      opts={{ cardHeight: 150 }}
      build={(ctx, args) => {
        const r = boardZoneScene(ctx, { x: ctx.padding, y: ctx.padding }, args);
        ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);
      }}
    />
  ),
};
export default meta;

/**
 * Доска со слотами. Тащите фигуры мышью — только так тут что-то и проверяется.
 *
 * Что стоит покрутить:
 *   • `onOccupied` — это ЧЕТЫРЕ РАЗНЫЕ ИГРЫ на одном коде. `swap` — шашки и шахматы «поменялись»,
 *     `capture` — взятие, `merge` — стопки в слоте, `reject` — ход запрещён;
 *   • `layout: ring` — та же зона, другой список слотов. Ни строчки в `BoardZone` для этого не
 *     нужно, и в этом весь смысл подключаемой раскладки;
 *   • отпустите фигуру между клетками — она всё равно встанет В СЛОТ: дроп резолвится в слот, а не
 *     в точку;
 *   • `rule: sameColor` — правило приёма поверх `onOccupied`. Тёмная фигура на светлую клетку не
 *     встанет, даже если та свободна: правило — последний гейт цепочки, и обойти его нечем.
 *
 * Чего тут НЕТ: «слепой» зоны (`requiresCapability`). Она решает про НАБОР — примет его, только
 * если вся пачка несёт нужную способность, — а в этом разделе тащат одиночные фигуры, и показывать
 * на них было бы нечего.
 */
export const Board: StoryObj<Args> = {};
