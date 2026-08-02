import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Card } from "../../game/ui/Card";
import { animScene, type AnimTarget } from "../../game/kit/animScene";
import { chessCaptureScene } from "../../game/kit/animScenes";
import { APPEAR_SPECS, defaults } from "../../game/anim/appearStyles";
import { DESTROY_STYLES, DESTROY_STYLE_IDS } from "../../game/anim/destroyStyles";
import { FLIP_SPECS } from "../../game/anim/flipStyles";
import { MOVE_STYLES, MOVE_STYLE_IDS } from "../../game/anim/moveStyles";
import { resolvePreset } from "../../game/anim/presets";
import { linear } from "../../game/kit/stackLayout";
import { CanvasStage } from "../harness/CanvasStage";


interface Args {
  target: AnimTarget;
  appearStyle: string;
  moveStyle: string;
  flipStyle: string;
  destroyStyle: string;
  speed: number;
  count: number;
  step: number;
}

const APPEAR_IDS = Object.keys(APPEAR_SPECS);
const FLIP_IDS = Object.keys(FLIP_SPECS);

/**
 * ВСЁ ВМЕСТЕ — четыре анимации на ОДНОМ элементе, по кнопке на каждую.
 *
 * Разделы `Animations/*` показывают анимации по одной и дают крутить их внутренности. Здесь другое:
 * как они уживаются на одной вещи. Появление, перемещение, переворот и уничтожение — не четыре
 * независимых эффекта, а один фил, и увидеть это можно, только запустив их подряд на одном столе:
 * прилетела → поехала → перевернулась → сгорела → вернулась.
 *
 * Поэтому тут не рычаги-числа (они по разделам), а ВЫБОР стиля в каждом из четырёх каналов.
 */
const meta: Meta<Args> = {
  title: "Animations/All together",
  args: { target: "stack", appearStyle: "slam", moveStyle: "arc", flipStyle: "loop", destroyStyle: "shred", speed: 1, count: 5, step: 0.72 },
  argTypes: {
    target: { name: "target", description: "на чём: card — одна карта; stack — раскрытая пачка; deck — сомкнутая колода; piece — фишка", control: { type: "select" }, options: ["card", "stack", "deck", "piece"] },
    appearStyle: { name: "appear.style", description: Object.entries(APPEAR_SPECS).map(([id, s]) => `${id} — ${s.label}`).join("; "), control: { type: "select" }, options: APPEAR_IDS },
    moveStyle: { name: "move.style", description: MOVE_STYLE_IDS.map((id) => `${id} — ${MOVE_STYLES[id]!.label}`).join("; "), control: { type: "select" }, options: MOVE_STYLE_IDS },
    flipStyle: { name: "flip.style", description: FLIP_IDS.map((id) => `${id} — ${FLIP_SPECS[id]!.label}`).join("; "), control: { type: "select" }, options: FLIP_IDS },
    destroyStyle: { name: "destroy.style", description: DESTROY_STYLE_IDS.map((id) => `${id} — ${DESTROY_STYLES[id]!.label}`).join("; "), control: { type: "select" }, options: DESTROY_STYLE_IDS },
    speed: { name: "speed", description: "общий множитель скорости", control: { type: "range", min: 0.25, max: 4, step: 0.05 } },
    count: { name: "count", description: "карт в пачке или колоде", control: { type: "range", min: 2, max: 24, step: 1 }, if: { arg: "target", neq: "card" } },
    step: { name: "layout.step", description: "нахлёст пачки в долях карты", control: { type: "range", min: 0.04, max: 1.2, step: 0.02 }, if: { arg: "target", eq: "stack" } },
  },
  parameters: {
    code: (a: Record<string, unknown>) => `import { resolvePreset } from "../../game/anim/presets";

// Фил — ОДИН объект на все четыре канала, и вешается он на ЭЛЕМЕНТЫ, а не на сцену: колода и
// сброс на одном столе могут вести себя по-разному.
ctx.setAnimPreset(ids, resolvePreset({
  appear:  { style: ${JSON.stringify(a.appearStyle)} },
  move:    { style: ${JSON.stringify(a.moveStyle)} },
  flip:    { style: ${JSON.stringify(a.flipStyle)} },
  destroy: { style: ${JSON.stringify(a.destroyStyle)} },
  speed: ${a.speed},
}));

// Четыре двери, по одной на канал:
ctx.appear(ids);                           // появление — событие доски
ctx.dispatch({ t: "move", id, x, y });     // перемещение — порт команд
ctx.flipStack(ids);                        // переворот пачки — своя операция с расписанием
(ctx.element(id) as Card).burn();          // уничтожение — собственная анимация элемента`,
  },
  render: (a) => (
    <CanvasStage<Card, Args>
      args={a}
      opts={{ cardHeight: 140 }}
      build={(ctx, args) => {
        const ap = APPEAR_SPECS[args.appearStyle];
        const fl = FLIP_SPECS[args.flipStyle];
        const preset = resolvePreset({
          appear: { style: ap ? ap.make(defaults(ap.knobs)) : args.appearStyle },
          move: { style: args.moveStyle },
          flip: { style: fl ? fl.make(defaults(fl.knobs)) : args.flipStyle },
          destroy: { style: args.destroyStyle },
          speed: args.speed,
        });
        let out = false;
        const r = animScene(
          ctx,
          { x: ctx.padding, y: ctx.padding },
          { target: args.target, preset, count: args.count, ...(args.target === "stack" ? { layout: linear({ step: args.step }) } : {}) },
          [
            { label: "появиться", variant: "ghost", run: (ids) => ctx.appear(ids) },
            {
              label: "переместить",
              run: (ids) => {
                // Туда-обратно одной кнопкой: сразу видно, что стиль перемещения симметричен —
                // «дуга» обязана быть дугой в обе стороны.
                const dx = out ? -ctx.cardW * 2.2 : ctx.cardW * 2.2;
                out = !out;
                for (const id of ids) {
                  const el = ctx.element(id);
                  if (el) ctx.dispatch({ t: "move", id, x: el.body.px + dx, y: el.body.py });
                }
              },
            },
            { label: "перевернуть", run: (ids) => (ids.length > 1 ? ctx.flipStack(ids) : ctx.dispatch({ t: "flip", id: ids[0]! })) },
            {
              label: "уничтожить",
              variant: "danger",
              run: (ids) => {
                for (const id of ids) (ctx.element(id) as Card | undefined)?.burn?.();
                ctx.wake();
              },
            },
          ],
          (t) => (t === "piece" ? "фишка не переворачивается: она не Flippable. Остальные три кнопки на ней работают." : ""),
        );
        ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);
      }}
    />
  ),
};
export default meta;

/**
 * Все четыре анимации на одном элементе. Запустите их подряд: появилась → поехала → перевернулась →
 * сгорела → вернулась.
 *
 * «Появиться» после «уничтожить» СОБИРАЕТ элемент заново: витрина помнит, из чего он был сделан.
 */
export const All: StoryObj<Args> = { name: "All together" };

/**
 * ВЗЯТИЕ: конь идёт на клетку пешки и снимает её.
 *
 * Это СЦЕНАРИЙ, а не новая анимация: перемещение одного элемента плюс уничтожение другого, с
 * задержкой между ними. Ни одной новой анимации для него не написано.
 *
 * Задержка не косметическая: снять пешку в момент команды значит показать, что она исчезла ДО того,
 * как конь до неё дошёл. Момент берётся из длительности стиля перемещения, поэтому при смене стиля
 * порядок событий остаётся верным сам собой.
 */
export const ChessCapture: StoryObj<Args> = {
  name: "Scenario: capture",
  parameters: { controls: { disable: true } },
  render: () => (
    <CanvasStage<Card, Record<string, never>>
      args={{}}
      opts={{ cardHeight: 200 }}
      build={(ctx) => {
        const r = chessCaptureScene(ctx, { x: ctx.padding, y: ctx.padding }, resolvePreset({ move: { style: "hop" }, destroy: { style: "shrink" } }));
        ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);
      }}
    />
  ),
};
