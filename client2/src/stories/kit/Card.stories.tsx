import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card, type CardOptions } from "../../game/ui/Card";
import { CanvasStage } from "../harness/CanvasStage";
import { pickArgs, type CardArgs } from "./cardArgs";
import { CARD_VARIANTS, cardVariantsSection } from "../../game/kit/cardVariants";

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

/**
 * ГАЛЕРЕЯ — все виды карты разом, чтобы глазами найти нужный и не крутить рычаги вслепую.
 *
 * Отдельной страницей, а не блоком под живым примером: страница карты — место, где ОДНУ карту
 * отлаживают рычагами, и соседи там мешают. Здесь наоборот — сравнивают, и рычагов нет вовсе.
 *
 * Канвас всё равно ОДИН: у каталога общий пул витрин, и пятнадцать канвасов под пятнадцать карт
 * означали бы пятнадцать WebGL-контекстов на одной странице (потолок браузера ~16).
 */
export const Gallery: Story = {
  // Имя страницы английское, как у всех разделов каталога: русский живёт в описаниях, а не в
  // идентификаторах (их видно в URL стори и в поиске по репозиторию).
  parameters: {
    controls: { disable: true },
    code: () => `import { CARD_VARIANTS, cardVariantsSection } from "../../game/kit/cardVariants";

// 1. СПИСОК ВИДОВ — данные, а не разметка: одна запись = одна заметная опция карты.
//    Здесь он же кормит и песочницу, поэтому каталог не может разойтись с ней.
const CARD_VARIANTS = [
  { caption: "открытая", opts: { faceUp: true } },
  { caption: "скрытая (нет лица)", opts: { hidden: true, faceUp: true } },
  { caption: "цензура (фильтр)", opts: { card: "Q♥", censored: true } },
  { caption: "удерживаемая", opts: { card: "8♦", pose: "held" } },
  // …всего ${CARD_VARIANTS.length}
];

// 2. РАСКЛАДКА — общая секция: сетка с переносом строк и подписью под каждой картой.
//    Ячейка меряется по САМОМУ КРУПНОМУ виду (удерживаемая карта нарисована ×1.45).
const r = cardVariantsSection(ctx, { x: ctx.padding, y: ctx.padding });
ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);

// 3. Своя выборка — тот же приём, без всякой регистрации:
for (const [i, v] of MY_VARIANTS.entries()) {
  ctx.card({ ...v.opts, id: \`my-\${i}\` }, { x: cx(i), y: cy(i) });
  ctx.label(v.caption, cx(i), cy(i) + ctx.cardH / 2 + 8, 14, 0x9aa89f);
}`,
  },
  render: () => (
    <CanvasStage<Card, Record<string, never>>
      args={{}}
      build={(ctx) => {
        const r = cardVariantsSection(ctx, { x: ctx.padding, y: ctx.padding }, "gal", true);
        ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);
      }}
    />
  ),
};
