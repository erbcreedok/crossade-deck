import type { Meta, StoryObj } from "@storybook/react-vite";
import { stackState, type StackContent } from "../../game/kit/stacks";
import type { KitScene } from "../../game/engine/kitScene";
import { CanvasStage } from "../harness/CanvasStage";
import { STACK_ARGS, STACK_ARG_TYPES, interactionFrom, layoutFrom, stackOptsFrom, type StackArgs } from "../kit/stackArgs";
import { STACK_INTERACTIONS } from "../../game/kit/stackInteraction";

// МЕХАНИКА ВЗАИМОДЕЙСТВИЯ СО СТОПКОЙ — раздел «Механики», не «UI-kit».
//
// «UI-kit/Stack» показывает КОМПОНЕНТ (раскладку, позу, состав). Этот раздел — про ДРУГОЕ: как одна
// и та же механика (spreadStack + dragConfig из kit/stackInteraction.ts) ведёт себя НЕЗАВИСИМО от
// того, что лежит в стопке. Раскладка тут зафиксирована (линейная, как колода): крутить её — работа
// соседнего раздела, а не этого.
//
// Матчасть не дублируется: `interactionFrom`/`stackOptsFrom`/`layoutFrom` те же функции моста, что
// использует «UI-kit/Stack» (stories/kit/stackArgs.ts). Здесь только сужен набор рычагов панели —
// геометрия стопки зафиксирована, а не отдана в контролы, чтобы не повторять соседний раздел.

/** Рычаги панели: сущность + механика + переопределения спреда/драга (те же поля, что у стопки). */
interface MechArgs {
  /** Из чего сложена демо-стопка. Раскладка от этого не зависит — меняется только предмет. */
  entity: Extract<StackContent, "cards" | "chips">;
  interaction: StackArgs["interaction"];
  spread: StackArgs["spread"];
  spreadTrigger: StackArgs["spreadTrigger"];
  spreadMaxGap: StackArgs["spreadMaxGap"];
  spreadClose: StackArgs["spreadClose"];
  spreadCenterX: StackArgs["spreadCenterX"];
  spreadKeepDiagonal: StackArgs["spreadKeepDiagonal"];
  cardPick: StackArgs["cardPick"];
  cardDragTrigger: StackArgs["cardDragTrigger"];
  stackDrag: StackArgs["stackDrag"];
}

const COUNT = 6;

/** Полный StackArgs для моста stackArgs.ts: раскладка стопки тут фиксирована (линейная, тесная —
 *  как колода), варьируются только сущность и механика взаимодействия. */
function toStackArgs(a: MechArgs): StackArgs {
  return {
    ...STACK_ARGS,
    layout: "linear",
    angleDeg: 0,
    step: 0.06,
    rotStep: 0,
    faceUp: true,
    count: COUNT,
    content: a.entity,
    interaction: a.interaction,
    spread: a.spread,
    spreadTrigger: a.spreadTrigger,
    spreadMaxGap: a.spreadMaxGap,
    spreadClose: a.spreadClose,
    spreadCenterX: a.spreadCenterX,
    spreadKeepDiagonal: a.spreadKeepDiagonal,
    cardPick: a.cardPick,
    cardDragTrigger: a.cardDragTrigger,
    stackDrag: a.stackDrag,
  };
}

const MECH_ARGS: MechArgs = {
  entity: "cards",
  interaction: "deck",
  spread: true,
  spreadTrigger: STACK_ARGS.spreadTrigger,
  spreadMaxGap: STACK_ARGS.spreadMaxGap,
  spreadClose: STACK_ARGS.spreadClose,
  spreadCenterX: STACK_ARGS.spreadCenterX,
  spreadKeepDiagonal: STACK_ARGS.spreadKeepDiagonal,
  cardPick: "first",
  cardDragTrigger: STACK_ARGS.cardDragTrigger,
  stackDrag: STACK_ARGS.stackDrag,
};

// Рычаги спреда/драга — те же argTypes, что у «UI-kit/Stack» (одно описание на все разделы, где
// стопка встречается вообще, см. stackArgs.ts). `entity` — свой, у`content` в stackArgs три опции
// (карты/фишки/фигуры), а тут заявлено только «карты | фишки».
const MECH_ARG_TYPES = {
  entity: {
    name: "entity",
    description: "что лежит в стопке. Механика — spread/drag — от этого не зависит: тот же рычаг двигает и карты, и фишки",
    control: { type: "select" as const },
    options: ["cards", "chips"],
  },
  interaction: STACK_ARG_TYPES.interaction,
  spread: STACK_ARG_TYPES.spread,
  spreadTrigger: STACK_ARG_TYPES.spreadTrigger,
  spreadMaxGap: STACK_ARG_TYPES.spreadMaxGap,
  spreadClose: STACK_ARG_TYPES.spreadClose,
  spreadCenterX: STACK_ARG_TYPES.spreadCenterX,
  spreadKeepDiagonal: STACK_ARG_TYPES.spreadKeepDiagonal,
  cardPick: STACK_ARG_TYPES.cardPick,
  cardDragTrigger: STACK_ARG_TYPES.cardDragTrigger,
  stackDrag: STACK_ARG_TYPES.stackDrag,
};

const meta: Meta<MechArgs> = {
  title: "Mechanics/Stack interactions",
  parameters: {
    code: (a: Record<string, unknown>) => `import { stackState } from "../../game/kit/stacks";
import { interactionFrom } from "../kit/stackArgs";

// Одна стопка, механика — готовый пресет (kit/stackInteraction.ts), рычаги ниже его перекрывают.
const { ids } = stackState(ctx, { x, y }, ${JSON.stringify(a, null, 2)});
const { spread, cardDrag, stackDrag } = interactionFrom(args);
if (spread) ctx.spreadStack(ids, at, layout, cell, spread);
ctx.dragConfig(ids, cardDrag, stackDrag);`,
  },
  argTypes: MECH_ARG_TYPES,
  args: { ...MECH_ARGS },
  render: (args) => (
    <CanvasStage<KitScene, MechArgs>
      args={args}
      target={(scene) => scene}
      build={(ctx, a) => {
        const at = { x: ctx.padding, y: ctx.padding };
        const full = toStackArgs(a);
        const r = stackState(ctx, at, stackOptsFrom(full));
        const { spread, cardDrag, stackDrag } = interactionFrom(full);
        if (spread) ctx.spreadStack(r.ids, at, layoutFrom(full), { w: ctx.cardW, h: ctx.cardH }, spread);
        ctx.dragConfig(r.ids, cardDrag, stackDrag);
        ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);
      }}
    />
  ),
};
export default meta;

type Story = StoryObj<MechArgs>;

/**
 * СТОПКА + МЕХАНИКА. Рычаги: какая сущность (карты/фишки) и какая механика (пресет + переопределения
 * спреда/драга). Раскладка не крутится — она уже есть в «UI-kit/Stack», здесь фокус на поведении:
 * СПРЕД (скролл раздвигает), ДРАГ КАРТЫ (любая/первая, тап/hold) и ДРАГ ВСЕЙ СТОПКИ.
 */
export const Default: Story = {};

/**
 * СРАВНЕНИЕ СУЩНОСТЕЙ — та же механика (`deck`: спред по скроллу со снэпом, тащим верхнюю) на
 * карточной стопке и на столбике фишек, рядом. Отдельной страницей, а не значением рычага: тут
 * сравнивают, а не крутят — та же роль, что у `Gallery` в «UI-kit/Stack».
 */
export const Entities: Story = {
  parameters: {
    controls: { disable: true },
    code: () => `import { stackState } from "../../game/kit/stacks";
import { STACK_INTERACTIONS } from "../../game/kit/stackInteraction";

// Одна и та же механика (пресет "deck"), два разных содержимого стопки.
const deck = STACK_INTERACTIONS.deck.make();
for (const content of ["cards", "chips"]) {
  const { ids } = stackState(ctx, at(content), { content, count: 6 });
  ctx.spreadStack(ids, at(content), layout, cell, deck.spread);
  ctx.dragConfig(ids, deck.cardDrag, deck.stackDrag);
}`,
  },
  render: () => (
    <CanvasStage<KitScene, Record<string, never>>
      args={{}}
      target={(scene) => scene}
      build={(ctx) => {
        const layout = layoutFrom({ ...STACK_ARGS, layout: "linear", step: 0.06 });
        const cell = { w: ctx.cardW, h: ctx.cardH };
        const gap = ctx.cardW * 1.6;
        const entities: { content: StackContent; caption: string }[] = [
          { content: "cards", caption: "cards" },
          { content: "chips", caption: "chips" },
        ];
        // Механика ОДНА — тот же объект пресета передаётся обеим стопкам, а не пересобирается
        // под каждую: это и есть точка сравнения — сущность разная, поведение общее.
        const inter = STACK_INTERACTIONS.deck!.make();
        let x = ctx.padding;
        let bottom = ctx.padding;
        for (const e of entities) {
          const at = { x, y: ctx.padding };
          const r = stackState(ctx, at, { form: layout, content: e.content, count: COUNT }, `ent-${e.content}`);
          if (inter.spread) ctx.spreadStack(r.ids, at, layout, cell, inter.spread);
          ctx.dragConfig(r.ids, inter.cardDrag, inter.stackDrag);
          const cap = ctx.label(e.caption, x + r.width / 2, r.bottom + 10, 12, 0x9aa89f, r.width);
          bottom = Math.max(bottom, r.bottom + 10 + cap.height);
          x += r.width + gap;
        }
        ctx.extent(x - gap + ctx.padding, bottom + ctx.padding);
      }}
    />
  ),
};
