import { at, move, place, removeFrom, type Board } from "./board";
import { add, canAccept, size } from "./container";
import { stackOffsets } from "./slotLayout";
import { resolveDrop, type DropCandidate } from "./dropResolve";
import { clampToBounds } from "./bounds";
import type { Rect } from "./layout/grid";
import type { PositionedSlot } from "./layout/slots";

// BoardZone — стейт-ное ядро визуального полигона (ООП: состояние board + поведение), но БЕЗ Pixi.
// Раскладка ПОДКЛЮЧАЕМА: зона принимает готовый список позиционированных слотов (grid/ring/points/
// seats — см. layout/slots.ts), сама геометрию не считает. Отвечает «где отдыхает фигура», «куда её
// перенёс дроп (по onOccupied)», «как не выпустить за рамку».

// Исход дропа на ЗАНЯТЫЙ слот (GRID-DESIGN.md, onOccupied). Пресеты; кастомный Action — позже.
export type OnOccupied = "merge" | "swap" | "capture" | "reject";

// Value-aware ПРАВИЛО приёма (rules as data): финальный гейт поверх onOccupied. Знает ids/слоты и
// текущий board; ЗНАЧЕНИЯ (ранг/масть) достаёт из своего замыкания. Основа правил игр (пасьянс и т.п.).
export interface AcceptCtx {
  figureId: string;
  fromKey: string;
  toKey: string;
  board: Board;
}
export type AcceptRule = (ctx: AcceptCtx) => boolean;

export interface BoardZoneOpts {
  slots: PositionedSlot[]; // раскладка (из любой стратегии)
  board: Board;
  bounds: Rect; // рамка контейнера — фигуры не выбираются за неё
  onOccupied?: OnOccupied; // что делать при дропе на занятый слот (дефолт merge)
  rule?: AcceptRule; // доп. гейт приёма по значениям (опц.)
}

// Сдвиг стопки в слоте (peek): верх выше-правее. Малый, чисто чтобы читалась глубина.
const STACK_STEP = { dx: 6, dy: -4 };

export class BoardZone {
  board: Board;
  readonly slotList: PositionedSlot[];
  readonly bounds: Rect;
  onOccupied: OnOccupied; // изменяем на лету (тоглер песочницы)
  private readonly centers: Map<string, { x: number; y: number }>;
  private readonly rule?: AcceptRule;

  constructor(o: BoardZoneOpts) {
    this.slotList = o.slots;
    this.board = o.board;
    this.bounds = o.bounds;
    this.onOccupied = o.onOccupied ?? "merge";
    this.centers = new Map(o.slots.map((s) => [s.key, s.center]));
    this.rule = o.rule;
  }

  /** В каком слоте и на какой глубине лежит фигура. */
  locate(figureId: string): { key: string; index: number } | null {
    for (const key of Object.keys(this.board.slots)) {
      const index = this.board.slots[key]!.members.indexOf(figureId);
      if (index >= 0) return { key, index };
    }
    return null;
  }

  /** Все слоты (ключ + прямоугольник) — для отрисовки фонов и дроп-целей. */
  slotRects(): Array<{ key: string; rect: Rect }> {
    return this.slotList.map((s) => ({ key: s.key, rect: s.rect }));
  }

  /** Позиция покоя фигуры: центр её слота + peek-сдвиг по глубине. */
  figureHome(figureId: string): { x: number; y: number } {
    const loc = this.locate(figureId);
    const center = loc && this.centers.get(loc.key);
    if (!loc || !center) return { x: this.bounds.x + this.bounds.w / 2, y: this.bounds.y + this.bounds.h / 2 };
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

  // Примет ли слот фигуру: структурно (пустой/onOccupied) И value-правило (если задано).
  private slotAccepts(key: string, fromKey: string, figureId: string): boolean {
    if (key === fromKey) return false; // реордер отдельно
    if (!this.structuralAccepts(key, figureId)) return false;
    return this.rule ? this.rule({ figureId, fromKey, toKey: key, board: this.board }) : true;
  }

  private structuralAccepts(key: string, figureId: string): boolean {
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
