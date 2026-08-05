// ЭКРАННАЯ РУКА (HUD) — своя рука игрока/призрака, прибитая к КАМЕРЕ: живёт в chrome-слое (не
// зумится, не ездит паном), во всю ширину снизу, статичный размер по экрану. Вне контентных
// координат борды — у неё нет точки на столе (это интерфейс, как DropBar), поэтому дерево борды
// при placement:"screen" руку-зону НЕ раскладывает: карты руки существуют только тут.
//
// Карты строит КАНОННОЙ фабрикой (buildBoardNode → TableItem) ради визуального паритета со столом,
// но без физики: трансформ root'а ставим руками при раскладке. Драг руки↔борда: карту руки под
// пальцем отдаёт pickAt — её КОНТЕНТНЫЙ двойник (nodeStore) становится лидером обычного драга, а
// HUD-спрайт на время прячется (setDragging). Дроп-зона руки (band) со состояниями rest/armed/hot —
// для «взять со стола» и реордера: судит жест по экранной точке (overBand/insertIndexAt).

import { Container, Graphics, type Renderer } from "pixi.js";
import { CARD } from "../../crossade/tree";
import { COLORS } from "../../engine/constants";
import type { CardTextureCache } from "../../ui/CardTextureCache";
import type { ElementDef } from "../core/spec";
import { buildBoardNode, type BoardNode } from "./nodeFactory";
import { handStrip, handCardSize } from "../hand/handStrip";
import { ACTION_BAR_H } from "./chrome";

const SIDE = 16; // поля по краям экрана
const GAP = 12; // зазор между картами в свободном ряду
const PAD_BOTTOM = 8; // отступ полосы руки над полосой действий
const BG = 0x1a241e;

/** Состояние дроп-зоны руки: покой / груз в полёте где-то / груз над рукой (владелец). */
export type HandZone = "rest" | "armed" | "hot";

/** Адаптивный размер карты руки под экран (узкий телефон → мельче). Ширина ряда — экран минус поля. */
function handCell(w: number, h: number): { w: number; h: number } {
  return handCardSize(w - SIDE * 2, h, CARD);
}

export interface HandHudDeps {
  /** Рука экранная (placement:"screen")? Иначе HUD пуст — руку раскладывает дерево борды. */
  enabled(): boolean;
  /** Карты своей руки по порядку (handKey(selfSeat)). */
  members(): readonly string[];
  def(id: string): ElementDef | undefined;
  tex(): CardTextureCache | null;
  renderer(): Renderer | null;
  /** Контентный двойник карты (nodeStore) — он становится лидером драга при захвате из руки. */
  contentNode(id: string): BoardNode | undefined;
  accent(): number;
  wake(): void;
}

export class SceneHandHud {
  readonly root = new Container();
  private readonly zone = new Graphics(); // полоса-дропзона под картами
  private nodes = new Map<string, BoardNode>();
  private size = { w: 0, h: 0 };
  private zoneState: HandZone = "rest";
  private dragging: string | null = null; // карта руки, поднятая в контент-драг: её HUD-спрайт прячем

  constructor(private readonly deps: HandHudDeps) {
    this.root.sortableChildren = true; // правая карта поверх левой (нахлёст ряда)
    this.zone.zIndex = -1000; // под картами
    this.root.addChild(this.zone);
  }

  /** Сколько снизу занимает band руки — стол вписывается в остаток (fitBoard). 0 — руки на экране нет. */
  reservedBottom(screenW: number, screenH: number): number {
    return this.deps.enabled() ? handCell(screenW, screenH).h + PAD_BOTTOM + ACTION_BAR_H : 0;
  }

  /** Пересобрать состав по снимку (добавить новые карты, снять ушедшие) и переразложить. */
  sync(): void {
    const tex = this.deps.tex();
    if (!this.deps.enabled() || !tex) {
      this.clear();
      this.zone.clear();
      return;
    }
    const want = new Set(this.deps.members());
    for (const [id, node] of this.nodes) {
      if (!want.has(id)) {
        this.root.removeChild(node.root);
        node.destroy();
        this.nodes.delete(id);
      }
    }
    for (const id of this.deps.members()) {
      if (this.nodes.has(id)) continue;
      const node = buildBoardNode(id, this.deps.def(id), tex, this.deps.renderer());
      this.nodes.set(id, node);
      this.root.addChild(node.root);
    }
    this.layout(this.size.w, this.size.h);
  }

  /** Разложить ряд по ширине экрана снизу; трансформ каждой карты ставим напрямую (без пружин). */
  layout(w: number, h: number): void {
    this.size = { w, h };
    if (!this.deps.enabled() || !this.deps.tex()) return;
    this.paintZone();
    const members = this.deps.members();
    const cell = handCell(w, h);
    const centerY = h - ACTION_BAR_H - PAD_BOTTOM - cell.h / 2;
    const poses = handStrip(members.length, cell, Math.max(cell.w, w - SIDE * 2), GAP);
    members.forEach((id, i) => {
      const node = this.nodes.get(id);
      const pose = poses[i];
      if (!node || !pose) return;
      node.root.visible = id !== this.dragging; // поднятую в контент-драг карту в руке не рисуем
      node.root.scale.set(cell.h / CARD.h);
      node.root.rotation = pose.rot;
      node.root.position.set(SIDE + pose.x, centerY);
      node.root.zIndex = i;
    });
  }

  // ——— драг руки↔борда: захват карты, дроп-зона, снятие ———

  /** Карта руки под ЭКРАННОЙ точкой (для захвата): её контентный двойник — лидер драга. Прячет
   *  HUD-спрайт на время драга и отдаёт контентную ноду (её показывает и ведёт жест). */
  pickAt(sx: number, sy: number): BoardNode | null {
    const id = this.cardAt(sx, sy);
    if (id === null) return null;
    const node = this.deps.contentNode(id);
    if (!node) return null;
    this.dragging = id;
    this.layout(this.size.w, this.size.h); // спрятать HUD-спрайт поднятой карты
    return node;
  }

  /** id карты руки под точкой (верхняя по нахлёсту), иначе null. Перетаскиваемую пропускаем. */
  cardAt(sx: number, sy: number): string | null {
    const cell = handCell(this.size.w, this.size.h);
    const hw = cell.w / 2;
    const hh = cell.h / 2;
    let hit: string | null = null;
    for (const [id, node] of this.nodes) {
      if (id === this.dragging) continue;
      const p = node.root.position;
      if (Math.abs(sx - p.x) <= hw && Math.abs(sy - p.y) <= hh) hit = id; // последняя (верхняя) выигрывает
    }
    return hit;
  }

  /** Экранная точка над полосой руки (дроп-зоной)? */
  overBand(sx: number, sy: number): boolean {
    const b = this.bandRect();
    return sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h;
  }

  /** Индекс вставки в руку по X (сколько центров карт левее точки). Перетаскиваемую не считаем. */
  insertIndexAt(sx: number): number {
    let idx = 0;
    for (const id of this.deps.members()) {
      if (id === this.dragging) continue;
      const node = this.nodes.get(id);
      if (node && node.root.position.x < sx) idx++;
    }
    return idx;
  }

  /** Сменить состояние дроп-зоны (жест: armed на время драга, hot над рукой, rest в покое). */
  setZone(state: HandZone): void {
    if (state === this.zoneState) return;
    this.zoneState = state;
    this.paintZone();
    this.deps.wake();
  }

  /** Снять пометку драга (карта вернулась или ушла на стол): вернуть HUD-спрайты и покой зоны. */
  clearDragging(): void {
    this.dragging = null;
    this.zoneState = "rest";
    this.layout(this.size.w, this.size.h);
  }

  private bandRect(): { x: number; y: number; w: number; h: number } {
    const cell = handCell(this.size.w, this.size.h);
    const cy = this.size.h - ACTION_BAR_H - PAD_BOTTOM - cell.h / 2;
    return { x: SIDE - GAP, y: cy - cell.h / 2 - GAP, w: this.size.w - 2 * (SIDE - GAP), h: cell.h + 2 * GAP };
  }

  /** Рамка дроп-зоны: фон всегда low-opacity; бордер — rest (тускло solid) / armed (серый dashed) /
   *  hot (акцент solid). Правило владельца. */
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

  /** Дев-хук: экранные ЦЕНТРЫ карт руки по порядку (chrome-слой — уже экранные координаты). */
  screenPoses(): { id: string; x: number; y: number }[] {
    const out: { id: string; x: number; y: number }[] = [];
    for (const id of this.deps.members()) {
      const node = this.nodes.get(id);
      if (node) out.push({ id, x: node.root.position.x, y: node.root.position.y });
    }
    return out;
  }

  private clear(): void {
    for (const node of this.nodes.values()) {
      this.root.removeChild(node.root);
      node.destroy();
    }
    this.nodes.clear();
  }

  destroy(): void {
    this.clear();
    this.root.destroy();
  }
}

/** Пунктирная обводка скруглённого прямоугольника: прямые рёбра — штрихами, углы — сплошными дугами.
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
