import { at, move, place, removeFrom, type Board } from "./board";
import { add, canAccept, size } from "./container";
import { stackOffsets } from "./slotLayout";
import { resolveDrop, type DropCandidate } from "./dropResolve";
import { clampToBounds } from "./bounds";
import { capabilityZoneRule, resolveDropChain, type DropRule } from "./dropPolicy";
import type { PileIdentity } from "./pileIdentity";
import type { Rect } from "./layout/grid";
import type { PositionedSlot } from "./layout/slots";
import type { Configurable, Param } from "../ui/controls"; // ТОЛЬКО типы — стираются на сборке, Pixi сюда не тянется

// BoardZone — стейт-ное ядро визуального полигона (ООП: состояние board + поведение), но БЕЗ Pixi.
// Раскладка ПОДКЛЮЧАЕМА: зона принимает готовый список позиционированных слотов (grid/ring/points/
// seats — см. layout/slots.ts), сама геометрию не считает. Отвечает «где отдыхает фигура», «куда её
// перенёс дроп (по onOccupied)», «как не выпустить за рамку».
//
// Приём дропа идёт ЦЕПОЧКОЙ приоритета (SELECTION-DESIGN §4.F/§7, issue #72): элемент (rule, нельзя
// нарушить) → зона (requiresCapability — слепые зоны §6, прозрачна без набора-Pile или без
// требования) → engine (onOccupied/структура слота). resolveDropChain/capabilityZoneRule — общее
// ядро (dropPolicy.ts), здесь только СБОРКА слоёв под конкретные BoardZone-примитивы.

// Исход дропа на ЗАНЯТЫЙ слот (GRID-DESIGN.md, onOccupied). Пресеты; кастомный Action — позже.
export type OnOccupied = "merge" | "swap" | "capture" | "reject";
const MODES: OnOccupied[] = ["merge", "swap", "capture", "reject"];

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
  rule?: AcceptRule; // элемент-слой цепочки: доп. гейт приёма по значениям (опц.), нельзя нарушить
  requiresCapability?: keyof PileIdentity["capabilities"]; // зона-слой: слепая зона (§6) — примет
  // НАБОР, только если ВЕСЬ он несёт эту способность (Pile.capabilities); без Pile-аргумента в
  // dropSetAt/dropAt требование не проверяется (обратная совместимость со старыми вызовами).
}

// Сдвиг стопки в слоте (peek): верх выше-правее. Малый, чисто чтобы читалась глубина.
const STACK_STEP = { dx: 6, dy: -4 };

export class BoardZone implements Configurable {
  board: Board;
  slotList: PositionedSlot[]; // может переразмечаться (динамический грид — relayout)
  readonly bounds: Rect;
  onOccupied: OnOccupied; // изменяем на лету (тоглер песочницы)
  private centers: Map<string, { x: number; y: number }>;
  private readonly rule?: AcceptRule;
  private readonly requiresCapability?: keyof PileIdentity["capabilities"];

  constructor(o: BoardZoneOpts) {
    this.slotList = o.slots;
    this.board = o.board;
    this.bounds = o.bounds;
    this.onOccupied = o.onOccupied ?? "merge";
    this.centers = new Map(o.slots.map((s) => [s.key, s.center]));
    this.rule = o.rule;
    this.requiresCapability = o.requiresCapability;
  }

  /** Единственный настраиваемый параметр зоны — исход дропа на занятый слот. Даёт зоне
   *  attachControls+Segmented «даром» вместо инлайновой отрисовки (была playgroundEngine.ts::segToggle). */
  params(): Param[] {
    return [{ kind: "choice", id: "onOccupied", label: "на занятый слот", options: MODES, get: () => MODES.indexOf(this.onOccupied), set: (i) => (this.onOccupied = MODES[i]!) }];
  }

  /** Переразметить слоты (динамический грид: рост меняет набор/позиции ячеек). */
  relayout(slots: PositionedSlot[]): void {
    this.slotList = slots;
    this.centers = new Map(slots.map((s) => [s.key, s.center]));
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
   *  вытеснили (capture): движок уводит их с борда. pile — идентичность переносимого набора
   *  (обычно один элемент); задаётся, если зона требует способность (§6, requiresCapability). */
  dropAt(figureId: string, x: number, y: number, pile?: PileIdentity): { moved: boolean; captured?: string[] } {
    const from = this.locate(figureId);
    if (!from) return { moved: false };
    if (this.zoneBlind(pile)) return { moved: false }; // слепая зона: набор без нужной способности её не видит
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

  /** Зона-слой цепочки (§4.F/§6): без требования или без pile-аргумента — прозрачна (не решает,
   *  ведёт себя как раньше). С требованием и pile — блокирует дроп в СЕБЯ, если набор не несёт
   *  способность целиком (capabilityZoneRule возвращает "pass" → resolveDropChain падает в fallback
   *  false — зона не приняла; "accept" → true, дроп идёт к engine-слою как обычно). */
  private zoneBlind(pile?: PileIdentity): boolean {
    if (!this.requiresCapability || !pile) return false;
    const zoneLayer: DropRule<PileIdentity> = capabilityZoneRule(pile, this.requiresCapability);
    return !resolveDropChain(pile, [zoneLayer], false);
  }

  // Примет ли слот фигуру — цепочка элемент(rule, нельзя нарушить) → engine(onOccupied/структура).
  // Зона-слой (requiresCapability) решается ОДИН раз для всего набора, см. zoneBlind/dropAt/dropSetAt.
  private slotAccepts(key: string, fromKey: string, figureId: string): boolean {
    if (key === fromKey) return false; // реордер отдельно
    const ctx: AcceptCtx = { figureId, fromKey, toKey: key, board: this.board };
    const elementLayer: DropRule<AcceptCtx> = () => (this.rule && !this.rule(ctx) ? "reject" : "pass");
    const engineLayer: DropRule<AcceptCtx> = () => (this.structuralAccepts(key, figureId) ? "accept" : "reject");
    return resolveDropChain(ctx, [elementLayer, engineLayer]);
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

  /** Перенести НАБОР фигур (мультиселект) в слот под точкой: каждую, кто принят, в порядке набора.
   *  pile — идентичность всего набора (SELECTION-DESIGN §3); при requiresCapability слепая зона (§6)
   *  без pile-аргумента остаётся прозрачной (обратная совместимость), с ним — не примет несущий не
   *  весь набор способность. */
  dropSetAt(ids: string[], x: number, y: number, pile?: PileIdentity): { moved: boolean } {
    const target = this.slotRects().find(({ rect }) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h);
    if (!target) return { moved: false };
    if (this.zoneBlind(pile)) return { moved: false };
    let moved = false;
    for (const id of ids) {
      const from = this.locate(id);
      if (!from || from.key === target.key) continue;
      if (!this.slotAccepts(target.key, from.key, id)) continue;
      this.board = move(this.board, from.key, target.key, [id]);
      moved = true;
    }
    return { moved };
  }

  /** Держать фигуру в рамке контейнера (запертость). */
  clamp(pos: { x: number; y: number }, half: { w: number; h: number }): { x: number; y: number } {
    return clampToBounds(pos, half, this.bounds);
  }
}
