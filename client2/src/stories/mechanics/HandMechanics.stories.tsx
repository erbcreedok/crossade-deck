import { useEffect, useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { action } from "storybook/actions";
import { BoardScene } from "../../game/boards/scene/scene";
import { deck36 } from "../../game/boards/library/decks";
import { CARD } from "../../game/crossade/tree";
import type { BoardSpec, HandFlow, HandSide } from "../../game/boards/core/spec";

const handAction = action("dispatch → мок-порт");

// РУКА-ДОК — раздел «Механики», НЕЗАВИСИМЫЙ от песочницы: минимальная борда (только колода в
// free-боксе), вся сцена — про руку и её конфиг-данные (spec.hand): край side, ось flow, реордер.
// Док фикс к камере (placement:"screen"): зумите/таскайте стол — рука стоит; стол вписывается в
// ОСТАТОК экрана (fitZoom с резервом дока: снизу, сверху, сбоку). Геометрия — чистый handDock.
// ДРАГ живой: со стола в док (гэп-превью раздвигает ряд — карта ляжет ровно в показанный гэп),
// из дока на стол, реордер внутри. Кнопки и дропзоны В руке — следующий шаг (слияние dropBar).

interface DockArgs {
  /** Край экрана, к которому пришвартован док. */
  side: HandSide;
  /** Ось ряда: по дефолту вдоль края (top/bottom → horizontal, left/right → vertical). */
  flow: HandFlow | "по краю";
  /** Сколько карт положить в руку из колоды. */
  handCards: number;
  /** Размер карт: адаптив «влезает N» (fit) — 0 значит дефолт 5. */
  fit: number;
}

/** Минимальная борда: free-бокс с колодой посередине — фон, чтобы было откуда/куда таскать. */
function dockSpec(a: DockArgs): BoardSpec {
  const { cards, ids } = deck36();
  return {
    id: "hand-dock",
    title: "",
    elements: cards,
    zones: [
      {
        id: "board",
        title: "",
        layout: { kind: "free" },
        cell: { w: Math.round(CARD.w * 6), h: Math.round(CARD.h * 4.5) },
        policy: { onOccupied: "merge" },
        drop: { hit: "overlap", only: "card", maxTilt: 30, magnet: true },
        setup: { 0: ids.slice(0, 18) },
      },
    ],
    seats: { count: { fixed: 1 }, show: "none", swap: false },
    hand: { reorder: true, placement: "screen", side: a.side, ...(a.flow === "по краю" ? {} : { flow: a.flow }), ...(a.fit > 0 ? { size: a.fit } : {}) },
    actions: [],
  };
}

function DockStage(a: DockArgs) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new BoardScene({ spec: dockSpec(a), seats: 1, onCommand: (cmd) => handAction(cmd) });
    (window as unknown as { __story?: BoardScene }).__story = scene; // дев-хук стори/e2e, как __sandbox
    void scene.mount(host, host.clientWidth || 640, host.clientHeight || 480).then(() => {
      // Набить руку из колоды: те же move-команды порта, что и палец (драг руки↔борды живой).
      const hooks = scene.testHooks();
      const deck = Object.entries(hooks.cards).filter(([, c]) => c.slot === "board:0").map(([id]) => id);
      for (const id of deck.slice(0, Math.max(0, a.handCards))) {
        scene.dispatch({ t: "move", el: id, from: "board:0", to: "hand:p1" });
      }
    });
    return () => scene.destroy();
  }, [a.side, a.flow, a.handCards, a.fit]);
  return <div ref={hostRef} style={{ width: "100%", height: "100vh", background: "#2f3d34", touchAction: "none", overflow: "hidden" }} />;
}

const meta: Meta<DockArgs> = {
  title: "Mechanics/Hand",
  parameters: {
    layout: "fullscreen",
    code: () => `import { BoardScene } from "../../game/boards/scene/scene";

// Рука — данные HandSpec: где живёт (placement), у какого края (side), вдоль какой оси (flow).
// Дефолты — bottom и вдоль края; геометрию дока считает чистый boards/hand/handDock.ts.
const spec = { ...boardSpec, hand: { reorder: true, placement: "screen", side: "right" } };
void new BoardScene({ spec, seats: 1 }).mount(host, width, height);`,
  },
  args: { side: "bottom", flow: "по краю", handCards: 5, fit: 0 },
  argTypes: {
    side: {
      name: "side",
      description: "край экрана: стол вписывается в остаток (снизу рука над полосой действий)",
      control: { type: "inline-radio" },
      options: ["bottom", "top", "left", "right"],
    },
    flow: {
      name: "flow",
      description: "ось ряда; «по краю» — дефолт (top/bottom → ряд, left/right → колонка); grid — сетка рядами вглубь",
      control: { type: "inline-radio" },
      options: ["по краю", "horizontal", "vertical", "grid"],
    },
    handCards: {
      name: "handCards",
      description: "сколько карт в руке: ряд центрируется, при переполнении уходит в нахлёст",
      control: { type: "range", min: 0, max: 12, step: 1 },
    },
    fit: {
      name: "fit",
      description: "size руки: сколько карт влезает вдоль оси без нахлёста (0 — дефолт 5); меньше — крупнее",
      control: { type: "range", min: 0, max: 10, step: 1 },
    },
  },
  render: (a) => <DockStage {...a} />,
};
export default meta;

type Story = StoryObj<DockArgs>;

/**
 * Док у НИЖНЕГО края (дефолт — прайм-зона большого пальца). Тащите карту со стола в полосу — ряд
 * раздвигается гэп-превью, карта ляжет ровно в показанный гэп; внутри руки — реордер; из руки на
 * стол — сыграть. Полоса светит rest → armed (груз в полёте) → hot (груз над рукой).
 */
export const Bottom: Story = {};

/** Док у ПРАВОГО края: колонка (ось по краю — vertical), стол уступает ширину, не высоту. */
export const RightColumn: Story = { args: { side: "right", handCards: 4 } };

/** Док у ВЕРХНЕГО края: ряд под топбаром — «рука соперника» будущих live-сцен по этой же оси. */
export const TopRow: Story = { args: { side: "top", handCards: 4 } };

/** Док у ЛЕВОГО края: колонка, зеркальная правой — левше или второй руке. */
export const LeftColumn: Story = { args: { side: "left", handCards: 4 } };

/** СЕТКА вглубь от края: колонки по длине края, ряды к центру — рука-склад (fit 4 — крупные). */
export const GridDock: Story = { args: { flow: "grid", handCards: 10, fit: 4 } };
