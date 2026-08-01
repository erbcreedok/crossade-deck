import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card, type CardOptions } from "../../game/ui/Card";
import { CanvasStage } from "../harness/CanvasStage";
import { pickArgs, type CardArgs } from "./cardArgs";

// ПРОВЕРОЧНАЯ стори №1 из трёх (категория «UI-примитивы»). Её задача — доказать, что каркас
// работает на настоящем компоненте: живые контролы, пересборка там, где живьём нельзя, один
// канвас на все стори. Полноценное наполнение каталога — отдельными шагами, по указанию владельца
// (какие элементы переезжают из песочницы, решает он).

const KEYS = ["card", "faceUp", "hidden", "censored", "back", "faceStyle", "fourColor", "custom", "torn", "size", "pose", "idle", "z", "selected", "draggable", "flippable"] as const;
const { argTypes, apply } = pickArgs(KEYS);

type Args = Pick<CardArgs, (typeof KEYS)[number]>;

const meta: Meta<Args> = {
  title: "UI-kit/Card",
  parameters: {
    // «Show code» печатает код КАРТЫ с аргументами этой стори, а не исходник стори.
    code: (a: Record<string, unknown>) => `// В секции (game/kit/*.ts) карту ставит контекст: он решает, родить её сейчас (витрина)
// или отложенно из спека (песочница копит спеки и спавнит карты после мебели).
ctx.card(${JSON.stringify(a, null, 2)}, { x: cx, y: cy });

// Напрямую, если сцены-секции нет:
import { Card } from "../../game/ui/Card";
const c = new Card(${JSON.stringify(a, null, 2)}, tex, baseScale);
scene.surface.addChild(c.root);
c.body.snapTo({ x: cx, y: cy, rot: 0, scale: c.restScale });

// Живьём, без пересборки:
c.setValue("K♥");        // масть можно буквой: "KH"
c.setConcealed(true);    // режим секретности
c.setCensored(true);     // пыль поверх настоящего лица
c.setSelected(true);     // контур набора
c.requestFlip();         // настоящий поворот, не подмена текстуры`,
  },
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
    pose: "rest",
    idle: false,
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

/**
 * Карта. Все опции — рычагами; страниц под «скрытую», «зацензуренную», «рубашкой
 * вверх» тут нет: каждую из них включает один аргумент.
 *
 * Что стоит покрутить, потому что по картинке неочевидно:
 *   • `hidden` против `censored` — режим секретности (лицо ЗАМЕНЕНО) против фильтра (лицо на месте,
 *     пыль поверх). Под пылью выглядят одинаково, в состоянии карты разница принципиальная;
 *   • `card: ""` — значение ПРИДЕРЖАНО: сервер его ещё не раскрыл. Это не то же, что скрытая карта;
 *   • `flippable: false` — рисуется замок, и переворот не проходит даже программно.
 */
export const Card_: Story = { name: "Card" };
