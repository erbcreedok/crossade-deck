import { useEffect, useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { action } from "storybook/actions";
import { BoardScene } from "../../game/boards/scene/scene";
import { deck36 } from "../../game/boards/library/decks";
import { handZone } from "../../game/boards/library/strips";
import { CARD } from "../../game/crossade/tree";
import { placeholderW, region, zoneW } from "../../game/boards/core/hudSpec";
import type { BoardSpec, HudSide, HudSlot } from "../../game/boards/core/spec";

const regionsAction = action("dispatch → мок-порт");
// РЕГИОНЫ HUD — площадка layout-системы: у каждого края три региона (start/center/end), углы
// принадлежат РОВНО одному краю (corners; дефолт — горизонтали) — перпендикулярные области не
// наплывают ПО ФОРМУЛЕ. Пустой угол отдаёт место соседям сам; bleed — единственная явная дверь
// наплыва. Каждый контрол панели меняет картинку — рычаги видны глазами.

const stage = { width: "100%", height: "100vh", background: "#2f3d34", touchAction: "none", overflow: "hidden" } as const;

interface RegionArgs {
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

function RegionsStage(a: RegionArgs) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new BoardScene({ spec: regionsSpec(a), seats: 1, onCommand: (cmd) => regionsAction(cmd) });
    (window as unknown as { __story?: BoardScene }).__story = scene;
    void scene.mount(host, host.clientWidth || 640, host.clientHeight || 480);
    return () => scene.destroy();
  }, [a.handSlot, a.handWidth, a.cornerBottomLeft, a.cornerBottomRight, a.handBleed, a.gap, a.inset]);
  return <div ref={hostRef} style={stage} />;
}

const meta: Meta<RegionArgs> = {
  title: "Mechanics/Hud Regions",
  parameters: {
    layout: "fullscreen",
    code: () => `import { region, pin, zoneW, placeholderW } from "game/boards/core/hudSpec";

// HUD = список ОБЛАСТЕЙ. Регион = {side, slot: start|center|end}; три региона делят ЛЕЙН края:
// px-константы держатся, {fr}/auto делят свободное ВСЕГО лейна, center клампится между соседями.
hud: {
  areas: [
    region("top", "start",  [placeholderW("меню", 120)]),
    region("top", "center", [placeholderW("статус", 160)]),   // центрирование = выбор региона
    region("top", "end",    [placeholderW("профиль", 120)]),
    region("bottom", "start", [zoneW("hand", "auto")], { gap: 10, inset: 12 }),
    region("left", "start", [placeholderW("туллбар", 150)]),  // вертикальные области — те же данные
  ],
  // УГЛЫ: спорный угол принадлежит РОВНО одному краю (дефолт — горизонтали): наплыв соседних
  // областей НЕВОЗМОЖЕН по формуле. Пустой угол отдаёт место сам. bleed: true — явная дверь.
  corners: { "bottom-left": "left" }, // отдать угол левой колонке — низ уступит
}`,
  },
  args: { handSlot: "start", handWidth: 300, cornerBottomLeft: "bottom", cornerBottomRight: "bottom", handBleed: false, gap: 10, inset: 0 },
  argTypes: {
    handSlot: { table: { category: "Область руки" }, description: "регион низа: прижим — выбором региона (start/center/end)", control: { type: "inline-radio" }, options: ["start", "center", "end"] },
    handWidth: { table: { category: "Область руки" }, description: "px-длина области руки (константа держится, лейн пустеет)", control: { type: "range", min: 180, max: 520, step: 20 } },
    handBleed: { table: { category: "Область руки" }, description: "ЯВНЫЙ наплыв: рука ложится по НЕурезанному лейну (игнорирует угловые вычеты)", control: { type: "boolean" } },
    gap: { table: { category: "Область руки" }, description: "зазор виджетов области", control: { type: "range", min: 0, max: 40, step: 2 } },
    inset: { table: { category: "Область руки" }, description: "дальность области от края (поверх safe-zone)", control: { type: "range", min: 0, max: 64, step: 4 } },
    cornerBottomLeft: { table: { category: "Углы (corners)" }, description: "владелец нижне-левого угла: bottom — низ во всю ширину; left — колонка до низа, рука уступает", control: { type: "inline-radio" }, options: ["bottom", "left"] },
    cornerBottomRight: { table: { category: "Углы (corners)" }, description: "владелец нижне-правого угла", control: { type: "inline-radio" }, options: ["bottom", "right"] },
  },
  render: (a) => <RegionsStage {...a} />,
};
export default meta;

/**
 * ПЛОЩАДКА РЕГИОНОВ: восемь областей по краям (три региона верха, рука+реакции внизу, колонки по
 * бокам). Углы — по владельцам (панель «Углы»): переключи bottom-left на left — колонка дотянется
 * до низа, а рука подвинется; bleed вернёт её на полный лейн (явный наплыв). Наплывов по умолчанию
 * НЕТ — это формула лейна, не дисциплина.
 */
export const RegionsPlayground: StoryObj<RegionArgs> = {};
