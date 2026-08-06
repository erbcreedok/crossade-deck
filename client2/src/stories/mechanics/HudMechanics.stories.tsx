import { useEffect, useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { action } from "storybook/actions";
import { BoardScene } from "../../game/boards/scene/scene";
import { localDriver } from "../../game/boards/core/driver";
import { deck36 } from "../../game/boards/library/decks";
import { handZone } from "../../game/boards/library/strips";
import { CARD } from "../../game/crossade/tree";
import type { BoardSpec, ElementDef, HudSide, HudSpec, ZoneSpec } from "../../game/boards/core/spec";

const hudAction = action("dispatch → мок-порт");

// HUD — раздел «Механики»: экранный слой виджетов (мобильное удобство) ПОВЕРХ борды. Доки по
// краям, в каждом РЯД виджетов с flex-семантикой КАК ДАННЫМИ (порядок массива, size: px | {fr} |
// "auto", justify, gap) — считает чистый hud/hudLayout. Виджет {kind:"zone", zone:id} швартует
// СВОЙ экземпляр ЛЮБОЙ strip-зоны (рука, мешок фишек…); без виджета зона живёт на борде. Лент
// сколько угодно, каждая со своими свойствами; перекинуть зону борд↔HUD можно ЖИВЬЁМ
// (scene.applySpec с новым hud) — ноды те же, жители перелетают, не телепортируются.

const stage = { width: "100%", height: "100vh", background: "#2f3d34", touchAction: "none", overflow: "hidden" } as const;

// ——— FlexDocks: флекс-площадка доков (контролы живые) ———

interface FlexArgs {
  handSide: HudSide;
  handSize: "auto" | "fr2";
  reactionsWidth: number;
  gap: number;
  profileJustify: "start" | "center" | "end";
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
    const scene = new BoardScene({ spec: flexSpec(a), seats: 1, onCommand: (cmd) => hudAction(cmd) });
    (window as unknown as { __story?: BoardScene }).__story = scene;
    void scene.mount(host, host.clientWidth || 640, host.clientHeight || 480);
    return () => scene.destroy();
  }, [a.handSide, a.handSize, a.reactionsWidth, a.gap, a.profileJustify]);
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
  zones: [
    ...myBoard.zones,
    handZone(),                                       // рука — strip-зона «hand»
    { id: "pouch", title: "", layout: { kind: "strip" }, // мешок фишек — ещё лента
      policy: { onOccupied: "merge" }, cell: { w: 48, h: 48 }, flow: "grid" },
  ],
  hud: {
    bottom: {
      widgets: [
        { kind: "zone", zone: "hand", size: "auto" },      // auto = вся доля свободного
        { kind: "placeholder", label: "реакции", size: 220 }, // px-константа
      ],
      gap: 10,
    },
    right: { widgets: [{ kind: "zone", zone: "pouch" }] },  // мешок — колонкой справа
    top: { widgets: [{ kind: "placeholder", label: "профиль", size: 180 }], justify: "end" },
  },
};
const scene = new BoardScene({ spec, seats: 2 });
void scene.mount(host, width, height);
// Живая миграция: тот же spec с другим hud — жители ПЕРЕЛЕТАЮТ (ноды те же).
scene.applySpec({ ...spec, hud: { right: { widgets: [{ kind: "zone", zone: "hand" }] } } });`,
  },
  args: { handSide: "bottom", handSize: "auto", reactionsWidth: 220, gap: 10, profileJustify: "end" },
  argTypes: {
    handSide: { description: "край дока руки (реакции едут с ней)", control: { type: "inline-radio" }, options: ["bottom", "top"] },
    handSize: { description: "доля руки в доке: auto ({fr:1}) или {fr:2} — вдвое жирнее свободного", control: { type: "inline-radio" }, options: ["auto", "fr2"] },
    reactionsWidth: { description: "px-константа виджета «реакции»: рука ужимается, константа держится", control: { type: "range", min: 80, max: 480, step: 20 } },
    gap: { description: "зазор между виджетами дока", control: { type: "range", min: 0, max: 40, step: 2 } },
    profileJustify: { description: "прижим ряда «профиль» у верхнего края", control: { type: "inline-radio" }, options: ["start", "center", "end"] },
  },
  render: (a) => <FlexStage {...a} />,
};
export default meta;

type Story = StoryObj<FlexArgs>;

/**
 * Флекс-площадка доков: рука (auto-доля) делит нижний док с «реакциями» (px-константа), «профиль»
 * прижат у верхнего края. Крутите контролы: край, доли, ширину константы, gap, justify — отрезки
 * считает чистый hud/hudLayout, стол вписывается в остаток экрана.
 */
export const FlexDocks: Story = {};

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
  const bottom: HudSpec["bottom"] = { widgets: [] };
  if (a.handPin === "hud") bottom.widgets = [...bottom.widgets, { kind: "zone", zone: "hand", size: "auto" }];
  if (a.pouchPin === "hud-bottom") bottom.widgets = [...bottom.widgets, { kind: "zone", zone: "pouch", size: 260 }];
  const hud: HudSpec = {};
  if (bottom.widgets.length) hud.bottom = bottom;
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
 * ДВЕ ЛЕНТЫ у одного игрока: рука с картами и мешок фишек (чипсы — другой контент, та же
 * механика ленты). Контролы ставят стартовые пины; кнопки сверху перекидывают зоны борд↔HUD
 * ЖИВЬЁМ (applySpec): жители перелетают, сцена не пересоздаётся. Обе могут делить нижний док,
 * разъехаться по краям или обе лечь на борду полосами.
 */
export const TwoHands: StoryObj<TwoArgs> = {
  args: { handPin: "hud", pouchPin: "hud-bottom" },
  argTypes: {
    handPin: { description: "где стартует рука", control: { type: "inline-radio" }, options: ["hud", "board"] },
    pouchPin: { description: "где стартует мешок фишек", control: { type: "inline-radio" }, options: ["hud-bottom", "hud-right", "board"] },
    handSide: { table: { disable: true } },
    handSize: { table: { disable: true } },
    reactionsWidth: { table: { disable: true } },
    gap: { table: { disable: true } },
    profileJustify: { table: { disable: true } },
  } as never,
  render: (a) => <TwoStage {...(a as unknown as TwoArgs)} />,
};

// ——— LiveTwoHands: два экрана над одним портом, у каждого две ленты ———

function liveTwoSpec(): BoardSpec {
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
      handZone({ setup: { p1: ids.slice(10, 13), p2: ids.slice(13, 16) } }),
      // Мешки открыты (фишкам нечего прятать) и живут на борде: у соседа видно ДВЕ его зоны.
      pouchZone({ p1: chipDefs.slice(0, 4).map((c) => c.id), p2: chipDefs.slice(4).map((c) => c.id) }),
    ],
    seats: { count: { fixed: 2 }, show: "backs", swap: false },
    hud: { bottom: { widgets: [{ kind: "zone", zone: "hand" }] } },
    actions: [],
  };
}

function LiveTwoStage() {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;
    const spec = liveTwoSpec();
    const driver = localDriver(spec, 2); // ОДИН порт на оба экрана
    const s1 = new BoardScene({ spec, driver, selfSeat: "p1", seats: 2, onCommand: (cmd) => hudAction(cmd) });
    const s2 = new BoardScene({ spec, driver, selfSeat: "p2", seats: 2 });
    (window as unknown as { __stories?: BoardScene[] }).__stories = [s1, s2];
    const w = () => Math.max(320, (left.parentElement?.clientWidth ?? 1280) / 2 - 2);
    void Promise.all([s1.mount(left, w(), left.clientHeight || 720), s2.mount(right, w(), right.clientHeight || 720)]);
    return () => [s1, s2].forEach((s) => s.destroy());
  }, []);
  const pane = { width: "50%", height: "100vh", touchAction: "none", overflow: "hidden" } as const;
  return (
    <div style={{ display: "flex", gap: 2, background: "#20291f" }}>
      <div ref={leftRef} style={{ ...pane, background: "#2f3d34" }} />
      <div ref={rightRef} style={{ ...pane, background: "#2c3a36" }} />
    </div>
  );
}

/**
 * LIVE: два экрана над ОДНИМ портом. У каждого игрока ДВЕ ленты: рука в HUD (карты, приватная —
 * соседу рубашки) и мешок фишек на борде (открытый). Для других обе выглядят двумя отдельными
 * зонами у места владельца. Тащите на любом экране — снимок один на всех.
 */
export const LiveTwoHands: StoryObj = { render: () => <LiveTwoStage />, parameters: { controls: { disable: true } } };
