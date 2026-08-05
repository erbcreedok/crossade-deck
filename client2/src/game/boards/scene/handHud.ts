// ЭКРАННАЯ РУКА (HUD) — РАСКЛАДКА и СЛОЙ, не владелец нод. Ключевой канон: одна нода на карту.
// Карты руки — те же самые узлы nodeStore (в byId), просто их root перекладывается СЮДА, на
// экранно-фиксированный слой (chrome, не зумится), и позиционируется в экранных координатах. Переход
// борда↔рука — непрерывный полёт ОДНОЙ ноды (nodeStore конвертирует координаты/масштаб на границе).
//
// HandHud держит: слой (root, на chrome), полосу-дропзону со состояниями rest/armed/hot и ЧИСТУЮ
// раскладку (poseOf/cardAt/overBand/insertIndexAt). Позиции узлам ставит nodeStore, спрашивая poseOf.

import { Container, Graphics } from "pixi.js";
import { CARD } from "../../crossade/tree";
import { handStrip, handStripWithGap, handCardSize } from "../hand/handStrip";
import { ACTION_BAR_H } from "./chrome";

const SIDE = 16; // поля по краям экрана
const GAP = 12; // зазор между картами в свободном ряду
const PAD_BOTTOM = 8; // отступ полосы руки над полосой действий
const BG = 0x1a241e;

/** Состояние дроп-зоны руки: покой / груз в полёте где-то / груз над рукой (владелец). */
export type HandZone = "rest" | "armed" | "hot";
/** Экранная поза карты руки: центр (x,y) и МАСШТАБ ноды (body.scaleVal), чтобы карта была нужной высоты. */
export interface HandPose {
  x: number;
  y: number;
  scale: number;
}

function handCell(w: number, h: number): { w: number; h: number } {
  return handCardSize(w - SIDE * 2, h, CARD);
}

export interface HandHudDeps {
  /** Рука экранная (placement:"screen")? Иначе руку раскладывает дерево борды. */
  enabled(): boolean;
  /** Карты своей руки по порядку (handKey(selfSeat)). */
  members(): readonly string[];
  accent(): number;
  wake(): void;
  /** Перецелить карты руки на свежие позы (гэп-превью раздвинул/сомкнул ряд) — зовёт nodeStore. */
  retarget(): void;
}

export class SceneHandHud {
  /** Слой руки на chrome: сюда nodeStore перекладывает root'ы карт руки (экранно-фиксированные). */
  readonly root = new Container();
  private readonly zone = new Graphics();
  private size = { w: 0, h: 0 };
  private zoneState: HandZone = "rest";
  private dragging: string | null = null; // карта, поднятая в драг: из строки исключается (гэп закрыт)
  private preview: number | null = null; // гэп-превью: индекс вставки, под который ряд раздвинут

  constructor(private readonly deps: HandHudDeps) {
    this.root.sortableChildren = true; // правая карта поверх левой; зона — под всеми
    this.zone.zIndex = -1000;
    this.root.addChild(this.zone);
  }

  /** Сколько снизу занимает band руки — стол вписывается в остаток (fitBoard). 0 — руки нет. */
  reservedBottom(screenW: number, screenH: number): number {
    return this.deps.enabled() ? handCell(screenW, screenH).h + PAD_BOTTOM + ACTION_BAR_H : 0;
  }

  /** Перерисовать дроп-зону под текущий размер (позиции карт ставит nodeStore по poseOf). */
  layout(w: number, h: number): void {
    this.size = { w, h };
    this.paintZone();
  }

  /** Экранная поза карты руки id (центр + scale ноды), либо null — она не в руке или её тащат. */
  poseOf(id: string): HandPose | null {
    if (!this.deps.enabled()) return null;
    const ids = this.laidIds();
    const i = ids.indexOf(id);
    if (i < 0) return null;
    const cell = handCell(this.size.w, this.size.h);
    const centerY = this.size.h - ACTION_BAR_H - PAD_BOTTOM - cell.h / 2;
    const width = Math.max(cell.w, this.size.w - SIDE * 2);
    const poses = this.preview === null ? handStrip(ids.length, cell, width, GAP) : handStripWithGap(ids.length, this.preview, cell, width, GAP);
    const p = poses[i]!;
    return { x: SIDE + p.x, y: centerY, scale: cell.h / CARD.h };
  }

  // ——— драг руки↔борда: захват, дроп-зона, снятие ———

  /** id карты руки под ЭКРАННОЙ точкой (верхняя по нахлёсту) — для захвата. Помечает её dragging. */
  pickAt(sx: number, sy: number): string | null {
    const id = this.cardAt(sx, sy);
    if (id !== null) {
      this.dragging = id;
      this.deps.wake();
    }
    return id;
  }

  /** id карты руки под точкой, иначе null. Перетаскиваемую пропускаем. */
  cardAt(sx: number, sy: number): string | null {
    const cell = handCell(this.size.w, this.size.h);
    let hit: string | null = null;
    for (const id of this.laidIds()) {
      const p = this.poseOf(id);
      if (p && Math.abs(sx - p.x) <= cell.w / 2 && Math.abs(sy - p.y) <= cell.h / 2) hit = id;
    }
    return hit;
  }

  /** Экранная поза перетаскиваемой карты, пока палец над рукой: следует за X (зажатым в полосу), на
   *  уровне карт руки, масштабом руки — карта на слое руки, сверху, среди своих. */
  dragPose(sx: number): HandPose {
    const cell = handCell(this.size.w, this.size.h);
    const centerY = this.size.h - ACTION_BAR_H - PAD_BOTTOM - cell.h / 2;
    const min = SIDE + cell.w / 2;
    const max = this.size.w - SIDE - cell.w / 2;
    return { x: Math.max(min, Math.min(max, sx)), y: centerY, scale: cell.h / CARD.h };
  }

  /** Экранная точка над полосой руки (дроп-зоной)? */
  overBand(sx: number, sy: number): boolean {
    const b = this.bandRect();
    return sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h;
  }

  /** Индекс вставки в руку по X: сколько центров карт левее точки в БАЗОВОМ ряду (без гэп-превью —
   *  подсказка не двигает цель, см. handStripWithGap). Перетаскиваемую не считаем. */
  insertIndexAt(sx: number): number {
    const cell = handCell(this.size.w, this.size.h);
    const poses = handStrip(this.laidIds().length, cell, Math.max(cell.w, this.size.w - SIDE * 2), GAP);
    return poses.filter((p) => SIDE + p.x < sx).length;
  }

  /** Груз навис над рукой в экранной точке: зона hot + гэп-превью — ряд раздвигается под индекс
   *  вставки, игрок ВИДИТ, куда ляжет карта, до отпускания. */
  hoverAt(sx: number): void {
    this.setZone("hot");
    const idx = this.insertIndexAt(sx);
    if (idx === this.preview) return;
    this.preview = idx;
    this.deps.retarget();
    this.deps.wake();
  }

  setZone(state: HandZone): void {
    if (state === this.zoneState) return;
    this.zoneState = state;
    if (state !== "hot") this.clearPreview(); // груз ушёл с руки — гэп смыкается
    this.paintZone();
    this.deps.wake();
  }

  /** Снять пометку драга (карта вернулась/ушла на стол): вернуть покой зоны и полную строку. */
  clearDragging(): void {
    this.dragging = null;
    this.zoneState = "rest";
    this.clearPreview();
    this.paintZone();
    this.deps.wake();
  }

  private clearPreview(): void {
    if (this.preview === null) return;
    this.preview = null;
    this.deps.retarget();
  }

  /** id карт руки, участвующих в РАСКЛАДКЕ (без перетаскиваемой — под неё гэп закрыт). */
  private laidIds(): string[] {
    return this.deps.members().filter((id) => id !== this.dragging);
  }

  private bandRect(): { x: number; y: number; w: number; h: number } {
    const cell = handCell(this.size.w, this.size.h);
    const cy = this.size.h - ACTION_BAR_H - PAD_BOTTOM - cell.h / 2;
    return { x: SIDE - GAP, y: cy - cell.h / 2 - GAP, w: this.size.w - 2 * (SIDE - GAP), h: cell.h + 2 * GAP };
  }

  private paintZone(): void {
    const g = this.zone;
    g.clear();
    if (!this.deps.enabled()) return;
    const b = this.bandRect();
    g.roundRect(b.x, b.y, b.w, b.h, 12).fill({ color: BG, alpha: 0.14 });
    if (this.zoneState === "armed") {
      dashedRoundRect(g, b.x, b.y, b.w, b.h, 12);
      g.stroke({ width: 2, color: 0x9aa79c, alpha: 0.95 });
    } else {
      const hot = this.zoneState === "hot";
      g.roundRect(b.x, b.y, b.w, b.h, 12).stroke({ width: hot ? 3 : 1.5, color: hot ? this.deps.accent() : 0x5f7a6d, alpha: hot ? 1 : 0.3 });
    }
  }

  /** Дев-хук: экранные ЦЕЛЕВЫЕ позиции карт руки по порядку. */
  screenPoses(): { id: string; x: number; y: number }[] {
    const out: { id: string; x: number; y: number }[] = [];
    for (const id of this.deps.members()) {
      const p = this.poseOf(id);
      if (p) out.push({ id, x: p.x, y: p.y });
    }
    return out;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/** Пунктирная обводка скруглённого прямоугольника: прямые рёбра штрихами, углы — сплошными дугами.
 *  Путь копится в g; вызвать g.stroke() после. Pixi v8 dash-паттерна не имеет — рисуем сегментами. */
function dashedRoundRect(g: Graphics, x: number, y: number, w: number, h: number, r: number, dash = 9, gap = 7): void {
  const x2 = x + w;
  const y2 = y + h;
  dashLine(g, x + r, y, x2 - r, y, dash, gap);
  dashLine(g, x2, y + r, x2, y2 - r, dash, gap);
  dashLine(g, x2 - r, y2, x + r, y2, dash, gap);
  dashLine(g, x, y2 - r, x, y + r, dash, gap);
  g.moveTo(x2 - r, y).arc(x2 - r, y + r, r, -Math.PI / 2, 0);
  g.moveTo(x2, y2 - r).arc(x2 - r, y2 - r, r, 0, Math.PI / 2);
  g.moveTo(x + r, y2).arc(x + r, y2 - r, r, Math.PI / 2, Math.PI);
  g.moveTo(x, y + r).arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
}

function dashLine(g: Graphics, x1: number, y1: number, x2: number, y2: number, dash: number, gap: number): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  const ux = dx / len;
  const uy = dy / len;
  for (let t = 0; t < len; t += dash + gap) {
    const t2 = Math.min(t + dash, len);
    g.moveTo(x1 + ux * t, y1 + uy * t).lineTo(x1 + ux * t2, y1 + uy * t2);
  }
}
