import type { Meta, StoryObj } from "@storybook/react-vite";
import { APPEAR_SPECS } from "../../game/anim/appearStyles";
import { animArgTypes, animStory, knobValues, type AnimArgs } from "./animArgs";

// ПОЯВЛЕНИЕ — как элемент приходит на стол. Раздача, добор, возврат в игру и восстановление
// уничтоженного это РАЗНЫЕ события, и до появления реестра все они выглядели одинаково: элемент
// просто возникал.
//
// Появление НЕ играет само при загрузке витрины. Это событие доски, а не состояние: пересборка
// случается на каждую правку рычага, и автопоказ был бы шумом, который прячет то, что крутят.
// Жмите «появиться» — та же дверь (`ctx.appear`), которой пользуется игра.

const { args, argTypes } = animArgTypes(APPEAR_SPECS, "appear.style");

const meta: Meta<AnimArgs> = {
  title: "Animations/Appear",
  args,
  argTypes,
  parameters: {
    code: (a: Record<string, unknown>) => {
      const x = a as unknown as AnimArgs;
      return `import { APPEAR_SPECS } from "../../game/anim/appearStyles";
import { resolvePreset } from "../../game/anim/presets";

// Стиль — ФАБРИКА: числа снаружи. Ровно те, что сейчас в панели:
const appear = APPEAR_SPECS.${x.style}.make(${JSON.stringify(knobValues(x, APPEAR_SPECS, x.style), null, 2)});

ctx.setAnimPreset(ids, resolvePreset({ appear: { style: appear }, speed: ${x.speed} }));

// Появление — СОБЫТИЕ: играет тот, кто положил элемент на стол.
ctx.appear(ids);

// Своя анимация — тем же полем, без регистрации. В КОНЦЕ кадр обязан быть нейтральным
// (dx=dy=rot=0, scale=1, alpha=1, mask=null), иначе элемент навсегда останется сдвинутым.
resolvePreset({ appear: { style: { label: "моя", dur: 0.4, frame: (t, ctx) => ({ … }) } } });`;
    },
  },
  render: animStory(
    APPEAR_SPECS,
    (style) => ({ appear: { style } }),
    (ctx) => [{ label: "появиться", variant: "ghost", run: (ids) => ctx.appear(ids) }],
  ),
};
export default meta;

/**
 * Появление на любой цели. Стиль и все числа внутри него — рычагами.
 *
 * `slam` (удар об стол) стоит покрутить целиком: высота падения, момент удара, резкость разгона,
 * сплющивание. Разгон тут СТЕПЕННОЙ, а не ease-out: у падающей вещи скорость растёт к столу, а
 * ease-out наоборот тормозит перед ударом — и удара не читается вовсе.
 */
export const Appear: StoryObj<AnimArgs> = {};
