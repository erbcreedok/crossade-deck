import { Container, Graphics, Text } from "pixi.js";
import { type FlowGeom } from "./dynamicGrid";
import { grid as gridLayout, pile, absolute } from "../slot/layouts";
import { leaf, group, type Group } from "../slot/types";
import { figures, has, measure, homeOf as slotHomeOf } from "../slot/slot";
import { dropInto } from "../slot/mutate";
import { paintFieldChrome } from "./fieldPaint";

// ПОЛЕ — обособленный модуль механики (программируется ЗДЕСЬ, движок только импортит и делегирует).
// ПОРЯДОК карт держит ДЕРЕВО СЛОТОВ: field(absolute)[ колода(linear), грид(grid, reorder+drop) ] —
// то же дерево, что и любой контейнер (slot/). Field — тонкий адаптер: даёт «хром»-графику
// (dashed-рамка + якорь), геометрию дропзоны и делегирует порядок/дом дереву (homeOf/reorder/detach).
// Карточные визуалы (Card) остаются в движке — Field лишь говорит, где им отдыхать и кто ему принадлежит.

export interface Rect4 {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FieldOpts {
  stackRect: Rect4; // область закрытой стопки
  grid: FlowGeom; // геометрия ячейки/отступа/origin грида
  stackIds: string[]; // карты стопки (низ→верх)
  anchor: Text; // текст якоря «тяни карту сюда» (создаёт движок, Field им управляет)
  verb: Text; // глагол дропзоны «наведи»/«брось»
  layerBelow: Container; // слой ПОД картами (сюда «наведи» — незаметно под картами)
  layerAbove: Container; // слой НАД картами (сюда «брось» — поверх карт при ховере)
  config?: FieldConfig; // стиль/поведение (по умолчанию NAKED_FIELD — голый грид)
}

// Состояние аффорданса грида-дропзоны: покой / идёт драг (борд отчётливее + глагол) / ховер над
// гридом (фон + яркий глагол «брось»).
export type FieldDrag = "idle" | "drag" | "hover";

// ——— КОНФИГ Поля (стиль/поведение как ДАННЫЕ, не жёсткое правило) ———
// «Хром» — вся графика поверх голого грида (рамки/якорь/глаголы). null → голый грид без графики.
export interface FieldChrome {
  outerBorder: boolean; // внешняя dashed-рамка Поля (при драге)
  dropzoneBorder: boolean; // рамка грида-дропзоны (при драге: dashed вне / solid+фон над)
  anchorText: string | null; // текст узла-якоря на пустом гриде (null → без якоря)
  verbDrag: string; // глагол при драге вне зоны
  verbHover: string; // глагол при ховере над зоной
  colors: { line: number; hover: number; fill: number; verbDrag: number; verbHover: number; anchor: number };
}
export interface FieldConfig {
  minCols: number; // минимум колонок грида (стартовое; можно менять контроллером)
  maxRows?: number; // максимум строк — при упоре грид растёт вширь (undefined → без предела)
  reserve: boolean; // держать место под следующую карту
  gridPad: number; // отступ рамки/фона от карт (gap между картами не трогает)
  reorder?: boolean; // разрешить перестановку карт внутри грида (стартовое; тоглер меняет)
  chrome: FieldChrome | null; // графика; null → голый грид
}

// Дефолт: ГОЛЫЙ грид без графики (то, что было до графических правок) — flow-паковка, без рамок/якорей.
export const NAKED_FIELD: FieldConfig = { minCols: 3, reserve: true, gridPad: 8, chrome: null };

// Для «обычных сеток»: рамки при драге + глаголы наведи/брось. БЕЗ якоря — якорь это про конкретное
// поле-источник (колода→грид), а не общая сетка; его добавляет своё поле поверх (anchorText). Будем редачить.
export const NORMAL_FIELD: FieldConfig = {
  minCols: 3,
  reserve: true,
  gridPad: 13,
  chrome: {
    outerBorder: true,
    dropzoneBorder: true,
    anchorText: null,
    verbDrag: "наведи",
    verbHover: "брось",
    colors: { line: 0x8fa39a, hover: 0xf2c14e, fill: 0x8fa39a, verbDrag: 0x9aa89f, verbHover: 0xf2c14e, anchor: 0x7d8f84 },
  },
};

export class Field {
  minCols: number; // ЖИВЫЕ параметры грида (стартуют из config, контроллер их меняет)
  maxRows: number | undefined;
  readonly frame = new Graphics(); // dashed-рамка Поля + фон/бордер грида + узел-якорь
  readonly anchor: Text;
  readonly verb: Text;
  readonly stackRect: Rect4;
  readonly grid: FlowGeom;
  // Дерево слотов — ИСТОЧНИК ПОРЯДКА: field(absolute)[ колода(linear), грид(grid) ]. minCols/maxRows
  // грид читает ЖИВЫМИ (геттеры), реордер/дроп — способности (caps) грида.
  private readonly root: Group;
  private readonly deckGroup: Group;
  private readonly gridGroup: Group;
  private readonly layerBelow: Container;
  private readonly layerAbove: Container;
  private readonly config: FieldConfig;
  private dragState: FieldDrag = "idle";

  constructor(o: FieldOpts) {
    this.stackRect = o.stackRect;
    this.grid = o.grid;
    this.anchor = o.anchor;
    this.verb = o.verb;
    this.layerBelow = o.layerBelow;
    this.layerAbove = o.layerAbove;
    this.config = o.config ?? NAKED_FIELD; // по умолчанию — голый грид
    this.minCols = this.config.minCols;
    this.maxRows = this.config.maxRows;

    const cell = { w: this.grid.cell.w, h: this.grid.cell.h };
    // Колода — куча со стаггером «толщины» (диагональ вверх-вправо, свет справа-сверху).
    this.deckGroup = group("field-deck", pile(), o.stackIds.map((id) => leaf(id, id, cell)));
    // Грид — 2D flow-группа; minCols/maxRows ЖИВЫЕ (геттеры), реордер/дроп — способности. Дропзона
    // расширена на gridPad (тот же отступ, что рисует рамку) — дроп у края ловится ровно как рисуется.
    this.gridGroup = group(
      "field-grid",
      gridLayout({ minCols: () => this.minCols, maxRows: () => this.maxRows, gap: this.grid.gap, reserve: this.config.reserve }),
      [],
      { reorder: { enabled: this.config.reorder ?? false }, drop: { pad: this.config.gridPad } },
    );
    // Поле — абсолют: колода на своём месте, грид на своём (origin из FlowGeom).
    this.root = group("field-root", absolute([{ x: this.stackRect.x, y: this.stackRect.y }, { x: this.grid.origin.x, y: this.grid.origin.y }]), [this.deckGroup, this.gridGroup]);

    this.anchor.visible = false;
    this.verb.visible = false;
  }

  // Порядок и реордер — ВЫВОДЯТСЯ из дерева/способностей (публичная поверхность прежняя).
  get stackIds(): string[] {
    return figures(this.deckGroup);
  }
  get gridIds(): string[] {
    return figures(this.gridGroup);
  }
  get reorder(): boolean {
    return this.gridGroup.caps?.reorder?.enabled ?? false;
  }
  set reorder(v: boolean) {
    if (this.gridGroup.caps?.reorder) this.gridGroup.caps.reorder.enabled = v;
  }

  /** Драг начался — грид показывает бордер отчётливее + глагол «наведи». */
  beginDrag(): void {
    this.dragState = "drag";
    this.draw();
  }

  /** Груз двигается — над гридом ли (тогда фон + «брось», иначе «наведи»). */
  hover(cp: { x: number; y: number }): void {
    const gr = this.gridRect();
    const over = cp.x >= gr.x && cp.x <= gr.x + gr.w && cp.y >= gr.y && cp.y <= gr.y + gr.h;
    this.dragState = over ? "hover" : "drag";
    this.draw();
  }

  /** Драг закончился — обратно в покой. */
  endDrag(): void {
    this.dragState = "idle";
    this.draw();
  }

  owns(id: string): boolean {
    return has(this.root, id);
  }

  allIds(): string[] {
    return figures(this.root);
  }

  /** Габарит грид-рамки/фона: bounding box ячеек (из дерева) + отступ GRID_PAD со всех сторон (карты
   *  не прижаты к границам). Позиции карт отступ НЕ меняет — расстояния между картами прежние. */
  gridRect(): Rect4 {
    const s = measure(this.gridGroup);
    const p = this.config.gridPad;
    return { x: this.grid.origin.x - p, y: this.grid.origin.y - p, w: s.w + 2 * p, h: s.h + 2 * p };
  }

  /** Внешняя рамка Поля — объемлет стопку и грид (+ отступы, снизу/справа больше). */
  outerRect(): Rect4 {
    const g = this.gridRect();
    const padTL = 14;
    const padR = 30;
    const padB = 30;
    const minX = Math.min(this.stackRect.x, g.x) - padTL;
    const minY = Math.min(this.stackRect.y, g.y) - padTL;
    const maxX = Math.max(this.stackRect.x + this.stackRect.w, g.x + g.w) + padR;
    const maxY = Math.max(this.stackRect.y + this.stackRect.h, g.y + g.h) + padB;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  /** Где отдыхает карта — берётся из ДЕРЕВА (дом вытекает из раскладок по пути корень→лист).
   *  Неизвестная карта → центр стопки (запасной). */
  homeOf(id: string): { x: number; y: number } {
    return slotHomeOf(this.root, id) ?? { x: this.stackRect.x + this.stackRect.w / 2, y: this.stackRect.y + this.stackRect.h / 2 };
  }

  /** Дроп карты — целиком делегируется дереву (dropInto: найти дропзону под точкой с учётом pad,
   *  перенести лист ИЛИ переставить по позиции). flip (раскрыть карту) — только вход из стопки в
   *  грид, т.е. перемещение, а не реордер. Возвращает moved (→ перелайаут) и flip (→ requestFlip). */
  place(id: string, cp: { x: number; y: number }): { moved: boolean; flip: boolean } {
    const r = dropInto(this.root, id, cp);
    return { moved: r.moved, flip: r.moved && !r.reordered };
  }

  /** Нарисовать «хром» — вся графика в fieldPaint.ts (SRP: Field держит механику, не чертит).
   *  Собираем геометрию/состояние и делегируем. */
  draw(): void {
    paintFieldChrome({
      frame: this.frame,
      anchor: this.anchor,
      verb: this.verb,
      layerBelow: this.layerBelow,
      layerAbove: this.layerAbove,
      chrome: this.config.chrome,
      dragState: this.dragState,
      gridRect: this.gridRect(),
      outerRect: this.outerRect(),
      gridEmpty: this.gridIds.length === 0,
      grid: this.grid,
      stackRect: this.stackRect,
    });
  }
}
