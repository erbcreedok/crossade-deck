// ЭКРАННАЯ РУКА (HUD) — своя рука игрока/призрака, прибитая к КАМЕРЕ: живёт в chrome-слое (не
// зумится, не ездит паном), во всю ширину снизу, статичный размер по экрану. Вне контентных
// координат борды — у неё нет точки на столе (это интерфейс, как DropBar), поэтому дерево борды
// при placement:"screen" руку-зону НЕ раскладывает: карты руки существуют только тут.
//
// Карты строит КАНОННОЙ фабрикой (buildBoardNode → TableItem) ради визуального паритета со столом,
// но без физики и без регистрации в движке: трансформ root'а ставим руками при раскладке. Ряд/веер
// — данные (handStrip; веер позже). Драг руки↔борда и кнопки-на-руке — следующими шагами.

import { Container, type Renderer } from "pixi.js";
import { CARD } from "../../crossade/tree";
import type { CardTextureCache } from "../../ui/CardTextureCache";
import type { ElementDef } from "../core/spec";
import { buildBoardNode, type BoardNode } from "./nodeFactory";
import { handStrip } from "../hand/handStrip";
import { ACTION_BAR_H } from "./chrome";

const SIDE = 16; // поля по краям экрана
const GAP = 12; // зазор между картами в свободном ряду
const PAD_BOTTOM = 8; // отступ полосы руки над полосой действий

/** Высота карты руки по высоте экрана: не крупнее 150 и не мельче 72 (палец достаёт, но стол не съеден). */
function handCardH(screenH: number): number {
  return Math.round(Math.max(72, Math.min(150, screenH * 0.2)));
}

export interface HandHudDeps {
  /** Рука экранная (placement:"screen")? Иначе HUD пуст — руку раскладывает дерево борды. */
  enabled(): boolean;
  /** Карты своей руки по порядку (handKey(selfSeat)). */
  members(): readonly string[];
  def(id: string): ElementDef | undefined;
  tex(): CardTextureCache | null;
  renderer(): Renderer | null;
  wake(): void;
}

export class SceneHandHud {
  readonly root = new Container();
  private nodes = new Map<string, BoardNode>();
  private size = { w: 0, h: 0 };

  constructor(private readonly deps: HandHudDeps) {
    this.root.sortableChildren = true; // правая карта поверх левой (нахлёст ряда)
  }

  /** Сколько снизу занимает band руки — стол вписывается в остаток (fitBoard). 0 — руки на экране нет. */
  reservedBottom(screenH: number): number {
    return this.deps.enabled() ? handCardH(screenH) + PAD_BOTTOM + ACTION_BAR_H : 0;
  }

  /** Пересобрать состав по снимку (добавить новые карты, снять ушедшие) и переразложить. */
  sync(): void {
    const tex = this.deps.tex();
    if (!this.deps.enabled() || !tex) {
      this.clear();
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
    const members = this.deps.members();
    if (!this.deps.enabled() || !this.deps.tex() || !members.length) return;
    const cardH = handCardH(h);
    const cell = { w: cardH * (CARD.w / CARD.h), h: cardH };
    const centerY = h - ACTION_BAR_H - PAD_BOTTOM - cardH / 2;
    const poses = handStrip(members.length, cell, Math.max(cell.w, w - SIDE * 2), GAP);
    members.forEach((id, i) => {
      const node = this.nodes.get(id);
      const pose = poses[i];
      if (!node || !pose) return;
      node.root.scale.set(cardH / CARD.h);
      node.root.rotation = pose.rot;
      node.root.position.set(SIDE + pose.x, centerY);
      node.root.zIndex = i;
    });
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
