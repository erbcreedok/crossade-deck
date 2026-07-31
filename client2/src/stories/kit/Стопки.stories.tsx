import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Card } from "../../game/ui/Card";
import { STACK_ANCHORS, stacksSection } from "../../game/kit/stacks";
import { dropzonesSection } from "../../game/kit/dropzones";
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

const meta: Meta<Record<string, never>> = {
  title: "Механики/Стопки",
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
export const ТриПолитики: Story = {};

/** Крупно — разглядеть грип (три точки под пачкой) и перекрытие карт. */
export const Крупно: Story = {
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
export const ПачкаВЗону: Story = {
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
