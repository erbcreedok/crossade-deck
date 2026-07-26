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

  constructor(o: { left: number; top: number; cell: { w: number; h: number }; step: number; ids: string[]; reorder?: boolean; pad?: number }) {
    this.fallback = { x: o.left + o.cell.w / 2, y: o.top + o.cell.h / 2 };
    // gap = step − cell.w → нахлёст (шаг соседа = step). reorder/drop — способности.
    this.cards = group("stack-cards", linear({ axis: "x", gap: o.step - o.cell.w }), o.ids.map((id) => leaf(id, id, o.cell)), { reorder: { enabled: o.reorder ?? false }, drop: { pad: o.pad ?? 8 } });
    this.root = group("stack-root", absolute([{ x: o.left, y: o.top }]), [this.cards]);
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
