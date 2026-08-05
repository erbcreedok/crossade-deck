// ЖЕСТ НАД КОСЫНКОЙ — владелец всего, что происходит между «палец коснулся карты» и «ход ушёл в
// движок правил»: что берётся, что берётся ПАЧКОЙ, какие слоты зажигаются, какой из них под грузом и
// что значит дроп. Плюс контуры слотов — их рисует тот же владелец, потому что он один знает, что
// сейчас зажжено.
//
// Правил здесь нет: легальность спрашивается у САМИХ ЗОН дерева (caps.drop.accept), а ход отдаётся
// движку — он же и решает, можно ли так. Сцена правила не дублирует, иначе подсветка и ход разъедутся.

import { Graphics } from "pixi.js";
import type { SceneElement } from "../engine/sceneEngine";
import type { DragPayload } from "../engine/drag";
import { GroupDrag } from "../engine/drag";
import type { DragContext } from "../engine/drag";
import type { Card } from "../ui/Card";
import { itemRect, pickDropZone, type DropRect } from "../engine/dropPick";
import { CARD, CASCADE_STEP, type SolitaireTree } from "./tree";
import { paintSlots } from "./slotPaint";
import type { SolitaireGameEngine } from "./engine";

export interface SolitaireGestureDeps {
  engine: SolitaireGameEngine;
  tree(): SolitaireTree;
  node(id: string): Card | undefined;
  wake(): void;
  drag(): DragPayload | null;
  dragCtx(): DragContext;
  setDrag(d: DragPayload): void;
  defaultBeginDrag(el: SceneElement, cp: { x: number; y: number }, sp: { x: number; y: number }): boolean;
  defaultElementTapped(el: SceneElement): void;
}

export class SolitaireGesture {
  /** Слой контуров слотов — сцена кладёт его в surface. */
  readonly slotLayer = new Graphics();

  private from = "";
  private ids: string[] = [];
  private hotSlot: string | null = null;
  private armedSlots: ReadonlySet<string> = new Set();

  constructor(private readonly deps: SolitaireGestureDeps) {}

  /** Тащить можно только открытую карту и только не из стока: сток сдаёт по тапу. */
  canDrag(el: SceneElement): boolean {
    const slot = this.deps.tree().slotOf(el.id);
    return slot !== null && slot !== "stock" && this.deps.engine.isFaceUp(el.id);
  }

  /** ТАП по стоку — сдача. Именно тап, а не попытка тащить: сток не таскают, по нему щёлкают. */
  tapped(el: SceneElement): void {
    if (this.deps.tree().slotOf(el.id) === "stock") {
      this.deps.engine.dealStock();
      return;
    }
    this.deps.defaultElementTapped(el);
  }

  begin(el: SceneElement, cp: { x: number; y: number }, sp: { x: number; y: number }): boolean {
    const from = this.deps.tree().slotOf(el.id) ?? "";
    const members = this.deps.engine.getState().board.slots[from]?.members ?? [];
    const index = members.indexOf(el.id);
    // Из колонки тянется весь пробег ОТ схваченной карты до верхней (в Клондайк открытый пробег
    // всегда легален: карты попадают в колонку только валидным ходом). Из сброса/фундамента — ровно
    // одна: там физически не ухватить ничего, кроме верха.
    this.from = from;
    this.ids = from.startsWith("tab:") && index >= 0 ? members.slice(index) : [el.id];
    this.armedSlots = this.legalTargets(this.ids, from);
    this.paint();

    if (this.ids.length > 1) {
      const els = this.ids.map((id) => this.deps.node(id)).filter((n): n is Card => !!n);
      const offsets = els.map((n) => ({ dx: n.body.px - cp.x, dy: n.body.py - cp.y }));
      const g = new GroupDrag(els, offsets, this.deps.dragCtx());
      g.move(cp);
      this.deps.setDrag(g);
      return true;
    }
    return this.deps.defaultBeginDrag(el, cp, sp);
  }

  moved(p: { x: number; y: number }): void {
    const hot = this.slotAt(p);
    if (hot === this.hotSlot) return;
    this.hotSlot = hot;
    this.paint();
    this.deps.wake();
  }

  /** Что значит дроп: цель считает ФИГУРА (slotAt — тот же выбор, что красит hot), ход отдаётся
   *  движку правил. Он же и решает, легален ли ход. */
  resolve(cp: { x: number; y: number }): void {
    const drag = this.deps.drag();
    if (!drag) return;
    const to = this.slotAt(cp);
    if (to && this.from && to !== this.from) {
      if (this.ids.length > 1) this.deps.engine.moveStack(this.from, to, this.ids);
      else this.deps.engine.moveCard(this.from, to, this.ids[0]!);
    }
    // Успешный ход уже пересобрал дерево (событие "move"), неуспешный оставил прежнее — в обоих
    // случаях карты едут ДОМОЙ по актуальному дереву той же пружиной.
    drag.release();
  }

  end(): void {
    this.from = "";
    this.ids = [];
    this.hotSlot = null;
    this.armedSlots = new Set();
    this.paint();
  }

  /** Контуры слотов: зажжённые — по легальности текущего груза, горячий — под грузом. */
  paint(): void {
    const tree = this.deps.tree();
    const extents: Record<string, number> = {};
    for (const id of Object.keys(tree.origins)) extents[id] = this.zoneRect(id).h;
    paintSlots(this.slotLayer, { origins: tree.origins, cell: CARD, extents, armed: this.armedSlots, hot: this.hotSlot });
  }

  /** Прямоугольник зоны слота: колонка тянется на ВЕСЬ каскад плюс запас под следующую карту —
   *  подсветка и попадание живут у всего стека, а не у базовой ячейки (жалоба владельца). */
  private zoneRect(id: string): DropRect {
    const o = this.deps.tree().origins[id]!;
    const n = this.deps.engine.getState().board.slots[id]?.members.length ?? 0;
    const reserve = id.startsWith("tab:") && n > 0 ? (n - 1) * CASCADE_STEP + CASCADE_STEP * 1.5 : 0;
    return { x: o.x, y: o.y, w: CARD.w, h: CARD.h + reserve };
  }

  /** Слот-цель под грузом: попадание считает ФИГУРА (нахлёст, engine/dropPick), палец — ничьи.
   *  Кандидаты — только слоты, легальные для текущего груза: геометрия правил не знает. */
  private slotAt(p: { x: number; y: number }): string | null {
    const cands = [...this.armedSlots];
    const lead = this.deps.drag()?.lead;
    const fp = (lead as { footprint?: { hw: number; hh: number } } | undefined)?.footprint;
    const rect = lead && fp ? itemRect(lead.body.px, lead.body.py, fp.hw * lead.body.scaleVal, fp.hh * lead.body.scaleVal) : itemRect(p.x, p.y, 0, 0);
    const i = pickDropZone(
      cands.map((id) => this.zoneRect(id)),
      rect,
      p,
    );
    return i >= 0 ? cands[i]! : null;
  }

  /** Зоны, готовые принять этот груз, — спрашиваем сами зоны (caps.drop.accept), а не повторяем
   *  правила: подсветка и легальность хода тогда не могут разойтись. Пачку (пробег колонки) берёт
   *  только другая колонка — в фундамент карты кладут по одной, и подсвечивать его было бы обманом. */
  private legalTargets(ids: readonly string[], from: string): ReadonlySet<string> {
    const tree = this.deps.tree();
    const out = new Set<string>();
    const stack = ids.length > 1;
    for (const id of Object.keys(tree.origins)) {
      if (id === from || (stack && !id.startsWith("tab:"))) continue;
      if (tree.accepts(id, ids[0]!)) out.add(id);
    }
    return out;
  }
}
