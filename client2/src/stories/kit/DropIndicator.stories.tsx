import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Card } from "../../game/ui/Card";
import { dropIndicatorSection, INDICATOR_STYLES, paintIndicatorBadge } from "../../game/kit/dropIndicator";
import { CanvasStage } from "../harness/CanvasStage";

// Витрина оформления подписи «переместить сюда» — та же секция, что раздел «Дроп-индикатор» на
// /playground (game/kit/dropIndicator.ts). Секция существует ради сравнения стилей ГЛАЗАМИ: это
// решение о читаемости, и принимать его по описанию нельзя.
//
// Все карты витрины настоящие и драгабл: отпущенная едет домой пружиной. Шестая ячейка —
// единственная, где видно наложение реальной драг-карты на подпись.

interface Args {
  style: number;
}

const meta: Meta<Args> = {
  title: "Mechanics/Drop indicator",
  args: { style: INDICATOR_STYLES.length - 1 },
  argTypes: {
    style: {
      name: `стиль подписи — 0…${INDICATOR_STYLES.length - 1}: ${INDICATOR_STYLES.map((s, i) => `${i} ${s.name}`).join("; ")}`,
      control: { type: "range", min: 0, max: INDICATOR_STYLES.length - 1, step: 1 },
    },
  },
  render: (args) => (
    <CanvasStage<Card, Args>
      args={args}
      apply={{ style: "rebuild" }} // подпись рисуется узлами при сборке; живого сеттера у неё нет
      build={(ctx, a) => {
        // Один стиль крупным планом: карта борда + подпись поверх + драг-карта рядом, как при
        // реальном наведении. Витрину со всеми шестью даёт стори «Сравнение».
        const style = INDICATOR_STYLES[Math.min(a.style, INDICATOR_STYLES.length - 1)] ?? INDICATOR_STYLES[0]!;
        const cx = ctx.padding + ctx.cardW / 2;
        const cy = ctx.padding + ctx.cardH / 2;
        ctx.card({ id: "di-one-board", card: "5♠", rest: "idle" }, { x: cx, y: cy }, 0);
        style.paint(ctx, cx, cy, "переместить сюда");
        ctx.card({ id: "di-one-drag", card: "K♥", rest: "held" }, { x: cx + ctx.cardW * 0.5, y: cy }, 1);
        ctx.label(style.name, cx, cy + ctx.cardH / 2 + 12, 13, 0x9aa89f, ctx.cardW * 2);
        ctx.extent(ctx.padding * 2 + ctx.cardW * 2.2, ctx.padding * 2 + ctx.cardH + 40);
      }}
    />
  ),
};
export default meta;

type Story = StoryObj<Args>;

/** Победитель сравнения — плашка с акцентной рамкой. Читается поверх любой карты. */
export const HudTag: Story = {};

/** Исходный вариант: золото с толстой чёрной обводкой. Baseline, с которым сравнивали остальные. */
export const Outline: Story = { args: { style: 0 } };

/** Жёсткая тень — сплошной дубль со сдвигом, без blur. Дёшево, но на пёстром фоне мылится. */
export const HardShadow: Story = { args: { style: 1 } };

/**
 * Все шесть ячеек разом — ТА ЖЕ секция, что на /playground. Первая (REST) показывает исходную
 * проблему: подпись лежит НИЖЕ карт и потому невидима.
 */
export const Comparison: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <CanvasStage<Card, Record<string, never>>
      args={{}}
      build={(ctx) => {
        const r = dropIndicatorSection(ctx, { x: ctx.padding, y: ctx.padding });
        ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);
      }}
    />
  ),
};

/** Подпись на пустом столе — без карт и рамок, чтобы оценить сам шильдик. */
export const BadgeOnly: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <CanvasStage<Card, Record<string, never>>
      args={{}}
      build={(ctx) => {
        paintIndicatorBadge(ctx, ctx.padding + 120, ctx.padding + 20, "переместить сюда", true);
        ctx.extent(ctx.padding * 2 + 240, ctx.padding * 2 + 40);
      }}
    />
  ),
};
