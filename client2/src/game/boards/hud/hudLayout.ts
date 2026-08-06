// РАСКЛАДКА HUD — чистая математика областей (без Pixi): регионы краёв делят ЛЕЙН своего края
// (regions.lane — углы по владельцам, наплывов нет по формуле), пины считаются от якоря. Выход
// один — AreaFrame на каждую область: край, отрезки виджетов в экранных координатах вдоль края,
// edge (дальность ленты от своего края). Сцена (SceneHud) лишь раздаёт готовые рамки докам.
//
// Флекс-ядро: size виджета = px-константа | {fr} доля | "auto" (= {fr:1}); доли делят СВОБОДНОЕ
// лейна (после констант и зазоров ВСЕХ регионов края — {fr:2} внизу слева и {fr:1} внизу справа
// относятся друг к другу как 2:1). Прижим — выбором региона: start/center/end; center-блок
// центрируется по лейну и КЛАМПИТСЯ между соседями; переполнение ужимает доли до нуля и
// прижимает блоки без наплыва друг на друга.
//
// ГДЕ живёт зона, решает HUD: есть виджет {kind:"zone"} в какой-то области → свой экземпляр
// зоны на экране; нет — зона на борде (zoneOnBoard). Никакого спецслучая «руки».

import type { BoardSpec, HudArea, HudSide, HudSize, HudSlot, HudSpec, HudWidget } from "../core/spec";
import { anchorSide, pinOf, regionOf } from "../core/hudSpec";
import { lane, type HudEnv } from "./regions";
import { sideExtent } from "./reserve";

export interface HudSpan {
  from: number;
  len: number;
}

/** Рамка области — всё, что нужно сцене, чтобы пришвартовать её виджеты. */
export interface AreaFrame {
  area: HudArea;
  /** Индекс области в hud.areas — стабильный ключ для заглушек/подписей. */
  areaIndex: number;
  /** Край ленты (у пина — ближайший край якоря). */
  side: HudSide;
  /** Пин? (поверх стола, вне резерва, хром его не двигает). */
  pinned: boolean;
  /** Отрезки виджетов В ЭКРАННЫХ координатах вдоль края (по одному на area.widgets[i]). */
  widgets: HudSpan[];
  /** Дальность ленты от СВОЕГО края: safe + inset (пин — из якоря и offset). */
  edge: number;
}

const GAP = 10;
/** Длина виджета пина без px-размера (у пина нет лейна — доли не работают, validate ругается). */
export const PIN_DEFAULT_SPAN = 96;

const frOf = (s: HudSize | undefined): number => (s === "auto" || s === undefined ? 1 : typeof s === "number" ? 0 : s.fr);
const pxOf = (s: HudSize | undefined): number => (typeof s === "number" ? s : 0);

/** Флекс-ряд ОДНОЙ области: отрезки виджетов от нуля; свободное для долей приходит извне
 *  (лейн края или 0 у пина). perFr — цена одной доли. */
function areaSpans(area: HudArea, perFr: number, fallback = 0): HudSpan[] {
  const gap = area.gap ?? GAP;
  let at = 0;
  return area.widgets.map((w) => {
    const len = pxOf(w.size) + perFr * frOf(w.size) + (perFr === 0 && pxOf(w.size) === 0 ? fallback : 0);
    const span = { from: at, len };
    at += len + gap;
    return span;
  });
}

/** Длина области при данной цене доли (сумма виджетов + внутренние зазоры). */
function areaLen(area: HudArea, perFr: number, fallback = 0): number {
  const spans = areaSpans(area, perFr, fallback);
  return spans.length ? spans[spans.length - 1]!.from + spans[spans.length - 1]!.len : 0;
}

interface Block {
  slot: HudSlot;
  items: { areaIndex: number; area: HudArea }[];
}

/** Region-области края по блокам start/center/end (внутри блока — порядок массива areas). */
function sideBlocks(hud: HudSpec, side: HudSide, bleed: boolean): Block[] {
  const slots: HudSlot[] = ["start", "center", "end"];
  return slots.map((slot) => ({
    slot,
    items: hud.areas
      .map((area, areaIndex) => ({ area, areaIndex }))
      .filter(({ area }) => {
        const r = regionOf(area);
        return r?.side === side && r.slot === slot && area.widgets.length > 0 && (area.bleed ?? false) === bleed;
      }),
  }));
}

/** Длина блока: области подряд с зазором GAP между ними. */
function blockLen(b: Block, perFr: number): number {
  const lens = b.items.map(({ area }) => areaLen(area, perFr));
  return lens.reduce((a, l) => a + l, 0) + GAP * Math.max(0, b.items.length - 1);
}

/** Цена одной fr-доли: свободное лейна делится на сумму долей всех областей края. */
function frPrice(blocks: Block[], laneLen: number): number {
  const areas = blocks.flatMap((b) => b.items.map((i) => i.area));
  const frs = areas.reduce((a, ar) => a + ar.widgets.reduce((s, w) => s + frOf(w.size), 0), 0);
  if (frs === 0) return 0;
  const fixed = areas.reduce((a, ar) => a + areaLen(ar, 0), 0) + GAP * Math.max(0, areas.length - 1);
  return Math.max(0, laneLen - fixed) / frs;
}

/** Разложить блоки лейна: start к началу, end к концу, center по центру с клампом между ними.
 *  Возвращает from каждого блока (в координатах лейна от нуля). Наплывов блоков нет. */
export function laneBlocks(lens: { start: number; center: number; end: number }, laneLen: number): { start: number; center: number; end: number } {
  const start = 0;
  const end = Math.max(lens.start + (lens.start && lens.end ? GAP : 0), laneLen - lens.end);
  let center = (laneLen - lens.center) / 2;
  const lo = lens.start ? lens.start + GAP : 0;
  const hi = (lens.end ? end - GAP : Math.max(laneLen, end)) - lens.center;
  center = Math.min(Math.max(center, lo), Math.max(lo, hi));
  return { start, center, end };
}

/** Рамки region-областей одного края (cut-лейн для обычных, полный — для bleed). */
function sideFrames(hud: HudSpec, side: HudSide, env: HudEnv, depth: (a: HudArea) => number): AreaFrame[] {
  const extent = (s: HudSide): number => sideExtent(hud, s, env, depth);
  const out: AreaFrame[] = [];
  for (const bleed of [false, true]) {
    const blocks = sideBlocks(hud, side, bleed);
    if (!blocks.some((b) => b.items.length)) continue;
    const l = lane(hud, side, env, extent, bleed);
    const laneLen = l.to - l.from;
    const perFr = frPrice(blocks, laneLen);
    const lens = {
      start: blockLen(blocks[0]!, perFr),
      center: blockLen(blocks[1]!, perFr),
      end: blockLen(blocks[2]!, perFr),
    };
    const at = laneBlocks(lens, laneLen);
    for (const b of blocks) {
      let cursor = l.from + at[b.slot];
      for (const { area, areaIndex } of b.items) {
        const spans = areaSpans(area, perFr).map((s) => ({ from: cursor + s.from, len: s.len }));
        out.push({ area, areaIndex, side, pinned: false, widgets: spans, edge: env.safe[side] + (area.inset ?? 0) });
        cursor += areaLen(area, perFr) + GAP;
      }
    }
  }
  return out;
}

/** Рамка пина: лента у ближайшего края якоря, мини-флекс растёт ОТ якоря внутрь экрана. */
function pinFrame(area: HudArea, areaIndex: number, env: HudEnv): AreaFrame {
  const p = pinOf(area)!;
  const side = anchorSide(p.anchor);
  const horizontal = side === "top" || side === "bottom";
  const off = p.offset ?? { x: 0, y: 0 };
  const spans = areaSpans(area, 0, PIN_DEFAULT_SPAN);
  const len = areaLen(area, 0, PIN_DEFAULT_SPAN);
  // Main-точка якоря на safe-прямоугольнике + offset по main-оси.
  const a = p.anchor;
  const mainSize = horizontal ? env.w : env.h;
  const safeLo = horizontal ? env.safe.left : env.safe.top;
  const safeHi = horizontal ? env.safe.right : env.safe.bottom;
  const grow: "start" | "center" | "end" = a === "center" || a.endsWith("-center") || a.endsWith("-middle") ? "center" : (horizontal ? a.endsWith("-left") : a.startsWith("top")) ? "start" : "end";
  const m0 = (grow === "start" ? safeLo : grow === "end" ? mainSize - safeHi : mainSize / 2) + (horizontal ? off.x : off.y);
  const from = grow === "start" ? m0 : grow === "end" ? m0 - len : m0 - len / 2;
  // Edge — дальность ленты от СВОЕГО края: safe + inset, offset по cross-оси отодвигает внутрь.
  const crossOff = horizontal ? off.y : off.x;
  const inward = side === "bottom" || side === "right" ? -crossOff : crossOff;
  const base = a === "center" ? (horizontal ? env.h : env.w) / 2 : env.safe[side];
  return {
    area,
    areaIndex,
    side,
    pinned: true,
    widgets: spans.map((s) => ({ from: from + s.from, len: s.len })),
    edge: Math.max(0, base + (area.inset ?? 0) + inward),
  };
}

/** ВСЕ рамки областей HUD: регионы четырёх краёв + пины. Порядок — стороны, затем пины. */
export function areaFrames(hud: HudSpec | undefined, env: HudEnv, depth: (a: HudArea) => number): AreaFrame[] {
  if (!hud) return [];
  const sides: HudSide[] = ["top", "bottom", "left", "right"];
  const frames = sides.flatMap((side) => sideFrames(hud, side, env, depth));
  hud.areas.forEach((area, areaIndex) => {
    if (pinOf(area) && area.widgets.length > 0) frames.push(pinFrame(area, areaIndex, env));
  });
  return frames;
}

/** Область, в которой пришвартована зона (первая по порядку areas), и индекс её виджета. */
export function zoneDockAt(hud: HudSpec | undefined, zoneId: string): { area: HudArea; areaIndex: number; index: number } | null {
  for (const [areaIndex, area] of (hud?.areas ?? []).entries()) {
    const index = area.widgets.findIndex((w) => w.kind === "zone" && w.zone === zoneId);
    if (index >= 0) return { area, areaIndex, index };
  }
  return null;
}

/** id всех зон, пришвартованных в HUD (в порядке областей и виджетов). */
export function dockedZones(hud: HudSpec | undefined): string[] {
  return (hud?.areas ?? []).flatMap((a) => a.widgets.flatMap((w) => (w.kind === "zone" ? [w.zone] : [])));
}

/** Зона живёт НА БОРДЕ? (есть в спеке и нет её виджета в HUD — дерево кладёт её на стол). */
export function zoneOnBoard(spec: Pick<BoardSpec, "zones" | "hud">, zoneId: string): boolean {
  return spec.zones.some((z) => z.id === zoneId) && zoneDockAt(spec.hud, zoneId) === null;
}
