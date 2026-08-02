import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Card, Pose } from "../../game/ui/Card";
import { animScene, type AnimTarget } from "../../game/kit/animScene";
import { resolvePreset } from "../../game/anim/presets";
import { linear } from "../../game/kit/stackLayout";
import { CanvasStage } from "../harness/CanvasStage";


interface Args {
  target: AnimTarget;
  pose: Pose;
  idle: boolean;
  speed: number;
  amp: number;
  count: number;
  step: number;
  reduceMotion: boolean;
}

/**
 * ДЫХАНИЕ — единственная анимация раздела, которая НЕ ЗАПУСКАЕТСЯ.
 *
 * Остальные три (появление, перемещение, уничтожение) — ПЕРЕХОДЫ: у них есть начало, длительность и
 * конец, их дёргают кнопкой. Дыхание идёт, пока предмет на столе, и конца у него нет — поэтому тут
 * нет кнопки «запустить», а есть тумблер.
 *
 * ГЛАВНОЕ, ЧТО ПОКАЗЫВАЕТ РАЗДЕЛ: дыхание и поза — РАЗНЫЕ оси. Поза говорит, ГДЕ предмет (лежит,
 * поднят, его держат) — от неё зависят размер, слой и тень. Дыхание говорит, шевелится ли он там, и
 * доступно в любой позе: лежащая карта имеет полное право покачиваться. Поза задаёт лишь
 * УМОЛЧАНИЕ — поднятый предмет дышит сам собой, потому что висит в воздухе.
 *
 * Практическая разница, которую видно только здесь: `reduceMotion` замораживает СОСТОЯНИЯ и не
 * трогает переходы. Выключите движение — дыхание встанет, карта останется поднятой, а переворот
 * продолжит работать. Иначе интерфейс перестал бы отвечать на действия, а не просто успокоился.
 */
const meta: Meta<Args> = {
  title: "Animations/Idle",
  args: { target: "card", pose: "lifted", idle: true, speed: 2.2, amp: 0.05, count: 5, step: 0.72, reduceMotion: false },
  argTypes: {
    target: { name: "target", description: "на чём: card — одна карта; stack — раскрытая пачка; deck — сомкнутая колода; piece — фишка", control: { type: "select" }, options: ["card", "stack", "deck", "piece"] },
    pose: { name: "pose", description: "где предмет находится. Задаёт размер, слой отрисовки и тень — но не дыхание", control: { type: "select" }, options: ["rest", "lifted", "held"] },
    idle: { name: "idle", description: "покачивается ли на месте. Своя ось: доступна в любой позе, поднятый предмет имеет её по умолчанию", control: { type: "boolean" } },
    speed: { name: "idle.speed", description: "скорость покачивания, рад/сек", control: { type: "range", min: 0, max: 8, step: 0.1 }, if: { arg: "idle", truthy: true } },
    amp: { name: "idle.amp", description: "размах покачивания в долях высоты карты. 0 — дыхания нет вовсе", control: { type: "range", min: 0, max: 0.25, step: 0.005 }, if: { arg: "idle", truthy: true } },
    reduceMotion: { name: "reduceMotion", description: "«уменьшить движение»: замораживает СОСТОЯНИЯ и не трогает переходы — иначе интерфейс перестал бы отвечать на действия", control: { type: "boolean" } },
    count: { name: "count", description: "карт в пачке", control: { type: "range", min: 2, max: 12, step: 1 }, if: { arg: "target", neq: "card" } },
    step: { name: "layout.step", description: "нахлёст пачки в долях карты", control: { type: "range", min: 0.04, max: 1.2, step: 0.02 }, if: { arg: "target", eq: "stack" } },
  },
  parameters: {
    code: (a: Record<string, unknown>) => `import { resolvePreset } from "../../game/anim/presets";

// Поза — ГДЕ предмет; дыхание — шевелится ли он там. Оси независимы, обе объявляются спекой.
ctx.card({ id, card: "A♠", pose: "${a.pose}", idle: ${a.idle} }, { x, y });

// Параметры дыхания — в филе, вместе с остальными анимациями:
ctx.setAnimPreset(ids, resolvePreset({ idle: { speed: ${a.speed}, amp: ${a.amp} } }));

// «Уменьшить движение» гасит именно СОСТОЯНИЯ (дыхание, пыль), переходы остаются:
scene.setReduceMotion(${a.reduceMotion});`,
  },
  render: (a) => (
    <CanvasStage<Card, Args>
      args={a}
      opts={{ cardHeight: 150 }}
      build={(ctx, args) => {
        const preset = resolvePreset({ idle: { speed: args.speed, amp: args.amp } });
        const r = animScene(
          ctx,
          { x: ctx.padding, y: ctx.padding },
          {
            target: args.target,
            preset,
            count: args.count,
            pose: args.pose,
            idle: args.idle,
            ...(args.target === "stack" ? { layout: linear({ step: args.step }) } : {}),
          },
          [],
        );
        ctx.wake();
        return void ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);
      }}
    />
  ),
};
export default meta;

/**
 * Дыхание. `pose` ставит предмет (лежит / поднят / держат), `idle` включает покачивание, а
 * `idle.speed` и `idle.amp` задают, какое оно.
 *
 * Смотреть надо В ДВИЖЕНИИ: статичный кадр не отличает поднятую карту от лежащей — только по тени,
 * и то не всегда.
 *
 * Две проверки, ради которых раздел и существует:
 *   • `pose: rest` + `idle: on` — лежащая карта дышит. Дыхание не привилегия поднятых;
 *   • `pose: lifted` + `idle: off` — поднятая карта неподвижна, но остаётся поднятой: высота и
 *     покачивание это разные вещи, и первое не пропадает, когда выключили второе.
 */
export const Idle: StoryObj<Args> = {};
