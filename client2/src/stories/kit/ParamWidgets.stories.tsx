import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Card } from "../../game/ui/Card";
import type { Configurable } from "../../game/ui/controls";
import { makeWidgetDemoState, widgetsSection } from "../../game/kit/widgets";
import { CanvasStage } from "../harness/CanvasStage";

// Канвасные виджеты параметров: Toggle (bool), Stepper (number), Segmented (choice).
//
// Их НЕ строят руками. Компонент декларирует свои параметры данными — `Configurable.params()` —
// а adapter (ui/controls.ts attachControls) сам решает, какой виджет какому параметру положен:
// number → Stepper, bool → Toggle, choice → Segmented. Добавить параметр = добавить строчку;
// добавить ВИД параметра = новый вариант Param. Отсюда и стори: каждая показывает params(), а не
// виджет — иначе каталог учил бы обходить единственную дверь.
//
// Панель контролов сторибука строится из ТОЙ ЖЕ модели (harness/paramArgs.ts), так что «крутилки»
// слева и виджеты на канвасе — два вида одного и того же описания.

interface Args {
  caption: string;
}

/** Собрать витрину одного Configurable по центру верха и вписать габарит. */
function stage(cfg: Configurable, caption: string) {
  return (
    <CanvasStage<Card, Args>
      args={{ caption }}
      apply={{ caption: "rebuild" }}
      build={(ctx) => {
        const cap = ctx.label(caption, ctx.padding, ctx.padding, 13, 0xcdb98f, undefined, 0);
        const rc = ctx.controls(cfg, { x: ctx.padding, y: ctx.padding + cap.height + 14 });
        const w = Math.max(cap.width, rc.steppers[0]?.w ?? 0, rc.toggles[0]?.w ?? 0, rc.segments[0]?.w ?? 0);
        ctx.extent(w + ctx.padding * 2, rc.bottom + ctx.padding);
      }}
    />
  );
}

const meta: Meta<Args> = {
  title: "UI-kit/Param widgets",
  parameters: { controls: { disable: true } },
};
export default meta;

type Story = StoryObj<Args>;

/** bool → Toggle. Один параметр, одна кнопка-переключатель с подписью. */
export const BoolToggle: Story = {
  render: () => {
    const s = { on: false };
    const cfg: Configurable = { params: () => [{ kind: "bool", label: "показывать подсказки", get: () => s.on, set: (v) => (s.on = v) }] };
    return stage(cfg, "bool → Toggle");
  },
};

/** number → Stepper. Минус/плюс с зажатыми границами; плавного слайдера на канвасе пока нет (#4). */
export const NumberStepper: Story = {
  render: () => {
    const s = { n: 3 };
    const cfg: Configurable = { params: () => [{ kind: "number", label: "колонок", min: 1, max: 8, get: () => s.n, set: (v) => (s.n = v) }] };
    return stage(cfg, "number → Stepper");
  },
};

/** number с format: значение показывается не «как есть», а как решил компонент. */
export const NumberStepperFormatted: Story = {
  render: () => {
    const s = { n: 4 };
    const cfg: Configurable = {
      params: () => [{ kind: "number", label: "строк", min: 0, max: 9, format: (v) => (v === 0 ? "без предела" : String(v)), get: () => s.n, set: (v) => (s.n = v) }],
    };
    return stage(cfg, "number + format → Stepper");
  },
};

/** choice → Segmented. Варианты рядом, под выбранным золотая черта. */
export const ChoiceSegmented: Story = {
  render: () => {
    const s = { i: 1 };
    const cfg: Configurable = {
      params: () => [{ kind: "choice", label: "на занятый слот", options: ["сшить", "поменять", "забрать", "отказать"], get: () => s.i, set: (v) => (s.i = v) }],
    };
    return stage(cfg, "choice → Segmented");
  },
};

/**
 * Все три вида разом — ТА ЖЕ секция, что блок «виджеты контролов» в разделе «Управление» на
 * /playground (game/kit/widgets.ts). Видно и раскладку: числа в строку, булевы ниже, выбор — ещё ниже.
 */
export const Showcase: Story = {
  render: () => {
    const state = makeWidgetDemoState();
    return (
      <CanvasStage<Card, Record<string, never>>
        args={{}}
        build={(ctx) => {
          const r = widgetsSection(ctx, { x: ctx.padding, y: ctx.padding }, state);
          ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);
        }}
      />
    );
  },
};
