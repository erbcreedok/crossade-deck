import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Card } from "../../game/ui/Card";
import type { KitScene } from "../../game/engine/kitScene";
import { applyMotionLevers, makeMotionLevers, motionConfigurable, statesSection, transitionsSection } from "../../game/kit/motion";
import { applyArgsToParams, paramsToArgs, paramsToArgTypes } from "../harness/paramArgs";
import { CanvasStage } from "../harness/CanvasStage";

// ДВИЖЕНИЕ. Раздел разбит на два, и это не косметика: «анимация» у нас — два разных явления.
//
//   ПЕРЕХОД   конечен: есть начало, длительность и конец. Его ЗАПУСКАЮТ кнопкой, дальше он идёт
//             сам. Переворот, полёт по команде, «сжечь».
//   СОСТОЯНИЕ бесконечно: крутится, пока включено. Его не запускают — им управляют. Покой,
//             левитация, цензурная пыль, «держат».
//
// У перехода бессмысленны ползунки интенсивности, у состояния — кнопка «запустить». Поэтому и
// стори разные.
//
// Смотреть надо В ДВИЖЕНИИ: статичный кадр не отличает пружину от телепорта, а живую пыль — от
// картинки. Скриншотом этот раздел не проверяется в принципе.

// ——— рычаги в ПАНЕЛИ ———
//
// Список берётся из `motionConfigurable` — того же `Configurable`, из которого стенд `/motion`
// строит свои канвасные виджеты. Второго набора значений в проекте нет.
const levers = makeMotionLevers();
let liveIds: string[] = [];
let liveScene: KitScene | null = null;

const applyAll = () => {
  if (!liveScene) return;
  liveScene.setReduceMotion(levers.reduceMotion);
  liveScene.setReduceFlash(levers.reduceFlash);
};

const CFG = motionConfigurable(levers, applyAll);
const PARAMS = CFG.params();
const motionArgTypes = paramsToArgTypes(PARAMS);

type MotionArgs = Record<string, unknown>;
const motionArgs = paramsToArgs(PARAMS) as MotionArgs;

/** Каждый рычаг применяется одинаково: влить в конфиг, разослать по живым картам и по сцене. */
const applyMotionArgs = Object.fromEntries(
  PARAMS.map((p) => [
    p.id,
    (scene: KitScene, v: unknown) => {
      applyArgsToParams(CFG.params(), { [p.id]: v });
      liveScene = scene;
      applyAll();
      const ctx = sceneCtx;
      if (ctx) applyMotionLevers(ctx, levers, liveIds);
    },
  ]),
);

// Контекст сборки нужен, чтобы разослать рычаги по картам уже после сборки. Витрина в каталоге
// одна, поэтому одна ссылка — не гонка.
let sceneCtx: Parameters<NonNullable<Parameters<typeof CanvasStage>[0]["build"]>>[0] | null = null;

const meta: Meta<MotionArgs> = {
  title: "Mechanics/Motion",
  argTypes: motionArgTypes,
  args: motionArgs,
  render: (args) => (
    <CanvasStage<KitScene, MotionArgs>
      args={args}
      apply={applyMotionArgs}
      target={(scene) => scene}
      opts={{ cardHeight: 150 }}
      build={(ctx) => {
        const t = transitionsSection(ctx, { x: ctx.padding, y: ctx.padding + 22 });
        ctx.label("ПЕРЕХОДЫ — запускаются кнопкой и заканчиваются сами", ctx.padding, ctx.padding, 13, 0xcdb98f, undefined, 0);
        const sTop = t.bottom + 46;
        ctx.label("СОСТОЯНИЯ — идут, пока включены; запускать нечего", ctx.padding, sTop - 24, 13, 0xcdb98f, undefined, 0);
        const s = statesSection(ctx, { x: ctx.padding, y: sTop });
        sceneCtx = ctx;
        liveIds = [...t.ids, ...s.ids];
        applyMotionLevers(ctx, levers, liveIds);
        ctx.extent(Math.max(t.width, s.width) + ctx.padding * 2, s.bottom + ctx.padding);
      }}
    />
  ),
};
export default meta;

type Story = StoryObj<MotionArgs>;

/** Переходы и состояния рядом — так видно, почему это разные вещи. */
export const Overview: Story = {};

/**
 * «Уменьшить движение» включено — тот же раздел глазами человека, которому анимация мешает.
 * Состояния обязаны замереть, переходы — остаться (иначе интерфейс перестанет отвечать на действия).
 */
export const ReducedMotion: Story = { args: { reduceMotion: true } };

/** «Без вспышек» — отдельный флаг фото-чувствительности: гасит мерцание, движение не трогает. */
export const NoFlashes: Story = { args: { reduceFlash: true, flicker: true } };

/** Пыль на максимуме разлёта — так виден сам механизм частиц, а не аккуратный дефолт. */
export const LoudDust: Story = { args: { jitterAmp: 4, swapsPerSec: 90, block: 8 } };

/** Крупно: разглядеть, что переворот — это поворот, а «сжечь» — волнистый фронт, а не затухание. */
export const Large: Story = {
  render: (args) => (
    <CanvasStage<KitScene, MotionArgs>
      args={args}
      apply={applyMotionArgs}
      target={(scene) => scene}
      opts={{ cardHeight: 240 }}
      build={(ctx) => {
        const t = transitionsSection(ctx, { x: ctx.padding, y: ctx.padding });
        sceneCtx = ctx;
        liveIds = t.ids;
        applyMotionLevers(ctx, levers, liveIds);
        ctx.extent(t.width + ctx.padding * 2, t.bottom + ctx.padding);
      }}
    />
  ),
};
