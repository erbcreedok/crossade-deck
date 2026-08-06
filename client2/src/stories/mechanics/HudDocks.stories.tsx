import { useEffect, useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { action } from "storybook/actions";
import { BoardScene } from "../../game/boards/scene/scene";
import { deck36 } from "../../game/boards/library/decks";
import { handZone } from "../../game/boards/library/strips";
import { CARD } from "../../game/crossade/tree";
import { region, zoneW } from "../../game/boards/core/hudSpec";
import type { BoardSpec } from "../../game/boards/core/spec";

const dockAction = action("dispatch → мок-порт");
// Доки ЛЮБОЙ зоны: в области HUD швартуется не только лента — pile-КОЛОДА живёт стопкой
// (рубашки — правило зоны, как на борде; взять верхнюю, дроп сверху). Механика одна: ноды те же,
// переезд борд↔HUD — живой applySpec, полёт непрерывный.

const stage = { width: "100%", height: "100vh", background: "#2f3d34", touchAction: "none", overflow: "hidden" } as const;

interface DeckArgs {
  deckPin: "hud" | "board";
}

function deckSpec(a: DeckArgs): BoardSpec {
  const { cards, ids } = deck36();
  return {
    id: "hud-deck-dock",
    title: "",
    elements: cards,
    zones: [
      {
        id: "board",
        title: "",
        layout: { kind: "free" },
        cell: { w: Math.round(CARD.w * 5.4), h: Math.round(CARD.h * 4) },
        policy: { onOccupied: "merge" },
        drop: { hit: "overlap", only: "card", maxTilt: 30, magnet: true },
        setup: { 0: ids.slice(0, 6) },
      },
      // Колода — pile-зона «deck»: в доке лежит СТОПКОЙ рубашками (faceUpInSlot — правило зоны).
      { id: "deck", title: "", layout: { kind: "pile" }, policy: { onOccupied: "merge" }, setup: { 0: ids.slice(6, 18) } },
      handZone({ setup: { p1: ids.slice(18, 22) } }),
    ],
    seats: { count: { fixed: 1 }, show: "none", swap: false },
    hud: {
      areas: [
        region("bottom", "start", [zoneW("hand", "auto")]),
        ...(a.deckPin === "hud" ? [region("right", "start", [zoneW("deck")])] : []),
      ],
    },
    actions: [],
  };
}

function DeckStage(a: DeckArgs) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BoardScene | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new BoardScene({ spec: deckSpec(a), seats: 1, onCommand: (cmd) => dockAction(cmd) });
    sceneRef.current = scene;
    (window as unknown as { __story?: BoardScene }).__story = scene;
    void scene.mount(host, host.clientWidth || 640, host.clientHeight || 480);
    return () => scene.destroy();
  }, [a.deckPin]);
  const btn = { padding: "4px 10px", background: "#1f2a22", color: "#d7e3d0", border: "1px solid #50604f", borderRadius: 6, cursor: "pointer", font: "12px monospace" } as const;
  const move = (deckPin: DeckArgs["deckPin"]): void => sceneRef.current?.applySpec(deckSpec({ deckPin }));
  return (
    <div style={{ position: "relative" }}>
      <div ref={hostRef} style={stage} />
      <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 8 }}>
        <button style={btn} data-testid="deck-to-hud" onClick={() => move("hud")}>колода → HUD</button>
        <button style={btn} data-testid="deck-to-board" onClick={() => move("board")}>колода → борд</button>
      </div>
    </div>
  );
}

const meta: Meta<DeckArgs> = {
  title: "Mechanics/Hud Docks",
  parameters: {
    layout: "fullscreen",
    code: () => `// Докуется зона ЛЮБОГО вида с презентацией дока (strip/presentation):
//   strip → ряд со вставкой и гэп-превью; pile → СТОПКА (взять верхнюю, дроп сверху).
// Прочие виды пока живут на борде — zoneDockConfig честно отдаёт null.
hud: { areas: [
  region("bottom", "start", [zoneW("hand", "auto")]),
  region("right", "start", [zoneW("deck")]),  // pile-колода колонкой-стопкой у правого края
] }
// Лицо в доке — ПРАВИЛО зоны (faceUpInSlot): рука лицом, колода рубашками.
// Переезд живой: scene.applySpec(specСДругимHud) — ноды те же, полёт непрерывный.`,
  },
  args: { deckPin: "hud" },
  argTypes: {
    deckPin: { description: "где колода: стопкой в области HUD или на борде", control: { type: "inline-radio" }, options: ["hud", "board"] },
  },
  render: (a) => <DeckStage {...a} />,
};
export default meta;

/**
 * КОЛОДА В HUD: pile-зона стопкой у правого края — рубашками (правило зоны, не дока). Верхняя
 * карта тащится на борд, карта с борда/руки ложится в стопку СВЕРХУ; кнопки перекидывают колоду
 * борд↔HUD живьём (applySpec).
 */
export const DeckDock: StoryObj<DeckArgs> = {};
