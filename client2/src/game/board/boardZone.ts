import { at, move, type Board } from "./board";
import { canAccept, size } from "./container";
import { cellCenter, cellRect, coordOf, keyOf, type GridSpec, type Rect } from "./layout/grid";
import { stackOffsets } from "./slotLayout";
import { resolveDrop, type DropCandidate } from "./dropResolve";
import { clampToBounds } from "./bounds";

// BoardZone — стейт-ное ядро визуального полигона (ООП: состояние board + поведение), но БЕЗ Pixi.
// Держит логический Board + геометрию сетки; отвечает «где отдыхает фигура», «куда её перенёс дроп»,
// «как не выпустить за рамку». Визуальный слой песочницы читает отсюда и лишь рисует.

export interface BoardZoneOpts {
  spec: GridSpec;
  rows: number; // число строк (фиксированная сетка слотов)
  board: Board;
  bounds: Rect; // рамка контейнера — фигуры не выбираются за неё
}

// Сдвиг стопки в слоте (peek): верх выше-правее. Малый, чисто чтобы читалась глубина.
const STACK_STEP = { dx: 6, dy: -4 };

export class BoardZone {
  board: Board;
  readonly spec: GridSpec;
  readonly rows: number;
  readonly bounds: Rect;

  constructor(o: BoardZoneOpts) {
    this.spec = o.spec;
    this.rows = o.rows;
    this.board = o.board;
    this.bounds = o.bounds;
  }

  /** В каком слоте и на какой глубине лежит фигура. */
  locate(figureId: string): { key: string; index: number } | null {
    for (const key of Object.keys(this.board.slots)) {
      const index = this.board.slots[key]!.members.indexOf(figureId);
      if (index >= 0) return { key, index };
    }
    return null;
  }

  /** Все слоты сетки (ключ + прямоугольник) — для отрисовки фонов и дроп-целей. */
  slotRects(): Array<{ key: string; rect: Rect }> {
    const out: Array<{ key: string; rect: Rect }> = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.spec.cols; c++) out.push({ key: keyOf(r, c), rect: cellRect(this.spec, r, c) });
    }
    return out;
  }

  /** Позиция покоя фигуры: центр её слота + peek-сдвиг по глубине. */
  figureHome(figureId: string): { x: number; y: number } {
    const loc = this.locate(figureId);
    if (!loc) return { x: this.bounds.x + this.bounds.w / 2, y: this.bounds.y + this.bounds.h / 2 };
    const { r, c } = coordOf(loc.key);
    const center = cellCenter(this.spec, r, c);
    const count = size(this.board.slots[loc.key]!);
    const off = stackOffsets(count, STACK_STEP.dx, STACK_STEP.dy)[loc.index]!;
    return { x: center.x + off.dx, y: center.y + off.dy };
  }

  /** Дроп фигуры в точку: резолвим целевой слот (EC1), переносим через board.move, если принят. */
  dropAt(figureId: string, x: number, y: number): { moved: boolean } {
    const from = this.locate(figureId);
    if (!from) return { moved: false };
    const cands: DropCandidate<null>[] = this.slotRects().map(({ key, rect }) => ({
      id: key,
      contains: (px, py) => px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h,
      accepts: () => {
        if (key === from.key) return false; // тот же слот — не переезд (реордер отдельно)
        const c = at(this.board, key);
        return c ? canAccept(c, figureId) : true; // пустой принимает; занятый — по canAccept
      },
      depth: 0,
    }));
    const win = resolveDrop(cands, x, y, null);
    if (!win) return { moved: false };
    this.board = move(this.board, from.key, win.id, [figureId]);
    return { moved: true };
  }

  /** Держать фигуру в рамке контейнера (запертость). */
  clamp(pos: { x: number; y: number }, half: { w: number; h: number }): { x: number; y: number } {
    return clampToBounds(pos, half, this.bounds);
  }
}
