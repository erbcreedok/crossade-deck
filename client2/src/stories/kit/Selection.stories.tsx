import type { Meta, StoryObj } from "@storybook/react-vite";
import { Graphics } from "pixi.js";
import type { KitScene } from "../../game/engine/kitScene";
import { CanvasStage } from "../harness/CanvasStage";
import { stackState } from "../../game/kit/stacks";
import { paintHighlight, unionRect, type Rect } from "../../game/ui/selection";
import { PresenceCursor } from "../../game/ui/PresenceCursor";
import { USER_COLORS } from "../../game/boards/room";

interface Args {
  color: string;
  pad: number;
  radius: number;
  strength: number;
}

/**
 * ВЫДЕЛЕНИЕ И ПРИСУТСТВИЕ — атомы поверх любых элементов:
 *
 *  • `paintHighlight` (ui/selection.ts) — АККУРАТНАЯ подсветка: мягкое свечение в несколько
 *    полупрозрачных слоёв + тонкая яркая линия, вместо одного грубого бордера. СТОПКА
 *    выделяется как ОДНА ФИГУРА: габарит считает `unionRect` по всем её картам (чистая
 *    функция), контур один на стопку, а не рамка на каждой карте.
 *  • `PresenceCursor` (ui/PresenceCursor.ts) — курсор присутствия: цветная точка с кольцом и
 *    именем; без имени — СВОЙ курсор (своё имя под собственным пальцем — шум).
 *
 * В live-режиме песочницы эти же атомы красятся ЦВЕТОМ ИГРОКА (лок «кто первый схватил»,
 * свой курсор, подсветки дропа).
 */
const meta: Meta<Args> = {
  title: "UI-kit/Selection",
  args: { color: "#6a9ae0", pad: 6, radius: 12, strength: 1 },
  argTypes: {
    color: {
      name: "color",
      description: "цвет подсветки и курсоров — в live сюда приходит цвет игрока, в соло — золото стола",
      control: { type: "color" },
    },
    pad: {
      name: "pad",
      description: "отступ свечения от габарита фигуры, px — подсветка не должна липнуть к краю карты",
      control: { type: "range", min: 0, max: 20, step: 1 },
    },
    radius: {
      name: "radius",
      description: "скругление контура, px — под скругление самой карты",
      control: { type: "range", min: 0, max: 24, step: 1 },
    },
    strength: {
      name: "strength",
      description: "насыщенность свечения 0..1 — домножает прозрачность всех слоёв",
      control: { type: "range", min: 0.2, max: 1, step: 0.05 },
    },
  },
  parameters: {
    code: (a: Record<string, unknown>) => `import { paintHighlight, unionRect } from "../../game/ui/selection";
import { PresenceCursor } from "../../game/ui/PresenceCursor";

// Стопка — ОДНА фигура: контур по объединению габаритов её карт.
const figure = unionRect(cards.map(cardRect))!;
paintHighlight(g, figure, { color: ${JSON.stringify(a.color)}, pad: ${a.pad}, radius: ${a.radius}, strength: ${a.strength} });

// Курсор присутствия: с именем — чужой, без имени — свой.
const cursor = new PresenceCursor({ color, label: "Красная панда" });
cursor.place(x, y);`,
  },
  render: (args) => (
    <CanvasStage<KitScene, Args>
      args={args}
      target={(scene) => scene}
      build={(ctx, a) => {
        const color = parseInt(a.color.replace("#", ""), 16);
        const style = { color, pad: a.pad, radius: a.radius, strength: a.strength };
        const cell = { w: ctx.cardW, h: ctx.cardH };
        const g = new Graphics();
        ctx.decor(g);

        // 1. Одиночная карта с подсветкой.
        const soloAt = { x: ctx.padding, y: ctx.padding };
        stackState(ctx, soloAt, { count: 1 }, "sel-solo");
        paintHighlight(g, { x: soloAt.x, y: soloAt.y, w: cell.w, h: cell.h }, style);
        const soloCap = ctx.label("card", soloAt.x + cell.w / 2, soloAt.y + cell.h + 14, 12, 0x9aa89f, cell.w);

        // 2. Стопка со стаггером — подсветка ОДНИМ контуром по unionRect (не рамка на каждой карте).
        const stackAt = { x: soloAt.x + cell.w + ctx.cardW * 1.2, y: ctx.padding };
        const stack = stackState(ctx, stackAt, { count: 5 }, "sel-stack");
        const rects: Rect[] = Array.from({ length: 5 }, (_, i) => ({ x: stackAt.x + i * 0.5, y: stackAt.y + i * 0.5, w: cell.w, h: cell.h }));
        paintHighlight(g, unionRect(rects)!, style);
        ctx.label("stack — one figure", stackAt.x + stack.width / 2, stackAt.y + cell.h + 14, 12, 0x9aa89f, cell.w * 2);

        // 3. Курсоры присутствия: чужие с именами (палитра live), свой — без имени.
        const NAMES = ["Красная панда", "Синяя сова", "Зелёная выдра", "Лиловая рысь"];
        const cy = stackAt.y + cell.h + 70;
        NAMES.forEach((name, i) => {
          const cursor = new PresenceCursor({ color: USER_COLORS[i]!, label: name });
          cursor.place(ctx.padding + 12 + i * 150, cy);
          ctx.decor(cursor.root);
        });
        const own = new PresenceCursor({ color });
        own.place(ctx.padding + 12 + NAMES.length * 150, cy);
        ctx.decor(own.root);
        ctx.label("presence cursors · последний без имени — свой", ctx.padding + 300, cy + 34, 12, 0x9aa89f, 600);

        ctx.extent(Math.max(stackAt.x + cell.w * 2.4, ctx.padding + 24 + (NAMES.length + 1) * 150), cy + 60 + soloCap.height);
      }}
    />
  ),
};
export default meta;

type Story = StoryObj<Args>;

/** Подсветка фигур (карта и стопка ЦЕЛИКОМ) + курсоры присутствия. Крутите цвет и свечение. */
export const Selection: Story = {};
