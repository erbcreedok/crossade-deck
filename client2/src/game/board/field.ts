import { Container, Graphics, Text } from "pixi.js";
import { type FlowGeom } from "./dynamicGrid";
import { grid as gridLayout, linear, absolute } from "../slot/layouts";
import { leaf, group, type Group } from "../slot/types";
import { figures, has, measure, homeOf as slotHomeOf } from "../slot/slot";
import { dropInto } from "../slot/mutate";

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
    // Колода — 1D-группа: почти-стопка со стаггером «толщины» (нахлёст на ~0.5px).
    this.deckGroup = group("field-deck", linear({ axis: "x", gap: 0.5 - cell.w }), o.stackIds.map((id) => leaf(id, id, cell)));
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

  /** Нарисовать «хром»: в ПОКОЕ бордеров НЕТ (только узел-якорь). Бордеры появляются при драге:
   *  внешняя рамка Поля + грид-дропзона (драг вне зоны — dashed; ховер над зоной — solid + фон). */
  draw(): void {
    this.frame.clear();
    const chrome = this.config.chrome;
    if (!chrome) {
      // Голый грид — без графики (дефолт).
      this.anchor.visible = false;
      this.verb.visible = false;
      return;
    }
    const gr = this.gridRect();
    const col = chrome.colors;
    if (this.dragState !== "idle") {
      if (chrome.outerBorder) dashRect(this.frame, this.outerRect(), 11, 7, col.line, 2, 1, 12); // рамка Поля на драге
      if (chrome.dropzoneBorder) {
        if (this.dragState === "hover") this.frame.roundRect(gr.x, gr.y, gr.w, gr.h, 8).fill({ color: col.fill, alpha: 0.16 }).stroke({ width: 2.5, color: col.hover }); // над зоной — solid + фон
        else dashRect(this.frame, gr, 9, 6, col.line, 1.5, 1, 8); // драг вне зоны — dashed (тот же радиус, что у solid)
      }
    }

    // Узел-якорь — только в покое, на пустом гриде и если задан текст.
    const idleEmpty = this.dragState === "idle" && this.gridIds.length === 0 && chrome.anchorText !== null;
    this.anchor.visible = idleEmpty;
    if (idleEmpty) {
      this.anchor.text = chrome.anchorText!;
      const cell = this.grid.cell;
      const first = { x: this.grid.origin.x + cell.w / 2, y: this.grid.origin.y + cell.h / 2 };
      const from = { x: this.stackRect.x + this.stackRect.w + 6, y: this.stackRect.y + 4 };
      const to = { x: first.x - cell.w * 0.32, y: first.y };
      drawKnot(this.frame, from, to, col.anchor, 1.5);
      this.anchor.position.set((from.x + to.x) / 2 + 6, Math.min(from.y, to.y) - 30);
    }

    // Глагол дропзоны: «наведи» (драг) — ПОД картами; «брось» (ховер) — НАД картами.
    const showVerb = this.dragState !== "idle";
    this.verb.visible = showVerb;
    if (showVerb) {
      const over = this.dragState === "hover";
      this.verb.text = over ? chrome.verbHover : chrome.verbDrag;
      this.verb.style.fill = over ? col.verbHover : col.verbDrag;
      this.verb.style.fontSize = over ? 20 : 16;
      // «брось» лежит ПОВЕРХ карт — без обводки/тени сливается с лицами. «наведи» под картами — тихий.
      this.verb.style.stroke = over ? { color: 0x14201b, width: 4 } : { color: 0, width: 0 };
      this.verb.style.dropShadow = over ? { color: 0x000000, alpha: 0.55, blur: 5, distance: 0, angle: 0 } : false;
      this.verb.position.set(gr.x + gr.w / 2, gr.y + gr.h / 2);
      (over ? this.layerAbove : this.layerBelow).addChild(this.verb);
    }
  }
}

// ——— «хром» Поля (dashed-рамка + узел-якорь) ———

// Пройтись пунктиром по ломаной (замкнутой): узор dash/gap НЕПРЕРЫВЕН через углы (carry переносит
// фазу в следующий сегмент), поэтому скруглённые углы выходят ровными, а не «рвутся» на стыках.
function dashPath(g: Graphics, pts: Array<{ x: number; y: number }>, dash: number, gap: number, color: number, width: number, alpha: number): void {
  const seg = dash + gap;
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    let d = 0;
    while (d < len) {
      const patPos = (carry + d) % seg;
      if (patPos < dash) {
        const draw = Math.min(dash - patPos, len - d);
        g.moveTo(a.x + ux * d, a.y + uy * d).lineTo(a.x + ux * (d + draw), a.y + uy * (d + draw));
        d += draw;
      } else {
        d += seg - patPos;
      }
    }
    carry = (carry + len) % seg;
  }
  g.stroke({ width, color, alpha });
}

// Точки контура прямоугольника: острого или скруглённого (углы — короткими дугами).
function rectPoints(r: Rect4, radius: number): Array<{ x: number; y: number }> {
  if (radius <= 0) return [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }, { x: r.x, y: r.y }];
  const rr = Math.min(radius, r.w / 2, r.h / 2);
  const pts: Array<{ x: number; y: number }> = [];
  const arc = (cx: number, cy: number, a0: number, a1: number): void => {
    const N = 5;
    for (let i = 0; i <= N; i++) {
      const a = a0 + ((a1 - a0) * i) / N;
      pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
    }
  };
  arc(r.x + rr, r.y + rr, Math.PI, Math.PI * 1.5); // верх-лево
  arc(r.x + r.w - rr, r.y + rr, Math.PI * 1.5, Math.PI * 2); // верх-право
  arc(r.x + r.w - rr, r.y + r.h - rr, 0, Math.PI * 0.5); // низ-право
  arc(r.x + rr, r.y + r.h - rr, Math.PI * 0.5, Math.PI); // низ-лево
  pts.push({ ...pts[0]! }); // замкнуть
  return pts;
}

// Dashed-прямоугольник (со скруглением углов при radius>0 — как у solid-рамки дропзоны).
export function dashRect(g: Graphics, r: Rect4, dash: number, gap: number, color: number, width: number, alpha = 1, radius = 0): void {
  dashPath(g, rectPoints(r, radius), dash, gap, color, width, alpha);
}

// Точки пути-УЗЛА: базовая линия from→to с петлёй посередине (перекрещивается — «узел»).
function knotPoints(from: { x: number; y: number }, to: { x: number; y: number }): Array<{ x: number; y: number }> {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const R = 15; // радиус петли
  const N = 56;
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    let x = from.x + dx * t;
    let y = from.y + dy * t;
    const s = (t - 0.32) / 0.34; // петля активна на t∈[0.32,0.66]
    if (s >= 0 && s <= 1) {
      const ang = s * Math.PI * 2 - Math.PI / 2; // полный оборот → перекрещивание
      x += px * Math.cos(ang) * R + ux * Math.sin(ang) * R * 0.65;
      y += py * Math.cos(ang) * R + uy * Math.sin(ang) * R * 0.65;
    }
    pts.push({ x, y });
  }
  return pts;
}

// Узел-стрелка: dashed-петля + наконечник. Тонкая/тусклая — «менее навязчивая».
function drawKnot(g: Graphics, from: { x: number; y: number }, to: { x: number; y: number }, color: number, width: number): void {
  const pts = knotPoints(from, to);
  // dashed по количеству точек (плотная выборка): рисуем 2 сегмента, пропускаем 2.
  let i = 0;
  while (i < pts.length - 1) {
    g.moveTo(pts[i]!.x, pts[i]!.y);
    for (let k = 0; k < 2 && i < pts.length - 1; k++, i++) g.lineTo(pts[i + 1]!.x, pts[i + 1]!.y);
    i += 2;
  }
  g.stroke({ width, color });
  // наконечник по касательной последнего сегмента.
  const a = pts[pts.length - 2]!;
  const b = pts[pts.length - 1]!;
  const tx = b.x - a.x;
  const ty = b.y - a.y;
  const tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl;
  const uy = ty / tl;
  const nx = -uy;
  const ny = ux;
  const s = 11;
  g.moveTo(b.x - ux * s + nx * s * 0.5, b.y - uy * s + ny * s * 0.5)
    .lineTo(b.x, b.y)
    .lineTo(b.x - ux * s - nx * s * 0.5, b.y - uy * s - ny * s * 0.5)
    .stroke({ width, color });
}
