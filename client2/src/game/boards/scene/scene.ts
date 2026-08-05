import type { Application } from "pixi.js";
import type { SceneElement } from "../../engine/sceneEngine";
import { SceneRuntime, type SceneApi, type SceneDelegate } from "../../engine/sceneRuntime";

import { CardTextureCache } from "../../ui/CardTextureCache";
import type { TableElement } from "../../engine/element";
import { dropTargetRect, measure, type DropProbe } from "../../slot/slot";
import { dropOf, type Group } from "../../slot/types";
import { buildBoardTree, type BoardTree } from "../geometry/boardTree";
import { localDriver, type BoardDriver } from "../core/driver";
import type { BoardState } from "../core/state";
import { baseZoneId, elementById, zoneOf, type BoardCommand, type BoardSpec, type ElementDef } from "../core/spec";
import type { ScenePresence } from "./scenePresence";
import type { SceneChrome } from "./chrome";
import type { SceneMenu } from "./menu";
import type { SceneDecor } from "./decor";
import type { SceneNodes } from "./nodesStore";
import { buildBoardParts } from "./parts";
import type { SceneGesture } from "./gesture";
import type { SceneHandHud } from "./handHud";
import { boardHooks, type BoardHooks } from "./hooks";
import { ACTION_BAR_H } from "./chrome";
import { fitZoom } from "../../engine/fitBoard";
import { focusTargetIn, menuTargetAt, type MenuTargetKind } from "../geometry/sceneAreas";
import { migrateState } from "../core/migrate";
import type { BoardSceneOptions } from "./options";

// СЦЕНА БОРДЫ — ОДНА, generic (BOARDS-DESIGN §4): конкретная борда — данные BoardSpec, не
// подкласс. Доктрина сцен проекта: снимок состояния — единственная правда, ход уходит в ПОРТ
// (dispatch → смарт-мок applyCommand), сцена правил не проверяет; камера/ввод/драг/тени — из
// SceneEngine. Кнопки ActionBar — те же команды порта, что и палец (два драйвера одной двери).

/** Камера борды: свои пределы зума (стол разглядывают вблизи, но и целиком он должен влезать). */
const BOARD_CAMERA = { minZoom: 0.25, maxZoom: 2.5, margin: 0, align: "center" } as const;

export type { MenuTargetKind } from "../geometry/sceneAreas";
export type { BoardSceneOptions, SceneMenus, SceneTool } from "./options";

export class BoardScene implements SceneDelegate {
  /** Движок-рантайм (композиция): камера/ввод/кадр/хром — его; сцена — делегат его швов. */
  readonly rt: SceneRuntime;
  private readonly api: SceneApi;
  private tex: CardTextureCache | null = null;
  private readonly nodeStore: SceneNodes;

  private spec: BoardSpec;
  private defs: ReadonlyMap<string, ElementDef>;
  private readonly selfSeat: string;
  private driver: BoardDriver;
  private state: BoardState;
  private tree: BoardTree;

  // Экранный HUD, меню, декор, блок-драг и действия колоды — коллабораторы (композиция).
  private readonly chromeHud: SceneChrome;
  private readonly menuOwner: SceneMenu;
  private readonly decor: SceneDecor;

  /** Live-присутствие (glow локов, курсоры, чужие драги) — целиком в scenePresence.ts. */
  private readonly presence: ScenePresence;
  /** Жест над бордой целиком — свой владелец (gesture.ts): подсветка, фикс-зоны, план дропа. */
  private readonly gesture: SceneGesture;
  /** Экранная рука (HUD, фикс к камере) — свой владелец; активна при hand.placement:"screen". */
  private readonly handHud: SceneHandHud;


  constructor(private readonly opts: BoardSceneOptions) {
    this.rt = new SceneRuntime(BOARD_CAMERA);
    this.rt.attach(this);
    this.api = this.rt.api;
    this.spec = opts.spec;
    this.defs = elementById(opts.spec);
    this.selfSeat = opts.selfSeat ?? "p1";
    this.driver = opts.driver ?? localDriver(opts.spec, opts.seats, opts.occupants);
    this.state = this.driver.boot();
    this.attachDriver(this.driver);
    this.tree = buildBoardTree(this.spec, this.state, this.selfSeat, this.state.free);
    const parts = buildBoardParts(
      {
        api: this.api,
        state: () => this.state,
        tree: () => this.tree,
        spec: () => this.spec,
        def: (id) => this.defs.get(id),
        tex: () => this.tex,
        selfSeat: this.selfSeat,
        dispatch: (cmd) => this.dispatch(cmd),
      },
      opts,
    );
    this.nodeStore = parts.nodeStore;
    this.presence = parts.presence;
    this.chromeHud = parts.chromeHud;
    this.menuOwner = parts.menuOwner;
    this.decor = parts.decor;
    this.gesture = parts.gesture;
    this.handHud = parts.handHud;
  }

  // ——— хост-API (тонкие двери в рантайм): интерфейс хостов не изменился ———

  mount(host: HTMLElement, width: number, height: number): Promise<void> {
    return this.rt.mount(host, width, height);
  }

  destroy(): void { this.rt.destroy(); }

  /** Курсор этого клиента — ЭКРАННОЙ точкой от хоста; дальше его ведёт владелец присутствия. */
  reportCursor(sx: number, sy: number, active = true): void {
    this.presence.reportOwnCursor(active ? this.api.screenToContent(sx, sy) : null);
    this.api.wake();
  }

  // ——— контекстное меню настроек (long-press по гриду/борде, ПКМ на десктопе) ———

  /** Цель меню под точкой — чистая menuTargetAt (sceneAreas); без хост-меню цели нет. */
  private menuTarget(cp: { x: number; y: number }): MenuTargetKind | null {
    return this.opts.menus ? menuTargetAt(this.spec.zones, this.tree.cellRects, cp) : null;
  }

  hasContextAt(cp: { x: number; y: number }): boolean { return this.menuTarget(cp) !== null; }

  openContextMenu(cp: { x: number; y: number }, sp: { x: number; y: number }): void {
    this.menuOwner.openAt(cp, sp);
  }

  /** Сменить СПЕКУ, не трогая драйвер (live: настройки и мигрированный снимок раздаёт комната —
   *  сцена лишь пересобирает геометрию; свежий снимок приедет обычным onState следом). */
  applySpec(spec: BoardSpec): void {
    this.setSpec(spec);
    this.rebuildBoard(false);
  }

  /** Сменить спеку на лету: жители пересыпаются migrateState, драйвер пересоздаётся с готовым
   *  снимком. Работает только со СВОИМ localDriver (standalone); зовёт хост меню (menus). */
  reconfigure(spec: BoardSpec, seats?: number): void {
    this.setSpec(spec);
    this.state = migrateState(this.state, spec, seats); // визуалы чистит сама миграция
    this.attachDriver(localDriver(spec, seats, undefined, this.state));
    this.rebuildBoard(false);
  }

  private setSpec(spec: BoardSpec): void {
    this.spec = spec;
    this.defs = elementById(spec);
  }

  /** Подписка на снимки — ОДНА на все три пути (первый драйвер, reconfigure, live): каждый снимок
   *  пересобирает доску, и второй такой подписки быть не должно. */
  private attachDriver(driver: BoardDriver): void {
    this.driver = driver;
    driver.onState((s) => {
      this.state = s;
      this.rebuildBoard(false);
    });
  }

  /** Тап мимо открытого меню закрывает его, и это ВЕСЬ смысл такого тапа — дабл-тап-зум не кормим.
   *  По строкам меню тап сюда не доходит: их ловит хит-тест хрома. */
  onSceneTap(content: { x: number; y: number }, screen: { x: number; y: number }): void {
    if (this.menuOwner.closeIfOutside(screen)) return;
    this.api.defaultSceneTap(content, screen);
  }

  // ——— порт команд: одна дверь для пальца, кнопок, консоли и (потом) сервера ———

  dispatch(cmd: BoardCommand): void {
    this.opts.onCommand?.(cmd);
    this.driver.dispatch(cmd);
  }

  // ——— сборка ———

  buildScene(app: Application): void {
    this.tex = new CardTextureCache(app);
    this.api.surfaceAdd(this.decor.layer);
    this.api.surfaceAdd(this.gesture.hintLayer);
    this.api.contentAdd(this.presence.root); // ПОСЛЕДНИМ ребёнком контента: локи и курсоры поверх карт
    this.api.chromeAddAt(this.gesture.dropBar.root, 0); // свой НИЖНИЙ слой HUD: меню и кнопки — поверх
    this.api.chromeAdd(this.handHud.root); // рука — над дроп-баром, под кнопками/меню
    this.chromeHud.build(this.spec.actions, this.opts.tools ?? []);
    this.api.setChromeButtons(this.chromeHud.buttons());
    this.rebuildBoard(true);
  }

  /** Строка статуса хоста у инструментов (live: «ник · комната 1234»). Пустая — спрятать. */
  setBadge(text: string): void { this.chromeHud.setBadge(text); }

  layoutChrome(w: number, h: number): void {
    this.chromeHud.layout(w, h);
    this.handHud.layout(w, h);
  }

  onBooted(): void { this.fitBoard(); }
  onSceneResize(): void { this.fitBoard(); }

  private fitBoard(): void {
    this.api.syncVp();
    const fit = { viewW: this.api.width(), viewH: this.api.height(), insetTop: ACTION_BAR_H, insetBottom: this.handHud.reservedBottom(this.api.width(), this.api.height()), size: this.tree.size };
    this.api.viewport().setZoom(fitZoom(fit));
    this.showView();
  }

  /** Показать текущий вид: пределы, трансформ, оповещение подписчиков — всегда этой тройкой. */
  private showView(): void {
    this.api.clampView();
    this.api.applyView();
    this.api.emitView();
  }

  // ——— состояние → доска ———

  private rebuildBoard(snap: boolean): void {
    this.tree = buildBoardTree(this.spec, this.state, this.selfSeat, this.state.free);
    if (!this.tex) return;
    this.nodeStore.sync(this.state, this.tree, snap);
    this.api.setContentSize(this.tree.size.w, this.tree.size.h);
    this.decor.sync();
    this.gesture.paintHints();
    this.handHud.sync();
    this.presence.paint();
    this.chromeHud.syncDice(this.state.dice);
    this.showView();
    this.api.wake();
  }

  // ——— швы домена ———

  draggables(): SceneElement[] {
    return this.nodeStore.list();
  }

  everyElement(): TableElement[] {
    return this.nodeStore.list();
  }

  /** Что фокусируется дабл-тапом (opt-in): карта-элемент под пальцем ГАСИТ жест (колода не
   *  зумится), иначе — самая внутренняя focusable-зона (чистая focusTargetIn, sceneAreas). */
  focusTargetAt(cp: { x: number; y: number }): { x: number; y: number; w: number; h: number } | null {
    if (this.api.hitElement(cp.x, cp.y)) return null;
    return focusTargetIn(this.spec.zones, this.tree.cellRects, cp);
  }

  homeOf(el: SceneElement): { home: { x: number; y: number }; depth: number } | null {
    // Сдвиги free-зон (колода-блок, свободные стопки) уже В ДЕРЕВЕ (FreePositions) — рендер, возврат
    // и хит-тест читают одну геометрию.
    const home = this.tree.homeOf(el.id);
    return home ? { home, depth: this.nodeStore.depth(el.id) } : null;
  }

  // ——— жест: что берётся, что светится, во что превращается дроп (gesture.ts) ———

  canDrag(el: SceneElement): boolean {
    return this.gesture.canDrag(el);
  }

  dragOnHold(el: SceneElement): boolean {
    return this.gesture.dragOnHold(el);
  }

  beginDrag(el: SceneElement, cp: { x: number; y: number }, sp: { x: number; y: number }): boolean {
    return this.gesture.begin(el, cp, sp);
  }

  /** Карта ЭКРАННОЙ руки под точкой: её контентный двойник — лидер драга. */
  pickHandCard(sx: number, sy: number): SceneElement | null { return this.handHud.pickAt(sx, sy); }

  onDragMoved(p: { x: number; y: number }): void {
    this.gesture.moved(p);
  }

  resolveDrop(el: SceneElement, cp: { x: number; y: number }): void {
    this.gesture.resolve(el, cp);
  }

  onDragCancel(): void {
    this.gesture.end();
  }

  afterDragEnd(): void {
    this.gesture.end();
  }

  /** Дев-хук для стори/e2e — экранная геометрия и состояние (hooks.ts). */
  testHooks(): BoardHooks {
    return boardHooks(this.state, this.tree, this.nodeStore.all(), (x, y) => this.api.contentToScreen(x, y), this.handHud.screenPoses());
  }

  onTeardown(_app: Application): void {
    this.menuOwner.destroy();
    this.gesture.destroy();
    this.handHud.destroy();
    this.presence.destroy();
    this.decor.destroy();
    this.nodeStore.destroy();
    this.tex?.destroy();
    this.tex = null;
  }
}
