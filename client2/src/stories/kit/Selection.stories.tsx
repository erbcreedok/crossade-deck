import type { Meta, StoryObj } from "@storybook/react-vite";
import type { KitScene } from "../../game/engine/kitScene";
import { CanvasStage } from "../harness/CanvasStage";
import { stackState } from "../../game/kit/stacks";
import { resolveLayout } from "../../game/kit/stackLayout";
import { watchFigureGlow, type FigureGlowPart } from "../../game/kit/figureGlow";
import type { Texture } from "pixi.js";
import type { Glowable } from "../../game/engine/element";
import type { GlowShape } from "../../game/ui/selection";
import { PresenceCursor } from "../../game/ui/PresenceCursor";
import { USER_COLORS } from "../../game/boards/core/room";

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

        // Фигуры-как-данные: карта, ЛЕСЕНКА карт (ступени контура видны, не предполагаются),
        // стопка фишек, куча фигур. Свечение — на элементах, контур один на фигуру.
        const FIGURES = [
          { caption: "card", opts: { count: 1 }, round: 0.16 },
          { caption: "stack — one figure", opts: { count: 5, form: "diagonal" as const }, round: 0.16 },
          { caption: "chips", opts: { content: "chips" as const, count: 6 }, round: 1 },
          { caption: "pieces pile", opts: { content: "pieces" as const, count: 4, form: "heap" as const }, round: 0.3 },
        ] as const;
        let x = ctx.padding;
        let rowBottom = ctx.padding;
        FIGURES.forEach((f, i) => {
          const at = { x, y: ctx.padding };
          const r = stackState(ctx, at, f.opts, `sel-${i}`);
          // ОДИН контур на фигуру: несёт нижний элемент. Силуэты частей — из ТОЙ ЖЕ раскладки,
          // что положила карты (root'ы на момент сборки ещё не синканы — брать их было враньём);
          // erase-пасс выводит настоящий ступенчатый контур союза, как маска теней.
          // ЖИВАЯ фигура: контур союза — слоем сцены (ни к какой части не привязан), уехавшая
          // часть рвёт силуэт и светится лично, на себе (watchFigureGlow). Потащите карту!
          type El = Glowable & { root: { x: number; y: number }; footprint: { hw: number; hh: number }; glowSilhouette?: { texture: Texture; bounds: { x: number; y: number; width: number; height: number } } | null };
          const els = r.ids.map((id) => ctx.element(id) as unknown as El | undefined);
          const base = els[0];
          if (base) {
            const cell = { w: base.footprint.hw * 2, h: base.footprint.hh * 2 };
            const layout = resolveLayout("form" in f.opts ? f.opts.form : "tight");
            const o0 = layout(0, r.ids.length, cell);
            const parts: FigureGlowPart[] = [];
            r.ids.forEach((_, k) => {
              const el = els[k];
              if (!el) return;
              const o = layout(k, r.ids.length, cell);
              const home = { x: at.x + cell.w / 2 + (o.dx - o0.dx), y: at.y + cell.h / 2 + (o.dy - o0.dy) };
              const sil = el.glowSilhouette;
              const shape: GlowShape = sil
                ? { kind: "silhouette", x: home.x + sil.bounds.x, y: home.y + sil.bounds.y, w: sil.bounds.width, h: sil.bounds.height, texture: sil.texture }
                : { x: home.x - cell.w / 2, y: home.y - cell.h / 2, w: cell.w, h: cell.h, radius: (Math.min(cell.w, cell.h) / 2) * (f.round ?? 0.16) };
              parts.push({ el, home, shape });
            });
            watchFigureGlow(ctx, parts, color);
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
