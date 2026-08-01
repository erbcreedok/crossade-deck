import { linear, absolute } from "../slot/layouts";
import { leaf, group, type Group } from "../slot/types";
import { figures, has, homeOf as slotHomeOf } from "../slot/slot";
import { dropInto } from "../slot/mutate";
import type { Configurable, Param } from "../ui/controls";
import { ANCHOR_ICON_IDS, type AnchorIconId, type ShowPolicy } from "../engine/markerPolicy";

// СТОПКА — контейнер на том же дереве слотов, что и Поле, только проще (без декора): ряд карт с
// нахлёстом (верх справа). Порядок/дом/реордер — из дерева. Реордер приходит ДАРОМ: та же способность
// на грид-группе. Движок держит визуалы, Stack — порядок и куда картам отдыхать.
//
// КОНФИГУРАЦИЯ СТОПКИ ЖИВЁТ ЗДЕСЬ, В ОДНОМ МЕСТЕ. Раньше она была раскидана по трём: геометрия и
// состав — в аргументах конструктора, единственный живой рычаг (реордер) — в params(), а вид и
// политика видимости ЯКОРЯ вообще не у стопки, а в конфиге метки на стороне движка. Из-за этого на
// вопрос «что у стопки можно настроить» приходилось читать три файла, и половина ответов не
// настраивалась в рантайме вовсе.
//
// Якорь описан ДАННЫМИ (id иконки + политика), а не функцией рисования: иначе `board/` пришлось бы
// импортировать Pixi, и конфиг перестал бы быть переносимым (см. docs/PORTABILITY.md — правила,
// которые нельзя сериализовать, невозможно отдать нативному клиенту). Кто и как рисует иконку по
// этому id — забота стенда (kit/markerIcons.ts).
/** Как выглядит и когда видна метка-якорь стопки — ДАННЫЕ, не замыкание. */
export interface StackAnchorConfig {
  icon: AnchorIconId; // id из словаря (markerPolicy.ts); рисует его стенд (kit/markerIcons.ts)
  show: ShowPolicy;
}

/** Полный конфиг стопки. Всё, что у стопки вообще настраивается, перечислено ровно тут. */
export interface StackConfig {
  /** Шаг соседней карты вправо. Меньше ширины ячейки → нахлёст. */
  step: number;
  /** Можно ли переставлять карты внутри стопки перетаскиванием. */
  reorder: boolean;
  /** Запас вокруг стопки, в пределах которого дроп считается «в стопку». */
  pad: number;
  anchor: StackAnchorConfig;
}

export const STACK_DEFAULTS: Omit<StackConfig, "step"> = {
  reorder: false,
  pad: 8,
  anchor: { icon: "anchor", show: "away" },
};

export class Stack implements Configurable {
  private readonly root: Group;
  private readonly cards: Group;
  private readonly fallback: { x: number; y: number };
  private readonly origin: { x: number; y: number };
  private readonly cell: { w: number; h: number };
  private readonly pad: number;
  private _step: number;
  /** Вид якоря — данные; стопка их только ХРАНИТ, рисует стенд. Меняется в рантайме. */
  readonly anchor: StackAnchorConfig;
  private lastGap: number | null = null;

  constructor(o: { left: number; top: number; cell: { w: number; h: number }; step: number; ids: string[] } & Partial<Omit<StackConfig, "step">>) {
    this.fallback = { x: o.left + o.cell.w / 2, y: o.top + o.cell.h / 2 };
    this.origin = { x: o.left, y: o.top };
    this.cell = o.cell;
    this.pad = o.pad ?? STACK_DEFAULTS.pad;
    this._step = o.step;
    this.anchor = { ...STACK_DEFAULTS.anchor, ...(o.anchor ?? {}) };
    // gap = step − cell.w → нахлёст (шаг соседа = step). reorder/drop — способности.
    this.cards = group("stack-cards", linear({ axis: "x", gap: o.step - o.cell.w }), o.ids.map((id) => leaf(id, id, o.cell)), { reorder: { enabled: o.reorder ?? STACK_DEFAULTS.reorder }, drop: { pad: this.pad } });
    this.root = group("stack-root", absolute([{ x: o.left, y: o.top }]), [this.cards]);
  }

  /** Шаг соседа вправо. Меняется в рантайме: дома карт после этого пересчитываются деревом сами,
   *  но ПЕРЕВЕЗТИ карты по новым домам обязан вызывающий (у него пружины и визуалы). */
  get step(): number {
    return this._step;
  }
  set step(v: number) {
    this._step = v;
    this.cards.layout = linear({ axis: "x", gap: v - this.cell.w });
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

  /**
   * Живые рычаги стопки — ОДИН список, из которого стенд строит канвасные виджеты, а каталог —
   * панель контролов. Шаг задаётся в ПРОЦЕНТАХ ширины карты, а не в пикселях: у стопки на телефоне
   * и на десктопе карта разная, а «насколько сосед вылезает» — величина относительная.
   */
  params(): Param[] {
    const anchorIcons = ANCHOR_ICON_IDS;
    const showPolicies: ShowPolicy[] = ["always", "atHome", "away", "empty", "gone"];
    return [
      { kind: "number", id: "overlap", label: "нахлёст, %", min: 15, max: 100, get: () => Math.round((this._step / this.cell.w) * 100), set: (v) => (this.step = (v / 100) * this.cell.w) },
      { kind: "bool", id: "reorder", label: "реордер", get: () => this.reorder, set: (v) => (this.reorder = v) },
      { kind: "choice", id: "anchorIcon", label: "иконка якоря", options: [...anchorIcons], get: () => Math.max(0, anchorIcons.indexOf(this.anchor.icon)), set: (i) => (this.anchor.icon = anchorIcons[i] ?? anchorIcons[0]!) },
      { kind: "choice", id: "anchorShow", label: "якорь виден", options: [...showPolicies], get: () => Math.max(0, showPolicies.indexOf(this.anchor.show)), set: (i) => (this.anchor.show = showPolicies[i] ?? "away") },
    ];
  }
}
