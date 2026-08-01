import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Card } from "../../game/ui/Card";
import { Stack } from "../../game/board/stack";
import { applyStackConfig, STACK_ANCHORS, stackAt, stacksSection, type StackDemo } from "../../game/kit/stacks";
import { dropzonesSection } from "../../game/kit/dropzones";
import type { KitContext } from "../../game/engine/kitScene";
import { applyArgsToParams, paramsToArgs, paramsToArgTypes } from "../harness/paramArgs";
import { CanvasStage } from "../harness/CanvasStage";

// Стопки — ТА ЖЕ секция, что раздел «Стопки» на /playground (game/kit/stacks.ts).
//
// Что здесь надо проверять руками:
//   • ГРИП под стопкой уводит ВСЮ пачку; верхняя карта (справа) тянется отдельно — это две разные
//     цели захвата в одном месте, и различить их можно только пальцем;
//   • ЯКОРЬ у трёх стопок с разными политиками. Разница видна ТОЛЬКО в движении: пока пачка на
//     месте, все три выглядят одинаково. Унесите пачку и посмотрите, что осталось;
//   • РЕОРДЕР: тащите карту вдоль своей стопки — соседи расступаются под неё.
//
// Рычаги «режим драга карты» и «при драге стопки» сюда не переехали намеренно: это флаги ДЕМО
// самого движка песочницы, а не свойства стопки. Каталог показывает компонент, а не стенд.

// ——— рычаги стопки живут в ПАНЕЛИ, а не на канвасе ———
//
// Канвасные Stepper/Toggle/Segmented — для `/playground`: это стенд внутри приложения, панели у
// него нет и взять её негде. У каталога она есть, и рисовать поверх сцены второй пульт значит
// игнорировать штатный инструмент.
//
// Список рычагов берётся у САМОЙ стопки (`Stack.params()`) через мост harness/paramArgs. Поэтому
// панель не может разойтись с тем, что стопка умеет: появился параметр у компонента — появился и
// в панели, без правки этой стори.
const PROBE = new Stack({ left: 0, top: 0, cell: { w: 100, h: 140 }, ids: ["probe"], step: 40, reorder: true });
const PARAMS = PROBE.params();
const stackArgTypes = paramsToArgTypes(PARAMS);

type StackArgs = Record<string, unknown>;
const stackArgs = paramsToArgs(PARAMS) as StackArgs;

// Живая цель правок: стори строит стопку внутри `build`, а панель дёргает её потом. Витрина в
// каталоге всегда одна (канвас один на весь сторибук), поэтому гонок тут неоткуда взяться.
interface LiveStack {
  ctx?: KitContext;
  demo?: StackDemo;
}
const live: LiveStack = {};

/** Все рычаги применяются одинаково: влить значение в параметр компонента и переразложить сцену. */
const applyStackArgs = Object.fromEntries(
  PARAMS.map((p) => [
    p.id,
    (h: LiveStack, v: unknown) => {
      if (!h.ctx || !h.demo) return;
      applyArgsToParams(h.demo.stack.params(), { [p.id]: v });
      applyStackConfig(h.ctx, h.demo);
    },
  ]),
);

const meta: Meta<Record<string, never>> = {
  title: "Mechanics/Stacks",
  parameters: { controls: { disable: true } },
  render: () => (
    <CanvasStage<Card, Record<string, never>>
      args={{}}
      build={(ctx) => {
        const r = stacksSection(ctx, { x: ctx.padding, y: ctx.padding });
        ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);
      }}
    />
  ),
};
export default meta;

type Story = StoryObj<Record<string, never>>;

/** Три стопки, три политики якоря. Ровно то, что показывает песочница. */
export const ThreeAnchorPolicies: Story = {};

/** Крупно — разглядеть грип (три точки под пачкой) и перекрытие карт. */
export const Large: Story = {
  render: () => (
    <CanvasStage<Card, Record<string, never>>
      args={{}}
      opts={{ cardHeight: 190 }}
      build={(ctx) => {
        const r = stacksSection(ctx, { x: ctx.padding, y: ctx.padding }, "big");
        ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);
      }}
    />
  ),
};

/**
 * Стопка против дроп-зон. Пачка карт Flippable и Burnable — «ПЕРЕВОРОТ» и «СЖЕЧЬ» её примут,
 * «ПОДГЛЯДЕТЬ» тоже (карты умеют). Сравните со столбиком фишек в разделе «Фишки и фигуры»:
 * там та же группировка, но зона «ПЕРЕВОРОТ» бессильна — фишки не Flippable.
 */
export const PileIntoZone: Story = {
  render: () => (
    <CanvasStage<Card, Record<string, never>>
      args={{}}
      opts={{ cardHeight: 110 }}
      build={(ctx) => {
        const r = stacksSection(ctx, { x: ctx.padding, y: ctx.padding }, "zn");
        ctx.label(`политик якоря: ${STACK_ANCHORS.length}`, ctx.padding, r.bottom + 6, 12, 0x9aa89f, undefined, 0);
        const z = dropzonesSection(ctx, { x: ctx.padding, y: r.bottom + 30 });
        ctx.extent(Math.max(r.width, z.width) + ctx.padding * 2, z.bottom + ctx.padding);
      }}
    />
  ),
};

/**
 * ОДНА стопка со всеми её рычагами — В ПАНЕЛИ СЛЕВА, а не пультом на канвасе.
 *
 * Крутится всё живьём: нахлёст разводит и сводит карты пружиной, иконка и политика якоря меняют
 * метку на месте. Список рычагов взят у самой стопки, поэтому «что можно настроить» здесь не
 * мнение стори, а факт из кода компонента.
 *
 * Это же и ответ на вопрос «где настраивается стопка»: раньше — в трёх местах (аргументы
 * конструктора, `params()`, конфиг метки на стороне движка), теперь — в одном `StackConfig`.
 */
export const Configurable: StoryObj<StackArgs> = {
  parameters: { controls: { disable: false } },
  argTypes: stackArgTypes,
  args: stackArgs,
  render: (args) => (
    <CanvasStage<LiveStack, StackArgs>
      args={args}
      apply={applyStackArgs}
      target={() => live}
      opts={{ cardHeight: 150 }}
      build={(ctx, a) => {
        // Панель применяется ДО рождения карт: иначе они легли бы по старым домам и поехали
        // пружиной первым же кадром — витрина открывалась бы «собирающейся на глазах».
        const demo = stackAt(ctx, { x: ctx.padding, y: ctx.padding }, "cfg", { reorder: true }, 5, 0, (stack) =>
          applyArgsToParams(stack.params(), a),
        );
        live.ctx = ctx;
        live.demo = demo;
        ctx.extent(demo.width + ctx.padding * 2, demo.bottom + ctx.padding);
      }}
    />
  ),
};
