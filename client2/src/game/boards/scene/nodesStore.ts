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
  /** Положить визуал в слой его текущего состояния (z-уровни движка, контент под камерой). */
  placeCard(node: BoardNode): void;
  /** Лицом или рубашкой лежит карта в этом слоте (правило зоны). */
  faceUpIn(id: string, slot: string): boolean;
  /** Карту ведёт чужой драг-стрим — не трогать её позицию/глубину. */
  remoteDragged(id: string): boolean;
  // ——— экранная рука (одна нода на карту): та же нода перекладывается на экранный слой ———
  /** Экранная поза карты руки (центр + масштаб ноды) или null — карта не в экранной руке. */
  handPose(id: string): { x: number; y: number; scale: number } | null;
  /** Переложить root ноды на СЛОЙ РУКИ (chrome, экранно-фиксированный, не зумится). */
  placeHand(node: BoardNode): void;
  /** Контент↔экран и зум камеры — для непрерывной конверсии на границе борда↔рука. */
  toScreen(x: number, y: number): { x: number; y: number };
  toContent(sx: number, sy: number): { x: number; y: number };
  zoom(): number;
}

export class SceneNodes {
  private readonly byId = new Map<string, BoardNode>();
  private readonly depths = new Map<string, number>();
  /** Пространство КАЖДОЙ ноды сейчас: контент (борда, под камерой) или рука (экран). Смена
   *  пространства = переложить root и КОНВЕРТИРОВАТЬ координаты/масштаб, чтобы полёт был непрерывен. */
  private readonly space = new Map<string, "content" | "hand">();

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
      const hp = this.host.handPose(id);
      const slot = tree.slotOf(id);
      const home = tree.homeOf(id);
      if (!hp && (!slot || !home)) {
        // Ни в руке, ни в дереве — обычно эту ноду СЕЙЧАС ведёт драг (карта поднята): не трогаем.
        return;
      }
      const node = this.nodeFor(id, tex);
      node.root.visible = true;
      if (this.host.remoteDragged(id)) return; // карту ведёт чужой драг-стрим
      if (hp) this.placeInHand(node, id, hp, indexInPile, snap);
      else this.placeOnBoard(node, id, state, slot!, home!, (slotOrder.get(slot!) ?? 0) * 1000 + indexInPile, snap);
    };

    for (const key of Object.keys(state.field.slots)) {
      state.field.slots[key]!.members.forEach((id, i) => place(id, i));
    }
    for (const [id, node] of this.byId) {
      if (alive.has(id)) continue;
      node.destroy();
      this.byId.delete(id);
      this.host.unregister(id);
      this.space.delete(id);
    }
  }

  /** Карта РУКИ: та же нода на экранном слое. Смена пространства борда→рука — с конверсией текущего
   *  положения (контент→экран) и масштаба (×zoom), чтобы полёт был непрерывным, а не телепортом. */
  private placeInHand(node: BoardNode, id: string, hp: { x: number; y: number; scale: number }, order: number, snap: boolean): void {
    if (this.space.get(id) !== "hand") {
      if (!snap) {
        const s = this.host.toScreen(node.body.px, node.body.py);
        node.body.snapTo({ x: s.x, y: s.y, scale: node.body.scaleVal * this.host.zoom() });
      }
      this.host.placeHand(node);
      this.space.set(id, "hand");
    }
    node.root.zIndex = order;
    this.depths.set(id, order);
    if (node.kind === "card" && !node.faceUp) node.requestFlip(); // своя рука — лицом владельцу
    const target = { x: hp.x, y: hp.y, rot: 0, scale: hp.scale };
    if (snap) node.body.snapTo(target);
    else node.body.setTarget(target);
  }

  /** Карта БОРДЫ: нода на контент-слое (под камерой). Смена рука→борда — конверсия экран→контент и
   *  масштаба (÷zoom), тоже непрерывным полётом. */
  private placeOnBoard(node: BoardNode, id: string, state: BoardState, slot: string, home: { x: number; y: number }, depth: number, snap: boolean): void {
    if (this.space.get(id) === "hand" && !snap) {
      const c = this.host.toContent(node.body.px, node.body.py);
      node.body.snapTo({ x: c.x, y: c.y, scale: node.body.scaleVal / this.host.zoom() });
    }
    this.space.set(id, "content");
    this.depths.set(id, depth);
    node.root.zIndex = depth;
    node.setState(node.pose);
    this.host.placeCard(node);
    const fx = state.fx[id];
    const wantFace = fx?.face ?? this.host.faceUpIn(id, slot);
    if (node.kind === "card" && node.faceUp !== wantFace) node.requestFlip();
    const target = { x: home.x, y: home.y, rot: fx?.rot ?? 0, scale: nodeScaleIn(node, slot) };
    if (snap) node.body.snapTo(target);
    else node.body.setTarget(target);
  }

  /** ВЖИВУЮ во время драга: переложить ноду в нужное пространство (рука-экран ⇄ борда-контент) с
   *  конверсией координат/масштаба. Идемпотентно (действует только на смене) — палец наводится на
   *  руку → карта на слой руки (сверху), уводит → обратно на борду. Одна нода, непрерывно. */
  setDragSpace(id: string, space: "content" | "hand"): void {
    const node = this.byId.get(id);
    if (!node || this.space.get(id) === space) return;
    if (space === "hand") {
      const s = this.host.toScreen(node.body.px, node.body.py);
      node.body.snapTo({ x: s.x, y: s.y, scale: node.body.scaleVal * this.host.zoom() });
      this.host.placeHand(node);
    } else {
      const c = this.host.toContent(node.body.px, node.body.py);
      node.body.snapTo({ x: c.x, y: c.y, scale: node.body.scaleVal / this.host.zoom() });
      this.host.placeCard(node); // state=drag → слой драга (контент)
    }
    this.space.set(id, space);
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
