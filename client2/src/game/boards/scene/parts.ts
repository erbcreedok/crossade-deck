// СБОРКА КОЛЛАБОРАТОРОВ СЦЕНЫ (фабрика частей): вся DI-проводка швов — здесь, BoardScene лишь
// отдаёт доступ к своим данным узким BoardPartsCtx и получает готовый набор частей. Циклы
// зависимостей (узлы ↔ присутствие) развязаны ленивыми замыканиями — все лямбды зовутся после
// полной сборки.

import type { Container, Renderer } from "pixi.js";
import type { Button } from "../../ui/Button";
import type { CardTextureCache } from "../../ui/CardTextureCache";
import type { DragContext, DragPayload } from "../../engine/drag";
import type { BoardCommand, BoardSpec, ElementDef } from "../core/spec";
import type { BoardState } from "../core/state";
import type { BoardTree } from "../geometry/boardTree";
import type { MenuTargetKind } from "../geometry/sceneAreas";
import type { BoardSceneOptions } from "./options";
import { nodeScaleIn, type BoardNode } from "./nodeFactory";
import { SceneBlockDrag } from "./blockDrag";
import { SceneChrome } from "./chrome";
import { SceneDeckActions } from "./deckActions";
import { SceneDecor } from "./decor";
import { SceneMenu } from "./menu";
import { SceneNodes } from "./nodesStore";
import { ScenePresence } from "./scenePresence";

/** Доступ сцены для частей: только чтение её данных и двери движка. */
export interface BoardPartsCtx {
  state(): BoardState;
  tree(): BoardTree;
  spec(): BoardSpec;
  def(id: string): ElementDef | undefined;
  tex(): CardTextureCache | null;
  renderer(): Renderer | null;
  selfSeat: string;
  dispatch(cmd: BoardCommand): void;
  wake(): void;
  after(sec: number, fn: () => void): void;
  size(): { w: number; h: number };
  accent(): number;
  // движок: реестр хит-теста, слои, драг, хром
  register(id: string, node: BoardNode): void;
  unregister(id: string): void;
  placeCard(node: BoardNode): void;
  dragCtx(): DragContext;
  setDrag(d: DragPayload): void;
  chromeAdd(c: Container): void;
  surfaceAdd(c: Container): void;
  setMenuButtons(btns: readonly Button[]): void;
  forgetHovered(btns: readonly Button[]): void;
  // правила сцены
  faceUpIn(id: string, slot: string): boolean;
  isDeckSlot(slot: string): boolean;
  hitElementId(cp: { x: number; y: number }): string | null;
  menuTarget(cp: { x: number; y: number }): MenuTargetKind | null;
}

export interface BoardParts {
  nodeStore: SceneNodes;
  presence: ScenePresence;
  blockDrag: SceneBlockDrag;
  deckActions: SceneDeckActions;
  chromeHud: SceneChrome;
  menuOwner: SceneMenu;
  decor: SceneDecor;
}

export function buildBoardParts(ctx: BoardPartsCtx, opts: BoardSceneOptions): BoardParts {
  // Узлы ↔ присутствие — цикл (снимок не трогает карту в чужом драге; присутствие водит узлы):
  // развязан let-замыканием, лямбды зовутся после полной сборки.
  let presence: ScenePresence;
  const members = (slot: string): readonly string[] => ctx.state().field.slots[slot]?.members ?? [];
  const homeOf = (id: string): { x: number; y: number } | null => ctx.tree().homeOf(id);

  const nodeStore = new SceneNodes({
    def: (id) => ctx.def(id),
    tex: () => ctx.tex(),
    renderer: () => ctx.renderer(),
    register: (id, node) => ctx.register(id, node),
    unregister: (id) => ctx.unregister(id),
    placeCard: (node) => ctx.placeCard(node),
    faceUpIn: (id, slot) => ctx.faceUpIn(id, slot),
    remoteDragged: (id) => presence.hasRemote(id),
  });

  const blockDrag = new SceneBlockDrag({
    state: () => ctx.state(),
    tree: () => ctx.tree(),
    node: (id) => nodeStore.get(id),
    dragCtx: () => ctx.dragCtx(),
    setDrag: (d) => ctx.setDrag(d),
    dispatch: (cmd) => ctx.dispatch(cmd),
  });

  const deckActions = new SceneDeckActions({
    state: () => ctx.state(),
    node: (id) => nodeStore.get(id),
    homeOf,
    dispatch: (cmd) => ctx.dispatch(cmd),
    after: (sec, fn) => ctx.after(sec, fn),
    wake: () => ctx.wake(),
  });

  presence = new ScenePresence(opts.presence, {
    node: (id) => nodeStore.get(id),
    nodes: () => nodeStore.all(),
    homeOf,
    slotOf: (id) => ctx.tree().slotOf(id),
    members,
    fxRot: (id) => ctx.state().fx[id]?.rot ?? 0,
    restScaleIn: (node, slot) => (slot ? nodeScaleIn(node, slot) : node.restScale),
    depth: (id) => nodeStore.depth(id),
    ownBlockDrag: () => blockDrag.active(),
  });

  const chromeHud = new SceneChrome({
    add: (c) => ctx.chromeAdd(c),
    dispatch: (cmd) => ctx.dispatch(cmd),
    accent: () => ctx.accent(),
    wake: () => ctx.wake(),
  });

  const menuOwner = new SceneMenu({
    menus: opts.menus,
    size: () => ctx.size(),
    chromeAdd: (c) => ctx.chromeAdd(c),
    setMenuButtons: (btns) => ctx.setMenuButtons(btns),
    forgetHovered: (btns) => ctx.forgetHovered(btns),
    wake: () => ctx.wake(),
    slotOf: (id) => ctx.tree().slotOf(id),
    isDeckSlot: (slot) => ctx.isDeckSlot(slot),
    fx: (id) => ctx.state().fx[id],
    faceUpIn: (id, slot) => ctx.faceUpIn(id, slot),
    hitElementId: (cp) => ctx.hitElementId(cp),
    menuTarget: (cp) => ctx.menuTarget(cp),
    dispatch: (cmd) => ctx.dispatch(cmd),
    shuffle: (slot) => deckActions.shuffle(slot),
    deal: (slot) => deckActions.deal(slot),
  });

  const decor = new SceneDecor({
    surfaceAdd: (c) => ctx.surfaceAdd(c),
    spec: () => ctx.spec(),
    tree: () => ctx.tree(),
    state: () => ctx.state(),
    selfSeat: ctx.selfSeat,
    accent: () => ctx.accent(),
    isMe: (occupant) => {
      const p = opts.presence;
      return !!p && occupant !== null && occupant === (p.label?.(p.who) ?? p.who);
    },
  });

  return { nodeStore, presence, blockDrag, deckActions, chromeHud, menuOwner, decor };
}
