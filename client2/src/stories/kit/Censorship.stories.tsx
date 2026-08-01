import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Card, CardOptions } from "../../game/ui/Card";
import { CanvasStage } from "../harness/CanvasStage";

// ЦЕНЗУРА — «TG-пыль» поверх карты.
//
// Главное свойство: пыль не самостоятельная картинка, а СМАЗ того, что под ней. Частицы рождаются
// по настоящему лицу карты и берут его цвета, поэтому туз пик размазывается тузом пик, джокер —
// джокером, рубашка — рубашкой. Раньше облако строилось по одному зашитому силуэту и красилось
// одним амбером: цензура выглядела одинаковой жёлтой крошкой поверх чего угодно.
//
// Само лицо под пылью НЕ печатается — иначе видно и карту, и эффект сразу, и цензура перестаёт
// быть цензурой. Всё, что должно читаться, несут частицы.
//
// Плотность облака неравномерная: клетки, непохожие на общий тон карты, рождают частиц больше.
// Без этого рисунок тонул в равномерной ряби — краска занимает малую долю лица, а кремовые частицы
// на кремовой подложке невидимы.
//
// Смотреть надо в ДВИЖЕНИИ: пыль живёт, и статичный кадр показывает лишь её срез.

const PAIRS: { caption: string; opts: CardOptions }[] = [
  { caption: "туз пик", opts: { card: "A♠" } },
  { caption: "дама червей", opts: { card: "Q♥" } },
  { caption: "джокер", opts: { custom: "joker" } },
  { caption: "джокер ч/б", opts: { custom: "joker-bw" } },
  { caption: "фак", opts: { custom: "finger" } },
  { caption: "рубашка (цензурить нечего)", opts: { faceUp: false, back: "emerald" } },
];

/** Ряд «как есть» сверху, «под цензурой» снизу — сравнение работает только парами. */
function build(ctx: Parameters<NonNullable<Parameters<typeof CanvasStage>[0]["build"]>>[0], only?: number) {
  const items = only === undefined ? PAIRS : [PAIRS[only]!];
  const gap = ctx.cardW * 0.35;
  const stepX = ctx.cardW + gap;
  const rowY = (r: number) => ctx.padding + 22 + ctx.cardH / 2 + r * (ctx.cardH + 46);

  ctx.label("как есть", ctx.padding, ctx.padding, 13, 0xcdb98f, undefined, 0);
  items.forEach((it, i) => {
    const x = ctx.padding + ctx.cardW / 2 + i * stepX;
    ctx.card({ ...it.opts, id: `plain-${i}`, rest: "idle" }, { x, y: rowY(0) }, i);
    ctx.label(it.caption, x, rowY(0) + ctx.cardH / 2 + 8, 12, 0x9aa89f, stepX * 0.95);
  });

  ctx.label("под цензурой", ctx.padding, rowY(1) - ctx.cardH / 2 - 24, 13, 0xcdb98f, undefined, 0);
  items.forEach((it, i) => {
    const x = ctx.padding + ctx.cardW / 2 + i * stepX;
    ctx.card({ ...it.opts, id: `cens-${i}`, censored: true, rest: "idle" }, { x, y: rowY(1) }, 100 + i);
    ctx.label(it.caption, x, rowY(1) + ctx.cardH / 2 + 8, 12, 0x9aa89f, stepX * 0.95);
  });

  ctx.extent(ctx.padding * 2 + items.length * stepX, rowY(1) + ctx.cardH / 2 + 40);
}

const meta: Meta<Record<string, never>> = {
  title: "Mechanics/Censorship",
  parameters: { controls: { disable: true } },
  render: () => <CanvasStage<Card, Record<string, never>> args={{}} opts={{ cardHeight: 150 }} build={(ctx) => build(ctx)} />,
};
export default meta;

type Story = StoryObj<Record<string, never>>;

/** Шесть лиц парами: сверху как есть, снизу под цензурой. Цвета пыли обязаны совпадать с лицом. */
export const SideBySide: Story = {};

/** Туз пик крупно — тот самый случай: чёрная краска даёт тёмный смаз, а не жёлтую крошку. */
export const AceOfSpades: Story = {
  render: () => <CanvasStage<Card, Record<string, never>> args={{}} opts={{ cardHeight: 260 }} build={(ctx) => build(ctx, 0)} />,
};

/** Джокер крупно: в пыли различимы три треугольника колпака и подпись — цвета свои у каждой части. */
export const Joker: Story = {
  render: () => <CanvasStage<Card, Record<string, never>> args={{}} opts={{ cardHeight: 260 }} build={(ctx) => build(ctx, 2)} />,
};

/** Фак крупно: видна ТОЛЬКО пыль. Самого пальца под ней нет — иначе это не цензура. */
export const Finger: Story = {
  render: () => <CanvasStage<Card, Record<string, never>> args={{}} opts={{ cardHeight: 260 }} build={(ctx) => build(ctx, 4)} />,
};

/**
 * Рубашка под цензурой выглядит как обычная рубашка — и это НЕ недоделка. Прятать на ней нечего:
 * обратная сторона публична, её видят все и без цензуры. Пыль поэтому рисуется только лицом вверх.
 * Стори стоит в каталоге именно чтобы это было видно, а не выяснялось в игре.
 */
export const CardBack: Story = {
  render: () => <CanvasStage<Card, Record<string, never>> args={{}} opts={{ cardHeight: 260 }} build={(ctx) => build(ctx, 5)} />,
};
