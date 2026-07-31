import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card, type CardOptions } from "../../game/ui/Card";
import { CanvasStage } from "../harness/CanvasStage";
import { pickArgs, type CardArgs } from "./cardArgs";

// ПРОВЕРОЧНАЯ стори №1 из трёх (категория «UI-примитивы»). Её задача — доказать, что каркас
// работает на настоящем компоненте: живые контролы, пересборка там, где живьём нельзя, один
// канвас на все стори. Полноценное наполнение каталога — отдельными шагами, по указанию владельца
// (какие элементы переезжают из песочницы, решает он).

const KEYS = ["card", "faceUp", "hidden", "back", "faceStyle", "fourColor", "custom", "torn", "size", "rest", "draggable", "flippable"] as const;
const { argTypes, apply } = pickArgs(KEYS);

type Args = Pick<CardArgs, (typeof KEYS)[number]>;

const meta: Meta<Args> = {
  title: "UI-kit/Card",
  argTypes,
  args: {
    card: "A♠",
    faceUp: true,
    hidden: false,
    back: "ruby",
    faceStyle: "pips",
    fourColor: false,
    custom: "",
    torn: false,
    size: 1,
    rest: "idle",
    draggable: true,
    flippable: true,
  },
  render: (args) => (
    <CanvasStage<Card, Args>
      args={args}
      apply={apply}
      build={(ctx, a) => {
        const opts: CardOptions = { id: "story-card", ...a };
        const card = new Card(opts, ctx.tex, ctx.baseScale);
        // Карта прибита за центр, витрина считается от левого верхнего угла — отсюда полуразмеры.
        ctx.add(card, { x: ctx.padding + card.footprint.hw, y: ctx.padding + card.footprint.hh });
      }}
    />
  ),
};
export default meta;

type Story = StoryObj<Args>;

/** Всё по умолчанию — точка отсчёта: как карта выглядит, если ничего не трогать. */
export const Default: Story = {};

/** Скрытость — РЕЖИМ секретности (Concealable), а не «другая карта»: значение прячется живой пылью. */
export const Concealed: Story = { args: { hidden: true } };

/** Рубашкой вверх — не то же самое, что скрытая: значение не придержано, карта просто перевёрнута. */
export const FaceDown: Story = { args: { faceUp: false } };

/** Нельзя тащить (Draggable=false): попытка драга отбивается «стоп»-качанием. Проверяется мышью. */
export const NotDraggable: Story = { args: { draggable: false } };

/** Не переворачивается (Flippable=false): на карте рисуется замок. */
export const NotFlippable: Story = { args: { flippable: false, faceUp: false } };

/** Левитирует («в руке»): сама покачивается, тень уходит дальше. */
export const Floating: Story = { args: { rest: "floating" } };

/** Значение ПРИДЕРЖАНО (пустая строка): сервер его ещё не раскрыл — карта маскируется. */
export const ValueWithheld: Story = { args: { card: "" } };
