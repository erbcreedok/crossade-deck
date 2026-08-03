import { useEffect, useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { action } from "storybook/actions";
import { BoardScene } from "../../game/boards/scene";
import type { BoardSpec } from "../../game/boards/spec";

interface Args {
  count: number;
  colsMin: number;
  colsMax: number;
  grow: "square" | "down" | "right";
  reserve: boolean;
  mode: "insert" | "swap";
}

const onCommand = action("dispatch → мок-порт");

const FACES = ["6♠", "7♥", "8♦", "9♣", "10♠", "J♥", "Q♦", "K♣", "A♠", "6♥", "7♦", "8♣", "9♠", "10♥", "J♦", "Q♣", "K♠", "A♥"];

/** Спека грида собирается ИЗ АРГОВ: раздел показывает, что реордер-грид — обычная flow-зона
 *  борды, а не отдельный механизм. */
function gridSpec(a: Args): BoardSpec {
  const faces = FACES.slice(0, a.count);
  return {
    id: "grid-demo",
    title: "Грид",
    elements: faces.map((f) => ({ kind: "card", id: f, face: f })),
    zones: [
      {
        id: "grid",
        title: "",
        layout: { kind: "flow", cols: { min: a.colsMin, max: a.colsMax }, grow: a.grow, reserve: a.reserve },
        policy: { onOccupied: "merge" },
        reorder: a.mode,
        setup: { 0: faces },
      },
    ],
    seats: { count: { fixed: 1 }, show: "none", swap: false },
    actions: [{ id: "shuffle", label: "перетасовать", command: { t: "shuffle", zone: "grid" } }],
  };
}

function GridStage(a: Args) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new BoardScene({ spec: gridSpec(a), onCommand: (cmd) => onCommand(cmd) });
    const g = globalThis as unknown as { __grid?: BoardScene };
    g.__grid = scene;
    void scene.mount(host, host.clientWidth || 640, host.clientHeight || 480);
    return () => {
      if (g.__grid === scene) delete g.__grid;
      scene.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.count, a.colsMin, a.colsMax, a.grow, a.reserve, a.mode]);
  return <div ref={hostRef} style={{ width: "100%", height: "100vh", background: "#2f3d34", touchAction: "none", overflow: "hidden" }} />;
}

/**
 * РЕОРДЕР-ГРИД — «Поле» из песочницы, вернувшееся в каталог ЖИВЫМ (раньше сюда не переезжало:
 * его механика была привязана к драг-роутингу песочницы; теперь роутинг общий — BoardScene).
 *
 * Это flow-зона борды: один живой контейнер, раскладка сама пересчитывает колонки и строки по
 * числу жителей (`slotfield/dynamicGrid.ts` — тот самый packGrid/flowLayout), потолки и полы —
 * рычагами. Дроп внутри грида — ВСТАВКА на позицию (сосед уступает место) или ОБМЕН местами —
 * ось `mode`. Дроп решается по координате пальца, хит-тест по несдвинутой сетке.
 */
const meta: Meta<Args> = {
  title: "Mechanics/Grid",
  args: { count: 8, colsMin: 2, colsMax: 4, grow: "square", reserve: false, mode: "insert" },
  argTypes: {
    count: { name: "count", description: "сколько карт живёт в гриде — раскладка пересчитывается от числа жителей, не от экрана", control: { type: "range", min: 1, max: 18, step: 1 } },
    colsMin: { name: "cols.min", description: "пол колонок: меньше грид не сожмётся, даже пустой (с reserve держит габарит)", control: { type: "range", min: 1, max: 6, step: 1 } },
    colsMax: { name: "cols.max", description: "потолок колонок: дальше жители переносятся в новые строки", control: { type: "range", min: 1, max: 8, step: 1 } },
    grow: {
      name: "grow",
      description: "куда грид растёт при свободе: square — балансирует стороны, down — держит колонки и растит строки, right — наоборот",
      control: { type: "select" },
      options: ["square", "down", "right"],
    },
    reserve: { name: "reserve", description: "держать место под СЛЕДУЮЩЕГО жителя: на гриде, забитом до края, иначе некуда класть нового" },
    mode: {
      name: "mode",
      description: "что значит дроп внутри грида: insert — карта встаёт на позицию, соседи сдвигаются; swap — карта и цель меняются местами (пятнашки)",
      control: { type: "select" },
      options: ["insert", "swap"],
    },
  },
  parameters: {
    layout: "fullscreen",
    code: (a: Record<string, unknown>) => `// Реордер-грид — flow-зона борды (никакого отдельного механизма):
const zone = {
  id: "grid",
  layout: { kind: "flow", cols: { min: ${a.colsMin}, max: ${a.colsMax} }, grow: "${a.grow}", reserve: ${a.reserve} },
  policy: { onOccupied: "merge" },
  reorder: "${a.mode}",            // дроп внутри: insert (вставка) | swap (обмен)
};
// Дроп внутри зоны сцена превращает в команду порта:
scene.dispatch({ t: "reorderSlot", key: "grid:0", order: next });`,
  },
  render: (a) => <GridStage {...a} />,
};
export default meta;

/**
 * Живой грид. Что сделать руками:
 *   • потащите карту на место другой: при `mode: insert` соседи сдвигаются, карта встаёт в
 *     позицию; при `swap` — меняются местами, как пятнашки;
 *   • крутите `count`: грид сам перекладывает жителей по min/max колонок;
 *   • `grow: down` против `right` — тот же состав раскладывается колонками или строками;
 *   • «перетасовать» — та же перестановка, но команда из кнопки: панель Actions показывает,
 *     что палец и кнопка ходят в одну дверь порта.
 */
export const Grid: StoryObj<Args> = {};
