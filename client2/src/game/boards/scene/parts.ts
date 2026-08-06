// СБОРКА КОЛЛАБОРАТОРОВ СЦЕНЫ (фабрика частей): вся DI-проводка швов — здесь, BoardScene лишь
// отдаёт доступ к своим данным узким BoardPartsCtx и получает готовый набор частей. Циклы
// зависимостей (узлы ↔ присутствие) развязаны ленивыми замыканиями — все лямбды зовутся после
// полной сборки.

import type { SceneApi } from "../../engine/sceneContract";
import { COLORS } from "../../engine/constants";
import type { Button } from "../../ui/Button";
import type { CardTextureCache } from "../../ui/CardTextureCache";
import type { BoardCommand, BoardSpec, ElementDef } from "../core/spec";
import type { BoardState } from "../core/state";
import type { BoardTree } from "../geometry/boardTree";
import type { BoardSceneOptions } from "./options";
import { nodeScaleIn, type BoardNode } from "./nodeFactory";
import { SceneBlockDrag } from "./blockDrag";
import { SceneChrome } from "./chrome";
import { SceneDeckActions } from "./deckActions";
import { SceneDecor } from "./decor";
import { SceneMenu } from "./menu";
import { SceneNodes } from "./nodesStore";
import { ScenePresence } from "./scenePresence";
import { SceneGesture } from "./gesture";
import { SceneGapPreview } from "./gapPreview";
import { SceneHud } from "./hud";
import { stripScale } from "../strip/config";
import { boardWorld, isDeckSlot, type DropWorld } from "../geometry/dropPlan";
import { faceUpInSlot } from "../core/faceUp";
import { menuTargetAt, type MenuTargetKind } from "../geometry/sceneAreas";

/**
 * Доступ сцены для частей: только чтение её данных плюс ОДНА дверь движка — `api`. Пробрасывать
 * движок пятнадцатью лямбдами смысла нет: SceneApi и есть его публичный контракт, а сужать его
 * повторно — заводить второй список того же самого, который разъедется с первым.
 */
export interface BoardPartsCtx {
  api: SceneApi;
  state(): BoardState;
  tree(): BoardTree;
  spec(): BoardSpec;
  def(id: string): ElementDef | undefined;
  tex(): CardTextureCache | null;
  selfSeat: string;
  dispatch(cmd: BoardCommand): void;
}

export interface BoardParts {
  hud: SceneHud;
  nodeStore: SceneNodes;
  presence: ScenePresence;
  blockDrag: SceneBlockDrag;
  deckActions: SceneDeckActions;
  chromeHud: SceneChrome;
  menuOwner: SceneMenu;
  decor: SceneDecor;
  gesture: SceneGesture;
}

export function buildBoardParts(ctx: BoardPartsCtx, opts: BoardSceneOptions): BoardParts {
  // Производное от спеки, дерева и снимка части считают САМИ — сцене незачем пробрасывать то, что
  // складывается из данных, которые она уже отдала.
  const world = (): DropWorld =>
    boardWorld({ zones: ctx.spec().zones, cellRects: ctx.tree().cellRects, slots: ctx.state().field.slots, homeOf: (id) => ctx.tree().homeOf(id) });
  /** Акцент сцены: в live — ЦВЕТ ЭТОГО игрока (профиль, курсор, подсветки), иначе золото. */
  const accent = (): number => (opts.presence ? opts.presence.palette(opts.presence.who) : COLORS.gold);
  const faceUpIn = (id: string, slot: string): boolean => faceUpInSlot({ def: ctx.def(id), zones: ctx.spec().zones, slot, selfSeat: ctx.selfSeat });
  const menuTarget = (cp: { x: number; y: number }): MenuTargetKind | null =>
    opts.menus ? menuTargetAt(ctx.spec().zones, ctx.tree().cellRects, cp) : null;

  // Узлы ↔ присутствие — цикл (снимок не трогает карту в чужом драге; присутствие водит узлы):
  // развязан let-замыканием, лямбды зовутся после полной сборки.
  let presence: ScenePresence;
  const members = (slot: string): readonly string[] => ctx.state().field.slots[slot]?.members ?? [];
  const homeOf = (id: string): { x: number; y: number } | null => ctx.tree().homeOf(id);

  const api = ctx.api;

  // HUD — владелец доков зон (виджеты kind:"zone" из spec.hud): раскладка и слои; ноды
  // пришвартованных зон — те же узлы nodeStore, их root перекладывается на его cardLayer.
  // Строится ДО nodeStore: тот спрашивает у него позы.
  const hud = new SceneHud({
    spec: () => ctx.spec(),
    accent,
    wake: () => api.wake(),
    selfSeat: ctx.selfSeat,
    members,
    retarget: () => nodeStore.retargetDocked(), // лениво: nodeStore ниже, зовётся после сборки
  });

  const nodeStore = new SceneNodes({
    def: (id) => ctx.def(id),
    tex: () => ctx.tex(),
    renderer: () => api.renderer(),
    register: (id, node) => api.byId.set(id, node),
    unregister: (id) => api.byId.delete(id),
    placeCard: (node) => api.placeCard(node),
    faceUpIn,
    slotScale: (slot) => stripScale(ctx.spec(), slot, ctx.selfSeat),
    remoteDragged: (id) => presence.hasRemote(id),
    dockPose: (id) => hud.poseOf(id),
    placeDocked: (node) => hud.cardLayer.addChild(node.root),
    toScreen: (x, y) => api.contentToScreen(x, y),
    toContent: (sx, sy) => api.screenToContent(sx, sy),
    zoom: () => api.viewport().zoom || 1,
  });

  const blockDrag = new SceneBlockDrag({
    state: () => ctx.state(),
    tree: () => ctx.tree(),
    node: (id) => nodeStore.get(id),
    dragCtx: () => api.dragCtx(),
    setDrag: (d) => api.setDrag(d),
    dispatch: (cmd) => ctx.dispatch(cmd),
  });

  const deckActions = new SceneDeckActions({
    state: () => ctx.state(),
    node: (id) => nodeStore.get(id),
    homeOf,
    dispatch: (cmd) => ctx.dispatch(cmd),
    after: (sec, fn) => api.after(sec, fn),
    wake: () => api.wake(),
  });

  presence = new ScenePresence(opts.presence, {
    node: (id) => nodeStore.get(id),
    nodes: () => nodeStore.all(),
    homeOf,
    slotOf: (id) => ctx.tree().slotOf(id),
    members,
    fxRot: (id) => ctx.state().fx[id]?.rot ?? 0,
    restScaleIn: (node, slot) => (slot ? nodeScaleIn(node, slot) * stripScale(ctx.spec(), slot, ctx.selfSeat) : node.restScale),
    depth: (id) => nodeStore.depth(id),
    ownBlockDrag: () => blockDrag.active(),
    wake: () => api.wake(),
  });

  const chromeHud = new SceneChrome({
    add: (c) => api.chromeAdd(c),
    dispatch: (cmd) => ctx.dispatch(cmd),
    accent,
    wake: () => api.wake(),
  });

  const menuOwner = new SceneMenu({
    menus: opts.menus,
    size: () => ({ w: api.width(), h: api.height() }),
    chromeAdd: (c) => api.chromeAdd(c),
    setMenuButtons: (btns) => api.setChromeButtons([...chromeHud.buttons(), ...btns]),
    forgetHovered: (btns) => api.forgetHovered(btns),
    wake: () => api.wake(),
    slotOf: (id) => ctx.tree().slotOf(id),
    isDeckSlot: (slot) => isDeckSlot(world(), slot),
    fx: (id) => ctx.state().fx[id],
    faceUpIn,
    hitElementId: (cp) => api.hitElement(cp.x, cp.y)?.id ?? null,
    menuTarget,
    dispatch: (cmd) => ctx.dispatch(cmd),
    shuffle: (slot) => deckActions.shuffle(slot),
    deal: (slot) => deckActions.deal(slot),
  });

  const decor = new SceneDecor({
    surfaceAdd: (c) => api.surfaceAdd(c),
    spec: () => ctx.spec(),
    tree: () => ctx.tree(),
    state: () => ctx.state(),
    selfSeat: ctx.selfSeat,
    accent,
    isMe: (occupant) => {
      const p = opts.presence;
      return !!p && occupant !== null && occupant === (p.label?.(p.who) ?? p.who);
    },
  });

  // Smart reorder контейнеров борды: гэп-превью вставки (ленты — по дефолту, flow с preview:true).
  const gapPreview = new SceneGapPreview({
    world,
    selfSeat: ctx.selfSeat,
    retargetSlot: (slot) => nodeStore.retargetSlot(ctx.state().field.slots[slot]?.members ?? [], (id) => ctx.tree().homeOf(id)),
    dispatch: (cmd) => ctx.dispatch(cmd),
    wake: () => api.wake(),
  });

  // Жест — последним: ему нужны уже собранные соседи (блок-драг, меню, действия колоды, присутствие).
  const gesture = new SceneGesture({
    state: () => ctx.state(),
    tree: () => ctx.tree(),
    spec: () => ctx.spec(),
    def: (id) => ctx.def(id),
    world,
    selfSeat: ctx.selfSeat,
    interactive: opts.interactive !== false,
    presence: opts.presence,
    accent,
    dispatch: (cmd) => ctx.dispatch(cmd),
    node: (id) => nodeStore.get(id),
    width: () => api.width(),
    height: () => api.height(),
    wake: () => api.wake(),
    drag: () => api.drag(),
    dragScreen: () => api.dragScreen(),
    grabMode: () => api.grabMode(),
    defaultBeginDrag: (el, cp, sp) => api.defaultBeginDrag(el, cp, sp),
    blockDrag,
    menu: menuOwner,
    presenceOwner: presence,
    hud,
    setDragSpace: (id, space) => nodeStore.setDragSpace(id, space),
    gapPreview,
  });

  return { hud, nodeStore, presence, blockDrag, deckActions, chromeHud, menuOwner, decor, gesture };
}
