import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Card } from "../../game/ui/Card";
import { chipPile, piecesSection } from "../../game/kit/pieces";
import { dropzonesSection } from "../../game/kit/dropzones";
import { drawPinIcon, drawRingIcon } from "../../game/kit/markerIcons";
import { CanvasStage } from "../harness/CanvasStage";

// Не-карточные элементы стола: фишки номиналов, шахматные фигуры, столбик фишек за грип.
//
// Главное, что показывает раздел: «элемент стола» ≠ «карта». Фишка и конь ездят тем же драгом,
// отбрасывают те же тени, живут в тех же слоях и носят те же метки. При этом они Draggable и
// Burnable, но НЕ Flippable — и зона «ПЕРЕВОРОТ» это видит, потому что реагирует на СПОСОБНОСТЬ
// груза, а не на его тип.
//
// Метка — это «ручка»: грип (три точки) под целью, за него тянут ЦЕЛЬ, а не то, что под пальцем.
// У столбика фишек за грип уезжает вся пачка. Проверяется только мышью.

const meta: Meta<Record<string, never>> = {
  title: "Механики/Фишки и фигуры",
  parameters: { controls: { disable: true } },
  render: () => (
    <CanvasStage<Card, Record<string, never>>
      args={{}}
      build={(ctx) => {
        const r = piecesSection(ctx, { x: ctx.padding, y: ctx.padding });
        ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);
      }}
    />
  ),
};
export default meta;

type Story = StoryObj<Record<string, never>>;

/** Весь ряд — ТА ЖЕ секция, что «Фишки и фигуры» на /playground. */
export const Ряд: Story = {};

/**
 * Столбик фишек отдельно и крупно. Тяните за грип под ним — уедет вся пачка целиком (GroupDrag);
 * тяните за верхнюю фишку — поедет она одна. Это две разные цели захвата в одном месте.
 */
export const СтолбикЗаГрип: Story = {
  render: () => (
    <CanvasStage<Card, Record<string, never>>
      args={{}}
      opts={{ cardHeight: 200 }}
      build={(ctx) => {
        const r = ctx.cardH * 0.34;
        chipPile(ctx, { x: ctx.padding + r, y: ctx.padding + ctx.cardH * 0.7 }, r);
        ctx.label("тяни за грип — уедет вся пачка", ctx.padding + r, ctx.padding + ctx.cardH * 0.7 + r + 26, 13, 0x9aa89f, r * 8);
        ctx.extent(ctx.padding * 2 + r * 8, ctx.padding * 2 + ctx.cardH);
      }}
    />
  ),
};

/**
 * Три политики видимости якоря на одинаковых фигурах: «когда унесли» (away), «когда пусто» (empty),
 * «всегда» (always). Разница видна только в движении — унесите фигуру и посмотрите, что осталось.
 */
export const ПолитикиЯкоря: Story = {
  render: () => (
    <CanvasStage<Card, Record<string, never>>
      args={{}}
      opts={{ cardHeight: 150 }}
      build={(ctx) => {
        const r = ctx.cardH * 0.34;
        const step = ctx.cardW * 1.4;
        const looks = [
          { id: "pol-away", cap: "away: якорь, когда унесли", look: { draw: drawRingIcon, show: "away" as const } },
          { id: "pol-empty", cap: "empty: кольцо, когда пусто", look: { draw: drawRingIcon, show: "empty" as const } },
          { id: "pol-always", cap: "always: метка всегда", look: { draw: drawPinIcon, show: "always" as const } },
        ];
        looks.forEach((l, i) => {
          const home = { x: ctx.padding + r + i * step, y: ctx.padding + r };
          ctx.piece(l.id, home, { kind: "chess", dark: i % 2 === 0, glyph: "♞" }, r);
          ctx.solo(l.id, home, l.look, l.cap);
          ctx.label(l.cap, home.x, home.y + r + 26, 12, 0x9aa89f, step * 0.95);
        });
        ctx.extent(ctx.padding * 2 + step * looks.length, ctx.padding * 2 + r * 2 + 60);
      }}
    />
  ),
};

/**
 * Фигуры против дроп-зон: «СЖЕЧЬ» их принимает, «ПЕРЕВОРОТ» — нет (не Flippable), «ПОДГЛЯДЕТЬ» —
 * нет (не Peekable, у фишки нечего прятать). Зоны — настоящая секция, не декорация.
 */
export const ПротивЗон: Story = {
  render: () => (
    <CanvasStage<Card, Record<string, never>>
      args={{}}
      opts={{ cardHeight: 130 }}
      build={(ctx) => {
        const r = ctx.cardH * 0.34;
        ctx.piece("z-chip", { x: ctx.padding + r, y: ctx.padding + r }, { kind: "chip", color: 0xb23b34, denom: "5" }, r);
        ctx.piece("z-knight", { x: ctx.padding + r * 3.4, y: ctx.padding + r }, { kind: "chess", dark: true, glyph: "♞" }, r);
        ctx.card({ id: "z-card", card: "A♠", rest: "idle" }, { x: ctx.padding + r * 6.4, y: ctx.padding + ctx.cardH / 2 }, 5);
        ctx.label("фишка и конь горят, но не переворачиваются; карта умеет всё", ctx.padding, ctx.padding + ctx.cardH + 14, 12, 0x9aa89f, ctx.cardW * 5, 0);
        const z = dropzonesSection(ctx, { x: ctx.padding, y: ctx.padding + ctx.cardH + 44 });
        ctx.extent(Math.max(ctx.cardW * 5, z.width) + ctx.padding * 2, z.bottom + ctx.padding);
      }}
    />
  ),
};
