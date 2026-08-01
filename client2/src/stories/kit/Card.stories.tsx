import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card, type CardOptions } from "../../game/ui/Card";
import { CanvasStage } from "../harness/CanvasStage";
import { pickArgs, type CardArgs } from "./cardArgs";

// ПРОВЕРОЧНАЯ стори №1 из трёх (категория «UI-примитивы»). Её задача — доказать, что каркас
// работает на настоящем компоненте: живые контролы, пересборка там, где живьём нельзя, один
// канвас на все стори. Полноценное наполнение каталога — отдельными шагами, по указанию владельца
// (какие элементы переезжают из песочницы, решает он).

const KEYS = ["card", "faceUp", "hidden", "censored", "back", "faceStyle", "fourColor", "custom", "torn", "size", "rest", "draggable", "flippable"] as const;
const { argTypes, apply } = pickArgs(KEYS);

type Args = Pick<CardArgs, (typeof KEYS)[number]>;

const meta: Meta<Args> = {
  title: "UI-kit/Card",
  argTypes,
  args: {
    card: "A♠",
    faceUp: true,
    hidden: false,
    censored: false,
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

/**
 * СКРЫТАЯ — режим секретности: значение объявлено секретным, и лицо ЗАМЕНЯЕТСЯ чистым фоном.
 * Под пылью показывать нечего — в этом и смысл. Не путать со следующей.
 */
export const Concealed: Story = { args: { hidden: true } };

/**
 * ЗАЦЕНЗУРЕНА — фильтр: настоящее лицо рисуется как есть, пыль ложится ПОВЕРХ него. Значение у
 * клиента есть, смотреть на него сейчас нельзя. Разница со «скрытой» видна, если снять фильтр:
 * под ним окажется та самая карта, а не пустой фон.
 */
export const Censored: Story = { args: { censored: true, card: "Q♥" } };

/** Оба режима разом: лицо заменено маской И поверх неё фильтр. Так выглядела «скрытая» до разделения. */
export const ConcealedAndCensored: Story = { args: { hidden: true, censored: true } };

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
