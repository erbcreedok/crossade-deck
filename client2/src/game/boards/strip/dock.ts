// ДОК ЛЕНТЫ У КРАЯ ЭКРАНА — чистая геометрия (без Pixi): куда пришвартована полоса (side), вдоль
// какой оси течёт ряд (flow: линия или сетка), какого размера ячейка (size: адаптив-fit или ячейка
// дизайнера) и где чьи центры. SceneZoneDock (сцена) лишь рисует и перекладывает ноды по числам.
//
// Оси: main — вдоль края (x у top/bottom, y у left/right), cross — поперёк, ОТ края вглубь экрана.
// Сетка (grid) растёт вглубь рядами: ряд 0 у края, следующие — внутрь; линия — сетка из одного
// ряда с нахлёстом при переполнении (stripRow). Явный flow поперёк края (bottom+vertical) не
// роняет док: ряд идёт по своей оси, по поперечной встаёт в центр экрана.

import type { Size } from "../../slot/types";
import type { HandFlow, HudSide } from "../core/spec";
import { stripCellSize, stripRow, type StripPose } from "./row";

const SIDE = 16; // поля дока от краёв экрана вдоль ряда
const GAP = 12; // зазор карт в свободном ряду и «дыхание» полосы-дропзоны
const PAD = 8; // отступ полосы от хрома её края

export interface DockFrame {
  w: number;
  h: number;
  /** Хром верха/низа экрана (топбар, полоса действий): док и его резерв их обходят. */
  insetTop: number;
  insetBottom: number;
  side: HudSide;
  /** null — вдоль края (flowAlong side). */
  flow: HandFlow | null;
  /** Размер карт из конфига руки: адаптив-fit или фикс-ячейка дизайнера. */
  size: { fit: number } | { cell: Size };
  /** Эталонный габарит карты (аспект) — адаптивный размер держит его пропорции. */
  card: Size;
  /** ДОП. ОТСТУП полосы от СВОЕГО края (safe-zone сцены + inset дока из спеки). Дефолт 0. */
  edge?: number;
  /** СТОПКА: все жители в одной точке (каскад-микросдвиг), взятие — верхний, дроп — сверху.
   *  Так докуются pile-зоны (колода в HUD); реордера и гэп-превью у стопки нет. */
  stack?: boolean;
}

/** Экранная поза карты дока: центр + масштаб ноды (по высоте карты). */
export interface DockPose {
  x: number;
  y: number;
  scale: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const swap = (s: Size): Size => ({ w: s.h, h: s.w });
/** Ряд вдоль вертикали? Грид всегда течёт ВДОЛЬ края; явный vertical — как задан. */
const vertical = (f: DockFrame): boolean => {
  const along = f.side === "left" || f.side === "right";
  return f.flow === "grid" || f.flow === null ? along : f.flow === "vertical";
};

/** Карта дока: фикс-ячейка конфига как есть, иначе адаптив — вдоль оси влезает fit штук, поперёк
 *  не толще доли экрана. Вертикальный ряд — та же формула со свёрнутыми осями (swap туда-обратно). */
export function dockCell(f: DockFrame): Size {
  if ("cell" in f.size) return f.size.cell;
  if (!vertical(f)) return stripCellSize(f.w - SIDE * 2, f.h, f.card, f.size.fit);
  return swap(stripCellSize(f.h - f.insetTop - f.insetBottom - PAD * 2, f.w, swap(f.card), f.size.fit));
}

/** Диапазон ряда вдоль main-оси (от края до края минус поля/хром). */
function mainRange(f: DockFrame): { from: number; to: number } {
  return vertical(f) ? { from: f.insetTop + PAD, to: f.h - f.insetBottom - PAD } : { from: SIDE, to: f.w - SIDE };
}

/** Центр РЯДА 0 (у края) по cross-оси и направление роста рядов — ОТ края вглубь экрана.
 *  edge (safe-zone + inset дока) отодвигает ряд 0 от СВОЕГО края. */
function crossBase(f: DockFrame, cell: Size): { at: number; dir: 1 | -1 } {
  const e = f.edge ?? 0;
  if (vertical(f)) {
    if (f.side === "left") return { at: SIDE + e + cell.w / 2, dir: 1 };
    if (f.side === "right") return { at: f.w - SIDE - e - cell.w / 2, dir: -1 };
    return { at: f.w / 2, dir: 1 }; // ось поперёк края: колонка в центре
  }
  if (f.side === "top") return { at: f.insetTop + e + PAD + cell.h / 2, dir: 1 };
  if (f.side === "bottom") return { at: f.h - f.insetBottom - e - PAD - cell.h / 2, dir: -1 };
  return { at: f.h / 2, dir: 1 };
}

/** Позиции n жителей в осях дока: main + номер ряда (row-major — порядок руки читается вдоль
 *  края, ряд за рядом). Линия — один ряд (нахлёст при переполнении, stripRow); сетка — без
 *  нахлёста, колонки по длине края, ряды вглубь. */
function positionsOf(f: DockFrame, n: number): { main: number; row: number }[] {
  const cell = dockCell(f);
  const m = vertical(f) ? swap(cell) : cell;
  const r = mainRange(f);
  const len = Math.max(m.w, r.to - r.from);
  // Стопка: все в центре отрезка, микрокаскад читается как «толщина» (верхние чуть правее).
  if (f.stack) return Array.from({ length: n }, (_, i) => ({ main: len / 2 + Math.min(i, 6) * 2, row: 0 }));
  if (f.flow !== "grid") return stripRow(n, m, len, GAP).map((p: StripPose) => ({ main: p.x, row: 0 }));
  const cols = Math.max(1, Math.floor((len + GAP) / (m.w + GAP)));
  const block = Math.min(n, cols) * (m.w + GAP) - GAP; // ширина блока колонок, центрируем по краю
  const left = (len - block) / 2 + m.w / 2;
  return Array.from({ length: n }, (_, i) => ({ main: left + (i % cols) * (m.w + GAP), row: Math.floor(i / cols) }));
}

/** Сколько РЯДОВ занимает n жителей (толщина дока: band, резерв). */
function rowsOf(f: DockFrame, n: number): number {
  if (f.flow !== "grid" || n <= 0) return 1;
  return Math.max(...positionsOf(f, n).map((p) => p.row)) + 1;
}

/** Позиция в осях дока → экранная поза. */
function toScreen(f: DockFrame, cell: Size, p: { main: number; row: number }): DockPose {
  const r = mainRange(f);
  const cb = crossBase(f, cell);
  const crossStep = (vertical(f) ? cell.w : cell.h) + GAP;
  const cross = cb.at + cb.dir * p.row * crossStep;
  const scale = cell.h / f.card.h;
  return vertical(f) ? { x: cross, y: r.from + p.main, scale } : { x: r.from + p.main, y: cross, scale };
}

/** Центры карт дока. Гэп-превью: те же позиции для count+1, позиция preview пустует — ряд/сетка
 *  раздвигается, показывая место вставки. КАНОН: индекс цели считает dockIndexAt по БАЗОВЫМ
 *  позициям — подсказка не двигает цель под неподвижным пальцем (урок playHover). */
export function dockPoses(f: DockFrame, count: number, preview: number | null): DockPose[] {
  const cell = dockCell(f);
  if (preview === null) return positionsOf(f, count).map((p) => toScreen(f, cell, p));
  const g = Math.max(0, Math.min(preview, count));
  return positionsOf(f, count + 1)
    .filter((_, i) => i !== g)
    .map((p) => toScreen(f, cell, p));
}

/** Полоса-дропзона дока: вдоль края во всю длину, вглубь — на все ряды текущего состава. */
export function dockBand(f: DockFrame, count: number): Rect {
  const cell = dockCell(f);
  const r = mainRange(f);
  const cb = crossBase(f, cell);
  const cSize = vertical(f) ? cell.w : cell.h;
  const depth = rowsOf(f, count) * (cSize + GAP) - GAP; // толщина всех рядов
  const nearEdge = cb.at - cSize / 2; // грань ряда 0 у края
  const c0 = cb.dir > 0 ? nearEdge : nearEdge + cSize - depth; // ближний к началу экрана торец
  if (vertical(f)) return { x: c0 - GAP, y: r.from - GAP, w: depth + GAP * 2, h: r.to - r.from + GAP * 2 };
  return { x: r.from - GAP, y: c0 - GAP, w: r.to - r.from + GAP * 2, h: depth + GAP * 2 };
}

/** Индекс вставки по точке: сколько БАЗОВЫХ позиций (без превью) до неё в row-major порядке —
 *  сначала целые ряды ближе точки к краю, затем центры её ряда по main-оси. */
export function dockIndexAt(f: DockFrame, count: number, p: { x: number; y: number }): number {
  if (f.stack) return count; // стопка: дроп всегда СВЕРХУ, гэпов нет
  const cell = dockCell(f);
  const cb = crossBase(f, cell);
  const crossStep = (vertical(f) ? cell.w : cell.h) + GAP;
  const main = vertical(f) ? p.y - mainRange(f).from : p.x - mainRange(f).from;
  const cross = vertical(f) ? p.x : p.y;
  const row = Math.max(0, Math.round((cross - cb.at) / (cb.dir * crossStep)));
  return positionsOf(f, count).filter((c) => c.row < row || (c.row === row && c.main < main)).length;
}

/** Поза груза над доком: следует за пальцем по main-оси (зажат в ряд), поперёк — в своём ряду. */
export function dockDragPose(f: DockFrame, p: { x: number; y: number }): DockPose {
  const cell = dockCell(f);
  const r = mainRange(f);
  const cb = crossBase(f, cell);
  const half = (vertical(f) ? cell.h : cell.w) / 2;
  const main = Math.max(r.from + half, Math.min(r.to - half, vertical(f) ? p.y : p.x)) - r.from;
  const crossStep = (vertical(f) ? cell.w : cell.h) + GAP;
  const row = f.flow === "grid" ? Math.max(0, Math.round(((vertical(f) ? p.x : p.y) - cb.at) / (cb.dir * crossStep))) : 0;
  return toScreen(f, cell, { main, row });
}

// Резерв краёв под доки живёт ОДНОЙ формулой в hud/reserve (sideExtent/hudReserved): вторая
// формула здесь дрейфовала от сценовой — источник глубины для резерва теперь только dockBand.
