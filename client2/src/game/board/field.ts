import { Container, Graphics, Text } from "pixi.js";
import { type FlowGeom } from "./dynamicGrid";
import { PIXEL_FONT } from "../engine/constants";
import { grid as gridLayout, pile, absolute } from "../slot/layouts";
import { leaf, group, type Group } from "../slot/types";
import { figures, has, measure, homeOf as slotHomeOf } from "../slot/slot";
import { dropInto } from "../slot/mutate";
import { paintFieldDecor } from "./fieldPaint";
import type { Configurable, Param } from "../ui/controls";

// ПОЛЕ — обособленный модуль механики (программируется ЗДЕСЬ, движок только импортит и делегирует).
// ПОРЯДОК карт держит ДЕРЕВО СЛОТОВ: field(absolute)[ колода(linear), грид(grid, reorder+drop) ] —
// то же дерево, что и любой контейнер (slot/). Field — тонкий адаптер: даёт «декор»-графику
// (dashed-рамка + якорь), геометрию дропзоны и делегирует порядок/дом дереву (homeOf/reorder/detach).
// Карточные визуалы (Card) остаются в движке — Field лишь говорит, где им отдыхать и кто ему принадлежит.

export interface Rect4 {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FieldOpts {
  left: number; // top-left бокса содержимого Поля (заголовок выше движок рисует сам)
  top: number;
  cell: { w: number; h: number }; // размер карточной ячейки (движок знает по размеру карты)
  stackIds: string[]; // карты стопки (низ→верх)
  layerBelow: Container; // слой ПОД картами (сюда «наведи» — незаметно под картами)
  layerAbove: Container; // слой НАД картами (сюда «брось» — поверх карт при ховере)
  config?: FieldConfig; // стиль/поведение (по умолчанию NAKED_FIELD — голый грид)
}

// Состояние аффорданса грида-дропзоны: покой / идёт драг (борд отчётливее + глагол) / ховер над
// гридом (фон + яркий глагол «брось»).
export type FieldDrag = "idle" | "drag" | "hover";

// ——— КОНФИГ Поля (стиль/поведение как ДАННЫЕ, не жёсткое правило) ———
// «Декор» — вся графика поверх голого грида (рамки/якорь/глаголы). null → голый грид без графики.
export interface FieldDecor {
  outerBorder: boolean; // внешняя dashed-рамка Поля (при драге)
  dropzoneBorder: boolean; // рамка грида-дропзоны (при драге: dashed вне / solid+фон над)
  anchorText: string | null; // текст узла-якоря на пустом гриде (null → без якоря)
  verbDrag: string; // глагол при драге вне зоны
  verbHover: string; // глагол при ховере над зоной
  colors: { line: number; hover: number; fill: number; verbDrag: number; verbHover: number; anchor: number };
}
export interface FieldConfig {
  // Границы грида — СИММЕТРИЧНО по обеим осям (min/max; min==max → фикс; undefined max → без предела).
  // Стартовые значения — контроллеры их меняют.
  colsMin: number;
  colsMax?: number;
  rowsMin: number;
  rowsMax?: number;
  grow?: "square" | "down" | "right"; // куда растёт при свободе (по умолчанию square)
  reserve: boolean; // держать место под следующую карту
  gridPad: number; // отступ рамки/фона от карт (gap между картами не трогает)
  innerPad: number; // отступ от top-left бокса Поля до содержимого
  cellGap: number; // зазор между ячейками грида
  deckGap: number; // зазор колода→грид (под стрелку-якорь; больше — длиннее стрелка)
  reorder?: boolean; // разрешить перестановку карт внутри грида (стартовое; тоглер меняет)
  decor: FieldDecor | null; // графика; null → голый грид
}

// Дефолт: ГОЛЫЙ грид без графики (то, что было до графических правок) — flow-паковка, без рамок/якорей.
export const NAKED_FIELD: FieldConfig = { colsMin: 3, rowsMin: 1, reserve: true, gridPad: 8, innerPad: 14, cellGap: 8, deckGap: 24, decor: null };

// Для «обычных сеток»: рамки при драге + глаголы наведи/брось. БЕЗ якоря — якорь это про конкретное
// поле-источник (колода→грид), а не общая сетка; его добавляет своё поле поверх (anchorText). Будем редачить.
export const NORMAL_FIELD: FieldConfig = {
  colsMin: 3,
  rowsMin: 1,
  reserve: true,
  gridPad: 13,
  innerPad: 14,
  cellGap: 8,
  deckGap: 24,
  decor: {
    outerBorder: true,
    dropzoneBorder: true,
    anchorText: null,
    verbDrag: "наведи",
    verbHover: "брось",
    colors: { line: 0x8fa39a, hover: 0xf2c14e, fill: 0x8fa39a, verbDrag: 0x9aa89f, verbHover: 0xf2c14e, anchor: 0x7d8f84 },
  },
};

export class Field implements Configurable {
  // ЖИВЫЕ границы грида (стартуют из config, контроллеры их меняют). undefined max → без предела.
  colsMin: number;
  colsMax: number | undefined;
  rowsMin: number;
  rowsMax: number | undefined;
  readonly frame = new Graphics(); // dashed-рамка Поля + фон/бордер грида + узел-якорь
  readonly anchor: Text; // текст узла-якоря (Поле создаёт и ведёт сам)
  readonly verb: Text; // глагол дропзоны «наведи»/«брось»
  readonly stackRect: Rect4; // область колоды — Поле СЧИТАЕТ само (не инжект)
  readonly grid: FlowGeom; // геометрия грида — тоже своя
  private readonly cell: { w: number; h: number };
  // Дерево слотов — ИСТОЧНИК ПОРЯДКА: field(absolute)[ колода(linear), грид(grid) ]. minCols/maxRows
  // грид читает ЖИВЫМИ (геттеры), реордер/дроп — способности (caps) грида.
  private readonly root: Group;
  private readonly deckGroup: Group;
  private readonly gridGroup: Group;
  private readonly layerBelow: Container;
  private readonly layerAbove: Container;
  private readonly config: FieldConfig;
  private dragState: FieldDrag = "idle";
  private dragBaseRect: Rect4 | null = null; // gridRect БЕЗ дыры на время драга (карт count не меняется)
  private lastGap: number | null = null; // последний индекс дыры (чтобы не пересчитывать зря)

  constructor(o: FieldOpts) {
    this.config = o.config ?? NAKED_FIELD; // по умолчанию — голый грид
    this.cell = o.cell;
    this.layerBelow = o.layerBelow;
    this.layerAbove = o.layerAbove;
    this.colsMin = this.config.colsMin;
    this.colsMax = this.config.colsMax;
    this.rowsMin = this.config.rowsMin;
    this.rowsMax = this.config.rowsMax;

    // Раскладка Поля — СВОЯ (не инжектится движком): колода в углу бокса, грид правее на deckGap.
    const pad = this.config.innerPad;
    this.stackRect = { x: o.left + pad, y: o.top + pad, w: this.cell.w, h: this.cell.h };
    this.grid = { cell: this.cell, gap: this.config.cellGap, origin: { x: this.stackRect.x + this.cell.w + this.config.deckGap, y: o.top + pad } };

    // Тексты декора Поле создаёт САМО (свои части); движок лишь даёт слои, куда их класть.
    this.anchor = new Text({ style: { fontFamily: PIXEL_FONT, fontSize: 12, fill: 0x9aa89f, align: "center" } });
    this.anchor.anchor.set(0.5, 0);
    this.verb = new Text({ style: { fontFamily: PIXEL_FONT, fontSize: 16, fill: 0x9aa89f, align: "center" } });
    this.verb.anchor.set(0.5, 0.5);

    const cell = this.cell;
    // Колода — куча со стаггером «толщины» (диагональ вверх-вправо, свет справа-сверху).
    this.deckGroup = group("field-deck", pile(), o.stackIds.map((id) => leaf(id, id, cell)));
    // Грид — 2D flow-группа; minCols/maxRows ЖИВЫЕ (геттеры), реордер/дроп — способности. Дропзона
    // расширена на gridPad (тот же отступ, что рисует рамку) — дроп у края ловится ровно как рисуется.
    this.gridGroup = group(
      "field-grid",
      gridLayout({ cell: this.grid.cell, cols: { min: () => this.colsMin, max: () => this.colsMax }, rows: { min: () => this.rowsMin, max: () => this.rowsMax }, grow: this.config.grow, gap: this.grid.gap, reserve: this.config.reserve }),
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

  /** Настраиваемые параметры Поля как ДАННЫЕ — контроллеры строятся из этого (generic attachControls),
   *  а не хардкодом. Добавить настройку = добавить строчку здесь. */
  params(): Param[] {
    const inf = (v: number) => (v === 0 ? "∞" : String(v)); // 0 в степпере макс = без предела
    return [
      { kind: "number", label: "мин колонок", min: 1, max: 12, get: () => this.colsMin, set: (v) => (this.colsMin = v) },
      { kind: "number", label: "макс колонок", min: 0, max: 12, format: inf, get: () => this.colsMax ?? 0, set: (v) => (this.colsMax = v === 0 ? undefined : v) },
      { kind: "number", label: "мин строк", min: 1, max: 12, get: () => this.rowsMin, set: (v) => (this.rowsMin = v) },
      { kind: "number", label: "макс строк", min: 0, max: 12, format: inf, get: () => this.rowsMax ?? 0, set: (v) => (this.rowsMax = v === 0 ? undefined : v) },
      { kind: "bool", label: "реордер в гриде", get: () => this.reorder, set: (v) => (this.reorder = v) },
    ];
  }

  /** Драг начался — бордер отчётливее + глагол; кэшируем базовый gridRect (без дыры). */
  beginDrag(): void {
    this.dragState = "drag";
    this.lastGap = null;
    this.gridGroup.gap = undefined;
    this.dragBaseRect = this.gridRect(); // база: карт count не меняется до дропа
    this.draw();
  }

  /** Груз двигается: над гридом → резервируем ДЫРУ на индексе дропа (соседи раздвигаются), иначе
   *  закрываем. draggedId исключается из раскладки (её тащат). Возвращает, изменилась ли раскладка
   *  (движку — чтобы ре-спрингнуть карты только при смене индекса). */
  hover(cp: { x: number; y: number }, draggedId?: string): boolean {
    const gr = this.dragBaseRect ?? this.gridRect();
    const over = cp.x >= gr.x && cp.x <= gr.x + gr.w && cp.y >= gr.y && cp.y <= gr.y + gr.h;
    const k = over ? this.gridDropIndex(cp) : null;
    if (k === this.lastGap) return false;
    this.lastGap = k;
    this.dragState = over ? "hover" : "drag";
    this.gridGroup.gap = k === null ? undefined : { index: k, size: this.grid.cell, skip: draggedId };
    this.draw();
    return true;
  }

  /** Драг закончился — покой, дыра закрыта. */
  endDrag(): void {
    this.dragState = "idle";
    this.gridGroup.gap = undefined;
    this.lastGap = null;
    this.dragBaseRect = null;
    this.draw();
  }

  // Индекс ячейки грида под точкой (как при дропе) — через раскладку грида, а не второй экземпляр.
  private gridDropIndex(cp: { x: number; y: number }): number {
    const sizes = this.gridGroup.children.map(measure);
    const local = { x: cp.x - this.grid.origin.x, y: cp.y - this.grid.origin.y };
    return this.gridGroup.layout.indexAt(local, sizes) ?? this.gridGroup.children.length;
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

  /** Высота, которую Поле резервирует под себя (движку — чтобы класть контроллеры ниже): рамка +
   *  сетка на maxRows строк. Из данных config, а не магической константы в движке. */
  reservedHeight(): number {
    const rows = this.rowsMax ?? 4;
    return this.config.innerPad * 2 + this.cell.h * rows + Math.max(0, rows - 1) * this.config.cellGap;
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

  /** Нарисовать «декор» — вся графика в fieldPaint.ts (SRP: Field держит механику, не чертит).
   *  Собираем геометрию/состояние и делегируем. */
  draw(): void {
    paintFieldDecor({
      frame: this.frame,
      anchor: this.anchor,
      verb: this.verb,
      layerBelow: this.layerBelow,
      layerAbove: this.layerAbove,
      decor: this.config.decor,
      dragState: this.dragState,
      gridRect: this.gridRect(),
      outerRect: this.outerRect(),
      gridEmpty: this.gridIds.length === 0,
      grid: this.grid,
      stackRect: this.stackRect,
    });
  }
}
