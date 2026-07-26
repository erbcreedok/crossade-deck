import { flowLayout, flowIndexAt, type FlowGeom } from "../board/dynamicGrid";
import type { Layout, Size, Vec } from "./types";

// Layout-стратегии: вся геометрия группы. Новый «тип контейнера» = новая стратегия здесь, а не класс.

// 1D — стопка/ряд по оси. gap<0 → нахлёст (колода со стаггером), gap>0 → раздельно (ряд).
export function linear(o: { axis?: "x" | "y"; gap?: number } = {}): Layout {
  const axis = o.axis ?? "x";
  const gap = o.gap ?? 0;
  const main = (s: Size) => (axis === "x" ? s.w : s.h);
  const place = (sizes: Size[]): { at: Vec[]; size: Size } => {
    const at: Vec[] = [];
    let cur = 0;
    let cross = 0;
    for (const s of sizes) {
      at.push(axis === "x" ? { x: cur, y: 0 } : { x: 0, y: cur });
      cur += main(s) + gap;
      cross = Math.max(cross, axis === "x" ? s.h : s.w);
    }
    const span = sizes.length ? cur - gap : 0;
    return { at, size: axis === "x" ? { w: span, h: cross } : { w: cross, h: span } };
  };
  return {
    place,
    indexAt(cp, sizes) {
      if (!sizes.length) return 0;
      const at = place(sizes).at;
      const coord = axis === "x" ? cp.x : cp.y;
      let idx = 0;
      for (let i = 0; i < sizes.length; i++) if (coord >= (axis === "x" ? at[i]!.x : at[i]!.y)) idx = i;
      return idx;
    },
  };
}

// 2D — flow-грид (переиспользует flowLayout/flowIndexAt). Ячейка = максимальный ребёнок (грид ровный).
export function grid(o: { minCols?: number; maxRows?: number; gap?: number; reserve?: boolean } = {}): Layout {
  const gap = o.gap ?? 0;
  const cellOf = (sizes: Size[]): Size => (sizes.length ? { w: Math.max(...sizes.map((s) => s.w)), h: Math.max(...sizes.map((s) => s.h)) } : { w: 0, h: 0 });
  const geom = (sizes: Size[]): FlowGeom => ({ cell: cellOf(sizes), gap, origin: { x: 0, y: 0 } });
  const opts = { minCols: o.minCols, maxRows: o.maxRows, reserve: o.reserve };
  return {
    place(sizes) {
      const cell = cellOf(sizes);
      const l = flowLayout(sizes.length, geom(sizes), opts);
      return { at: l.centers.map((c) => ({ x: c.x - cell.w / 2, y: c.y - cell.h / 2 })), size: l.size };
    },
    indexAt(cp, sizes) {
      const l = flowLayout(sizes.length, geom(sizes), opts);
      return flowIndexAt(cp, geom(sizes), l.cols, sizes.length);
    },
  };
}

// Абсолют — дети на фиксированных смещениях (Поле: колода + грид на своих местах). indexAt = хит-тест.
export function absolute(offsets: Vec[]): Layout {
  return {
    place(sizes) {
      const at = sizes.map((_, i) => offsets[i] ?? { x: 0, y: 0 });
      let w = 0;
      let h = 0;
      sizes.forEach((s, i) => {
        w = Math.max(w, at[i]!.x + s.w);
        h = Math.max(h, at[i]!.y + s.h);
      });
      return { at, size: { w, h } };
    },
    indexAt(cp, sizes) {
      for (let i = 0; i < sizes.length; i++) {
        const a = offsets[i] ?? { x: 0, y: 0 };
        const s = sizes[i]!;
        if (cp.x >= a.x && cp.x <= a.x + s.w && cp.y >= a.y && cp.y <= a.y + s.h) return i;
      }
      return null;
    },
  };
}
