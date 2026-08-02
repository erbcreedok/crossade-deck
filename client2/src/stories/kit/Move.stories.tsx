import type { Meta, StoryObj } from "@storybook/react-vite";
import { MOVE_STYLES, MOVE_STYLE_IDS } from "../../game/anim/moveStyles";
import { animArgTypes, animStory, type AnimArgs } from "./animArgs";

// ПЕРЕМЕЩЕНИЕ — как элемент летит, когда его двигает ПРОГРАММА: команда доски, сервер, правило игры.
//
// Драг сюда не входит: там траекторию задаёт рука, и движку остаётся только успевать. А «карта
// пошла в сброс», «конь встал на клетку», «фишка прилетела в банк» — движение, которое кто-то
// спроектировал, и выглядеть оно может очень по-разному.
//
// `spring` — единственный стиль БЕЗ расписания: движение отдаётся пружинам тела. Так стол вёл себя
// всегда, и это остаётся значением по умолчанию, а не пережитком.

const { args, argTypes } = animArgTypes(
  Object.fromEntries(MOVE_STYLE_IDS.map((id) => [id, { label: MOVE_STYLES[id]!.label, knobs: {}, make: () => id }])),
  "move.style",
);

const meta: Meta<AnimArgs> = {
  title: "Animations/Move",
  args: { ...args, style: "arc" },
  argTypes,
  parameters: {
    code: (a: Record<string, unknown>) => `import { resolvePreset } from "../../game/anim/presets";

ctx.setAnimPreset(ids, resolvePreset({ move: { style: ${JSON.stringify(a.style)} }, speed: ${a.speed} }));

// Перемещение идёт через ПОРТ КОМАНД — ту же дверь, что у сервера и правил игры.
// Стиль выбирает пресет, а не место вызова: обходя дверь, мы показали бы движение, которого в
// игре не бывает.
ctx.dispatch({ t: "move", id, x, y });

// Своя траектория — функцией, без регистрации. Возвращает, ГДЕ элемент относительно ПРЯМОЙ
// старт→цель: along — доля пути, lift — увод перпендикулярно ей. На концах строго 0 и 1, иначе
// элемент не долетит до собственной цели.
resolvePreset({ move: { style: { label: "моя", dur: 0.5, frame: (p) => ({ along: p, lift: Math.sin(Math.PI * p) * 0.3, rot: 0, scale: 1 }) } } });`,
  },
  render: animStory(
    Object.fromEntries(MOVE_STYLE_IDS.map((id) => [id, { label: MOVE_STYLES[id]!.label, knobs: {}, make: () => id }])),
    (style) => ({ move: { style: style as string } }),
    (ctx) => {
      let out = false;
      return [
        {
          label: "переместить",
          kind: "move",
          run: (ids) => {
            // Туда-обратно одной кнопкой: сразу видно, симметричен ли стиль. «Дуга» обязана быть
            // дугой в обе стороны, иначе карта возвращается не тем путём, каким уходила.
            const dx = out ? -ctx.cardW * 2.4 : ctx.cardW * 2.4;
            out = !out;
            for (const id of ids) {
              const el = ctx.element(id);
              if (el) ctx.dispatch({ t: "move", id, x: el.body.px + dx, y: el.body.py });
            }
          },
        },
      ];
    },
  ),
};
export default meta;

/**
 * Перемещение на любой цели. Жмите «переместить» несколько раз: элемент ходит туда-обратно.
 *
 * Что стоит сравнить: `spring` против остальных. У пружины нет расписания — время задаёт физика,
 * и перелёт цели получается сам собой. У `swoop` тот же перелёт нарисован НАМЕРЕННО, и это разные
 * вещи: пружину нельзя «попросить» перелететь сильнее, не сделав её мягче на всём столе.
 */
export const Move: StoryObj<AnimArgs> = {};
