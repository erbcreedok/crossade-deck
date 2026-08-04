import type { Meta, StoryObj } from "@storybook/react-vite";
import type { KitScene } from "../../game/engine/kitScene";
import { CanvasStage } from "../harness/CanvasStage";
import { stackState } from "../../game/kit/stacks";
import type { Glowable } from "../../game/engine/element";
import { PresenceCursor } from "../../game/ui/PresenceCursor";
import { USER_COLORS } from "../../game/boards/room";

interface Args {
  color: string;
}

/**
 * ВЫДЕЛЕНИЕ И ПРИСУТСТВИЕ — атомы:
 *
 *  • СВЕЧЕНИЕ (`Card/Piece.setGlow`, атом ui/selection.makeGlow) устроено как СОБСТВЕННАЯ ТЕНЬ:
 *    узел в локальных координатах элемента, нижним ребёнком его root — едет, наклоняется и
 *    масштабируется вместе с элементом сам, без пер-кадровой синхронизации, и адаптивен к любому
 *    предмету (карта, фишка, шахматная фигура — каждый светится своим футпринтом). В стопке
 *    внутренние края свечений накрыты соседями — снаружи остаётся ОБЩИЙ контур фигуры, ровно как
 *    сливаются тени. Есть shadow — есть и glow.
 *  • `PresenceCursor` (ui/PresenceCursor.ts) — курсор присутствия: цветная точка с кольцом и
 *    именем; без имени — СВОЙ курсор (своё имя под собственным пальцем — шум).
 *
 * В live-режиме песочницы то же самое красится ЦВЕТОМ ИГРОКА: светится ровно то, что он держит —
 * одиночная карта одна, колода при блок-драге целиком.
 */
const meta: Meta<Args> = {
  title: "UI-kit/Selection",
  args: { color: "#6a9ae0" },
  argTypes: {
    color: {
      name: "color",
      description: "цвет свечения и курсоров — в live сюда приходит цвет игрока, в соло — золото стола",
      control: { type: "color" },
    },
  },
  parameters: {
    code: (a: Record<string, unknown>) => `// Свечение — способность элемента (Glowable), как собственная тень: включил — едет само.
for (const id of stack.ids) (ctx.element(id) as Glowable).setGlow(${JSON.stringify(a.color)});

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

        // Фигуры-как-данные: карта, стопка карт, стопка фишек, куча фигур. Свечение включается
        // НА ЭЛЕМЕНТАХ — в стопке контуры сливаются в одну фигуру (как тени), не рамка на каждой.
        const FIGURES = [
          { caption: "card", opts: { count: 1 } },
          { caption: "stack — one figure", opts: { count: 5 } },
          { caption: "chips", opts: { content: "chips" as const, count: 6 } },
          { caption: "pieces pile", opts: { content: "pieces" as const, count: 4 } },
        ];
        let x = ctx.padding;
        let rowBottom = ctx.padding;
        FIGURES.forEach((f, i) => {
          const at = { x, y: ctx.padding };
          const r = stackState(ctx, at, f.opts, `sel-${i}`);
          // ОДИН контур на фигуру: несёт нижний элемент (span = габарит целой стопки), как тени.
          const base = ctx.element(r.ids[0]!) as unknown as (Glowable & { footprint: { hw: number; hh: number } }) | undefined;
          if (base) {
            const fig = { w: r.width, h: r.bottom - at.y };
            base.setGlow(color, r.ids.length === 1 ? undefined : {
              w: fig.w,
              h: fig.h,
              dx: at.x + fig.w / 2 - (at.x + base.footprint.hw),
              dy: at.y + fig.h / 2 - (at.y + base.footprint.hh),
            });
          }
          ctx.label(f.caption, at.x + r.width / 2, r.bottom + 16, 12, 0x9aa89f, Math.max(r.width * 1.6, 140));
          rowBottom = Math.max(rowBottom, r.bottom);
          x += r.width + ctx.cardW * 0.9;
        });

        // Курсоры присутствия: чужие с именами (палитра live), свой — без имени.
        const NAMES = ["Красная панда", "Синяя сова", "Зелёная выдра", "Лиловая рысь"];
        const cy = rowBottom + 80;
        NAMES.forEach((name, i) => {
          const cursor = new PresenceCursor({ color: USER_COLORS[i]!, label: name });
          cursor.place(ctx.padding + 12 + i * 150, cy);
          ctx.decor(cursor.root);
        });
        const own = new PresenceCursor({ color });
        own.place(ctx.padding + 12 + NAMES.length * 150, cy);
        ctx.decor(own.root);
        ctx.label("presence cursors · последний без имени — свой", ctx.padding + 300, cy + 34, 12, 0x9aa89f, 600);

        ctx.extent(Math.max(x, ctx.padding + 24 + (NAMES.length + 1) * 150), cy + 70);
      }}
    />
  ),
};
export default meta;

type Story = StoryObj<Args>;

/** Свечение фигур (карта, стопка, фишки, фигуры) + курсоры присутствия. Крутите цвет. */
export const Selection: Story = {};
