// РАНТАЙМ СЦЕНЫ — КОМПОЗИЦИЯ ВМЕСТО НАСЛЕДОВАНИЯ (странглер над SceneEngine): сцена больше не
// подкласс движка, а ДЕЛЕГАТ (SceneDelegate — те же швы, что были protected-виртуалами) плюс
// публичный ДОСТУП (SceneApi — то, что раньше было protected-полями). Пока живы старые сцены-
// наследники, ядро SceneEngine остаётся; когда мигрируют все — protected-контракт умирает и
// SceneRuntime сливается с ядром. Не реализованный делегатом шов ведёт себя ПО-СТАРОМУ (super).

import type { Application, Container } from "pixi.js";
import type { Button } from "../ui/Button";
import type { DragContext, DragPayload } from "./drag";
import type { TableElement } from "./element";
import type { DragMode } from "./inputRouter";
import { SceneEngine, type CameraConfig, type SceneElement, type SpreadSource } from "./sceneEngine";
import type { Viewport } from "./viewport";

interface Pt {
  x: number;
  y: number;
}

/** Швы сцены (бывшие protected-виртуалы движка). Обязательны только три реестра + сборка. */
export interface SceneDelegate {
  buildScene(app: Application): void;
  draggables(): SceneElement[];
  everyElement(): TableElement[];
  homeOf(el: SceneElement): { home: Pt; depth: number } | null;

  layoutChrome?(w: number, h: number): void;
  chromeInsetTop?(): number;
  onBooted?(): void;
  onSceneResize?(w: number, h: number): void;
  focusTargetAt?(cp: Pt): { x: number; y: number; w: number; h: number } | null;
  spreadOnElement?(cp: Pt, rawX: number, rawY: number, source: SpreadSource): boolean;
  onSpreadBegin?(): void;
  pickElement?(cx: number, cy: number): SceneElement | null;
  canDrag?(el: SceneElement): boolean;
  dragOnTap?(el: SceneElement): boolean;
  dragOnHold?(el: SceneElement): boolean;
  /** Свой захват. Дефолтный одиночный драг — api.defaultBeginDrag. */
  beginDrag?(el: SceneElement, cp: Pt, sp: Pt): boolean;
  beforeDragMove?(el: SceneElement, cp: Pt): boolean;
  dragPoint?(cp: Pt): Pt;
  onDragMoved?(p: Pt): void;
  beforeDrop?(el: SceneElement, cp: Pt): boolean;
  resolveDrop?(el: SceneElement, cp: Pt): void;
  onDragCancel?(): void;
  afterDragEnd?(): void;
  onElementBlocked?(el: SceneElement): void;
  onElementTapped?(el: SceneElement): void;
  /** Свой тап по сцене. Дефолт (дабл-тап-зум) — api.defaultSceneTap. */
  onSceneTap?(content: Pt, screen: Pt): void;
  hasContextAt?(cp: Pt): boolean;
  openContextMenu?(cp: Pt, sp: Pt): void;
  setHome?(el: SceneElement, home: Pt, depth: number): void;
  stepScene?(dt: number): boolean;
  reapDead?(): void;
  onTeardown?(app: Application): void;
}

/** Публичный доступ сцены к движку (бывшие protected-поля/хелперы). */
export interface SceneApi {
  width(): number;
  height(): number;
  renderer(): Application["renderer"] | null;
  contentAdd(c: Container): void;
  surfaceAdd(c: Container): void;
  chromeAdd(c: Container): void;
  chromeAddAt(c: Container, index: number): void;
  setChromeButtons(btns: readonly Button[]): void;
  forgetHovered(btns: readonly Button[]): void;
  byId: Map<string, SceneElement>;
  drag(): DragPayload | null;
  setDrag(d: DragPayload): void;
  dragScreen(): Pt;
  grabMode(): DragMode;
  dragCtx(): DragContext;
  viewport(): Viewport;
  setContentSize(w: number, h: number): void;
  wake(): void;
  after(sec: number, fn: () => void): void;
  placeCard(el: TableElement): void;
  releaseElement(el: SceneElement): void;
  hitElement(cx: number, cy: number): SceneElement | null;
  screenToContent(sx: number, sy: number): Pt;
  contentToScreen(cx: number, cy: number): Pt;
  syncVp(): void;
  clampView(): void;
  applyView(): void;
  emitView(): void;
  focusBounds(b: { x: number; y: number; w: number; h: number }): void;
  /** Дефолтные ветки движка, которые делегат может звать из своих швов. */
  defaultBeginDrag(el: SceneElement, cp: Pt, sp: Pt): boolean;
  defaultSceneTap(content: Pt, screen: Pt): void;
}

export class SceneRuntime extends SceneEngine {
  private d!: SceneDelegate;

  constructor(cam: CameraConfig = {}) {
    super(cam);
  }

  /** Привязать делегата ДО mount (сцена и рантайм создаются взаимно — двухфазная инициализация). */
  attach(d: SceneDelegate): void {
    this.d = d;
  }

  readonly api: SceneApi = {
    width: () => this.width,
    height: () => this.height,
    renderer: () => this.app?.renderer ?? null,
    contentAdd: (c) => void this.content.addChild(c),
    surfaceAdd: (c) => void this.scene.surface.addChild(c),
    chromeAdd: (c) => void this.chrome.addChild(c),
    chromeAddAt: (c, i) => void this.chrome.addChildAt(c, i),
    setChromeButtons: (btns) => {
      this.chromeButtons = [...btns];
    },
    forgetHovered: (btns) => {
      if (this.hoveredBtn && btns.includes(this.hoveredBtn)) this.hoveredBtn = null;
    },
    byId: this.byId,
    drag: () => this.drag,
    setDrag: (d) => {
      this.drag = d;
    },
    dragScreen: () => this.dragScreen,
    grabMode: () => this.grabMode,
    dragCtx: () => this.dragCtx,
    viewport: () => this.viewport,
    setContentSize: (w, h) => {
      this.contentW = w;
      this.contentH = h;
    },
    wake: () => this.wake(),
    after: (sec, fn) => this.after(sec, fn),
    placeCard: (el) => this.placeCard(el),
    releaseElement: (el) => this.releaseElement(el),
    hitElement: (cx, cy) => this.hitElement(cx, cy),
    screenToContent: (sx, sy) => this.screenToContent(sx, sy),
    contentToScreen: (cx, cy) => this.contentToScreen(cx, cy),
    syncVp: () => this.syncVp(),
    clampView: () => this.clampView(),
    applyView: () => this.applyView(),
    emitView: () => this.emitView(),
    focusBounds: (b) => this.focusBounds(b),
    defaultBeginDrag: (el, cp, sp) => super.beginDrag(el, cp, sp),
    defaultSceneTap: (content, screen) => super.onSceneTap(content, screen),
  };

  // ——— форвардинг швов: делегат реализовал — его слово; нет — поведение ядра (super) ———

  protected buildScene(app: Application): void {
    this.d.buildScene(app);
  }
  protected draggables(): SceneElement[] {
    return this.d.draggables();
  }
  protected everyElement(): TableElement[] {
    return this.d.everyElement();
  }
  protected homeOf(el: SceneElement): { home: Pt; depth: number } | null {
    return this.d.homeOf(el);
  }
  protected layoutChrome(w: number, h: number): void {
    this.d.layoutChrome ? this.d.layoutChrome(w, h) : super.layoutChrome(w, h);
  }
  protected chromeInsetTop(): number {
    return this.d.chromeInsetTop ? this.d.chromeInsetTop() : super.chromeInsetTop();
  }
  protected onBooted(): void {
    this.d.onBooted?.();
    super.onBooted();
  }
  protected onSceneResize(w: number, h: number): void {
    this.d.onSceneResize ? this.d.onSceneResize(w, h) : super.onSceneResize(w, h);
  }
  protected focusTargetAt(cp: Pt): { x: number; y: number; w: number; h: number } | null {
    return this.d.focusTargetAt ? this.d.focusTargetAt(cp) : super.focusTargetAt(cp);
  }
  protected spreadOnElement(cp: Pt, rawX: number, rawY: number, source: SpreadSource): boolean {
    return this.d.spreadOnElement ? this.d.spreadOnElement(cp, rawX, rawY, source) : super.spreadOnElement(cp, rawX, rawY, source);
  }
  protected onSpreadBegin(): void {
    this.d.onSpreadBegin ? this.d.onSpreadBegin() : super.onSpreadBegin();
  }
  protected pickElement(cx: number, cy: number): SceneElement | null {
    return this.d.pickElement ? this.d.pickElement(cx, cy) : super.pickElement(cx, cy);
  }
  protected canDrag(el: SceneElement): boolean {
    return this.d.canDrag ? this.d.canDrag(el) : super.canDrag(el);
  }
  protected dragOnTap(el: SceneElement): boolean {
    return this.d.dragOnTap ? this.d.dragOnTap(el) : super.dragOnTap(el);
  }
  protected dragOnHold(el: SceneElement): boolean {
    return this.d.dragOnHold ? this.d.dragOnHold(el) : super.dragOnHold(el);
  }
  protected beginDrag(el: SceneElement, cp: Pt, sp: Pt): boolean {
    return this.d.beginDrag ? this.d.beginDrag(el, cp, sp) : super.beginDrag(el, cp, sp);
  }
  protected beforeDragMove(el: SceneElement, cp: Pt): boolean {
    return this.d.beforeDragMove ? this.d.beforeDragMove(el, cp) : super.beforeDragMove(el, cp);
  }
  protected dragPoint(cp: Pt): Pt {
    return this.d.dragPoint ? this.d.dragPoint(cp) : super.dragPoint(cp);
  }
  protected onDragMoved(p: Pt): void {
    this.d.onDragMoved ? this.d.onDragMoved(p) : super.onDragMoved(p);
  }
  protected beforeDrop(el: SceneElement, cp: Pt): boolean {
    return this.d.beforeDrop ? this.d.beforeDrop(el, cp) : super.beforeDrop(el, cp);
  }
  protected resolveDrop(el: SceneElement, cp: Pt): void {
    this.d.resolveDrop ? this.d.resolveDrop(el, cp) : super.resolveDrop(el, cp);
  }
  protected onDragCancel(): void {
    this.d.onDragCancel ? this.d.onDragCancel() : super.onDragCancel();
  }
  protected afterDragEnd(): void {
    this.d.afterDragEnd ? this.d.afterDragEnd() : super.afterDragEnd();
  }
  protected onElementBlocked(el: SceneElement): void {
    this.d.onElementBlocked ? this.d.onElementBlocked(el) : super.onElementBlocked(el);
  }
  protected onElementTapped(el: SceneElement): void {
    this.d.onElementTapped ? this.d.onElementTapped(el) : super.onElementTapped(el);
  }
  protected onSceneTap(content: Pt, screen: Pt): void {
    this.d.onSceneTap ? this.d.onSceneTap(content, screen) : super.onSceneTap(content, screen);
  }
  protected hasContextAt(cp: Pt): boolean {
    return this.d.hasContextAt ? this.d.hasContextAt(cp) : super.hasContextAt(cp);
  }
  protected openContextMenu(cp: Pt, sp: Pt): void {
    this.d.openContextMenu ? this.d.openContextMenu(cp, sp) : super.openContextMenu(cp, sp);
  }
  protected setHome(el: SceneElement, home: Pt, depth: number): void {
    this.d.setHome ? this.d.setHome(el, home, depth) : super.setHome(el, home, depth);
  }
  protected stepScene(dt: number): boolean {
    return this.d.stepScene ? this.d.stepScene(dt) : super.stepScene(dt);
  }
  protected reapDead(): void {
    this.d.reapDead ? this.d.reapDead() : super.reapDead();
  }
  protected onTeardown(app: Application): void {
    this.d.onTeardown?.(app);
    super.onTeardown(app);
  }
}
