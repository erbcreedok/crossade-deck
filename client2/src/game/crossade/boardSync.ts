// СВЕДЕНИЕ ДОСКИ СО СНИМКОМ — коллаборатор: единственный владелец узлов карт. Держит по одному
// Card на карту снимка, разводит их по домам дерева, считает z и сносит те, которых в снимке не
// стало. Ни правил, ни сети не знает: ему говорят «вот снимок, вот дерево» и он приводит картинку
// в соответствие.
//
// Узлы КЛЮЧУЮТСЯ ИДЕНТИЧНОСТЬЮ карты, а не индексом в зоне: поэтому реордер и переход между зонами
// проигрываются по-настоящему (карта летит из старого места в новое), а не «телепортом» с
// перерисовкой всей зоны.

import type { Card } from "../ui/Card";
import { makeCard } from "../ui/Card";
import type { CardTextureCache } from "../ui/CardTextureCache";
import type { NetTree } from "./netTree";
import type { CrossadeState } from "./state";

export interface BoardSyncDeps {
  tree(): NetTree;
  tex(): CardTextureCache;
  /** Раздать place() все карты доски: порядок вызовов задаёт z между зонами (см. depth ниже). */
  placeCards(state: CrossadeState, place: (cardId: string, indexInPile: number) => void): void;
  faceUpFor(cardId: string, slot: string): boolean;
  cardScaleFor(cardId: string): number;
  /** Карту держит кто-то другой (ожидание ответа сервера) — по дому её не разводить, но и не сносить. */
  heldOutOfHome(cardId: string): boolean;
  // двери движка: реестр хит-теста и слой карт
  placeCard(node: Card): void;
  register(cardId: string, node: Card): void;
  unregister(cardId: string): void;
}

export class SceneBoardSync {
  readonly nodes = new Map<string, Card>();
  private readonly depths = new Map<string, number>();

  constructor(private readonly deps: BoardSyncDeps) {}

  depth(cardId: string): number {
    return this.depths.get(cardId) ?? 0;
  }

  /** snap — поставить сразу (первый монтаж), иначе карта ДОЛЕТАЕТ пружиной, как всё в проекте. */
  sync(state: CrossadeState, snap: boolean): void {
    const tree = this.deps.tree();
    const alive = new Set<string>();
    this.depths.clear();
    // Порядок слотов доски — устойчивый z между пачками: те же ключи и в том же порядке, в каком их
    // собрал buildTree.
    const slotOrder = new Map<string, number>();
    Object.keys(tree.origins).forEach((id, i) => slotOrder.set(id, i));

    const place = (cardId: string, indexInPile: number): void => {
      alive.add(cardId);
      if (this.deps.heldOutOfHome(cardId)) return;
      const slot = tree.slotOf(cardId);
      const home = tree.homeOf(cardId);
      if (!slot || !home) return;
      const node = this.nodeFor(cardId, slot);
      const faceUp = this.deps.faceUpFor(cardId, slot);
      if (node.faceUp !== faceUp) node.requestFlip();
      const depth = (slotOrder.get(slot) ?? 0) * 1000 + indexInPile;
      this.depths.set(cardId, depth);
      node.root.zIndex = depth;
      node.setState(node.pose);
      this.deps.placeCard(node);
      const target = { x: home.x, y: home.y, rot: 0, scale: node.restScale };
      if (snap) node.body.snapTo(target);
      else node.body.setTarget(target);
    };

    this.deps.placeCards(state, place);

    for (const [cardId, node] of this.nodes) {
      if (alive.has(cardId)) continue;
      node.destroy();
      this.nodes.delete(cardId);
      this.deps.unregister(cardId);
    }
  }

  destroy(): void {
    for (const node of this.nodes.values()) node.destroy();
    this.nodes.clear();
    this.depths.clear();
  }

  /** flippable: true — НЕ приглашение переворачивать (сцена flip не зовёт), а способ не носить
   *  замочек: flippable: false рисует lock-бейдж (см. ui/Card.ts). */
  private nodeFor(cardId: string, slot: string): Card {
    const existing = this.nodes.get(cardId);
    if (existing) return existing;
    const node = makeCard(
      { id: cardId, card: cardId, faceUp: this.deps.faceUpFor(cardId, slot), flippable: true },
      this.deps.tex(),
      this.deps.cardScaleFor(cardId),
    );
    this.nodes.set(cardId, node);
    this.deps.register(cardId, node);
    return node;
  }
}
