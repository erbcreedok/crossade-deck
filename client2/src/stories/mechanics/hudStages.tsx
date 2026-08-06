import { useEffect, useRef } from "react";
import { action } from "storybook/actions";
import { BoardScene } from "../../game/boards/scene/scene";
import { deck36 } from "../../game/boards/library/decks";
import { handZone } from "../../game/boards/library/strips";
import { CARD } from "../../game/crossade/tree";
import { placeholderW, region, zoneW } from "../../game/boards/core/hudSpec";
import type { BoardSpec, HudSide, HudSlot } from "../../game/boards/core/spec";

// Стейджи раздела Mechanics/Hud (флекс-площадка и площадка регионов). Здесь ЖИВЁТ сцена и
// спеки; сами стори (мета, args, панель «Код») — в HudMechanics.stories.tsx: секция у HUD одна.

export const hudAction = action("dispatch → мок-порт");
export const stage = { width: "100%", height: "100vh", background: "#2f3d34", touchAction: "none", overflow: "hidden" } as const;
export const btn = { padding: "4px 10px", background: "#1f2a22", color: "#d7e3d0", border: "1px solid #50604f", borderRadius: 6, cursor: "pointer", font: "12px monospace" } as const;

// ——— FlexDocks: флекс-площадка доков (контролы живые) ———

export interface FlexArgs {
  handSide: HudSide;
  /** Длина области руки вдоль лейна: auto — доля свободного, число — px-константа (рука
   *  сжимает ряд и оставляет лейн пустым — эффект ВИДЕН, в отличие от прежнего fr2-без-соседа). */
  handSize: "auto" | 320 | 480;
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
      areas: [
        region(a.handSide, "start", [zoneW("hand", a.handSize), placeholderW("реакции", a.reactionsWidth)], { gap: a.gap, inset: a.dockInset }),
        // Прижим — ВЫБОРОМ региона (start/center/end): «профиль» живёт в своём регионе верха,
        // рука на top не перезаписывает его (обе области — элементы одного массива areas).
        region("top", a.profileJustify, [placeholderW("профиль", 180)]),
      ],
    },
    actions: [],
  };
}

export function FlexStage(a: FlexArgs) {
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

// ——— RegionsPlayground: у каждого края три региона (start/center/end), углы по владельцам ———
// Углы принадлежат РОВНО одному краю (corners; дефолт — горизонтали) — перпендикулярные области
// не наплывают ПО ФОРМУЛЕ. Пустой угол отдаёт место соседям сам; bleed — единственная явная
// дверь наплыва. Каждый контрол панели меняет картинку — рычаги видны глазами.

export interface RegionArgs {
  handSlot: HudSlot;
  handWidth: number;
  cornerBottomLeft: "bottom" | "left";
  cornerBottomRight: "bottom" | "right";
  handBleed: boolean;
  gap: number;
  inset: number;
}

function regionsSpec(a: RegionArgs): BoardSpec {
  const { cards, ids } = deck36();
  return {
    id: "hud-regions",
    title: "",
    elements: cards,
    zones: [
      {
        id: "board",
        title: "",
        layout: { kind: "free" },
        cell: { w: Math.round(CARD.w * 4.6), h: Math.round(CARD.h * 3.4) },
        policy: { onOccupied: "merge" },
        drop: { hit: "overlap", only: "card", maxTilt: 30, magnet: true },
        setup: { 0: ids.slice(0, 8) },
      },
      handZone({ setup: { p1: ids.slice(8, 11) } }),
    ],
    seats: { count: { fixed: 1 }, show: "none", swap: false },
    hud: {
      areas: [
        // Верх: три региона одного края — прижим выражается ВЫБОРОМ региона, не полем justify.
        region("top", "start", [placeholderW("меню", 120)]),
        region("top", "center", [placeholderW("статус", 160)]),
        region("top", "end", [placeholderW("профиль", 120)]),
        // Низ: рука в выбранном регионе (px-длина — рычаги slot/width видны) + «реакции» у конца.
        region("bottom", a.handSlot, [zoneW("hand", a.handWidth)], { gap: a.gap, inset: a.inset, ...(a.handBleed ? { bleed: true } : {}) }),
        region("bottom", "end", [placeholderW("реакции", 140)]),
        // Бока: вертикальные области auto-долей — колонка тянется на ВЕСЬ свой лейн, и смена
        // владельца угла видна самим столбиком (дотянулся до низа / уступил).
        region("left", "start", [placeholderW("туллбар", "auto")]),
        region("right", "end", [placeholderW("чат", "auto")]),
      ],
      corners: { "bottom-left": a.cornerBottomLeft, "bottom-right": a.cornerBottomRight },
    },
    actions: [],
  };
}

export function RegionsStage(a: RegionArgs) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new BoardScene({ spec: regionsSpec(a), seats: 1, onCommand: (cmd) => hudAction(cmd) });
    (window as unknown as { __story?: BoardScene }).__story = scene;
    void scene.mount(host, host.clientWidth || 640, host.clientHeight || 480);
    return () => scene.destroy();
  }, [a.handSlot, a.handWidth, a.cornerBottomLeft, a.cornerBottomRight, a.handBleed, a.gap, a.inset]);
  return <div ref={hostRef} style={stage} />;
}
