import { useEffect, useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { action } from "storybook/actions";
import { BoardScene } from "../../game/boards/scene/scene";
import { roundTableBoard } from "../../game/boards/library";
import type { BoardSpec } from "../../game/boards/core/spec";

const handAction = action("dispatch → мок-порт");

// РУКА — раздел «Механики»: своя рука как ЭКРАННЫЙ HUD (placement:"screen"), прибитый к камере.
// Рука во всю ширину снизу, статичный размер по экрану, ВНЕ контентных координат борды — покрутите
// зум/пан фоновой борды: стол ездит, рука стоит. Дерево борды при screen руку-зону не кладёт
// (сторож boards/hand/handPlacement.test.ts), карты руки живут только в HUD (boards/scene/handHud.ts).
// Раскладка ряда — чистая geometry (boards/hand/handStrip.ts): свободный ряд → нахлёст при переполнении.

interface HandArgs {
  /** Сколько карт положить в руку (из колоды фоновой борды). */
  handCards: number;
  /** Мест за столом фоновой борды. */
  seats: number;
}

/** Лёгкая фоновая борда с ЭКРАННОЙ рукой: круглый стол, рука уехала в HUD. */
function specFrom(a: HandArgs): BoardSpec {
  const base = roundTableBoard({ seats: a.seats, dealt: 2, ring: "capped" });
  return { ...base, hand: { reorder: true, placement: "screen" } };
}

function HandStage(a: HandArgs) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new BoardScene({ spec: specFrom(a), seats: a.seats, onCommand: (cmd) => handAction(cmd) });
    void scene.mount(host, host.clientWidth || 640, host.clientHeight || 480).then(() => {
      // Набить руку из колоды: те же move-команды порта, что и палец потом (драг руки↔борда — шаг 3).
      // Набить руку из колоды: те же move-команды порта, что и палец (драг руки↔борды теперь живой).
      const hooks = scene.testHooks();
      const deck = Object.entries(hooks.cards).filter(([, c]) => c.slot === "board:0").map(([id]) => id);
      for (const id of deck.slice(0, Math.max(0, a.handCards))) {
        scene.dispatch({ t: "move", el: id, from: "board:0", to: "hand:p1" });
      }
    });
    return () => scene.destroy();
  }, [a.handCards, a.seats]);
  return <div ref={hostRef} style={{ width: "100%", height: "100vh", background: "#2f3d34", touchAction: "none", overflow: "hidden" }} />;
}

const meta: Meta<HandArgs> = {
  title: "Mechanics/Hand",
  parameters: {
    layout: "fullscreen",
    code: () => `import { roundTableBoard } from "../../game/boards/library";
import { BoardScene } from "../../game/boards/scene/scene";

// Рука — ЭКРАННЫЙ HUD: одно поле данных placement:"screen". Дерево борды руку-зону не кладёт,
// её рисует handHud.ts на chrome-слое (фикс к камере, вне контента).
const spec = { ...roundTableBoard({ seats: 2, dealt: 2 }), hand: { reorder: true, placement: "screen" } };
void new BoardScene({ spec, seats: 2 }).mount(host, width, height);`,
  },
  args: { handCards: 5, seats: 2 },
  argTypes: {
    handCards: {
      name: "handCards",
      description: "сколько карт в руке (из колоды): ряд центрируется, при переполнении уходит в нахлёст",
      control: { type: "range", min: 0, max: 12, step: 1 },
    },
    seats: {
      name: "seats",
      description: "мест за столом фоновой борды (рука всегда СВОЯ, place p1)",
      control: { type: "range", min: 1, max: 4, step: 1 },
    },
  },
  render: (a) => <HandStage {...a} />,
};
export default meta;

type Story = StoryObj<HandArgs>;

/**
 * ЭКРАННАЯ рука над лёгкой бордой. Рука прибита к камере: зумите и таскайте стол — рука стоит на
 * месте во всю ширину снизу. Крутите handCards: ряд центрируется, при переполнении карты уходят в
 * ровный нахлёст. ДРАГ живой: тащите карту руки на стол — сыграть; карту стола в полосу руки — взять;
 * внутри руки — реордер. Полоса-дропзона руки светит rest → armed (груз в полёте) → hot (над рукой).
 */
export const Default: Story = {};
