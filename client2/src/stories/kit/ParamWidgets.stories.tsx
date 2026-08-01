import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Card } from "../../game/ui/Card";
import type { Configurable, Param } from "../../game/ui/controls";
import { CanvasStage } from "../harness/CanvasStage";

// Канвасные виджеты параметров: Toggle (bool), Stepper (number), Segmented (choice).
//
// Их НЕ строят руками. Компонент декларирует свои параметры ДАННЫМИ — `Configurable.params()` —
// а адаптер (`ui/controls.ts` attachControls) сам решает, какой виджет какому параметру положен:
// number → Stepper, bool → Toggle, choice → Segmented. Добавить параметр = добавить строчку;
// добавить ВИД параметра = новый вариант `Param`.
//
// Поэтому рычаг тут один — ВИД параметра, и он же показывает главное: виджет не выбирают, его
// выводят из описания. Панель слева строится из той же модели (harness/paramArgs.ts), так что
// крутилки сторибука и виджеты на канвасе — два вида одного описания.

interface Args {
  kind: "bool" | "number" | "choice";
  label: string;
  /** number: границы и подпись значения. */
  min: number;
  max: number;
  formatted: boolean;
  /** choice: варианты через запятую. */
  options: string;
}

/** Описание параметра из аргументов панели — то самое `params()`, которое объявляет компонент. */
function paramFrom(a: Args): Param {
  if (a.kind === "bool") {
    const st = { on: true };
    return { kind: "bool", id: "flag", label: a.label, get: () => st.on, set: (v) => (st.on = v) };
  }
  if (a.kind === "choice") {
    const st = { i: 1 };
    return { kind: "choice", id: "pick", label: a.label, options: a.options.split(",").map((s) => s.trim()).filter(Boolean), get: () => st.i, set: (v) => (st.i = v) };
  }
  const st = { n: Math.round((a.min + a.max) / 2) };
  return {
    kind: "number",
    id: "num",
    label: a.label,
    min: a.min,
    max: a.max,
    // `format` — не украшение: им компонент объясняет, что значит КРАЙНЕЕ значение. «0» и
    // «без предела» это одно число и два разных смысла, и знает разницу только компонент.
    ...(a.formatted ? { format: (v: number) => (v === a.min ? "без предела" : String(v)) } : {}),
    get: () => st.n,
    set: (v) => (st.n = v),
  };
}

const meta: Meta<Args> = {
  title: "UI-kit/Param widgets",
  args: { kind: "number", label: "строк", min: 0, max: 9, formatted: true, options: "сшить, поменять, забрать, отказать" },
  argTypes: {
    kind: { name: "kind", description: "вид параметра. Виджет НЕ выбирают — его выводит адаптер: number → Stepper, bool → Toggle, choice → Segmented", control: { type: "select" }, options: ["bool", "number", "choice"] },
    label: { name: "label", description: "подпись параметра", control: { type: "text" } },
    min: { name: "min", description: "нижняя граница (number)", control: { type: "range", min: 0, max: 20, step: 1 }, if: { arg: "kind", eq: "number" } },
    max: { name: "max", description: "верхняя граница (number)", control: { type: "range", min: 1, max: 40, step: 1 }, if: { arg: "kind", eq: "number" } },
    formatted: { name: "format", description: "показывать значение не «как есть», а как решил компонент: 0 → «без предела»", control: { type: "boolean" }, if: { arg: "kind", eq: "number" } },
    options: { name: "options", description: "варианты через запятую (choice)", control: { type: "text" }, if: { arg: "kind", eq: "choice" } },
  },
  parameters: {
    code: (a: Record<string, unknown>) => `// Компонент ОБЪЯВЛЯЕТ свои параметры — виджеты появляются сами.
class MyThing implements Configurable {
  params(): Param[] {
    return [${a.kind === "bool" ? `{ kind: "bool", id: "flag", label: ${JSON.stringify(a.label)}, get: () => s.on, set: (v) => (s.on = v) }` : a.kind === "choice" ? `{ kind: "choice", id: "pick", label: ${JSON.stringify(a.label)}, options: ${JSON.stringify(String(a.options).split(",").map((x) => x.trim()))}, get: () => s.i, set: (v) => (s.i = v) }` : `{ kind: "number", id: "num", label: ${JSON.stringify(a.label)}, min: ${a.min}, max: ${a.max}, get: () => s.n, set: (v) => (s.n = v) }`}];
  }
}

// В секции стенда:
ctx.controls(myThing, { x, y });

// В панели каталога — из ТОГО ЖЕ описания, второй модели нет:
import { paramsToArgTypes } from "../harness/paramArgs";
const argTypes = paramsToArgTypes(myThing.params());`,
  },
  render: (a) => (
    <CanvasStage<Card, Args>
      args={a}
      // Виджет строится узлами при сборке — живого сеттера у него нет; любая правка описания
      // это новое описание, а не новое значение.
      apply={{ kind: "rebuild", label: "rebuild", min: "rebuild", max: "rebuild", formatted: "rebuild", options: "rebuild" }}
      build={(ctx, args) => {
        const cfg: Configurable = { params: () => [paramFrom(args)] };
        const cap = ctx.label(`${args.kind} → ${args.kind === "bool" ? "Toggle" : args.kind === "choice" ? "Segmented" : "Stepper"}`, ctx.padding, ctx.padding, 13, 0xcdb98f, undefined, 0);
        const rc = ctx.controls(cfg, { x: ctx.padding, y: ctx.padding + cap.height + 14 });
        const w = Math.max(cap.width, rc.steppers[0]?.w ?? 0, rc.toggles[0]?.w ?? 0, rc.segments[0]?.w ?? 0);
        ctx.extent(w + ctx.padding * 2, rc.bottom + ctx.padding);
      }}
    />
  ),
};
export default meta;

type Story = StoryObj<Args>;

/**
 * Один параметр и виджет, который ему положен. Страниц под Toggle, Stepper и Segmented тут нет:
 * их различает ВИД параметра, а не отдельный экран — и в этом вся мысль раздела. Виджет не
 * выбирают, его выводят из описания; выбрать его руками означало бы обойти единственную дверь.
 */
export const ParamWidget: StoryObj<Args> = { name: "Param widget" };
