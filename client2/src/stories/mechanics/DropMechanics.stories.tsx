import { useEffect, useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { action } from "storybook/actions";
import { BoardScene } from "../../game/boards/scene/scene";
import { roundTableBoard } from "../../game/boards/library";
import type { BoardSpec } from "../../game/boards/core/spec";
import type { DropPolicy } from "../../game/slot/dropPolicy";

const dropAction = action("dispatch → мок-порт");

// ДРОП-МЕХАНИКИ — раздел «Механики»: КАК зона ловит груз. Политика — данные зоны
// (slot/dropPolicy.ts): хит-правило (нахлёст фигуры / центр фигуры / только палец), вид груза,
// порог наклона и визуальный магнит. Здесь политики песочницы крутятся рычагами; сами дефолты
// живут в спеке (boards/library/roundTable.ts) и заперты сторожами
// (slot/dropPolicy.test.ts, boards/geometry/dropPolicies.test.ts).

interface DropArgs {
  /** Хит-правило колоды. */
  deckHit: NonNullable<DropPolicy["hit"]>;
  /** Пускает ли колода только карты. */
  deckCargo: "card" | "any";
  /** Порог наклона груза для снепа в колоду. */
  deckMaxTilt: number;
  /** Визуальный магнит колоды. */
  deckMagnet: boolean;
  /** Хит-правило центра стола. */
  tableHit: NonNullable<DropPolicy["hit"]>;
}

/** Спека песочницы с политиками из рычагов: та же сборка, что в игре, — меняются только данные. */
function specFrom(a: DropArgs): BoardSpec {
  const base = roundTableBoard({ seats: 2, dealt: 6 });
  return {
    ...base,
    zones: base.zones.map((z) => {
      if (z.id === "board") return { ...z, drop: { hit: a.deckHit, ...(a.deckCargo === "card" ? { only: "card" } : {}), maxTilt: a.deckMaxTilt, magnet: a.deckMagnet } };
      if (z.id === "table") return { ...z, drop: { hit: a.tableHit, shape: "circle" } };
      return z;
    }),
  };
}

function DropStage(a: DropArgs) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new BoardScene({ spec: specFrom(a), seats: 2, onCommand: (cmd) => dropAction(cmd) });
    void scene.mount(host, host.clientWidth || 640, host.clientHeight || 480);
    return () => scene.destroy();
  }, [a.deckHit, a.deckCargo, a.deckMaxTilt, a.deckMagnet, a.tableHit]);
  return <div ref={hostRef} style={{ width: "100%", height: "100vh", background: "#2f3d34", touchAction: "none", overflow: "hidden" }} />;
}

const meta: Meta<DropArgs> = {
  title: "Mechanics/Drop mechanics",
  parameters: {
    layout: "fullscreen",
    code: (a: Record<string, unknown>) => `import { roundTableBoard } from "../../game/boards/library";
import { BoardScene } from "../../game/boards/scene/scene";

// Политика дропа — ДАННЫЕ зоны (slot/dropPolicy.ts), сцена лишь исполняет.
const spec = roundTableBoard({ seats: 2, dealt: 6 });
spec.zones[0].drop = { hit: "${a.deckHit}"${a.deckCargo === "card" ? ', only: "card"' : ""}, maxTilt: ${a.deckMaxTilt}, magnet: ${a.deckMagnet} }; // колода
spec.zones[1].drop = { hit: "${a.tableHit}", shape: "circle" }; // центр стола
void new BoardScene({ spec, seats: 2 }).mount(host, width, height);`,
  },
  args: { deckHit: "overlap", deckCargo: "card", deckMaxTilt: 30, deckMagnet: true, tableHit: "center" },
  argTypes: {
    deckHit: {
      name: "deckHit",
      description: "что считается попаданием в колоду: overlap — фигура частично накрыла; center — центр фигуры внутри; finger — только палец",
      control: { type: "inline-radio" },
      options: ["overlap", "center", "finger"],
    },
    deckCargo: {
      name: "deckCargo",
      description: "какой груз колода принимает: card — только карты (фишку не засунуть никак); any — любой",
      control: { type: "inline-radio" },
      options: ["card", "any"],
    },
    deckMaxTilt: {
      name: "deckMaxTilt",
      description: "порог наклона (°): сильнее наклонённая карта не снепается нахлёстом — впихнуть можно только пальцем над колодой",
      control: { type: "range", min: 0, max: 90, step: 5 },
    },
    deckMagnet: {
      name: "deckMagnet",
      description: "визуальный магнит: пока колода — цель дропа, карта пружиной прилипает к ней ещё до отпускания",
      control: { type: "boolean" },
    },
    tableHit: {
      name: "tableHit",
      description: "что считается попаданием в центр стола: center — по центру карты (край на круге не перебивает внешний круг); overlap/finger — как у колоды",
      control: { type: "inline-radio" },
      options: ["overlap", "center", "finger"],
    },
  },
  render: (a) => <DropStage {...a} />,
};
export default meta;

type Story = StoryObj<DropArgs>;

/**
 * ПОЛИТИКИ ДРОПА песочницы, живьём. Потащите карту: колода снепает по нахлёсту и магнитом (только
 * карты, только ровные — наклоните карту через её меню «поворот» и снеп пропадёт, останется палец);
 * центр стола ловит по ЦЕНТРУ карты — край, заехавший на круг, не утаскивает дроп с внешнего круга;
 * свободные стопки всегда ловят пальцем — карта в круге лежит где и как положили. Дефолты рычагов =
 * дефолты спеки песочницы (boards/library/roundTable.ts).
 */
export const Default: Story = {};
