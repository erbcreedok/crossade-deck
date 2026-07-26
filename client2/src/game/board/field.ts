import { Container, Graphics, Text } from "pixi.js";
import { flowLayout, type FlowGeom } from "./dynamicGrid";

// ПОЛЕ — обособленный модуль механики (программируется ЗДЕСЬ, движок только импортит и делегирует).
// Владелец: закрытая стопка + flow-грид (карты пакуются по индексу, минимум 3 колонки, всегда резерв
// места под следующую). Field хранит ЛОГИКУ (какие id в стопке/гриде) + ГЕОМЕТРИЮ + рисует свою
// «хром»-графику (dashed-рамка Поля + якорь-узел). Карточные визуалы (Card) остаются в движке —
// Field лишь говорит, где им отдыхать (homeOf), и кто ему принадлежит (owns).

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
  minCols: number; // минимум колонок грида
  reserve: boolean; // держать место под следующую карту
  gridPad: number; // отступ рамки/фона от карт (gap между картами не трогает)
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
  stackIds: string[];
  gridIds: string[] = [];
  readonly frame = new Graphics(); // dashed-рамка Поля + фон/бордер грида + узел-якорь
  readonly anchor: Text;
  readonly verb: Text;
  readonly stackRect: Rect4;
  readonly grid: FlowGeom;
  private readonly layerBelow: Container;
  private readonly layerAbove: Container;
  private readonly config: FieldConfig;
  private dragState: FieldDrag = "idle";

  constructor(o: FieldOpts) {
    this.stackRect = o.stackRect;
    this.grid = o.grid;
    this.stackIds = [...o.stackIds];
    this.anchor = o.anchor;
    this.verb = o.verb;
    this.layerBelow = o.layerBelow;
    this.layerAbove = o.layerAbove;
    this.config = o.config ?? NAKED_FIELD; // по умолчанию — голый грид
    this.anchor.visible = false;
    this.verb.visible = false;
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
    return this.stackIds.includes(id) || this.gridIds.includes(id);
  }

  allIds(): string[] {
    return [...this.stackIds, ...this.gridIds];
  }

  private layout() {
    return flowLayout(this.gridIds.length, this.grid, { minCols: this.config.minCols, reserve: this.config.reserve });
  }

  /** Габарит грид-рамки/фона: bounding box ячеек + отступ GRID_PAD со всех сторон (карты не прижаты
   *  к границам). Позиции карт (flowLayout) отступ НЕ меняет — расстояния между картами прежние. */
  gridRect(): Rect4 {
    const s = this.layout().size;
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

  /** Где отдыхает карта: в стопке — колода со стаггером «толщины»; в гриде — flow-позиция по индексу. */
  homeOf(id: string): { x: number; y: number } {
    const base = { x: this.stackRect.x + this.stackRect.w / 2, y: this.stackRect.y + this.stackRect.h / 2 };
    const si = this.stackIds.indexOf(id);
    if (si >= 0) return { x: base.x + si * 0.35, y: base.y - si * 0.3 };
    const gi = this.gridIds.indexOf(id);
    if (gi >= 0) return this.layout().centers[gi] ?? base;
    return base;
  }

  /** Дроп карты: попал в грид → уходит в грид (append по индексу). Возвращает, сдвинулась ли. */
  place(id: string, cp: { x: number; y: number }): { moved: boolean } {
    const gr = this.gridRect();
    const inGrid = cp.x >= gr.x && cp.x <= gr.x + gr.w && cp.y >= gr.y && cp.y <= gr.y + gr.h;
    if (inGrid && !this.gridIds.includes(id)) {
      this.stackIds = this.stackIds.filter((x) => x !== id);
      this.gridIds.push(id);
      return { moved: true };
    }
    return { moved: false };
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
      if (chrome.outerBorder) dashRect(this.frame, this.outerRect(), 11, 7, col.line, 2); // рамка Поля на драге
      if (chrome.dropzoneBorder) {
        if (this.dragState === "hover") this.frame.roundRect(gr.x, gr.y, gr.w, gr.h, 8).fill({ color: col.fill, alpha: 0.16 }).stroke({ width: 2.5, color: col.hover }); // над зоной — solid + фон
        else dashRect(this.frame, gr, 9, 6, col.line, 1.5); // драг вне зоны — dashed
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
      this.verb.position.set(gr.x + gr.w / 2, gr.y + gr.h / 2);
      (over ? this.layerAbove : this.layerBelow).addChild(this.verb);
    }
  }
}

// ——— «хром» Поля (dashed-рамка + узел-якорь) ———

// Dashed-прямоугольник (сегменты по 4 рёбрам).
export function dashRect(g: Graphics, r: Rect4, dash: number, gap: number, color: number, width: number, alpha = 1): void {
  const seg = dash + gap;
  const line = (x1: number, y1: number, x2: number, y2: number): void => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    for (let d = 0; d < len; d += seg) {
      const e = Math.min(d + dash, len);
      g.moveTo(x1 + ux * d, y1 + uy * d).lineTo(x1 + ux * e, y1 + uy * e);
    }
  };
  line(r.x, r.y, r.x + r.w, r.y);
  line(r.x + r.w, r.y, r.x + r.w, r.y + r.h);
  line(r.x + r.w, r.y + r.h, r.x, r.y + r.h);
  line(r.x, r.y + r.h, r.x, r.y);
  g.stroke({ width, color, alpha });
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
