import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Card } from "../../game/ui/Card";
import { chipPile } from "../../game/kit/pieces";
import { dropzonesSection } from "../../game/kit/dropzones";
import { drawPinIcon, drawRingIcon } from "../../game/kit/markerIcons";
import { CanvasStage } from "../harness/CanvasStage";
import { piecesSection } from "../../game/kit/pieces";
import { PIECE_ARGS, PIECE_ARG_TYPES, specFrom, type PieceArgs } from "./pieceArgs";

// Не-карточные элементы стола: фишки номиналов, шахматные фигуры, столбик фишек за грип.
//
// Главное, что показывает раздел: «элемент стола» ≠ «карта». Фишка и конь ездят тем же драгом,
// отбрасывают те же тени, живут в тех же слоях и носят те же метки. При этом они Draggable и
// Burnable, но НЕ Flippable — и зона «ПЕРЕВОРОТ» это видит, потому что реагирует на СПОСОБНОСТЬ
// груза, а не на его тип.
//
// Метка — это «ручка»: грип (три точки) под целью, за него тянут ЦЕЛЬ, а не то, что под пальцем.
// У столбика фишек за грип уезжает вся пачка. Проверяется только мышью.

const meta: Meta<PieceArgs> = {
  // UI-примитив, а не механика: фишка и фигура — такой же элемент стола, как карта и кнопка.
  // В «Механиках» им было не место; механика — это грип, якорь и дроп-зоны, они ниже отдельно.
  title: "UI-kit/Piece",
  parameters: {
    code: (a: Record<string, unknown>) => `// Спека типа → визуал берётся из реестра (ui/pieceKinds.ts). Дальше фишка живёт ровно как карта:
// тот же драг, те же тени, те же слои и метки. Flippable она при этом НЕ является.
ctx.piece("chip-1", { x: cx, y: cy }, ${JSON.stringify(a.kind === "chip" ? { kind: "chip", color: a.color, denom: a.denom } : { kind: "chess", dark: a.dark, glyph: a.glyph })}, ${JSON.stringify(a.radius)});`,
  },
  argTypes: PIECE_ARG_TYPES,
  args: PIECE_ARGS,
  // ОДИН элемент, разные аргументы. Ряда «все типы сразу» тут нет намеренно: сравнивать варианты —
  // работа боковой навигации каталога, и в ряду ни один из них не разглядеть.
  render: (args) => (
    <CanvasStage<Card, PieceArgs>
      args={args}
      build={(ctx, a) => {
        const home = { x: ctx.padding + a.radius, y: ctx.padding + a.radius };
        ctx.piece("pc", home, specFrom(a), a.radius);
        (ctx.element("pc") as { setZ?: (v: number) => void } | undefined)?.setZ?.(a.z);
        // Метка — «ручка» элемента: грип тянет ЦЕЛЬ, якорь остаётся дома по своей политике.
        ctx.solo("pc", home, { draw: a.anchor === "always" ? drawPinIcon : drawRingIcon, show: a.anchor }, "pc");
        ctx.extent(ctx.padding * 2 + a.radius * 2, ctx.padding * 2 + a.radius * 2);
      }}
    />
  ),
};
export default meta;

type Story = StoryObj<PieceArgs>;

/**
 * Фишка или фигура. Тип, цвет, номинал, символ и радиус — рычагами: страниц под «фишку», «коня» и
 * «светлую сторону» тут нет, их различает ОДИН аргумент.
 *
 * Что видно только тут: элемент стола ≠ карта. Фишка ездит тем же драгом, отбрасывает ту же тень и
 * носит те же метки, но она НЕ Flippable — и зона «ПЕРЕВОРОТ» это видит, потому что реагирует на
 * СПОСОБНОСТЬ груза, а не на его тип. Тень у неё эллиптическая: у лежащей фишки почти круглая, у
 * стоящей фигуры — узкий овал у основания.
 */
export const Piece_: Story = { name: "Piece" };

/**
 * Столбик фишек отдельно и крупно. Тяните за грип под ним — уедет вся пачка целиком (GroupDrag);
 * тяните за верхнюю фишку — поедет она одна. Это две разные цели захвата в одном месте.
 */
export const PileByGrip: Story = {
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
 * Фигуры против дроп-зон: «СЖЕЧЬ» их принимает, «ПЕРЕВОРОТ» — нет (не Flippable), «ПОДГЛЯДЕТЬ» —
 * нет (не Peekable, у фишки нечего прятать). Зоны — настоящая секция, не декорация.
 */
export const AgainstZones: Story = {
  render: () => (
    <CanvasStage<Card, Record<string, never>>
      args={{}}
      opts={{ cardHeight: 130 }}
      build={(ctx) => {
        const r = ctx.cardH * 0.34;
        ctx.piece("z-chip", { x: ctx.padding + r, y: ctx.padding + r }, { kind: "chip", color: 0xb23b34, denom: "5" }, r);
        ctx.piece("z-knight", { x: ctx.padding + r * 3.4, y: ctx.padding + r }, { kind: "chess", dark: true, glyph: "♞" }, r);
        ctx.card({ id: "z-card", card: "A♠", pose: "rest" }, { x: ctx.padding + r * 6.4, y: ctx.padding + ctx.cardH / 2 }, 5);
        ctx.label("фишка и конь горят, но не переворачиваются; карта умеет всё", ctx.padding, ctx.padding + ctx.cardH + 14, 12, 0x9aa89f, ctx.cardW * 5, 0);
        const z = dropzonesSection(ctx, { x: ctx.padding, y: ctx.padding + ctx.cardH + 44 });
        ctx.extent(Math.max(ctx.cardW * 5, z.width) + ctx.padding * 2, z.bottom + ctx.padding);
      }}
    />
  ),
};

/**
 * ГАЛЕРЕЯ — все элементы раздела разом: фишки номиналов, шахматные фигуры, столбик и карта рядом.
 *
 * Отдельной страницей, как у карты и кнопки: тут сравнивают, а не крутят рычаги. Секция та же,
 * что раздел «Фишки и фигуры» на /playground (game/kit/pieces.ts) — не копия.
 */
export const Gallery: Story = {
  parameters: {
    controls: { disable: true },
    code: () => `import { piecesSection } from "../../game/kit/pieces";

// Список элементов — ДАННЫЕ (pieceRow), визуал каждого берётся из реестра по спеке
// (ui/pieceKinds.ts): новый тип = ветка там, а не правка раскладки.
const r = piecesSection(ctx, { x: ctx.padding, y: ctx.padding });
ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);`,
  },
  render: () => (
    <CanvasStage<Card, Record<string, never>>
      args={{}}
      opts={{ cardHeight: 130 }}
      build={(ctx) => {
        const r = piecesSection(ctx, { x: ctx.padding, y: ctx.padding });
        ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);
      }}
    />
  ),
};
