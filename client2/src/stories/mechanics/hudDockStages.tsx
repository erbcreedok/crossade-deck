import { useEffect, useRef } from "react";
import { BoardScene } from "../../game/boards/scene/scene";
import { LiveTwoPane } from "./liveStage";
import { deck36 } from "../../game/boards/library/decks";
import { handZone } from "../../game/boards/library/strips";
import { CARD } from "../../game/crossade/tree";
import { pin as pinArea, region, zoneW } from "../../game/boards/core/hudSpec";
import type { BoardSpec, ElementDef, HudArea, HudSpec, HudWidget, ZoneSpec } from "../../game/boards/core/spec";
import { btn, hudAction, stage } from "./hudStages";

// Стейджи доков раздела Mechanics/Hud: две ленты одного игрока, live-вид двух экранов и
// pile-колода с инструментом. Стори (мета, args, панель «Код») — в HudMechanics.stories.tsx.

// ——— TwoHands: две ленты (рука-карты + мешок-фишки) и живая миграция борд↔HUD ———

const chipDefs: ElementDef[] = Array.from({ length: 8 }, (_, i) => ({ kind: "chip", id: `ch${i + 1}`, denom: 25 * (i + 1) }));
const pouchZone = (setup?: ZoneSpec["setup"]): ZoneSpec =>
  ({ id: "pouch", title: "", layout: { kind: "strip" }, policy: { onOccupied: "merge" }, cell: { w: 48, h: 48 }, flow: "grid", setup });

export interface TwoArgs {
  handPin: "hud" | "board";
  pouchPin: "hud-bottom" | "hud-right" | "pin" | "board";
}

/** hud из пинов двух лент: обе могут делить нижний край, разъехаться по краям или лечь на борду. */
function twoHud(a: TwoArgs): HudSpec | undefined {
  const widgets: HudWidget[] = [];
  if (a.handPin === "hud") widgets.push(zoneW("hand", "auto"));
  if (a.pouchPin === "hud-bottom") widgets.push(zoneW("pouch", 260));
  const areas: HudArea[] = [];
  if (widgets.length) areas.push(region("bottom", "start", widgets));
  if (a.pouchPin === "hud-right") areas.push(region("right", "start", [zoneW("pouch")]));
  // Пин: фикс-позиция у якоря, ПОВЕРХ стола (в резерв не входит), offset отодвигает от угла.
  if (a.pouchPin === "pin") areas.push(pinArea("bottom-right", [zoneW("pouch", 220)], { offset: { x: -12, y: -120 } }));
  return areas.length ? { areas } : undefined;
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

export function TwoStage(a: TwoArgs) {
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

// ——— LiveTwoHands: два экрана над одним портом, у каждого две ленты ———

export interface LiveTwoArgs {
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

/** hud из пинов: обе ленты могут делить нижний край или жить на борде. */
function hudOfPins(a: LiveTwoArgs): HudSpec | undefined {
  const widgets: HudWidget[] = [];
  if (a.handPin === "hud") widgets.push(zoneW("hand", "auto"));
  if (a.pouchPin === "hud") widgets.push(zoneW("pouch", 240));
  return widgets.length ? { areas: [region("bottom", "start", widgets)] } : undefined;
}

export function LiveTwoStage(a: LiveTwoArgs) {
  return <LiveTwoPane spec={() => liveTwoSpec(a)} deps={[a.handPin, a.handHidden, a.handAccess, a.handAtSeat, a.pouchPin]} onCommand={hudAction} />;
}

// ——— DeckDock: pile-колода стопкой в HUD + generic widget-инструмент в пине ———

export interface DeckArgs {
  deckPin: "hud" | "board";
}

// ИНСТРУМЕНТ — generic widget-элемент: обычный житель зоны, живёт в пине HUD, тащится на борд
// и обратно той же непрерывной механикой nodesStore, что карты.
const toolDefs: ElementDef[] = [{ kind: "widget", id: "w-vote", label: "ГОЛОС", w: 64, h: 40 }];

function deckSpec(a: DeckArgs): BoardSpec {
  const { cards, ids } = deck36();
  return {
    id: "hud-deck-dock",
    title: "",
    elements: [...cards, ...toolDefs],
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
      // Пояс инструментов — strip-зона из одного widget-жителя, живёт ПИНОМ у правого низа.
      { id: "tools", title: "", layout: { kind: "strip" }, policy: { onOccupied: "merge" }, cell: { w: 72, h: 48 }, hidden: false, setup: { p1: toolDefs.map((t) => t.id) } },
    ],
    seats: { count: { fixed: 1 }, show: "none", swap: false },
    hud: {
      areas: [
        region("bottom", "start", [zoneW("hand", "auto")]),
        ...(a.deckPin === "hud" ? [region("right", "start", [zoneW("deck")])] : []),
        pinArea("bottom-right", [zoneW("tools", 90)], { offset: { x: -8, y: -170 } }),
      ],
    },
    actions: [],
  };
}

export function DeckStage(a: DeckArgs) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BoardScene | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new BoardScene({ spec: deckSpec(a), seats: 1, onCommand: (cmd) => hudAction(cmd) });
    sceneRef.current = scene;
    (window as unknown as { __story?: BoardScene }).__story = scene;
    void scene.mount(host, host.clientWidth || 640, host.clientHeight || 480);
    return () => scene.destroy();
  }, [a.deckPin]);
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
