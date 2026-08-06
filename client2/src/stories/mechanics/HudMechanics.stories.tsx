import { useEffect, useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { action } from "storybook/actions";
import { BoardScene } from "../../game/boards/scene/scene";
import { LiveTwoPane } from "./liveStage";
import { deck36 } from "../../game/boards/library/decks";
import { handZone } from "../../game/boards/library/strips";
import { CARD } from "../../game/crossade/tree";
import type { BoardSpec, ElementDef, HudSide, HudSpec, HudWidget, ZoneSpec } from "../../game/boards/core/spec";

const hudAction = action("dispatch → мок-порт");
// HUD — раздел «Механики»: экранный слой виджетов ПОВЕРХ борды. Доки по краям, flex-семантика
// КАК ДАННЫЕ (порядок, size px|{fr}|"auto", justify, gap, inset) — hud/hudLayout. Виджет
// {kind:"zone", zone:id} швартует СВОЙ экземпляр любой strip-зоны; без виджета зона на борде.
// Миграция борд↔HUD — живьём (applySpec); safe-zone устройства — рычаг движка (setSafeArea).

const stage = { width: "100%", height: "100vh", background: "#2f3d34", touchAction: "none", overflow: "hidden" } as const;
// ——— FlexDocks: флекс-площадка доков (контролы живые) ———

interface FlexArgs {
  handSide: HudSide;
  handSize: "auto" | "fr2";
  reactionsWidth: number;
  gap: number;
  profileJustify: "start" | "center" | "end";
  /** Дальность дока руки от его края (HudDock.inset) — поверх safe-zone. */
  dockInset: number;
  /** Эмуляция safe-zone устройства (рычаг движка scene.setSafeArea / опция safeArea). */
  safeBottom: number;
  safeTop: number;
  safeSide: number;
}

function flexSpec(a: FlexArgs): BoardSpec {
  const { cards, ids } = deck36();
  return {
    id: "hud-flex",
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
        setup: { 0: ids.slice(0, 14) },
      },
      handZone({ setup: { p1: ids.slice(14, 18) } }),
    ],
    seats: { count: { fixed: 1 }, show: "none", swap: false },
    hud: {
      [a.handSide]: {
        widgets: [
          { kind: "zone", zone: "hand", size: a.handSize === "auto" ? "auto" : { fr: 2 } },
          { kind: "placeholder", label: "реакции", size: a.reactionsWidth },
        ],
        gap: a.gap,
        inset: a.dockInset,
      },
      top: { widgets: [{ kind: "placeholder", label: "профиль", size: 180 }], justify: a.profileJustify },
    },
    actions: [],
  };
}

function FlexStage(a: FlexArgs) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // Safe-zone — рычаг ДВИЖКА, не HUD: хост читает поля устройства и кормит опцией/setSafeArea.
    const safeArea = { top: a.safeTop, bottom: a.safeBottom, left: a.safeSide, right: a.safeSide };
    const scene = new BoardScene({ spec: flexSpec(a), seats: 1, safeArea, onCommand: (cmd) => hudAction(cmd) });
    (window as unknown as { __story?: BoardScene }).__story = scene;
    void scene.mount(host, host.clientWidth || 640, host.clientHeight || 480);
    return () => scene.destroy();
  }, [a.handSide, a.handSize, a.reactionsWidth, a.gap, a.profileJustify, a.dockInset, a.safeBottom, a.safeTop, a.safeSide]);
  return <div ref={hostRef} style={stage} />;
}

const meta: Meta<FlexArgs> = {
  title: "Mechanics/Hud",
  parameters: {
    layout: "fullscreen",
    code: () => `import { BoardScene } from "game/boards/scene/scene";
import { handZone } from "game/boards/library/strips";
import type { BoardSpec } from "game/boards/core/spec";

// HUD — доки виджетов по краям экрана; flex-семантика КАК ДАННЫЕ.
// Любая strip-зона швартуется виджетом {kind:"zone", zone:id}; без виджета — на борде.
const spec: BoardSpec = {
  ...myBoard,
  zones: [...myBoard.zones, handZone()], // рука — strip-зона «hand»; мешок — ещё strip-зона

  hud: {
    bottom: { widgets: [
      { kind: "zone", zone: "hand", size: "auto" },         // auto = вся доля свободного
      { kind: "placeholder", label: "реакции", size: 220 }, // px-константа
    ], gap: 10, inset: 12 },                                // дальность дока от края (поверх safe)
    top: { widgets: [{ kind: "placeholder", label: "профиль", size: 180 }], justify: "end" },
  },
};
// Safe-zone устройства — рычаг ДВИЖКА (не HUD): хост читает поля платформы и кормит сцену.
const scene = new BoardScene({ spec, seats: 2, safeArea: { top: 0, bottom: 34, left: 0, right: 0 } });
void scene.mount(host, width, height);
scene.setSafeArea({ top: 47, bottom: 21, left: 0, right: 0 }); // живо: поворот экрана
// Живая миграция: тот же spec с другим hud — жители ПЕРЕЛЕТАЮТ (ноды те же).
scene.applySpec({ ...spec, hud: { right: { widgets: [{ kind: "zone", zone: "hand" }] } } });`,
  },
  args: { handSide: "bottom", handSize: "auto", reactionsWidth: 220, gap: 10, profileJustify: "end", dockInset: 0, safeBottom: 0, safeTop: 0, safeSide: 0 },
  // Панель разделена: свойства HUD-ДОКА (spec.hud) отдельно от РЫЧАГОВ ДВИЖКА (safe-zone сцены).
  argTypes: {
    handSide: { table: { category: "HUD-док" }, description: "край дока руки (реакции едут с ней)", control: { type: "inline-radio" }, options: ["bottom", "top"] },
    handSize: { table: { category: "HUD-док" }, description: "доля руки в доке: auto ({fr:1}) или {fr:2} — вдвое жирнее свободного", control: { type: "inline-radio" }, options: ["auto", "fr2"] },
    reactionsWidth: { table: { category: "HUD-док" }, description: "px-константа виджета «реакции»: рука ужимается, константа держится", control: { type: "range", min: 80, max: 480, step: 20 } },
    gap: { table: { category: "HUD-док" }, description: "зазор между виджетами дока", control: { type: "range", min: 0, max: 40, step: 2 } },
    profileJustify: { table: { category: "HUD-док" }, description: "прижим ряда «профиль» у верхнего края", control: { type: "inline-radio" }, options: ["start", "center", "end"] },
    dockInset: { table: { category: "HUD-док" }, description: "дальность дока от края (HudDock.inset), ПОВЕРХ safe-zone", control: { type: "range", min: 0, max: 64, step: 4 } },
    safeBottom: { table: { category: "Сцена (движок): safe-zone" }, description: "низ (home-индикатор): scene.setSafeArea — у каждого устройства свои поля", control: { type: "range", min: 0, max: 60, step: 4 } },
    safeTop: { table: { category: "Сцена (движок): safe-zone" }, description: "верх (чёлка)", control: { type: "range", min: 0, max: 60, step: 4 } },
    safeSide: { table: { category: "Сцена (движок): safe-zone" }, description: "бока (лендскейп-вырез)", control: { type: "range", min: 0, max: 60, step: 4 } },
  },
  render: (a) => <FlexStage {...a} />,
};
export default meta;
type Story = StoryObj<FlexArgs>;

/**
 * Флекс-площадка доков: рука (auto-доля) + «реакции» (px) внизу, «профиль» сверху. Панель — две
 * категории: HUD-док (данные spec.hud, вкл. dockInset — дальность от края) и Сцена/движок
 * (эмуляция safe-zone: setSafeArea). Дефолты нулевые — док прибит к краю.
 */
export const FlexDocks: Story = {};
/** Гасит контролы меты (FlexArgs) у стори с другим набором args — иначе панель врёт. */
const flexArgsOff = Object.fromEntries(["handSide", "handSize", "reactionsWidth", "gap", "profileJustify", "dockInset", "safeBottom", "safeTop", "safeSide"]
  .map((k) => [k, { table: { disable: true } }]));
// ——— TwoHands: две ленты (рука-карты + мешок-фишки) и живая миграция борд↔HUD ———

const chipDefs: ElementDef[] = Array.from({ length: 8 }, (_, i) => ({ kind: "chip", id: `ch${i + 1}`, denom: 25 * (i + 1) }));
const pouchZone = (setup?: ZoneSpec["setup"]): ZoneSpec =>
  ({ id: "pouch", title: "", layout: { kind: "strip" }, policy: { onOccupied: "merge" }, cell: { w: 48, h: 48 }, flow: "grid", setup });
interface TwoArgs {
  handPin: "hud" | "board";
  pouchPin: "hud-bottom" | "hud-right" | "board";
}

/** hud из пинов двух лент: обе могут делить нижний док, разъехаться по краям или лечь на борду. */
function twoHud(a: TwoArgs): HudSpec | undefined {
  const widgets: HudWidget[] = [];
  if (a.handPin === "hud") widgets.push({ kind: "zone", zone: "hand", size: "auto" });
  if (a.pouchPin === "hud-bottom") widgets.push({ kind: "zone", zone: "pouch", size: 260 });
  const hud: HudSpec = {};
  if (widgets.length) hud.bottom = { widgets };
  if (a.pouchPin === "hud-right") hud.right = { widgets: [{ kind: "zone", zone: "pouch" }] };
  return Object.keys(hud).length ? hud : undefined;
}

function twoSpec(a: TwoArgs): BoardSpec {
  const { cards, ids } = deck36();
  return {
    id: "hud-two-strips",
    title: "",
    elements: [...cards, ...chipDefs],
    zones: [
      {
        id: "board",
        title: "",
        layout: { kind: "free" },
        cell: { w: Math.round(CARD.w * 5.4), h: Math.round(CARD.h * 4) },
        policy: { onOccupied: "merge" },
        drop: { hit: "overlap", maxTilt: 30, magnet: true },
        setup: { 0: ids.slice(0, 12) },
      },
      handZone({ setup: { p1: ids.slice(12, 16) } }),
      pouchZone({ p1: chipDefs.map((c) => c.id) }),
    ],
    seats: { count: { fixed: 1 }, show: "none", swap: false },
    hud: twoHud(a),
    actions: [],
  };
}
function TwoStage(a: TwoArgs) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BoardScene | null>(null);
  const pinsRef = useRef<TwoArgs>(a);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    pinsRef.current = a;
    const scene = new BoardScene({ spec: twoSpec(a), seats: 1, onCommand: (cmd) => hudAction(cmd) });
    sceneRef.current = scene;
    (window as unknown as { __story?: BoardScene }).__story = scene;
    void scene.mount(host, host.clientWidth || 640, host.clientHeight || 480);
    return () => scene.destroy();
  }, [a.handPin, a.pouchPin]);
  // ЖИВАЯ миграция: тот же spec с другим hud через applySpec — сцена НЕ пересоздаётся,
  // ноды те же, жители перелетают борд↔док непрерывно (канон «одна нода на жителя»).
  const move = (patch: Partial<TwoArgs>): void => {
    pinsRef.current = { ...pinsRef.current, ...patch };
    sceneRef.current?.applySpec(twoSpec(pinsRef.current));
  };
  const btn = { padding: "4px 10px", background: "#1f2a22", color: "#d7e3d0", border: "1px solid #50604f", borderRadius: 6, cursor: "pointer", font: "12px monospace" } as const;
  return (
    <div style={{ position: "relative" }}>
      <div ref={hostRef} style={stage} />
      <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 8 }}>
        <button style={btn} data-testid="hand-to-board" onClick={() => move({ handPin: "board" })}>рука → борд</button>
        <button style={btn} data-testid="hand-to-hud" onClick={() => move({ handPin: "hud" })}>рука → HUD</button>
        <button style={btn} data-testid="pouch-to-board" onClick={() => move({ pouchPin: "board" })}>мешок → борд</button>
        <button style={btn} data-testid="pouch-to-hud" onClick={() => move({ pouchPin: "hud-bottom" })}>мешок → HUD</button>
      </div>
    </div>
  );
}

/**
 * ДВЕ ЛЕНТЫ у одного игрока: рука с картами и мешок фишек (другой контент, та же механика).
 * Контролы ставят стартовые пины; кнопки сверху перекидывают зоны борд↔HUD ЖИВЬЁМ (applySpec):
 * жители перелетают, сцена не пересоздаётся.
 */
export const TwoHands: StoryObj<TwoArgs> = {
  args: { handPin: "hud", pouchPin: "hud-bottom" },
  argTypes: {
    handPin: { description: "где стартует рука", control: { type: "inline-radio" }, options: ["hud", "board"] },
    pouchPin: { description: "где стартует мешок фишек", control: { type: "inline-radio" }, options: ["hud-bottom", "hud-right", "board"] },
    ...flexArgsOff,
  } as never,
  render: (a) => <TwoStage {...(a as unknown as TwoArgs)} />,
};
// ——— LiveTwoHands: два экрана над одним портом, у каждого две ленты ———

interface LiveTwoArgs {
  handPin: "hud" | "board";
  handHidden: boolean;
  handAccess: "open" | "request" | "locked";
  handAtSeat: "above" | "below" | "left" | "right";
  pouchPin: "hud" | "board";
}

function liveTwoSpec(a: LiveTwoArgs): BoardSpec {
  const { cards, ids } = deck36();
  return {
    id: "hud-live-two",
    title: "",
    elements: [...cards, ...chipDefs],
    zones: [
      {
        id: "board",
        title: "",
        layout: { kind: "free" },
        cell: { w: Math.round(CARD.w * 5), h: Math.round(CARD.h * 3.8) },
        policy: { onOccupied: "merge" },
        drop: { hit: "overlap", maxTilt: 30, magnet: true },
        setup: { 0: ids.slice(0, 10) },
      },
      // Свойства руки — из контролов: hidden (рубашки/лица), access (open/request/locked;
      // request пока ведёт себя как locked, чужая лента помечена «по запросу»), atSeat.
      { ...handZone({ hidden: a.handHidden, access: a.handAccess, atSeat: a.handAtSeat }),
        setup: { p1: ids.slice(10, 13), p2: ids.slice(13, 16) } },
      // Мешки открыты (access-дефолт: дроп включён): у соседа две зоны владельца.
      pouchZone({ p1: chipDefs.slice(0, 4).map((c) => c.id), p2: chipDefs.slice(4).map((c) => c.id) }),
    ],
    seats: { count: { fixed: 2 }, show: "backs", swap: false },
    hud: hudOfPins(a),
    actions: [],
  };
}

/** hud из пинов: обе ленты могут делить нижний док или жить на борде. */
function hudOfPins(a: LiveTwoArgs): HudSpec | undefined {
  const widgets: HudWidget[] = [];
  if (a.handPin === "hud") widgets.push({ kind: "zone", zone: "hand", size: "auto" });
  if (a.pouchPin === "hud") widgets.push({ kind: "zone", zone: "pouch", size: 240 });
  return widgets.length ? { bottom: { widgets } } : undefined;
}

function LiveTwoStage(a: LiveTwoArgs) {
  return <LiveTwoPane spec={() => liveTwoSpec(a)} deps={[a.handPin, a.handHidden, a.handAccess, a.handAtSeat, a.pouchPin]} onCommand={hudAction} />;
}

/**
 * LIVE: два экрана над ОДНИМ портом, у каждого ДВЕ ленты. Контролы крутят СВОЙСТВА ТВОЕЙ руки —
 * на соседнем экране видно, как она выглядит у него: pin hud → мини-визави (зеркало, atSeat),
 * pin board → полоса ужатой; hidden — рубашки/лица; access — open/request («по запросу»)/locked.
 * Мешок всегда открыт: дроп в мешок соседа работает. Снимок один на всех.
 */
export const LiveTwoHands: StoryObj<LiveTwoArgs> = {
  args: { handPin: "hud", handHidden: true, handAccess: "request", handAtSeat: "below", pouchPin: "board" },
  argTypes: {
    handPin: { description: "где ТВОЯ рука: hud — док у низа (соседу мини-визави); board — полоса на борде (соседу ужатая полоса)", control: { type: "inline-radio" }, options: ["hud", "board"] },
    handHidden: { description: "приватность значений: сосед видит рубашки (true) или лица (false)", control: { type: "boolean" } },
    handAccess: { description: "доступ соседа: open — дроп/взятие включены; request — по запросу (пометка); locked — заперто", control: { type: "inline-radio" }, options: ["open", "request", "locked"] },
    handAtSeat: { description: "где мини-рука живёт у твоего аватара на чужом экране (pin hud)", control: { type: "inline-radio" }, options: ["above", "below", "left", "right"] },
    pouchPin: { description: "где мешок фишек", control: { type: "inline-radio" }, options: ["hud", "board"] },
    ...flexArgsOff,
  } as never,
  render: (a) => <LiveTwoStage {...(a as unknown as LiveTwoArgs)} />,
};
