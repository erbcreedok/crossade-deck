// РЕЗЕРВ КРАЁВ ПОД HUD — чистая формула (без Pixi): сколько каждый край экрана съедает у стола
// (fitZoom вписывает борду в остаток). Единственный источник и для резерва стола, и для угловых
// вычетов лейнов (regions.lane) — иначе две формулы дрейфуют (так умер dockReserved из strip/dock).
// Резерв стартует от safe-полей ВСЕХ краёв (чёлку столом не накрываем, даже без областей там);
// занятый край добавляет глубину самой толстой области + её дальность + дыхание края.

import type { EdgeInsets, HudArea, HudSide, HudSpec } from "../core/hudSpec";
import { pinOf } from "../core/hudSpec";
import { anchorSide } from "../core/hudSpec";
import { chromeOf, sideAreas, type HudEnv } from "./regions";

/** Дыхание края за глубиной области (стиль прежнего SceneHud.reserved: низ дышит хромом). */
const BREATH = { top: 8, bottom: 0, left: 16, right: 16 } as const;

/** Пины с резервом (reserve:true) на данном краю — редкость: пин обычно ПОВЕРХ стола. */
function reservingPins(hud: HudSpec | undefined, side: HudSide): HudArea[] {
  return (hud?.areas ?? []).filter((a) => {
    const p = pinOf(a);
    return p !== null && p.reserve === true && a.widgets.length > 0 && anchorSide(p.anchor) === side;
  });
}

/**
 * ПОЛНОЕ вторжение края от его кромки: safe + живой хром + max(inset + глубина области).
 * Незанятый край (и без reserve-пинов) → 0: пустой угол ничего не режет, лейн соседа тянется
 * до своей safe-границы сам. depth(area) отдаёт сцена (bandDepth дока / глубина заглушки).
 */
export function sideExtent(hud: HudSpec | undefined, side: HudSide, env: HudEnv, depth: (a: HudArea) => number): number {
  const areas = [...sideAreas(hud, side), ...reservingPins(hud, side)];
  if (!areas.length) return 0;
  const deepest = Math.max(...areas.map((a) => (a.inset ?? 0) + depth(a)));
  return env.safe[side] + chromeOf(env, side) + deepest + BREATH[side];
}

/** Резерв краёв под HUD и safe-zone: стол вписывается в остаток. Пины БЕЗ reserve не входят. */
export function hudReserved(hud: HudSpec | undefined, env: HudEnv, depth: (a: HudArea) => number): EdgeInsets {
  const r: EdgeInsets = { top: env.safe.top, bottom: env.safe.bottom, left: env.safe.left, right: env.safe.right };
  for (const side of ["top", "bottom", "left", "right"] as const) {
    const extent = sideExtent(hud, side, env, depth);
    if (extent > 0) r[side] = Math.max(r[side], extent);
  }
  // Низ и верх дышат живым хромом и без областей (полоса действий — не HUD, но стол под неё
  // не лезет); прежде это доклеивал fitBoard — теперь формула резерва ОДНА, сцена берёт как есть.
  r.bottom = Math.max(r.bottom, env.safe.bottom + env.chrome.bottom);
  r.top = Math.max(r.top, env.safe.top + env.chrome.top);
  return r;
}
