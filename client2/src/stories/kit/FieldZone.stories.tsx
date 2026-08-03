import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Card } from "../../game/ui/Card";
import { fieldZoneScene, FIELD_SCENE_DEFAULTS, type FieldSceneOpts } from "../../game/kit/fieldZoneScene";
import { CanvasStage } from "../harness/CanvasStage";
import { action } from "storybook/actions";
import { expect } from "storybook/test";
import { dragOnCanvas, elementAt, waitForElement } from "../harness/canvasDrag";


interface Args extends FieldSceneOpts {}

const onDrop = action("дроп в слот");

/**
 * ДОСКА — размеченный стол: слоты, в которые фигуры ВСТАЮТ, а не лежат где попало.
 *
 * В движке это `FieldZone` (board/boardZone.ts): состояние доски плюс правила приёма, БЕЗ Pixi.
 * Раскладка у неё ПОДКЛЮЧАЕМАЯ — зона получает готовый список позиционированных слотов и про
 * стратегию не знает вовсе (board/layout/slots.ts). Поэтому «шахматы», «монополия» и «карточный
 * планшет» отличаются не кодом зоны, а тем, какой список слотов ей дали.
 *
 * Проверяется только МЫШЬЮ: перетащите фигуру. Скриншот не отличит «встала в слот» от «осталась
 * там, где отпустили» — а это и есть единственное, что здесь важно.
 */
const meta: Meta<Args> = {
  title: "Mechanics/Field zone",
  args: FIELD_SCENE_DEFAULTS,
  argTypes: {
    layout: {
      name: "layout",
      description: "стратегия раскладки слотов: grid — сетка (шахматы, планшет); ring — по окружности (монополия, круговой ход). Зона про стратегию не знает — ей дают готовый список слотов",
      control: { type: "select" },
      options: ["grid", "ring", "hex"],
    },
    content: {
      name: "content",
      description:
        "ЧТО стоит на клетках. Доска не про шахматы: те же слоты и те же правила приёма держат фишки и карты — зона про содержимое не знает вовсе",
      control: { type: "select" },
      options: ["chess", "chips", "cards"],
    },
    cols: { name: "cols", description: "колонок (сетка и соты)", control: { type: "range", min: 1, max: 8, step: 1 }, if: { arg: "layout", neq: "ring" } },
    rows: { name: "rows", description: "строк (сетка и соты)", control: { type: "range", min: 1, max: 6, step: 1 }, if: { arg: "layout", neq: "ring" } },
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
    code: (a: Record<string, unknown>) => `import { FieldZone } from "../../game/slotfield/fieldZone";
import { gridSlots, hexSlots, ringSlots } from "../../game/slotfield/layout/slots";

// 1. РАСКЛАДКА — отдельно от зоны. Стратегий несколько, зона про них не знает.
const slots = ${a.layout === "ring" ? `ringSlots(${a.ringCount}, { cx, cy, radius, cell })` : a.layout === "hex" ? `hexSlots(${a.cols}, ${a.rows}, { cell, origin, gap })` : `gridSlots({ cols: ${a.cols}, cell, gap, origin }, ${a.rows})`};

// 2. ЗОНА — состояние доски плюс правила приёма. Pixi внутри нет вовсе.
const zone = new FieldZone({
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
        // Исход дропа уходит в панель Actions: по картинке видно, ЧТО получилось, а здесь — почему
        // (встала, отказано, кого съела и в какой слот).
        const r = fieldZoneScene(ctx, { x: ctx.padding, y: ctx.padding }, { ...args, onEvent: onDrop });
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
 *   • `layout: ring` — та же зона, другой список слотов. Ни строчки в `FieldZone` для этого не
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
export const FieldZone: StoryObj<Args> = { name: "Field zone" };

/**
 * СЦЕНАРИЙ — то же, что делает палец, но записанное шагами.
 *
 * Панель Interactions показывает его по шагам и даёт отмотать назад; при падении видно, НА КАКОМ
 * шаге разошлось, а не «где-то в драге». Жест собирается из pointer-событий (harness/canvasDrag),
 * потому что на канвасе нет ни узлов, ни ролей, за которые мог бы взяться обычный сценарий.
 *
 * Проверяется ровно то, что чинилось руками: фигура ОСТАЁТСЯ в новой клетке. Пока команда `move`
 * не переставляла дом, она доезжала до клетки и уползала обратно — и по одной картинке это
 * неотличимо от «дроп не сработал».
 */
export const DropScenario: StoryObj<Args> = {
  name: "Drop scenario",
  play: async ({ canvasElement, step }) => {
    await step("витрина собралась", async () => waitForElement(canvasElement, "bz-0"));

    // Целимся в СОСЕДНЮЮ ФИГУРУ, а не в клетку по зашитому шагу: шаг зависит от размера карты, а
    // ряд ниже на узком кадре (панель сценария открыта) может оказаться за кромкой — жест тогда
    // уходит мимо канваса. Соседи же по определению видны: они стоят в одном ряду.
    const a0 = elementAt(canvasElement, "bz-0");
    const b0 = elementAt(canvasElement, "bz-1");

    await step("тащим фигуру на ЗАНЯТУЮ клетку соседа", async () => {
      await dragOnCanvas(canvasElement, a0, b0);
    });

    await step("сосед уехал на её место, она — на его: это обмен (onOccupied: swap)", async () => {
      const a1 = elementAt(canvasElement, "bz-0");
      const b1 = elementAt(canvasElement, "bz-1");
      await expect(Math.round(a1.x)).toBe(Math.round(b0.x));
      await expect(Math.round(b1.x)).toBe(Math.round(a0.x));
    });

    await step("следующий жест стартует уже от НОВОГО дома, а не от старого", async () => {
      const from = elementAt(canvasElement, "bz-0");
      await dragOnCanvas(canvasElement, from, a0);
      const back = elementAt(canvasElement, "bz-0");
      await expect(Math.round(back.x)).toBe(Math.round(a0.x));
    });
  },
};

/**
 * ГАЛЕРЕЯ ДОСОК — три раскладки рядом, с разным содержимым.
 *
 * Смысл ровно в том, что зона одна и та же. Сетка, кольцо и соты отличаются ТОЛЬКО списком слотов,
 * а правила приёма, дроп и рамка у всех трёх общие. Содержимое тоже ничего не решает: на клетках
 * стоят шахматы, фишки и карты, и зона про это не знает.
 */
export const Gallery: StoryObj<Args> = {
  parameters: {
    controls: { disable: true },
    code: () => `import { fieldZoneScene } from "../../game/kit/fieldZoneScene";

// Раскладка и содержимое — параметры ОДНОЙ секции, а не три разных доски:
fieldZoneScene(ctx, at, { layout: "grid", content: "chess", cols: 3, rows: 3 }, "g1");
fieldZoneScene(ctx, at2, { layout: "ring", content: "chips", ringCount: 8 }, "g2");
fieldZoneScene(ctx, at3, { layout: "hex", content: "cards", cols: 3, rows: 3 }, "g3");`,
  },
  render: () => (
    <CanvasStage<never, Record<string, never>>
      args={{}}
      opts={{ cardHeight: 96 }}
      build={(ctx) => {
        let x = ctx.padding;
        let bottom = ctx.padding;
        const boards: Array<{ o: Partial<FieldSceneOpts>; cap: string }> = [
          { o: { layout: "grid", content: "chess", cols: 3, rows: 3, figures: 5 }, cap: "сетка · шахматы" },
          { o: { layout: "ring", content: "chips", ringCount: 8, figures: 5 }, cap: "кольцо · фишки" },
          { o: { layout: "hex", content: "cards", cols: 3, rows: 3, figures: 4 }, cap: "соты · карты" },
        ];
        boards.forEach((b, i) => {
          // `width` секции — ШИРИНА ОТ ЕЁ НАЧАЛА, а не правый край сцены: следующая доска встаёт
          // на x + width, иначе они наезжают друг на друга тем сильнее, чем левее начались.
          const r = fieldZoneScene(ctx, { x, y: ctx.padding }, b.o, `bg${i}`);
          const cap = ctx.label(b.cap, x, r.bottom + 12, 13, 0x9aa89f, r.width, 0);
          bottom = Math.max(bottom, r.bottom + 12 + cap.height);
          x += r.width + ctx.cardW * 0.7;
        });
        ctx.extent(x - ctx.cardW * 0.7 + ctx.padding, bottom + ctx.padding);
      }}
    />
  ),
};
