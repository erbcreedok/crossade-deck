import { linear, absolute } from "../slot/layouts";
import { leaf, group, type Group } from "../slot/types";
import { figures, has, homeOf as slotHomeOf } from "../slot/slot";
import { dropInto } from "../slot/mutate";
import type { Configurable, Param } from "../ui/controls";

// СТОПКА — контейнер на том же дереве слотов, что и Поле, только проще (без декора): ряд карт с
// нахлёстом (верх справа). Порядок/дом/реордер — из дерева. Реордер приходит ДАРОМ: та же способность
// на грид-группе. Движок держит визуалы, Stack — порядок и куда картам отдыхать.
export class Stack implements Configurable {
  private readonly root: Group;
  private readonly cards: Group;
  private readonly fallback: { x: number; y: number };
  private readonly origin: { x: number; y: number };
  private readonly cell: { w: number; h: number };
  private readonly pad: number;
  private lastGap: number | null = null;

  constructor(o: { left: number; top: number; cell: { w: number; h: number }; step: number; ids: string[]; reorder?: boolean; pad?: number }) {
    this.fallback = { x: o.left + o.cell.w / 2, y: o.top + o.cell.h / 2 };
    this.origin = { x: o.left, y: o.top };
    this.cell = o.cell;
    this.pad = o.pad ?? 8;
    // gap = step − cell.w → нахлёст (шаг соседа = step). reorder/drop — способности.
    this.cards = group("stack-cards", linear({ axis: "x", gap: o.step - o.cell.w }), o.ids.map((id) => leaf(id, id, o.cell)), { reorder: { enabled: o.reorder ?? false }, drop: { pad: this.pad } });
    this.root = group("stack-root", absolute([{ x: o.left, y: o.top }]), [this.cards]);
  }

  private sizes(): { w: number; h: number }[] {
    return this.cards.children.map((c) => (c.kind === "leaf" ? c.size : { w: 0, h: 0 }));
  }
  // Габарит стопки БЕЗ дыры (для теста «над стопкой ли»).
  private baseBounds(): { x: number; y: number; w: number; h: number } {
    const s = this.cards.layout.place(this.sizes()).size;
    return { x: this.origin.x - this.pad, y: this.origin.y - this.pad, w: s.w + 2 * this.pad, h: s.h + 2 * this.pad };
  }
  private dropIndex(cp: { x: number; y: number }): number {
    return this.cards.layout.indexAt({ x: cp.x - this.origin.x, y: cp.y - this.origin.y }, this.sizes()) ?? this.cards.children.length;
  }

  /** Наведение: над стопкой → карты РАСТУПАЮТСЯ (дыра на индексе дропа), skip исключается. Возвращает,
   *  изменилась ли раскладка (движку — ре-спринг только при смене индекса). */
  hover(cp: { x: number; y: number }, draggedId?: string): boolean {
    const b = this.baseBounds();
    const over = cp.x >= b.x && cp.x <= b.x + b.w && cp.y >= b.y && cp.y <= b.y + b.h;
    // Карта стопки всегда «своя» (перенос между стопками не поддержан) → гэп только при реордере.
    const k = over && this.reorder ? this.dropIndex(cp) : null;
    if (k === this.lastGap) return false;
    this.lastGap = k;
    this.cards.gap = k === null ? undefined : { index: k, size: this.cell, skip: draggedId };
    return true;
  }
  /** Закрыть дыру (на дропе/отмене). */
  clearGap(): void {
    this.cards.gap = undefined;
    this.lastGap = null;
  }

  get ids(): string[] {
    return figures(this.cards);
  }
  get top(): string | undefined {
    const f = figures(this.cards);
    return f[f.length - 1];
  }
  get reorder(): boolean {
    return this.cards.caps?.reorder?.enabled ?? false;
  }
  set reorder(v: boolean) {
    if (this.cards.caps?.reorder) this.cards.caps.reorder.enabled = v;
  }

  owns(id: string): boolean {
    return has(this.root, id);
  }
  /** Дом карты (центр) — из дерева. */
  homeOf(id: string): { x: number; y: number } {
    return slotHomeOf(this.root, id) ?? this.fallback;
  }
  /** Дроп карты по стопке: перестановка по позиции (если реордер вкл). moved → карты переехали. */
  place(id: string, cp: { x: number; y: number }): { moved: boolean } {
    return { moved: dropInto(this.root, id, cp).moved };
  }
  /** Перевернуть порядок (для флипа всей пачки — верх становится низом). */
  reverse(): void {
    this.cards.children.reverse();
  }

  params(): Param[] {
    return [{ kind: "bool", label: "реордер", get: () => this.reorder, set: (v) => (this.reorder = v) }];
  }
}
