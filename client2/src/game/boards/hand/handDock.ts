// ДОК РУКИ У КРАЯ ЭКРАНА — чистая геометрия (без Pixi): куда пришвартована полоса (side), вдоль
// какой оси течёт ряд (flow), какого размера карта и где чьи центры. HandHud (сцена) лишь рисует
// и перекладывает ноды по этим числам — вся математика сторожится здесь, юнитами.
//
// Оси: main — вдоль ряда (x при horizontal, y при vertical), cross — поперёк, к краю side.
// Несовместимые side+flow (bottom+vertical) не роняют док: ряд идёт по своей оси, а по поперечной
// встаёт в центр экрана — дизайнер увидит и поправит, игрок не получит сломанного стола.

import type { Size } from "../../slot/types";
import type { HandFlow, HandSide } from "../core/spec";
import { handCardSize, handStrip, handStripWithGap } from "./handStrip";

const SIDE = 16; // поля дока от краёв экрана вдоль ряда
const GAP = 12; // зазор карт в свободном ряду и «дыхание» полосы-дропзоны
const PAD = 8; // отступ полосы от хрома её края

/** Рамка дока: экран, хром сверху/снизу и сама конфигурация руки. */
export interface DockFrame {
  w: number;
  h: number;
  /** Хром верха/низа экрана (топбар, полоса действий): док и его резерв их обходят. */
  insetTop: number;
  insetBottom: number;
  side: HandSide;
  flow: HandFlow;
  /** Эталонный габарит карты (аспект) — адаптивный размер держит его пропорции. */
  card: Size;
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
/** Вертикальный ряд? (grid — шаг 4b: пока течёт вдоль края, как horizontal). */
const vertical = (f: DockFrame): boolean => f.flow === "vertical";

/** Адаптивная карта дока: вдоль оси ряда влезает HAND_FIT штук, поперёк — не толще доли экрана.
 *  Вертикальный ряд — та же формула со свёрнутыми осями (swap туда и обратно). */
export function dockCell(f: DockFrame): Size {
  if (!vertical(f)) return handCardSize(f.w - SIDE * 2, f.h, f.card);
  return swap(handCardSize(f.h - f.insetTop - f.insetBottom - PAD * 2, f.w, swap(f.card)));
}

/** Диапазон ряда вдоль main-оси (от края до края минус поля/хром). */
function mainRange(f: DockFrame): { from: number; to: number } {
  return vertical(f) ? { from: f.insetTop + PAD, to: f.h - f.insetBottom - PAD } : { from: SIDE, to: f.w - SIDE };
}

/** Центр ряда по cross-оси: прижат к своему краю; ось не совпала с краем — центр экрана. */
function crossCenter(f: DockFrame, cell: Size): number {
  if (vertical(f)) return f.side === "left" ? SIDE + cell.w / 2 : f.side === "right" ? f.w - SIDE - cell.w / 2 : f.w / 2;
  return f.side === "top" ? f.insetTop + PAD + cell.h / 2 : f.side === "bottom" ? f.h - f.insetBottom - PAD - cell.h / 2 : f.h / 2;
}

/** Центры карт дока (превью-гэп раздвигает ряд; индекс цели всё равно считает dockIndexAt по
 *  БАЗОВОМУ ряду — подсказка не двигает цель, канон handStripWithGap). */
export function dockPoses(f: DockFrame, count: number, preview: number | null): DockPose[] {
  const cell = dockCell(f);
  const r = mainRange(f);
  const m = vertical(f) ? swap(cell) : cell;
  const len = Math.max(m.w, r.to - r.from);
  const strip = preview === null ? handStrip(count, m, len, GAP) : handStripWithGap(count, preview, m, len, GAP);
  const cross = crossCenter(f, cell);
  const scale = cell.h / f.card.h;
  return strip.map((p) => (vertical(f) ? { x: cross, y: r.from + p.x, scale } : { x: r.from + p.x, y: cross, scale }));
}

/** Полоса-дропзона дока (band): ряд во всю длину своей оси ± дыхание GAP. */
export function dockBand(f: DockFrame): Rect {
  const cell = dockCell(f);
  const r = mainRange(f);
  const cross = crossCenter(f, cell);
  if (vertical(f)) return { x: cross - cell.w / 2 - GAP, y: r.from - GAP, w: cell.w + GAP * 2, h: r.to - r.from + GAP * 2 };
  return { x: r.from - GAP, y: cross - cell.h / 2 - GAP, w: r.to - r.from + GAP * 2, h: cell.h + GAP * 2 };
}

/** Индекс вставки по точке: сколько центров БАЗОВОГО ряда (без превью) до неё по main-оси. */
export function dockIndexAt(f: DockFrame, count: number, p: { x: number; y: number }): number {
  const main = vertical(f) ? p.y : p.x;
  return dockPoses({ ...f }, count, null).filter((c) => (vertical(f) ? c.y : c.x) < main).length;
}

/** Поза груза над доком: следует за пальцем по main-оси (зажат в ряд), поперёк — в ряду. */
export function dockDragPose(f: DockFrame, p: { x: number; y: number }): DockPose {
  const cell = dockCell(f);
  const r = mainRange(f);
  const half = (vertical(f) ? cell.h : cell.w) / 2;
  const main = Math.max(r.from + half, Math.min(r.to - half, vertical(f) ? p.y : p.x));
  const cross = crossCenter(f, cell);
  const scale = cell.h / f.card.h;
  return vertical(f) ? { x: cross, y: main, scale } : { x: main, y: cross, scale };
}

/** Сколько экрана резервирует док у СВОЕГО края — стол вписывается в остаток (fitZoom). Полоса
 *  низа включает хром низа (полоса действий живёт под рукой), остальные края — только себя. */
export function dockReserved(f: DockFrame): { top: number; bottom: number; left: number; right: number } {
  const cell = dockCell(f);
  const r = { top: 0, bottom: 0, left: 0, right: 0 };
  if (f.side === "bottom") r.bottom = cell.h + PAD + f.insetBottom;
  else if (f.side === "top") r.top = cell.h + PAD * 2;
  else r[f.side] = cell.w + SIDE * 2;
  return r;
}
