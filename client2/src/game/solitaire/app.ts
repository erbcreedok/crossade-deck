import { Application, Rectangle, type FederatedPointerEvent } from "pixi.js";
import { CanvasApp } from "../engine/canvasApp";
import { topmostAt, type HitBox } from "../engine/cardHit";
import { SolitaireGameEngine } from "./engine";
import { mountSolitaireBoard, updateBoardVisuals, type SolitaireUIState } from "./ui";
import type { SlotGeometry } from "../board/solitaireLayout";

// Канвас-хост «Косынки» (issue #97): наследник CanvasApp (REFACTOR E1) — заводить второй
// самодельный жизненный цикл канваса рядом с общим было бы неверно (см. поправку 1 в задании).
// SolitaireApp владеет SolitaireGameEngine (правила/состояние) и SolitaireUIState (Pixi-узлы) и
// связывает их напрямую pointer-событиями Pixi, а не через InputRouter: InputRouter заточен под
// песочницу — пан/зум/пинч камеры и обобщённые кнопки, которых у стола пасьянса просто нет
// (доска не панится и не зумится, координаты контента совпадают с экранными один-в-один). Роль
// InputRouter'а тут свелась бы к пустым заглушкам pan/pinch/button — натягивание вышло бы
// уродливее прямых pointerdown/move/up. Порог «тап vs драг» (8px) и различение реализованы вручную.

const DRAG_THRESHOLD = 8; // px — сдвиг пальца, после которого тап на карте становится драгом

// Что именно тащим: либо кандидат «тап по стоку» (сдать/переработать), либо карта/пробег карт
// колонки tableau, снятых с pointerdown и следующих за пальцем до pointerup.
type DragState =
  | { kind: "stock-tap"; startScreen: { x: number; y: number }; cancelled: boolean }
  | {
      kind: "card";
      fromSlot: string;
      cardIds: string[]; // одна карта либо пробег tableau (от схваченной до верхней)
      grab: { x: number; y: number }; // точка захвата в контент-координатах
      started: boolean; // порог 8px пройден — реально драгаем, а не просто держим палец
      offsets: { id: string; dx: number; dy: number }[]; // смещение каждой карты от точки захвата (локальные координаты слота)
    };

export class SolitaireApp extends CanvasApp {
  readonly engine = new SolitaireGameEngine();
  private ui: SolitaireUIState | null = null;
  private drag: DragState | null = null;
  private activePointerId: number | null = null;

  constructor() {
    super();
    // Подписка на движок — один раз на весь жизненный цикл SolitaireApp (не на build(), которая
    // может звать build() повторно при рестарте канваса): иначе на второй build() слушатель
    // задвоился бы и updateBoardVisuals вызывался бы дважды на каждый ход.
    this.engine.on("move", this.handleEngineMove);
  }

  protected onLayout(width: number, height: number): void {
    // Раскладка слотов пасьянса сама viewport-aware (getSolitaireLayout) — здесь только
    // запоминаем размер экрана, пересборку геометрии делает build()/onResize().
    void width;
    void height;
  }

  protected build(app: Application): void {
    this.ui = mountSolitaireBoard(app, this.engine.getState(), { width: this.width, height: this.height });
    app.stage.eventMode = "static";
    app.stage.hitArea = new Rectangle(0, 0, this.width, this.height);
    app.stage.on("pointerdown", this.onDown);
    app.stage.on("pointermove", this.onMove);
    app.stage.on("pointerup", this.onUp);
    app.stage.on("pointerupoutside", this.onUp);
  }

  protected onBooted(): void {
    this.wake(); // отрисовать хотя бы один кадр только что смонтированной доски
  }

  // Ресайз хоста (issue #49): раскладка слотов зависит от W/H (getSolitaireLayout), поэтому
  // геометрию слотов и Pixi-узлы под них надо пересобрать целиком, а не просто подвинуть камеру.
  protected onResize(width: number, height: number): void {
    if (!this.app || this.destroyed) return;
    this.drag = null; // геометрия слотов сменилась — старый драг-контекст (offsets и т.п.) невалиден
    this.ui?.boardContainer.destroy({ children: true });
    this.ui = mountSolitaireBoard(this.app, this.engine.getState(), { width, height });
    this.app.stage.hitArea = new Rectangle(0, 0, width, height);
  }

  protected onTeardown(app: Application): void {
    app.stage.off("pointerdown", this.onDown);
    app.stage.off("pointermove", this.onMove);
    app.stage.off("pointerup", this.onUp);
    app.stage.off("pointerupoutside", this.onUp);
    this.ui = null;
    this.drag = null;
  }

  // Ничего не анимируется непрерывно (ходы — мгновенный снап, не пружина по кадрам) — кадр всегда
  // «затих»: тикер уснёт сам, а render() дальше вызывается вручную через wake() по событию.
  protected frame(): boolean {
    return false;
  }

  private handleEngineMove = (): void => {
    if (!this.ui) return;
    updateBoardVisuals(this.ui, this.engine.getState());
    this.wake();
  };

  // ——— ввод ———

  private onDown = (e: FederatedPointerEvent): void => {
    if (this.activePointerId !== null || !this.ui) return; // ведём только один палец за раз
    this.activePointerId = e.pointerId;
    const cp = { x: e.global.x, y: e.global.y }; // stage не трансформирован — контент = экран

    const hit = this.pickCard(cp.x, cp.y);
    if (hit && hit.slot === "stock") {
      this.drag = { kind: "stock-tap", startScreen: cp, cancelled: false };
      return;
    }
    if (hit) {
      this.beginCardDrag(hit.slot, hit.cardId, cp);
      return;
    }
    const stockGeom = this.ui.slotGeometries.stock;
    if (stockGeom && this.pointInRect(cp, stockGeom)) {
      this.drag = { kind: "stock-tap", startScreen: cp, cancelled: false };
    }
  };

  private onMove = (e: FederatedPointerEvent): void => {
    if (e.pointerId !== this.activePointerId || !this.drag || !this.ui) return;
    const cp = { x: e.global.x, y: e.global.y };

    if (this.drag.kind === "stock-tap") {
      if (dist(cp, this.drag.startScreen) > DRAG_THRESHOLD) this.drag.cancelled = true;
      return;
    }

    if (!this.drag.started) {
      if (dist(cp, this.drag.grab) <= DRAG_THRESHOLD) return;
      this.drag.started = true;
      // Поднять карты пробега над соседями их же слота (bring-to-front внутри контейнера слота).
      const slotContainer = this.ui.slotContainers[this.drag.fromSlot];
      if (slotContainer) {
        for (const id of this.drag.cardIds) {
          const node = this.ui.cardNodes.get(id);
          if (node) slotContainer.addChild(node.root);
        }
      }
    }

    const dx = cp.x - this.drag.grab.x;
    const dy = cp.y - this.drag.grab.y;
    for (const off of this.drag.offsets) {
      const node = this.ui.cardNodes.get(off.id);
      if (!node) continue;
      node.body.snapTo({ x: off.dx + dx, y: off.dy + dy, rot: 0, scale: node.restScale });
      node.sync();
    }
    this.wake();
  };

  private onUp = (e: FederatedPointerEvent): void => {
    if (e.pointerId !== this.activePointerId || !this.drag || !this.ui) {
      if (e.pointerId === this.activePointerId) this.activePointerId = null;
      return;
    }
    const cp = { x: e.global.x, y: e.global.y };
    const drag = this.drag;
    this.drag = null;
    this.activePointerId = null;

    if (drag.kind === "stock-tap") {
      if (!drag.cancelled) this.engine.dealStock(); // handleEngineMove перерисует на "move"
      return;
    }

    if (!drag.started) return; // тап без сдвига — не ход, визуально ничего не менялось

    const target = this.slotAt(cp);
    if (target && target !== drag.fromSlot) {
      if (drag.cardIds.length > 1) this.engine.moveStack(drag.fromSlot, target, drag.cardIds);
      else this.engine.moveCard(drag.fromSlot, target, drag.cardIds[0]!);
    }
    // Успешный ход уже перерисован через "move"; неуспешный (нет цели/невалидный ход/дроп на
    // свой же слот) движок не эмиттит — снапаем карты обратно на их прежние места вручную.
    updateBoardVisuals(this.ui, this.engine.getState());
    this.wake();
  };

  private beginCardDrag(fromSlot: string, cardId: string, grab: { x: number; y: number }): void {
    if (!this.ui) return;
    // Тащить можно только открытую карту; закрытые (сток, закопанные в tableau) руками не берутся.
    if (!this.engine.isFaceUp(cardId)) return;
    const members = this.engine.getState().board.slots[fromSlot]?.members ?? [];
    const idx = members.indexOf(cardId);
    if (idx < 0) return;
    // Из tableau тянем весь пробег ОТ схваченной карты до верхней (moveStack); из waste/found —
    // ровно одну (там всегда открыт только верх, ничего другого физически не ухватить).
    const cardIds = fromSlot.startsWith("tab:") ? members.slice(idx) : [cardId];
    const offsets = cardIds
      .map((id) => {
        const node = this.ui!.cardNodes.get(id);
        return node ? { id, dx: node.body.px, dy: node.body.py } : null;
      })
      .filter((o): o is { id: string; dx: number; dy: number } => o !== null);
    this.drag = { kind: "card", fromSlot, cardIds, grab, started: false, offsets };
  }

  private pickCard(cx: number, cy: number): { cardId: string; slot: string } | null {
    if (!this.ui) return null;
    const state = this.engine.getState();
    const boxes: HitBox[] = [];
    const meta: { cardId: string; slot: string }[] = [];
    let z = 0;
    for (const [slotId, members] of Object.entries(state.board.slots)) {
      for (const cardId of members.members) {
        const node = this.ui.cardNodes.get(cardId);
        if (!node) continue;
        const gp = node.root.getGlobalPosition();
        const fp = node.footprint;
        boxes.push({ px: gp.x, py: gp.y, hw: fp.hw, hh: fp.hh, z: z++ });
        meta.push({ cardId, slot: slotId });
      }
    }
    const idx = topmostAt(boxes, cx, cy);
    return idx >= 0 ? meta[idx]! : null;
  }

  private slotAt(cp: { x: number; y: number }): string | null {
    if (!this.ui) return null;
    for (const [slotId, geom] of Object.entries(this.ui.slotGeometries)) {
      if (this.pointInRect(cp, geom)) return slotId;
    }
    return null;
  }

  private pointInRect(cp: { x: number; y: number }, geom: SlotGeometry): boolean {
    return cp.x >= geom.x && cp.x <= geom.x + geom.w && cp.y >= geom.y && cp.y <= geom.y + geom.h;
  }
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
