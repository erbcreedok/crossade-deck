// РАСКЛАДКА ДОКА HUD — чистый flex-ряд как данные (без Pixi): виджеты делят длину дока по size
// (px-константа | {fr} доля свободного | "auto" = {fr:1}), порядок — порядок массива, прижим
// ряда — justify, зазор — gap. Тот же атомарный подход, что у слот-раскладок: математика отдельно,
// сцена (SceneHud) лишь раздаёт виджетам посчитанные отрезки.
//
// ГДЕ живёт зона, решает HUD: виджет {kind:"zone", zone:id} есть → СВОЙ экземпляр зоны в экранном
// доке; нет — зона на борде. Никакого спецслучая «руки»: любая strip-зона швартуется одинаково.

import type { BoardSpec, HudDock, HudSide, HudSize, HudSpec } from "../core/spec";

export interface HudSpan {
  from: number;
  len: number;
}

const GAP = 10;

const frOf = (s: HudSize | undefined): number => (s === "auto" || s === undefined ? 1 : typeof s === "number" ? 0 : s.fr);
const pxOf = (s: HudSize | undefined): number => (typeof s === "number" ? s : 0);

/** Отрезки виджетов вдоль дока длиной `length`. Доли делят СВОБОДНОЕ (длина минус константы и
 *  зазоры); без долей ряд занимает только константы и прижимается по justify. Переполнение
 *  констант не роняет ряд — доли ужимаются до нуля, ряд остаётся слева. */
export function hudSpans(length: number, dock: HudDock): HudSpan[] {
  const gap = dock.gap ?? GAP;
  const ws = dock.widgets;
  if (!ws.length) return [];
  const fixed = ws.reduce((a, w) => a + pxOf(w.size), 0);
  const frs = ws.reduce((a, w) => a + frOf(w.size), 0);
  const free = Math.max(0, length - fixed - gap * (ws.length - 1));
  const lens = ws.map((w) => pxOf(w.size) + (frs > 0 ? (free * frOf(w.size)) / frs : 0));
  const total = lens.reduce((a, b) => a + b, 0) + gap * (ws.length - 1);
  const lead = dock.justify === "center" ? (length - total) / 2 : dock.justify === "end" ? length - total : 0;
  const between = dock.justify === "between" && ws.length > 1 ? Math.max(0, (length - total) / (ws.length - 1)) : 0;
  let at = Math.max(0, lead);
  return lens.map((len) => {
    const span = { from: at, len };
    at += len + gap + between;
    return span;
  });
}

/** Все непустые доки HUD. */
export function hudDocks(hud: HudSpec | undefined): { side: HudSide; dock: HudDock }[] {
  if (!hud) return [];
  const sides: HudSide[] = ["top", "bottom", "left", "right"];
  return sides.flatMap((side) => (hud[side]?.widgets.length ? [{ side, dock: hud[side]! }] : []));
}

/** Док, в котором пришвартована зона (первый по порядку сторон), и индекс её виджета в нём. */
export function zoneDockAt(hud: HudSpec | undefined, zoneId: string): { side: HudSide; dock: HudDock; index: number } | null {
  for (const { side, dock } of hudDocks(hud)) {
    const index = dock.widgets.findIndex((w) => w.kind === "zone" && w.zone === zoneId);
    if (index >= 0) return { side, dock, index };
  }
  return null;
}

/** id всех зон, пришвартованных в HUD (в порядке сторон и виджетов). */
export function dockedZones(hud: HudSpec | undefined): string[] {
  return hudDocks(hud).flatMap(({ dock }) => dock.widgets.flatMap((w) => (w.kind === "zone" ? [w.zone] : [])));
}

/** Зона живёт НА БОРДЕ? (есть в спеке и нет её виджета в HUD — дерево кладёт её на стол). */
export function zoneOnBoard(spec: Pick<BoardSpec, "zones" | "hud">, zoneId: string): boolean {
  return spec.zones.some((z) => z.id === zoneId) && zoneDockAt(spec.hud, zoneId) === null;
}
