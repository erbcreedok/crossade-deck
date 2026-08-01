import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, type ButtonOptions } from "../../game/ui/Button";
import { buttonsSection } from "../../game/kit/buttons";
import { CanvasStage, isDocsMode } from "../harness/CanvasStage";
import { pickButtonArgs, type ButtonArgs } from "./buttonArgs";

// UI-примитив «Кнопка».
//
// В режиме СТОРИ — ровно одна кнопка, цель контролов: раздел тут отлаживают, и соседи мешают.
// На вкладке DOCS под ней добавляется галерея всех видов и размеров: страницу читают, а «какой из
// них главный на экране» — вопрос, который решается только сравнением рядом.
//
// Отдельной страницы под каждый вид по-прежнему нет: вид — это аргумент.
//
// Кнопка сама событий не слушает — ввод в неё роутит движок сцены (см. sceneEngine.hitButton).
// Поэтому ховер и нажатие в витрине работают по-настоящему, мышью.

const KEYS = ["label", "variant", "size", "disabled", "color", "borderColor", "fit", "textSize", "width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight", "padding", "textShrink", "textGrow", "textFit", "textColor", "borderWidth", "radius", "fillAlpha", "borderAlpha", "textAlpha", "elevation"] as const;
const { argTypes, apply } = pickButtonArgs(KEYS);

/**
 * Аргументы ПАНЕЛИ. Числа и цвета тут шире, чем у компонента: «не задано» приходит нулём или
 * пустой строкой — пустого числа в контролах нет, а `undefined` в панель не введёшь.
 */
type Args = Omit<Pick<ButtonArgs, (typeof KEYS)[number]>, "color" | "borderColor" | "textColor"> & {
  color: string;
  borderColor: string;
  textColor: string;
};

/**
 * Аргументы панели → опции кнопки.
 *
 * «Не задано» приходит нулём или пустой строкой: пустого числа в контролах нет, а `undefined` в
 * панель не введёшь. Разбираем это ЗДЕСЬ, а не в компоненте: условность каталога не должна
 * протекать в стол.
 */
function buttonOptsFrom(a: Args): ButtonOptions {
  const num = (v: unknown) => (Number(v) > 0 ? Number(v) : undefined);
  const col = (v: unknown) => (typeof v === "string" && v ? Number(`0x${v.replace("#", "")}`) : typeof v === "number" ? v : undefined);
  return {
    label: a.label,
    variant: a.variant,
    size: a.size,
    disabled: a.disabled,
    color: col(a.color),
    borderColor: col(a.borderColor),
    textColor: col(a.textColor),
    borderWidth: Number(a.borderWidth) >= 0 && a.borderWidth !== 0 ? Number(a.borderWidth) : undefined,
    radius: num(a.radius),
    fillAlpha: a.fillAlpha,
    borderAlpha: a.borderAlpha,
    textAlpha: a.textAlpha,
    elevation: a.elevation,
    fit: a.fit,
    textSize: num(a.textSize),
    textShrink: a.textShrink,
    textGrow: a.textGrow,
    textFit: a.textFit,
    width: num(a.width),
    height: num(a.height),
    minWidth: num(a.minWidth),
    maxWidth: num(a.maxWidth),
    minHeight: num(a.minHeight),
    maxHeight: num(a.maxHeight),
    padding: Number(a.padding),
  };
}

const meta: Meta<Args> = {
  title: "UI-kit/Button",
  parameters: {
    // Что печатает «Show code»: код КОМПОНЕНТА с аргументами этой стори, а не исходник стори.
    // Код обязан описывать ТО, ЧТО НА ЭКРАНЕ. На Docs под целью стоит ещё и галерея, и умолчать
    // о ней значит показать неправду: читающий скопирует фрагмент и получит другую картинку.
    code: (a: Record<string, unknown>) => `import { Button } from "../../game/ui/Button";

const b = new Button({
  label: ${JSON.stringify(a.label)},
  variant: ${JSON.stringify(a.variant)},   // primary | secondary | danger | ghost | text
  size: ${JSON.stringify(a.size)},         // sm | md | lg
  disabled: ${JSON.stringify(a.disabled)},
  onClick: () => deal(),
});

// В секции (game/kit/*.ts) — через контекст: он же зарегистрирует кнопку в хит-тесте сцены,
// поэтому ховер и нажатие заработают сами. Точка — ЦЕНТР кнопки.
ctx.button(b, { x: cx, y: cy });

// Напрямую в сцене обе строки обязательны: без addChild кнопки не видно, без регистрации
// она не нажимается (ввод роутит движок, см. sceneEngine.hitButton).
scene.surface.addChild(b.root);
b.place(cx, cy);${
      isDocsMode()
        ? `

// ——— галерея ниже (только на этой странице) ———
// Все виды и размеры разом — ТА ЖЕ секция, что раздел «Кнопки» на /playground.
import { buttonsSection } from "../../game/kit/buttons";
buttonsSection(ctx, { x, y });`
        : ""
    }`,
  },
  argTypes,
  // 0 и пустая строка значат «не задано»: у Storybook нет «пустого числа», а вводить undefined
  // в панели нечем. Разбор — в build, чтобы компонент не знал про эту условность каталога.
  args: { label: "Основная", variant: "primary", size: "md", disabled: false, color: "", borderColor: "", textColor: "", borderWidth: 0, radius: 0, fillAlpha: 1, borderAlpha: 1, textAlpha: 1, elevation: 0, fit: "preset", textSize: 0, textShrink: true, textGrow: false, textFit: "both", width: 0, height: 0, minWidth: 0, maxWidth: 0, minHeight: 0, maxHeight: 0, padding: 11 },
  render: (args) => (
    <CanvasStage<Button, Args>
      args={args}
      apply={apply as never}
      // У кнопки нет id (адресуются по нему только элементы стола), поэтому цель живых правок
      // указываем явно — иначе стенд искал бы её среди расставленных карт и не нашёл.
      target={(scene) => scene.button(0)}
      build={(ctx, a) => {
        // Цель контролов.
        const opts: ButtonOptions = { ...buttonOptsFrom(a) };
        const b = new Button(opts);
        ctx.button(b, { x: ctx.padding + b.w / 2, y: ctx.padding + b.h / 2 });
        if (!isDocsMode()) {
          ctx.extent(ctx.padding * 2 + b.w, ctx.padding * 2 + b.h);
          return;
        }
        // Галерея — только на Docs, и это ТА ЖЕ секция, что раздел «Кнопки» на /playground
        // (game/kit/buttons.ts). Не копия: разойтись им негде.
        const gy = ctx.padding + b.h + 34;
        const g = ctx.label("все виды и размеры — для сравнения друг с другом", ctx.padding, gy, 13, 0xcdb98f, undefined, 0);
        const r = buttonsSection(ctx, { x: ctx.padding, y: gy + g.height + 12 });
        ctx.extent(Math.max(b.w, r.width, g.width) + ctx.padding * 2, r.bottom + ctx.padding);
      }}
    />
  ),
};
export default meta;

type Story = StoryObj<Args>;

/**
 * Кнопка. Вид, размер, подпись и доступность — рычагами: страниц под каждый `variant` тут нет, их
 * различает ОДИН аргумент.
 *
 * Проверять надо МЫШЬЮ: кнопка сама событий не слушает, ввод в неё роутит движок
 * (`sceneEngine.hitButton`), поэтому ховер и нажатие — настоящая проверка связки, а не картинки.
 * `disabled` при этом обязан и гасить вид, и глушить клик: раньше он гасил только клик.
 */
export const Button_: Story = { name: "Button" };
