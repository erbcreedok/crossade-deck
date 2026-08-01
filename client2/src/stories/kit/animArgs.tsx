import type { StoryObj } from "@storybook/react-vite";
import type { Card } from "../../game/ui/Card";
import { animScene, type AnimAction, type AnimTarget, type TargetNote } from "../../game/kit/animScene";
import { defaults, type StyleKnob } from "../../game/anim/appearStyles";
import { resolvePreset, type PresetOverride } from "../../game/anim/presets";
import { linear } from "../../game/kit/stackLayout";
import { CanvasStage } from "../harness/CanvasStage";

// ОБЩЕЕ УСТРОЙСТВО РАЗДЕЛОВ «АНИМАЦИИ».
//
// Разделов четыре — появление, перемещение, переворот, уничтожение, — и отличаются они ровно тремя
// вещами: своим реестром стилей, действием на кнопке и тем, у каких целей действие работает. Всё
// остальное одинаково, поэтому описано здесь ОДИН раз.
//
// Раньше это был один сборный раздел «Animations» с четырьмя стори (Stack, Single Card, Chip Drop,
// Chess Capture) и общей кучей рычагов. Он путал два разных вопроса: «какая анимация» и «на чём».
// Первый — это разделы, второй — рычаг `target` внутри каждого.

/** Любой стиль-фабрика: числа снаружи, описание рычагов внутри. */
export interface StyleSpec<S> {
  label: string;
  knobs: Record<string, StyleKnob>;
  make: (v: Record<string, number>) => S;
}

export interface AnimArgs {
  target: AnimTarget;
  style: string;
  speed: number;
  count: number;
  step: number;
  faceUp: boolean;
  [knob: string]: unknown;
}

/** Рычаги стиля → контролы. Прячем чужие: крутилка, которая ни на что не влияет, — обман. */
function knobTypes(knobs: Record<string, StyleKnob>, styleId: string) {
  return Object.fromEntries(
    Object.entries(knobs).map(([k, v]) => [
      `k_${k}`,
      { name: `${styleId}.${k}`, description: v.label, control: { type: "range" as const, min: v.min, max: v.max, step: v.step }, if: { arg: "style", eq: styleId } },
    ]),
  );
}

/** Значения рычагов текущего стиля — без префикса, как их ждёт фабрика. */
export function knobValues<S>(a: AnimArgs, specs: Record<string, StyleSpec<S>>, styleId: string): Record<string, number> {
  const knobs = specs[styleId]?.knobs ?? {};
  return Object.fromEntries(Object.keys(knobs).map((k) => [k, Number(a[`k_${k}`] ?? knobs[k]!.def)]));
}

/** Полный набор аргументов и типов раздела: цель, стиль, скорость, форма пачки и рычаги стилей. */
export function animArgTypes<S>(specs: Record<string, StyleSpec<S>>, styleLabel: string) {
  const ids = Object.keys(specs);
  return {
    args: {
      target: "card" as AnimTarget,
      style: ids[0]!,
      speed: 1,
      count: 5,
      step: 0.72,
      faceUp: true,
      ...Object.assign({}, ...ids.map((id) => Object.fromEntries(Object.entries(defaults(specs[id]!.knobs)).map(([k, v]) => [`k_${k}`, v])))),
    } as AnimArgs,
    argTypes: {
      target: {
        name: "target",
        description: "на чём: card — одна карта; stack — раскрытая пачка; deck — сомкнутая колода рубашкой вверх; piece — фишка",
        control: { type: "select" as const },
        options: ["card", "stack", "deck", "piece"],
      },
      style: { name: styleLabel, description: ids.map((id) => `${id} — ${specs[id]!.label}`).join("; "), control: { type: "select" as const }, options: ids },
      speed: { name: "speed", description: "общий множитель скорости: сжимает и длительности, и задержки", control: { type: "range" as const, min: 0.25, max: 4, step: 0.05 } },
      count: { name: "count", description: "карт в пачке или колоде", control: { type: "range" as const, min: 2, max: 24, step: 1 }, if: { arg: "target", neq: "card" } },
      faceUp: { name: "faceUp", description: "чем вверх лежит пачка", control: { type: "boolean" as const }, if: { arg: "target", eq: "stack" } },
      step: { name: "layout.step", description: "нахлёст пачки в долях карты: 0.06 — сомкнутая, 0.72 — раскрытая", control: { type: "range" as const, min: 0.04, max: 1.2, step: 0.02 }, if: { arg: "target", eq: "stack" } },
      ...Object.assign({}, ...ids.map((id) => knobTypes(specs[id]!.knobs, id))),
    },
  };
}

/** Витрина раздела: цель по рычагу, кнопки — действие этого раздела. */
export function animStory<S>(
  specs: Record<string, StyleSpec<S>>,
  override: (style: S, a: AnimArgs) => PresetOverride,
  actions: (ctx: Parameters<NonNullable<Parameters<typeof CanvasStage>[0]["build"]>>[0], a: AnimArgs) => AnimAction[],
  note?: TargetNote,
): StoryObj<AnimArgs>["render"] {
  return (a: AnimArgs) => (
    <CanvasStage<Card, AnimArgs>
      args={a}
      opts={{ cardHeight: 150 }}
      build={(ctx, args) => {
        const spec = specs[args.style] ?? specs[Object.keys(specs)[0]!]!;
        const preset = resolvePreset({ ...override(spec.make(knobValues(args, specs, args.style)), args), speed: args.speed });
        const r = animScene(
          ctx,
          { x: ctx.padding, y: ctx.padding },
          {
            target: args.target,
            preset,
            count: args.count,
            // Колода по определению сомкнута и лежит рубашкой вверх: свою раскладку она задаёт
            // сама, и подсовывать ей чужие рычаги значило бы называть колодой любую пачку.
            ...(args.target === "stack" ? { layout: linear({ step: args.step }), faceUp: args.faceUp } : {}),
          },
          actions(ctx, args),
          note,
        );
        ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);
      }}
    />
  );
}
