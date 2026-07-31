import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Card } from "../../game/ui/Card";
import { commandPortSection, concealBlock, flipBlock, moveBlock, revealBlock } from "../../game/kit/commandPort";
import { CanvasStage } from "../harness/CanvasStage";

// ПОРТ КОМАНД — то, чем сервер, консоль или скрытая логика двигают карты, минуя пальцы игрока.
// Та же секция, что раздел «Управление» на /playground (game/kit/commandPort.ts).
//
// Карты здесь НЕ тащатся: их двигает команда. Это не ограничение витрины, а суть раздела —
// показать дверь (engine/command.ts), через которую обязаны проходить все действия, иначе undo,
// сеть и синхронизация ничего не смогут перехватить.
//
// Смотреть надо на ДВИЖЕНИЕ: перенос идёт пружиной, как при драге. Телепорт означал бы, что
// команда обошла физику, и по статичному скриншоту это неотличимо.

const meta: Meta<Record<string, never>> = {
  title: "Механики/Порт команд",
  parameters: { controls: { disable: true } },
  render: () => (
    <CanvasStage<Card, Record<string, never>>
      args={{}}
      build={(ctx) => {
        const r = commandPortSection(ctx, { x: ctx.padding, y: ctx.padding });
        ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);
      }}
    />
  ),
};
export default meta;

type Story = StoryObj<Record<string, never>>;

/** Все четыре команды подряд: flip, conceal, setValue, move. */
export const ВсеКоманды: Story = {};

/** `{t:"flip"}` — переворот настоящий, той же анимацией (0.45 с), что и при жесте. */
export const Перевернуть: Story = {
  render: () => (
    <CanvasStage<Card, Record<string, never>>
      args={{}}
      opts={{ cardHeight: 190 }}
      build={(ctx) => {
        const r = flipBlock(ctx, { x: ctx.padding, y: ctx.padding }, "one-flip");
        ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);
      }}
    />
  ),
};

/**
 * `{t:"conceal"}` — РЕЖИМ секретности, а не «другая карта»: под живой пылью всё это время лежит
 * настоящее значение, и снятие скрытости показывает именно его.
 */
export const Скрытость: Story = {
  render: () => (
    <CanvasStage<Card, Record<string, never>>
      args={{}}
      opts={{ cardHeight: 190 }}
      build={(ctx) => {
        const r = concealBlock(ctx, { x: ctx.padding, y: ctx.padding }, "one-conceal");
        ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);
      }}
    />
  ),
};

/**
 * `{t:"setValue"}` — про ДРУГОЕ, чем скрытость: значения нет вовсе (card: ""), карта маскируется,
 * и команда его проставляет. Так выглядит «сервер раскрыл придержанное».
 */
export const РаскрытьЗначение: Story = {
  render: () => (
    <CanvasStage<Card, Record<string, never>>
      args={{}}
      opts={{ cardHeight: 190 }}
      build={(ctx) => {
        const r = revealBlock(ctx, { x: ctx.padding, y: ctx.padding }, "one-reveal");
        ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);
      }}
    />
  ),
};

/** `{t:"move"}` — карта летит пружиной, а не телепортируется. Проверяется только глазами. */
export const Перенос: Story = {
  render: () => (
    <CanvasStage<Card, Record<string, never>>
      args={{}}
      opts={{ cardHeight: 150 }}
      build={(ctx) => {
        const r = moveBlock(ctx, { x: ctx.padding, y: ctx.padding }, "one-move-");
        ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);
      }}
    />
  ),
};
