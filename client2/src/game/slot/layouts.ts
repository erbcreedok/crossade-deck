import { flowLayout, flowIndexAt, type FlowGeom, type GridSpec } from "../slotfield/dynamicGrid";
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
      // Индекс ВСТАВКИ [0, N]: до центра карты i → перед ней; за всеми центрами → в КОНЕЦ (append).
      let idx = sizes.length;
      for (let i = sizes.length - 1; i >= 0; i--) {
        const center = (axis === "x" ? at[i]!.x : at[i]!.y) + (axis === "x" ? sizes[i]!.w : sizes[i]!.h) / 2;
        if (coord < center) idx = i;
      }
      return idx;
    },
  };
}

// 2D — flow-грид (переиспользует flowLayout/flowIndexAt). Ячейка = максимальный ребёнок (грид ровный).
// Границы cols/rows (min/max) и reserve можно задать числом ИЛИ геттером — тогда параметр ЖИВОЙ
// (контроллер меняет его на лету, раскладка перечитывает без пересоздания стратегии).
type Num = number | (() => number | undefined);
type Bool = boolean | (() => boolean);
const rNum = (n?: Num): number | undefined => (typeof n === "function" ? n() : n);
const rBool = (b?: Bool): boolean | undefined => (typeof b === "function" ? b() : b);

export function grid(o: { cell?: Size | (() => Size); cols?: { min?: Num; max?: Num }; rows?: { min?: Num; max?: Num }; grow?: GridSpec["grow"]; gap?: number; reserve?: Bool; center?: Bool } = {}): Layout {
  const gap = o.gap ?? 0;
  // Размер ячейки: ЯВНЫЙ (если задан) — тогда пустой грид тоже знает габарит и резервирует colsMin×rowsMin;
  // иначе выводим из детей (макс. ребёнок). Явный нужен там, где грид пустеет, но должен держать место.
  const cellOf = (sizes: Size[]): Size => {
    const ex = typeof o.cell === "function" ? o.cell() : o.cell;
    if (ex) return ex;
    return sizes.length ? { w: Math.max(...sizes.map((s) => s.w)), h: Math.max(...sizes.map((s) => s.h)) } : { w: 0, h: 0 };
  };
  const geom = (sizes: Size[]): FlowGeom => ({ cell: cellOf(sizes), gap, origin: { x: 0, y: 0 } });
  const spec = (): GridSpec => ({ cols: { min: rNum(o.cols?.min), max: rNum(o.cols?.max) }, rows: { min: rNum(o.rows?.min), max: rNum(o.rows?.max) }, grow: o.grow, reserve: rBool(o.reserve), center: rBool(o.center) });
  return {
    place(sizes) {
      const cell = cellOf(sizes);
      const l = flowLayout(sizes.length, geom(sizes), spec());
      return { at: l.centers.map((c) => ({ x: c.x - cell.w / 2, y: c.y - cell.h / 2 })), size: l.size };
    },
    indexAt(cp, sizes) {
      const l = flowLayout(sizes.length, geom(sizes), spec());
      return flowIndexAt(cp, geom(sizes), l.cols, l.rows, sizes.length);
    },
  };
}

// РАДИУС — жители по окружности РОВНОГО круга (не овала), первый — «на севере», дальше по часовой.
// Радиус живой: растёт с числом ПОЗИЦИЙ так, чтобы соседние центры отстояли на большую сторону
// карты + gap (хорда 2R·sin(π/n) ≥ reach; ширины мало — вертикальные соседи наезжали бы).
// `slots` — МИНИМУМ позиций круга (место каждому игроку): жителей меньше — круг всё равно размечен
// на slots позиций, карты занимают первые по часовой, остальные позиции пустуют (их рисует борда).
// `max` — ПОТОЛОК: дальше круг не растёт, лишние жители ужимаются по нему плотнее (см. ниже).
// Одна позиция — в центре (R=0). indexAt — индекс ВСТАВКИ по углу точки, зажатый в [0..n].

/** Центры count позиций круга (top-left ячеек) + габарит. Общая математика раскладки radial и
 *  отрисовки пустых позиций-заготовок (boardTree) — одна формула, а не две расползающиеся.
 *  `max` — ПОТОЛОК числа позиций, которое держит РАДИУС: до него круг растёт с жителями, дальше
 *  стоит на месте, а лишние ужимаются по нему плотнее (угловой шаг делится на всех, карты уходят в
 *  нахлёст веером). Потолок меньше двух — не потолок, а точка: такое значение игнорируется. */
export function radialPositions(count: number, cell: Size, gap = 0, max = 0): { at: Vec[]; size: Size } {
  const n = Math.max(1, count);
  const reach = Math.max(cell.w, cell.h) + gap;
  const spread = max >= 2 ? Math.min(n, max) : n; // сколько позиций задаёт радиус
  const r = spread < 2 ? 0 : reach / (2 * Math.sin(Math.PI / spread));
  const c = { x: r + cell.w / 2, y: r + cell.h / 2 };
  const at = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return { x: c.x + r * Math.cos(a) - cell.w / 2, y: c.y + r * Math.sin(a) - cell.h / 2 };
  });
  return { at, size: { w: r * 2 + cell.w, h: r * 2 + cell.h } };
}

export function radial(o: { cell?: Size; gap?: number; slots?: number; max?: number } = {}): Layout {
  const gap = o.gap ?? 0;
  const max = o.max ?? 0;
  const cellOf = (sizes: Size[]): Size => {
    if (sizes.length) return { w: Math.max(...sizes.map((s) => s.w)), h: Math.max(...sizes.map((s) => s.h)) };
    return o.cell ? { ...o.cell } : { w: 0, h: 0 };
  };
  const countOf = (sizes: Size[]): number => Math.max(sizes.length, o.slots ?? 0);
  const place = (sizes: Size[]): { at: Vec[]; size: Size } => {
    const count = countOf(sizes);
    if (!count || (!sizes.length && !o.cell && !o.slots)) return { at: [], size: cellOf(sizes) };
    const pos = radialPositions(count, cellOf(sizes), gap, max);
    return { at: pos.at.slice(0, sizes.length), size: pos.size };
  };
  return {
    place,
    indexAt(cp, sizes) {
      const n = sizes.length;
      if (!n) return 0;
      const count = countOf(sizes);
      const { size } = radialPositions(count, cellOf(sizes), gap, max);
      const a = Math.atan2(cp.y - size.h / 2, cp.x - size.w / 2);
      const t = (a + Math.PI / 2) / (2 * Math.PI); // доля круга от «севера» по часовой
      return Math.min(n, Math.round(((t % 1) + 1) % 1 * count));
    },
  };
}

// Куча/колода — почти совмещённые слоты с лёгким ДИАГОНАЛЬНЫМ стаггером «толщины» (свет справа-сверху).
// Верх = последний. indexAt → верх (дроп в кучу = положить сверху). Отдельная стратегия, не костыль
// над linear: у кучи своя семантика (нахлёст по обеим осям, стаггер может уходить в минус по y).
//
// cell — РЕЗЕРВ места для ПУСТОЙ кучи (тот же смысл, что явный cell у grid). Без него опустевшая
// куча меряется в 0×0: она пропадает из раскладки родителя и перестаёт ловить дроп — а именно в
// пустую кучу и надо уметь положить (пустая колонка Клондайка ждёт короля, пустой фундамент — туза).
export function pile(o: { dx?: number; dy?: number; cell?: Size } = {}): Layout {
  const dx = o.dx ?? 0.35;
  const dy = o.dy ?? -0.3;
  const nz = (v: number): number => (v === 0 ? 0 : v); // -0 → 0 (i*dy при i=0 даёт -0)
  return {
    place(sizes) {
      if (!sizes.length && o.cell) return { at: [], size: { ...o.cell } };
      const at = sizes.map((_, i) => ({ x: nz(i * dx), y: nz(i * dy) }));
      let minX = 0;
      let minY = 0;
      let maxX = 0;
      let maxY = 0;
      sizes.forEach((s, i) => {
        minX = Math.min(minX, at[i]!.x);
        minY = Math.min(minY, at[i]!.y);
        maxX = Math.max(maxX, at[i]!.x + s.w);
        maxY = Math.max(maxY, at[i]!.y + s.h);
      });
      return { at, size: { w: maxX - minX, h: maxY - minY } };
    },
    indexAt(_cp, sizes) {
      return sizes.length ? sizes.length - 1 : 0; // куча принимает сверху
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
