import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, type ButtonOptions } from "../../game/ui/Button";
import { buttonsSection } from "../../game/kit/buttons";
import { CanvasStage } from "../harness/CanvasStage";
import { pickButtonArgs, type ButtonArgs } from "./buttonArgs";

// UI-примитив «Кнопка». Две разные вещи в одном каталоге:
//   • отдельные стори — ОДНА живая кнопка под контролами (что можно у неё покрутить);
//   • «Витрина» — НАСТОЯЩАЯ секция песочницы (game/kit/buttons.ts), та же функция, что рисует
//     раздел «Кнопки» на /playground. Не копия: разойтись им негде.
//
// Кнопка сама событий не слушает — ввод в неё роутит движок сцены (см. sceneEngine.hitButton).
// Поэтому ховер и нажатие в витрине работают по-настоящему, мышью.

const KEYS = ["label", "variant", "size", "disabled"] as const;
const { argTypes, apply } = pickButtonArgs(KEYS);

type Args = Pick<ButtonArgs, (typeof KEYS)[number]>;

const meta: Meta<Args> = {
  title: "UI-kit/Кнопка",
  argTypes,
  args: { label: "Основная", variant: "primary", size: "md", disabled: false },
  render: (args) => (
    <CanvasStage<Button, Args>
      args={args}
      apply={apply}
      // У кнопки нет id (адресуются по нему только элементы стола), поэтому цель живых правок
      // указываем явно — иначе стенд искал бы её среди расставленных карт и не нашёл.
      target={(scene) => scene.button(0)}
      build={(ctx, a) => {
        const opts: ButtonOptions = { ...a };
        const b = new Button(opts);
        ctx.button(b, { x: ctx.padding + b.w / 2, y: ctx.padding + b.h / 2 });
        ctx.extent(ctx.padding * 2 + b.w, ctx.padding * 2 + b.h);
      }}
    />
  ),
};
export default meta;

type Story = StoryObj<Args>;

/** Основное действие экрана. Одна на экран — если их две, ни одна не читается как главная. */
export const Основная: Story = {};

/** Обычное действие: приглушённая заливка, читается как «можно, но не обязательно». */
export const Вторичная: Story = { args: { label: "Вторичная", variant: "secondary" } };

/** Разрушительное действие. Красный тут — предупреждение, а не украшение. */
export const Опасная: Story = { args: { label: "Опасно", variant: "danger" } };

/** Только контур: действие есть, но веса ему не добавляем. */
export const Призрак: Story = { args: { label: "Призрак", variant: "ghost" } };

/** Голый текст без фона и обводки — им набраны тумблеры песочницы (segToggle). */
export const Текстовая: Story = { args: { label: "текстовая", variant: "text" } };

/** Недоступна: гасится и глушит клик. Ховер и нажатие при этом не срабатывают — проверяется мышью. */
export const Недоступна: Story = { args: { label: "Недоступна", disabled: true } };

/**
 * Вся витрина кнопок целиком — ТА ЖЕ секция, что раздел «Кнопки» на /playground.
 * Контролы тут не действуют: секция строит свои кнопки сама, это её предмет.
 */
export const Витрина: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <CanvasStage<Button, Record<string, never>>
      args={{}}
      build={(ctx) => {
        const r = buttonsSection(ctx, { x: ctx.padding, y: ctx.padding });
        ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);
      }}
    />
  ),
};
