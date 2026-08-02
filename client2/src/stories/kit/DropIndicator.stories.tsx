import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Card } from "../../game/ui/Card";
import { indicatorStyle, INDICATOR_STYLES, INDICATOR_STYLE_IDS } from "../../game/kit/dropIndicator";
import { CanvasStage } from "../harness/CanvasStage";


interface Args {
  /** Ключ стиля, а не индекс: индекс молча сдвигается при вставке нового стиля в середину. */
  style: string;
  /** Что под подписью: карта на столе, пустой стол или карта в руке поверх неё. */
  under: "card" | "empty" | "dragOver";
  text: string;
}

/**
 * Витрина оформления подписи «переместить сюда» — та же секция, что раздел «Дроп-индикатор» на
 * /playground (game/kit/dropIndicator.ts). Секция существует ради сравнения стилей ГЛАЗАМИ: это
 * решение о читаемости, и принимать его по описанию нельзя.
 *
 * Все карты витрины настоящие и драгабл: отпущенная едет домой пружиной. Шестая ячейка —
 * единственная, где видно наложение реальной драг-карты на подпись.
 */
const meta: Meta<Args> = {
  title: "Mechanics/Drop indicator",
  args: { style: "hudTag", under: "dragOver", text: "переместить сюда" },
  argTypes: {
    style: {
      name: "style",
      description: INDICATOR_STYLES.map((s) => `${s.id} — ${s.name}`).join("; "),
      control: { type: "select" },
      options: INDICATOR_STYLE_IDS,
    },
    under: {
      name: "under",
      description: "на чём читать подпись: card — карта на столе; empty — пустой стол (виден сам шильдик); dragOver — карта в руке НАВЕДЕНА поверх, единственный честный тест читаемости",
      control: { type: "select" },
      options: ["card", "empty", "dragOver"],
    },
    text: { name: "text", description: "текст подписи; длинный проверяет, не разъезжается ли подложка", control: { type: "text" } },
  },
  parameters: {
    code: (a: Record<string, unknown>) => `import { indicatorStyle } from "../../game/kit/dropIndicator";

// Подпись рисуется УЗЛАМИ поверх карт, поэтому её стиль — функция рисования, а не набор чисел.
indicatorStyle(${JSON.stringify(a.style)}).paint(ctx, cx, cy, ${JSON.stringify(a.text)});`,
  },
  render: (args) => (
    <CanvasStage<Card, Args>
      args={args}
      apply={{ style: "rebuild", under: "rebuild", text: "rebuild" }} // подпись рисуется узлами при сборке; живого сеттера у неё нет
      build={(ctx, a) => {
        const style = indicatorStyle(a.style);
        const cx = ctx.padding + ctx.cardW / 2;
        const cy = ctx.padding + ctx.cardH / 2;
        if (a.under !== "empty") ctx.card({ id: "di-board", card: "5♠", pose: "rest" }, { x: cx, y: cy }, 0);
        style.paint(ctx, cx, cy, a.text);
        // Наведённая карта — единственный честный тест: подпись обязана читаться ПОД грузом, а не
        // на пустом столе. Первая версия индикатора лежала ниже карт и была невидима именно тут.
        // Сдвиг с запасом на РАЗМЕР: удерживаемая карта нарисована ×1.45, и при сдвиге в полкарты
        // она накрывала подпись целиком — раздел переставал показывать то, ради чего он есть.
        if (a.under === "dragOver") ctx.card({ id: "di-drag", card: "K♥", pose: "held" }, { x: cx + ctx.cardW * 1.15, y: cy }, 1);
        // Подпись — ниже НАРИСОВАННОГО низа удерживаемой карты (×1.45), иначе она под ней.
        ctx.label(style.name, cx, cy + (ctx.cardH * 1.45) / 2 + 12, 13, 0x9aa89f, ctx.cardW * 2);
        ctx.extent(ctx.padding * 2 + ctx.cardW * 2.7, ctx.padding * 2 + ctx.cardH * 1.45 + 40);
      }}
    />
  ),
};
export default meta;

type Story = StoryObj<Args>;

/**
 * Подпись «переместить сюда». Стиль, фон и текст — рычагами: страниц под каждый из пяти стилей тут
 * нет, их различает ОДИН аргумент.
 *
 * Крутить надо `under`: единственный честный тест читаемости — подпись ПОД наведённой картой, а не
 * на пустом столе. Первая версия индикатора рисовалась ниже карт и была невидима ровно в этом
 * случае, при том что на пустом столе выглядела прекрасно.
 */
export const DropIndicator: Story = {};
