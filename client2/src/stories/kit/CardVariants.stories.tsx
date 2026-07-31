import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Card } from "../../game/ui/Card";
import { cardVariantsSection } from "../../game/kit/cardVariants";
import { CanvasStage } from "../harness/CanvasStage";

// Ряд «Карты — варианты» — ТА ЖЕ секция, что первая на /playground (game/kit/cardVariants.ts).
//
// Стори «UI-kit/Карта» показывает ОДНУ карту под контролами: там крутят опции по одной и смотрят,
// что каждая делает. Здесь наоборот — все заметные варианты рядом и одновременно, потому что
// «чем скрытая отличается от закрытой» невозможно понять, глядя на них по очереди.
//
// Карты настоящие и драгабл. Отпущенная едет домой пружиной.

const meta: Meta<Record<string, never>> = {
  title: "UI-kit/Card variants",
  parameters: { controls: { disable: true } },
  render: () => (
    <CanvasStage<Card, Record<string, never>>
      args={{}}
      build={(ctx) => {
        const r = cardVariantsSection(ctx, { x: ctx.padding, y: ctx.padding });
        ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);
      }}
    />
  ),
};
export default meta;

type Story = StoryObj<Record<string, never>>;

/** Все варианты разом — ровно тот список, что рисует песочница. */
export const All: Story = {};

/** Тот же ряд карточкой покрупнее — разглядеть пыль скрытой карты и зигзаг порванной. */
export const Large: Story = {
  render: () => (
    <CanvasStage<Card, Record<string, never>>
      args={{}}
      opts={{ cardHeight: 220 }}
      build={(ctx) => {
        const r = cardVariantsSection(ctx, { x: ctx.padding, y: ctx.padding }, "big");
        ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);
      }}
    />
  ),
};
