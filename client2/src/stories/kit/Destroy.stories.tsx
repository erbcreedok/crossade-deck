import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Card } from "../../game/ui/Card";
import { DESTROY_STYLES, DESTROY_STYLE_IDS } from "../../game/anim/destroyStyles";
import { animArgTypes, animStory, type AnimArgs } from "./animArgs";

// УНИЧТОЖЕНИЕ — как элемент уходит со стола. «Сжечь» лишь ОДИН из способов, а не синоним: шреддер,
// растворение, улёт за край — такие же, и заводить под каждый свой метод у карты значило бы
// переписывать её на каждую хотелку.
//
// Догоревший элемент помечается мёртвым и выбывает из реестра сцены — это поведение стола, и гнуть
// его нельзя. Поэтому «вернуть» не воскрешает, а СОБИРАЕТ заново из спеки: витрина помнит, из чего
// элемент был сделан.

const SPECS = Object.fromEntries(DESTROY_STYLE_IDS.map((id) => [id, { label: DESTROY_STYLES[id]!.label, knobs: {}, make: () => id }]));
const { args, argTypes } = animArgTypes(SPECS, "destroy.style");

const meta: Meta<AnimArgs> = {
  title: "Animations/Destroy",
  args: { ...args, style: "burn" },
  argTypes,
  parameters: {
    code: (a: Record<string, unknown>) => `import { resolvePreset } from "../../game/anim/presets";

ctx.setAnimPreset(ids, resolvePreset({ destroy: { style: ${JSON.stringify(a.style)} }, speed: ${a.speed} }));

// Уничтожение — СОБСТВЕННАЯ анимация элемента, а не перемещение: командой доски её не выразить,
// поэтому дёргаем элемент напрямую.
(ctx.element(id) as Card).burn();

// Свой способ — функцией. Кадр богаче, чем у переворота: маска, прозрачность, тень.
resolvePreset({ destroy: { style: {
  label: "осыпание", dur: 0.6,
  frame: (t, ctx) => ({ dx: 0, dy: 0, rot: 0, scale: 1, alpha: 1 - t / 0.6, mask: null, shadow: 1 }),
} } });`,
  },
  render: animStory(
    SPECS,
    (style) => ({ destroy: { style: style as string } }),
    (ctx) => [
      { label: "уничтожить", variant: "danger", run: (ids) => { for (const id of ids) (ctx.element(id) as Card | undefined)?.burn?.(); ctx.wake(); } },
      { label: "вернуть", variant: "ghost", run: (ids) => ctx.appear(ids) },
    ],
  ),
};
export default meta;

/**
 * Уничтожение на любой цели. «Вернуть» собирает элемент заново — им же удобно перезапускать.
 *
 * Что стоит посмотреть: `burn` съедает карту МАСКОЙ, а не затуханием, поэтому под ней ничего не
 * просвечивает; `shred` режет на полосы, и соседние уезжают вразнобой — иначе это не резка, а
 * сползание листа; `flyRight` гаснет ПОЗДНО, потому что карта должна улететь, а не растаять.
 */
export const Destroy: StoryObj<AnimArgs> = {};
