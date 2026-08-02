import type { Meta, StoryObj } from "@storybook/react-vite";
import { FLIP_SPECS } from "../../game/anim/flipStyles";
import { animArgTypes, animStory, knobValues, type AnimArgs } from "./animArgs";

// ПЕРЕВОРОТ. Цель — рычаг, а не отдельный раздел на каждую:
//
//   карта  — настоящее вращение на 180°, а не подмена текстуры;
//   пачка  — СВОЯ операция поверх карточной: расписание (разом или волной) и, возможно, разворот
//            порядка. Это не N одиночных флипов, потому она и живёт в движке отдельным методом;
//   колода — та же пачка, но сомкнутая: волны на ней не видно вовсе, зато только на ней читается
//            разворот порядка — верхняя карта уходит вниз;
//   фишка  — НЕ переворачивается: она не Flippable, у неё нет второй стороны.

interface FlipArgs extends AnimArgs {
  dur: number;
  halfTurns: number;
  mode: "whole" | "cascade";
  stagger: number;
  reverse: boolean;
}

const base = animArgTypes(FLIP_SPECS, "flip.style");

const meta: Meta<FlipArgs> = {
  title: "Animations/Flip",
  args: { ...base.args, dur: 0.45, halfTurns: 1, mode: "cascade", stagger: 0.07, reverse: false } as FlipArgs,
  argTypes: {
    ...base.argTypes,
    dur: { name: "flip.dur", description: "длительность переворота ОДНОЙ карты, сек", control: { type: "range", min: 0.05, max: 2, step: 0.01 } },
    halfTurns: { name: "flip.halfTurns", description: "полуобороты: 1 — обычный, 3 — с прокрутом. Чётное вернёт ТУ ЖЕ сторону", control: { type: "range", min: 1, max: 5, step: 1 } },
    mode: { name: "stackFlip.mode", description: "пачку разом (как предмет) или волной слева направо", control: { type: "select" }, options: ["whole", "cascade"], if: { arg: "target", neq: "card" } },
    stagger: { name: "stackFlip.stagger", description: "задержка между соседями в волне, сек", control: { type: "range", min: 0, max: 0.4, step: 0.01 }, if: { arg: "mode", eq: "cascade" } },
    reverse: { name: "stackFlip.reverse", description: "разворачивать ли ПОРЯДОК карт: пачку перевернули как предмет — низ стал верхом", control: { type: "boolean" }, if: { arg: "target", neq: "card" } },
  },
  parameters: {
    code: (a: Record<string, unknown>) => {
      const x = a as unknown as FlipArgs;
      return `import { FLIP_SPECS } from "../../game/anim/flipStyles";
import { resolvePreset } from "../../game/anim/presets";

const flip = FLIP_SPECS.${x.style}.make(${JSON.stringify(knobValues(x, FLIP_SPECS, x.style), null, 2)});

ctx.setAnimPreset(ids, resolvePreset({
  flip: { style: flip, dur: ${x.dur}, halfTurns: ${x.halfTurns} },
  stackFlip: { mode: ${JSON.stringify(x.mode)}, stagger: ${x.stagger}, reverse: ${x.reverse} },
  speed: ${x.speed},
}));

ctx.dispatch({ t: "flip", id });   // одиночная цель — порт команд
ctx.flipStack(ids);                // ПАЧКА — своя операция с расписанием`;
    },
  },
  render: animStory<ReturnType<(typeof FLIP_SPECS)["spin"]["make"]>>(
    FLIP_SPECS,
    (style, a) => {
      const x = a as FlipArgs;
      return { flip: { style, dur: x.dur, halfTurns: x.halfTurns }, stackFlip: { mode: x.mode, stagger: x.stagger, reverse: x.reverse } };
    },
    (ctx) => [{ label: "перевернуть", kind: "flip", run: (ids) => (ids.length > 1 ? ctx.flipStack(ids) : ctx.dispatch({ t: "flip", id: ids[0]! })) }],
    (target) => (target === "piece" ? "фишка НЕ Flippable: у неё нет второй стороны. Кнопка отработает, элемент не шелохнётся — и это верное поведение, а не сломанная анимация." : ""),
  ),
};
export default meta;

/**
 * Переворот. Цель, стиль и все числа внутри стиля — рычагами.
 *
 * Что стоит покрутить, потому что по картинке неочевидно:
 *   • `target: piece` — фишка не перевернётся, и это верно: она не Flippable. Кнопка отработает,
 *     элемент не шелохнётся;
 *   • `target: stack` + `mode: whole` против `cascade` — «разом» это пачка как ПРЕДМЕТ (низ стал
 *     верхом, порядок разворачивается), «волной» — каждая карта на своём месте;
 *   • `target: deck` — сомкнутая колода рубашкой вверх. Волны на ней не видно вовсе (карты
 *     закрывают друг друга), зато только на ней читается `reverse`: верхняя карта уходит вниз;
 *   • `halfTurns: 2` — карта вернёт ТУ ЖЕ сторону, прокрутившись. Иногда это и нужно.
 */
export const Flip: StoryObj<FlipArgs> = {};
