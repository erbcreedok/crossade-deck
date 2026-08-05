// РАСКЛАДКА ДОКА HUD — чистый flex-ряд как данные (без Pixi): виджеты делят длину дока по size
// (px-константа | {fr} доля свободного | "auto" = {fr:1}), порядок — порядок массива, прижим
// ряда — justify, зазор — gap. Тот же атомарный подход, что у слот-раскладок: математика отдельно,
// сцена (SceneHud) лишь раздаёт виджетам посчитанные отрезки.

import type { HudDock, HudSide, HudSize, HudSpec, HudWidget } from "../core/spec";

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

/** Док, в котором живёт виджет kind (первый по порядку сторон), и индекс виджета в нём. */
export function hudWidgetAt(hud: HudSpec | undefined, kind: HudWidget["kind"]): { side: HudSide; dock: HudDock; index: number } | null {
  for (const { side, dock } of hudDocks(hud)) {
    const index = dock.widgets.findIndex((w) => w.kind === kind);
    if (index >= 0) return { side, dock, index };
  }
  return null;
}

/** Рука живёт ЗОНОЙ НА БОРДЕ? (нет hand-виджета в HUD — дерево кладёт её вниз борды). */
export function handOnBoard(spec: { hand?: unknown; hud?: HudSpec }): boolean {
  return !!spec.hand && hudWidgetAt(spec.hud, "hand") === null;
}
