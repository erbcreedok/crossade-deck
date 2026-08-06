// РЕГИОНЫ HUD — чистая математика лейнов и углов (без Pixi). Лейн — отрезок main-оси края,
// в котором живут все region-области этого края. Ключевой канон: наплывы соседних краёв
// НЕВОЗМОЖНЫ ПО ФОРМУЛЕ — угол принадлежит ровно одному краю (corners, дефолт — горизонтали),
// лейн проигравшего края укорачивается на ПОЛНОЕ вторжение победителя (extent). Пустой угол
// (сосед без областей) не режет ничего — лейн сам тянется до safe-границы («пустой угол отдаёт
// место»). Явный area.bleed раскладывает область по НЕурезанному лейну — единственная дверь.

import type { EdgeInsets, HudArea, HudCorner, HudSide, HudSpec } from "../core/hudSpec";
import { regionOf } from "../core/hudSpec";

/** Окружение раскладки: экран, safe-zone сцены и ЖИВЫЕ полосы хрома (0 без кнопок). */
export interface HudEnv {
  w: number;
  h: number;
  safe: EdgeInsets;
  chrome: { top: number; bottom: number };
}

/** Region-области края в порядке массива areas (пины краю не принадлежат). */
export function sideAreas(hud: HudSpec | undefined, side: HudSide): HudArea[] {
  return (hud?.areas ?? []).filter((a) => regionOf(a)?.side === side && a.widgets.length > 0);
}

/** Край занят? (есть хоть одна непустая region-область). */
export function sideBusy(hud: HudSpec | undefined, side: HudSide): boolean {
  return sideAreas(hud, side).length > 0;
}

const CORNER_SIDES: Record<HudCorner, { h: HudSide; v: HudSide }> = {
  "top-left": { h: "top", v: "left" },
  "top-right": { h: "top", v: "right" },
  "bottom-left": { h: "bottom", v: "left" },
  "bottom-right": { h: "bottom", v: "right" },
};

/** Владелец угла: угол оспаривается, только когда ОБА смежных края заняты; тогда — из corners
 *  спеки, дефолт — ГОРИЗОНТАЛЬНЫЙ край. Никто не спорит → null (угол свободен, вычетов нет). */
export function cornerOwner(hud: HudSpec | undefined, corner: HudCorner): HudSide | null {
  const { h, v } = CORNER_SIDES[corner];
  if (!sideBusy(hud, h) || !sideBusy(hud, v)) return null;
  return hud?.corners?.[corner] ?? h;
}

/** Полоса хрома своего края (кнопки внизу, инструменты сверху); у вертикалей её нет. */
export function chromeOf(env: HudEnv, side: HudSide): number {
  return side === "top" ? env.chrome.top : side === "bottom" ? env.chrome.bottom : 0;
}

const corners = (side: HudSide): [HudCorner, HudCorner] => {
  if (side === "top") return ["top-left", "top-right"];
  if (side === "bottom") return ["bottom-left", "bottom-right"];
  return side === "left" ? ["top-left", "bottom-left"] : ["top-right", "bottom-right"];
};

/**
 * Лейн края: main-отрезок в экранных координатах. База — safe-поля (и живой хром у вертикалей);
 * спорный угол чужого владельца срезает лейн на extent(перпендикулярного края) — полное вторжение
 * соседа от его кромки. uncut=true (bleed-область) — вычеты углов игнорируются.
 */
export function lane(
  hud: HudSpec | undefined,
  side: HudSide,
  env: HudEnv,
  extent: (side: HudSide) => number,
  uncut = false,
): { from: number; to: number } {
  const horizontal = side === "top" || side === "bottom";
  let from = horizontal ? env.safe.left : env.safe.top + env.chrome.top;
  let to = horizontal ? env.w - env.safe.right : env.h - env.safe.bottom - env.chrome.bottom;
  if (!uncut) {
    const [c0, c1] = corners(side);
    const cut = (corner: HudCorner): number => {
      const owner = cornerOwner(hud, corner);
      if (owner === null || owner === side) return 0;
      const { h, v } = CORNER_SIDES[corner];
      return extent(side === h ? v : h);
    };
    from = Math.max(from, cut(c0));
    to = Math.min(to, horizontal ? env.w - cut(c1) : env.h - cut(c1));
  }
  return { from, to: Math.max(from, to) };
}
