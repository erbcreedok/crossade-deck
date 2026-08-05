// УЗЛЫ БОРДЫ (композиция BoardScene): хранилище визуальных узлов по id + синк «снимок → доска».
// Владеет map узлов и глубинами; создаёт узлы фабрикой (nodeFactory), сажает каждый в его дом
// по дереву, снимает пропавших. Карту, которую ведёт чужой драг-стрим, снимок не дёргает.


import type { CardTextureCache } from "../../ui/CardTextureCache";
import type { Renderer } from "pixi.js";
import type { BoardState } from "../core/state";
import type { ElementDef } from "../core/spec";
import type { BoardTree } from "../geometry/boardTree";
import { buildBoardNode, nodeScaleIn, type BoardNode } from "./nodeFactory";

export interface NodesHost {
  def(id: string): ElementDef | undefined;
  tex(): CardTextureCache | null;
  renderer(): Renderer | null;
  /** Индекс движка для хит-тестов: узел появился/умер. */
  register(id: string, node: BoardNode): void;
  unregister(id: string): void;
  /** Положить визуал в слой его текущего состояния (z-уровни движка). */
  placeCard(node: BoardNode): void;
  /** Лицом или рубашкой лежит карта в этом слоте (правило зоны). */
  faceUpIn(id: string, slot: string): boolean;
  /** Карту ведёт чужой драг-стрим — не трогать её позицию/глубину. */
  remoteDragged(id: string): boolean;
}

export class SceneNodes {
  private readonly byId = new Map<string, BoardNode>();
  private readonly depths = new Map<string, number>();

  constructor(private readonly host: NodesHost) {}

  get(id: string): BoardNode | undefined {
    return this.byId.get(id);
  }

  all(): IterableIterator<[string, BoardNode]> {
    return this.byId.entries();
  }

  list(): BoardNode[] {
    return [...this.byId.values()];
  }

  depth(id: string): number {
    return this.depths.get(id) ?? 0;
  }

  /** Снимок → доска: каждый житель в свой дом (spring/snap), пропавшие узлы — снести. */
  sync(state: BoardState, tree: BoardTree, snap: boolean): void {
    const tex = this.host.tex();
    if (!tex) return;
    const alive = new Set<string>();
    this.depths.clear();
    const slotOrder = new Map<string, number>();
    Object.keys(tree.origins).forEach((id, i) => slotOrder.set(id, i));

    const place = (id: string, indexInPile: number): void => {
      alive.add(id);
      const slot = tree.slotOf(id);
      const home = tree.homeOf(id);
      if (!slot || !home) {
        // Дом уехал из дерева (карту забрала экранная рука-HUD, placement:"screen") — прячем
        // контентный двойник, чтобы он не висел бесхозным на последнем месте. Вернётся дом — покажем.
        const twin = this.byId.get(id);
        if (twin) twin.root.visible = false;
        return;
      }
      const node = this.nodeFor(id, tex);
      node.root.visible = true;
      const depth = (slotOrder.get(slot) ?? 0) * 1000 + indexInPile;
      this.depths.set(id, depth);
      if (this.host.remoteDragged(id)) return; // карту ведёт чужой драг-стрим
      node.root.zIndex = depth;
      node.setState(node.pose);
      this.host.placeCard(node);
      const fx = state.fx[id];
      const wantFace = fx?.face ?? this.host.faceUpIn(id, slot);
      if (node.kind === "card" && node.faceUp !== wantFace) node.requestFlip();
      const target = { x: home.x, y: home.y, rot: fx?.rot ?? 0, scale: nodeScaleIn(node, slot) };
      if (snap) node.body.snapTo(target);
      else node.body.setTarget(target);
    };

    for (const key of Object.keys(state.field.slots)) {
      state.field.slots[key]!.members.forEach((id, i) => place(id, i));
    }
    for (const [id, node] of this.byId) {
      if (alive.has(id)) continue;
      node.destroy();
      this.byId.delete(id);
      this.host.unregister(id);
    }
  }

  private nodeFor(id: string, tex: CardTextureCache): BoardNode {
    const existing = this.byId.get(id);
    if (existing) return existing;
    const node = buildBoardNode(id, this.host.def(id), tex, this.host.renderer());
    this.byId.set(id, node);
    this.host.register(id, node);
    return node;
  }

  destroy(): void {
    for (const node of this.byId.values()) node.destroy();
    this.byId.clear();
  }
}
