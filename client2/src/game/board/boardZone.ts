import { at, move, place, removeFrom, type Board } from "./board";
import { add, canAccept, size } from "./container";
import { cellCenter, cellRect, coordOf, keyOf, type GridSpec, type Rect } from "./layout/grid";
import { stackOffsets } from "./slotLayout";
import { resolveDrop, type DropCandidate } from "./dropResolve";
import { clampToBounds } from "./bounds";

// BoardZone — стейт-ное ядро визуального полигона (ООП: состояние board + поведение), но БЕЗ Pixi.
// Держит логический Board + геометрию сетки; отвечает «где отдыхает фигура», «куда её перенёс дроп»,
// «как не выпустить за рамку». Визуальный слой песочницы читает отсюда и лишь рисует.

// Исход дропа на ЗАНЯТЫЙ слот (GRID-DESIGN.md, onOccupied). Пресеты; кастомный Action — позже.
export type OnOccupied = "merge" | "swap" | "capture" | "reject";

export interface BoardZoneOpts {
  spec: GridSpec;
  rows: number; // число строк (фиксированная сетка слотов)
  board: Board;
  bounds: Rect; // рамка контейнера — фигуры не выбираются за неё
  onOccupied?: OnOccupied; // что делать при дропе на занятый слот (дефолт merge)
}

// Сдвиг стопки в слоте (peek): верх выше-правее. Малый, чисто чтобы читалась глубина.
const STACK_STEP = { dx: 6, dy: -4 };

export class BoardZone {
  board: Board;
  readonly spec: GridSpec;
  readonly rows: number;
  readonly bounds: Rect;
  onOccupied: OnOccupied; // изменяем на лету (тоглер песочницы)

  constructor(o: BoardZoneOpts) {
    this.spec = o.spec;
    this.rows = o.rows;
    this.board = o.board;
    this.bounds = o.bounds;
    this.onOccupied = o.onOccupied ?? "merge";
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

  /** Дроп фигуры в точку: резолвим целевой слот (EC1), исход по onOccupied. captured — кого
   *  вытеснили (capture): движок уводит их с борда. */
  dropAt(figureId: string, x: number, y: number): { moved: boolean; captured?: string[] } {
    const from = this.locate(figureId);
    if (!from) return { moved: false };
    const cands: DropCandidate<null>[] = this.slotRects().map(({ key, rect }) => ({
      id: key,
      contains: (px, py) => px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h,
      accepts: () => this.slotAccepts(key, from.key, figureId),
      depth: 0,
    }));
    const win = resolveDrop(cands, x, y, null);
    if (!win) return { moved: false };
    return this.commit(figureId, from.key, win.id);
  }

  // Примет ли слот фигуру: пустой — да; тот же — нет; занятый — по onOccupied.
  private slotAccepts(key: string, fromKey: string, figureId: string): boolean {
    if (key === fromKey) return false; // реордер отдельно
    const c = at(this.board, key);
    if (!c || c.members.length === 0) return true; // пустой
    switch (this.onOccupied) {
      case "merge":
        return canAccept(c, figureId);
      case "swap":
      case "capture":
        return true;
      case "reject":
        return false;
    }
  }

  // Применить исход. Пустой слот — всегда просто переезд; занятый — по onOccupied.
  private commit(figureId: string, from: string, to: string): { moved: boolean; captured?: string[] } {
    const tgt = at(this.board, to);
    const occupied = !!tgt && tgt.members.length > 0;
    if (!occupied || this.onOccupied === "merge") {
      this.board = move(this.board, from, to, [figureId]); // пустой → создать; занятый+merge → поверх
      return { moved: true };
    }
    const tgtMembers = [...tgt!.members];
    let b = removeFrom(this.board, from, [figureId]);
    b = removeFrom(b, to, tgtMembers);
    b = place(b, to, add(at(b, to) ?? { members: [] }, [figureId])); // новичок в цель
    if (this.onOccupied === "swap") {
      b = place(b, from, add(at(b, from) ?? { members: [] }, tgtMembers)); // прежний жилец — в исходный слот
      this.board = b;
      return { moved: true };
    }
    this.board = b; // capture — вытесненные уходят с борда
    return { moved: true, captured: tgtMembers };
  }

  /** Держать фигуру в рамке контейнера (запертость). */
  clamp(pos: { x: number; y: number }, half: { w: number; h: number }): { x: number; y: number } {
    return clampToBounds(pos, half, this.bounds);
  }
}
