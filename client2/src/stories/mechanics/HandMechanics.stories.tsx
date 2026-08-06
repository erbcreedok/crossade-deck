import { useEffect, useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { action } from "storybook/actions";
import { BoardScene } from "../../game/boards/scene/scene";
import { LiveTwoPane } from "./liveStage";
import { deck36 } from "../../game/boards/library/decks";
import { handZone } from "../../game/boards/library/strips";
import { CARD } from "../../game/crossade/tree";
import type { BoardSpec, HandFlow, HudSide } from "../../game/boards/core/spec";

const handAction = action("dispatch → мок-порт");

// РУКА-ДОК — раздел «Механики», НЕЗАВИСИМЫЙ от песочницы: минимальная борда (только колода в
// free-боксе), вся сцена — про руку. Рука — ОБЫЧНАЯ strip-зона (handZone()): свойства (flow,
// fit, hidden, locked, preview) живут в её ZoneSpec; ГДЕ она — решает hud (виджет kind:"zone").
// Док фикс к камере (placement:"screen"): зумите/таскайте стол — рука стоит; стол вписывается в
// ОСТАТОК экрана (fitZoom с резервом дока: снизу, сверху, сбоку). Геометрия — чистый handDock.
// ДРАГ живой: со стола в док (гэп-превью раздвигает ряд — карта ляжет ровно в показанный гэп),
// из дока на стол, реордер внутри. Кнопки и дропзоны В руке — следующий шаг (слияние dropBar).

interface DockArgs {
  /** Рука: виджет экранного HUD (фикс к камере) или зона НА борде (в дереве, зумится со столом). */
  pin: "screen" | "board";
  /** Край HUD, в чей док встаёт рука-виджет. */
  side: HudSide;
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
      handZone({ ...(a.flow === "по краю" ? {} : { flow: a.flow }), ...(a.fit > 0 ? { fit: a.fit } : {}) }),
    ],
    seats: { count: { fixed: 1 }, show: "none", swap: false },
    // ГДЕ рука — решает HUD: виджет зоны в доке края = экранная; нет HUD = зона на борде.
    hud: a.pin === "screen" ? { [a.side]: { widgets: [{ kind: "zone", zone: "hand" }] } } : undefined,
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
  }, [a.pin, a.side, a.flow, a.handCards, a.fit]);
  return <div ref={hostRef} style={{ width: "100%", height: "100vh", background: "#2f3d34", touchAction: "none", overflow: "hidden" }} />;
}

const meta: Meta<DockArgs> = {
  title: "Mechanics/Hand",
  parameters: {
    layout: "fullscreen",
    code: () => `import { BoardScene } from "game/boards/scene/scene";
import { handZone } from "game/boards/library/strips";
import type { BoardSpec } from "game/boards/core/spec";

// РУКА — обычная strip-зона: никакого спецпонятия в словаре. Свойства руки живут
// в ЕЁ ZoneSpec; ГДЕ она (борда или экранный док) — решает hud. Лент может быть
// сколько угодно (вторая рука, мешок фишек…) — просто ещё strip-зоны с другим id.
const spec: BoardSpec = {
  ...myBoard, // любая борда: зоны, места, элементы
  zones: [
    ...myBoard.zones,
    handZone(), // = { id:"hand", layout:{kind:"strip"}, policy:{onOccupied:"merge"} }
    // свойства — точечно, в самой зоне:
    //   flow: "grid"        ось ряда в доке (дефолт — вдоль края)
    //   fit: 5              адаптив «влезает N» (или cell: {w,h} — фикс)
    //   hidden: false       открытая: другие видят лица (дефолт true — рубашки)
    //   access: "locked"    запереть от чужих | "request" — по запросу (дефолт "open")
    //   atSeat: "above"     где мини-лента у аватара, когда зона в HUD (дефолт below)
    //   reorder: "none"     без реордера; preview: false — без гэп-превью
  ],
  // HUD — экранный слой: доки по краям, в каждом РЯД виджетов (flex-как-данные:
  // порядок массива, size: px | {fr} | "auto", justify, gap). Убери виджет — зона
  // вернётся НА борду (та же механика и вид). deal раздаёт в зону «hand» (to: id).
  hud: {
    bottom: { widgets: [{ kind: "zone", zone: "hand" }] },
  },
};
void new BoardScene({ spec, seats: 2 }).mount(host, width, height);`,
  },
  args: { pin: "screen", side: "bottom", flow: "по краю", handCards: 5, fit: 0 },
  argTypes: {
    pin: {
      name: "pin",
      description: "screen — рука виджетом HUD (фикс к экрану); board — рука зоной НА борде (зумится со столом)",
      control: { type: "inline-radio" },
      options: ["screen", "board"],
    },
    side: {
      name: "side",
      description: "край HUD для руки-виджета: стол вписывается в остаток",
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

/**
 * Рука НА БОРДЕ (placement:"board"): та же рука зоной в дереве — зумится и ездит со столом, но
 * вид и механика ТЕ ЖЕ, что у дока: центрированный ряд, лента rest/armed/hot, гэп-превью
 * вставки, дроп со стола в показанный гэп, реордер.
 */
export const BoardHand: Story = { args: { pin: "board", handCards: 4 } };

/** Мини-сцена SMART REORDER для ЗОНЫ (без руки): flow-«ряд» с opt-in `preview: true` — жители
 *  расступаются под гэп, дроп из колоды ложится в показанный гэп. Тот же примитив, что у руки
 *  (group.gap слот-дерева); без флага зона живёт по-старому (дроп в конец). */
function zonePreviewSpec(): BoardSpec {
  const { cards, ids } = deck36();
  return {
    id: "zone-preview",
    title: "",
    elements: cards,
    zones: [
      {
        id: "board",
        title: "",
        layout: { kind: "free" },
        cell: { w: Math.round(CARD.w * 5), h: Math.round(CARD.h * 3.6) },
        policy: { onOccupied: "merge" },
        drop: { hit: "overlap", only: "card", maxTilt: 30, magnet: true },
        setup: { 0: ids.slice(0, 12) },
      },
      {
        id: "row",
        title: "ряд",
        layout: { kind: "flow" },
        cell: { w: Math.round(CARD.w * 1.3), h: Math.round(CARD.h * 1.3) },
        policy: { onOccupied: "merge" },
        frame: "dashed",
        preview: true,
        setup: { 0: ids.slice(12, 15) },
      },
    ],
    seats: { count: { fixed: 1 }, show: "none", swap: false },
    actions: [],
  };
}

function ZoneStage() {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new BoardScene({ spec: zonePreviewSpec(), seats: 1, onCommand: (cmd) => handAction(cmd) });
    (window as unknown as { __story?: BoardScene }).__story = scene;
    void scene.mount(host, host.clientWidth || 640, host.clientHeight || 480);
    return () => scene.destroy();
  }, []);
  return <div ref={hostRef} style={{ width: "100%", height: "100vh", background: "#2f3d34", touchAction: "none", overflow: "hidden" }} />;
}

// Контролы отключены: сцена фиксированная, панель args тут врала бы.
export const ZonePreview: Story = { render: () => <ZoneStage />, parameters: { controls: { disable: true } } };

/** LIVE: ДВА ЭКРАНА над ОДНИМ портом (общий localDriver — минимум событий: один снимок на всех).
 *  Слева — экран p1, справа — p2. Контролы КРУТЯТ СВОЙСТВА РУКИ — и на соседнем экране видно,
 *  как ТВОЯ рука выглядит у него: pin hud → мини-визави у аватара (зеркало), pin board → та же
 *  полоса ужатой; hidden — рубашки или лица; access — зовёт ли чужая лента дроп. */
interface LiveArgs {
  pin: "screen" | "board";
  handCards: number;
  hidden: boolean;
  access: "open" | "request" | "locked";
  atSeat: "above" | "below" | "left" | "right";
}

function liveSpec(a: LiveArgs): BoardSpec {
  const { cards, ids } = deck36();
  return {
    id: "hand-live",
    title: "",
    elements: cards,
    zones: [
      {
        id: "board",
        title: "",
        layout: { kind: "free" },
        cell: { w: Math.round(CARD.w * 5), h: Math.round(CARD.h * 3.8) },
        policy: { onOccupied: "merge" },
        drop: { hit: "overlap", only: "card", maxTilt: 30, magnet: true },
        setup: { 0: ids.slice(0, 16) },
      },
      handZone({ hidden: a.hidden, access: a.access, atSeat: a.atSeat }),
    ],
    seats: { count: { fixed: 2 }, show: "backs", swap: false },
    hud: a.pin === "screen" ? { bottom: { widgets: [{ kind: "zone", zone: "hand" }] } } : undefined,
    actions: [],
  };
}

function LiveStage(a: LiveArgs) {
  // Раздать по handCards карт каждому — те же move-команды порта, что и палец.
  const deal = (s1: BoardScene): void => {
    const deck = Object.entries(s1.testHooks().cards).filter(([, c]) => c.slot === "board:0").map(([id]) => id);
    const n = Math.max(0, a.handCards);
    deck.slice(0, n).forEach((id) => s1.dispatch({ t: "move", el: id, from: "board:0", to: "hand:p1" }));
    deck.slice(n, n * 2).forEach((id) => s1.dispatch({ t: "move", el: id, from: "board:0", to: "hand:p2" }));
  };
  return <LiveTwoPane spec={() => liveSpec(a)} deps={[a.pin, a.handCards, a.hidden, a.access, a.atSeat]} onCommand={handAction} ready={deal} />;
}

export const LiveTwoScreens: Story = {
  args: { pin: "screen", handCards: 3, hidden: true, access: "open", atSeat: "below" } as never,
  argTypes: {
    // pin и handCards — из меты (те же смыслы); side/flow/fit тут ни при чём.
    side: { table: { disable: true } },
    flow: { table: { disable: true } },
    fit: { table: { disable: true } },
    hidden: { description: "приватность ЗНАЧЕНИЙ: сосед видит рубашки (true) или лица (false)", control: { type: "boolean" } },
    access: {
      description: "доступ соседа к твоей руке: open — дроп/взятие включены; request — по запросу (пометка); locked — заперто",
      control: { type: "inline-radio" },
      options: ["open", "request", "locked"],
    },
    atSeat: {
      description: "где у твоего аватара живёт мини-рука на ЧУЖОМ экране, когда она у тебя в HUD",
      control: { type: "inline-radio" },
      options: ["above", "below", "left", "right"],
    },
  } as never,
  render: (a) => <LiveStage {...(a as unknown as LiveArgs)} />,
};

// HUD с несколькими виджетами, две ленты и живая миграция борд↔HUD — раздел Mechanics/Hud.
