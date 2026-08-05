import { Application, Container, Rectangle } from "pixi.js";
import { CanvasApp } from "./canvasApp";
import { SceneLayers, levelOf } from "./sceneLayers";
import { Viewport, wheelGoesToScene, type ViewState } from "./viewport";
import { InputRouter, type DragMode, type InputHandlers } from "./inputRouter";
import { buildSceneInput } from "./sceneInput";
import { Marker, type MarkerConfig, type MarkerHost, type ShowPolicy } from "./marker";
import { SceneMarkers, type Grabber as MarkerGrabber } from "./sceneMarkers";
import { SingleDrag, type DragContext, type DragPayload } from "./drag";
import { topmostAt, type HitBox } from "./cardHit";
import { Button } from "../ui/Button";
import { Card, type Pose } from "../ui/Card";
import { Piece } from "../ui/Piece";
import type { DropZone } from "../ui/DropZone";
import type { Draggable, Peekable, TableElement } from "./element";
import { flipSchedule } from "../anim/flipSchedule";
import { animDurationOf, type AnimKind } from "../anim/durations";
import { BASE_PRESET, type AnimPreset } from "../anim/presets";
import { LandingQueue } from "./sceneLanding";
import { SceneCamera, type SpreadSource } from "./sceneCamera";
import type { SceneApi, SceneDelegate } from "./sceneContract";
import { ScenePeeks } from "./scenePeeks";
import { DelayQueue, SceneTimers } from "./sceneTimers";

/** Какая из анимаций элемента: у каждой своё расписание в пресете. */
export type { AnimKind } from "../anim/durations";

// ОБЩАЯ ОБВЯЗКА СЦЕНЫ — слой между тонким Host'ом (CanvasApp: Pixi, тикер, ресайз) и конкретной
// сценой (песочница, Косынка, будущие игры). Здесь живёт всё, что у любой сцены со столом ОДИНАКОВО
// и потому не должно писаться заново:
//
//   • полотно контента + слои сцены (SceneLayers) и раскладка элементов по состояниям;
//   • камера: пан/зум/пинч/колесо/инерция/клампы/скроллбары/авто-скролл у кромки;
//   • ввод: InputRouter + хит-тест элементов и кнопок + ховер;
//   • драг: DragContext (подъём в слой драга, возврат домой), SingleDrag по умолчанию;
//   • дроп-зоны: реестр, подсветка armed/hot по СПОСОБНОСТЯМ груза, диспатч дропа;
//   • «подглядеть» (Peekable): сессии показа и их закрытие по таймеру/концу драга;
//   • цикл кадра и рендер: шаг элементов, слитые тени, сон/пробуждение.
//
// Сцена реализует ТОЛЬКО своё: какие элементы у неё есть (everyElement/draggables), где их дом
// (homeOf) и что значит дроп (resolveDrop). Всё остальное — переопределяемые швы с рабочими
// умолчаниями, так что простая сцена не пишет ни строчки ввода и камеры.
//
// Почему это вынесено (разбор: issue #78): пасьянс, написанный ДО общего слоя, оброс
// собственным разбором pointer-событий, своей камерой и своим драгом — параллельной реализацией
// вместо переиспользования. Общий слой закрывает саму возможность повторить это.

export type { ViewState };

/** Элемент сцены: база TableElement + драгабельность + геометрия покоя (для хит-теста и возврата). */
export type SceneElement = TableElement &
  Draggable & {
    readonly pose: Pose;
    readonly restScale: number;
    readonly footprint: { hw: number; hh: number };
  };

interface Pt {
  x: number;
  y: number;
}

/** Зарегистрированная дроп-зона: сама зона + что она делает и что принимает. */
interface ZoneReg {
  zone: DropZone;
  onDrop: (p: DragPayload, at: Pt) => void;
  accepts: (p: DragPayload) => boolean;
  textFor?: (p: DragPayload) => { armed: string; hot: string };
}

/** Настройки камеры сцены. Умолчания — ровно те, на которых откатана песочница: контрол и жесты
 *  обязаны совпадать во всех сценах, поэтому расходиться тут можно только осознанно. */
/** Всё, за что тянут ЧЕРЕЗ МЕТКУ (стопки, столбики, соло-цели) — единый список для хит-теста. */
export type Grabber = MarkerGrabber<SceneElement>;

export interface CameraConfig {
  minZoom?: number;
  maxZoom?: number;
  margin?: number;
  align?: "left" | "center";
  /** Как класть контент по вертикали, когда он ниже экрана. По умолчанию — к верху. */
  alignY?: "center" | "top";
}

export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 2.6;
export { ZOOM_SENS, WHEEL_GESTURE_GAP_MS } from "./sceneCamera";
export type { SpreadSource } from "./sceneCamera";
/** Сколько секунд дропзона «подглядеть» держит карту раскрытой до авто-возврата. */
export { PEEK_DUR } from "./scenePeeks";

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class SceneEngine extends CanvasApp {
  // ——— полотно и слои ———
  protected content!: Container;
  protected scene!: SceneLayers;
  /** Экранный слой поверх сцены: топбар и прочий HUD. Живёт ВНЕ камеры — не панится и не зумится. */
  protected chrome!: Container;
  /** Кнопки экранного слоя: хит-тест в ЭКРАННЫХ координатах, приоритет выше карт (см. pickOverlay). */
  protected chromeButtons: Button[] = [];
  /** Размер полотна контента (не экрана) — от него считаются клампы камеры и тени. */
  protected contentW = 1;
  protected contentH = 1;

  // ——— камера ———
  protected readonly viewport: Viewport;
  private onView: ((v: ViewState) => void) | null = null;
  protected readonly camera = new SceneCamera({
    viewport: () => this.viewport,
    size: () => ({ w: this.width, h: this.height }),
    insetTop: () => this.chromeInsetTop(),
    contentSize: () => ({ w: this.contentW, h: this.contentH }),
    syncVp: () => this.syncVp(),
    clampView: () => this.clampView(),
    applyView: () => this.applyView(),
    emitView: () => this.emitView(),
    wake: () => this.wake(),
    screenToContent: (sx, sy) => this.screenToContent(sx, sy),
    canvasRect: () => this.app!.canvas.getBoundingClientRect(),
    spreadOnElement: (cp, rx, ry, src) => this.spreadOnElement(cp, rx, ry, src),
    onSpreadBegin: () => this.onSpreadBegin(),
    focusTargetAt: (cp) => this.focusTargetAt(cp),
    inDocument: () => this.inDocument,
    dragInfo: () => ({ payload: this.drag, screen: this.dragScreen, dragging: this.input.gesture === "drag" }),
    refreshZoneHot: (pp) => this.refreshZoneHot(pp),
  });
  // Метка последнего жеста спреда колесом/тачпадом — для синтетической ГРАНИЦЫ жеста. У колеса нет
  // pointerdown/up: пауза дольше WHEEL_GESTURE_GAP_MS = новый жест (сброс детента спреда, onSpreadBegin).
  private lastWheelSpreadT = 0;

  // ——— дабл-тап-зум на зону (общий механизм; сцена решает, что фокусируемо — focusTargetAt) ———

  // ——— ввод ———
  protected readonly input = new InputRouter<SceneElement, Button>(this.inputHandlers());
  protected buttons: Button[] = [];
  protected hoveredBtn: Button | null = null; // наведённая кнопка (ПК): гасим/зажигаем только её
  protected hoverRerenders = 0; // счётчик перерисовок от ховера — для e2e-замера отсутствия лагов
  protected byId = new Map<string, SceneElement>(); // реестр по id — для API/меток/наборов

  // ——— драг ———
  protected drag: DragPayload | null = null; // текущий груз (одна карта или пачка)
  protected dragScreen = { x: 0, y: 0 }; // экранная позиция пальца — для авто-скролла у кромки
  protected readonly dragCtx: DragContext = {
    raise: (el) => {
      el.setState("drag");
      el.root.zIndex = 1e6;
      this.placeCard(el);
    },
    returnHome: (el) => this.releaseElement(el as SceneElement),
    flipGroup: (els) => this.flipGroup(els as readonly SceneElement[]),
    startPeek: (els) => this.startPeek(els),
  };

  // ——— дроп-зоны ———
  protected zones: ZoneReg[] = [];

  // ——— МЕТКИ ЗАХВАТА (marker.ts) — общий механизм стола, не привилегия песочницы ———
  //
  // Метка — это «ручка» цели: драггер (грип) едет с грузом за пальцем, якорь стоит дома по своей
  // политике видимости, и они свапаются по состоянию. Цель за меткой может быть чем угодно —
  // стопкой карт, столбиком фишек, одиночной фигурой: host отдаёт слот, состояние и ГРУЗ
  // (makePayload), а движок про её природу ничего не знает.
  //
  // Живёт здесь, а не в песочнице, потому что механизм generic по элементу и нужен каждой сцене,
  // где за что-то тянут через ручку — в том числе витрине каталога. Держать его в PlaygroundEngine
  // значило бы, что каталог обязан или копировать плумбинг, или показывать стопки без ручек.
  private readonly markerRig = new SceneMarkers<SceneElement>();
  /** Каким жестом (tap/hold) захватили текущий драг — роутер сообщает при onPieceGrab, а `beginDrag`
   *  читает, чтобы выбрать нужный интент (у стека тап и hold могут тащить разное). */
  protected grabMode: DragMode = "tap";

  /** Навесить пару меток (драггер + якорь) — см. sceneMarkers.ts. */
  protected mountMarkers(
    host: MarkerHost,
    lead: () => SceneElement | null,
    dragger: Omit<MarkerConfig, "show"> & { show?: ShowPolicy },
    anchorCfg: Omit<MarkerConfig, "show" | "follow" | "hit"> & { show?: ShowPolicy },
  ): { dragger: Marker; anchor: Marker } {
    return this.markerRig.mount({ verb: this.scene.verb, surface: this.scene.surface, dragLayer: this.scene.cards.drag }, host, lead, dragger, anchorCfg);
  }

  protected clearMarkers(): void {
    this.markerRig.clear();
  }

  // ——— «подглядеть» ———
  // id → сессия показа. undo — замыкание из Peekable.peekReveal, возвращающее элемент КАК БЫЛО:
  // reveal и restore одной парой, рассинхрону неоткуда взяться. grabbed — показанный элемент
  // перехватили повторным драгом; тогда восстановление ждёт КОНЦА драга или истечения PEEK_DUR.
  protected readonly peeks = new ScenePeeks({ wake: () => this.wake(), releaseElement: (el) => this.releaseElement(el as SceneElement) });

  /** Лёгкий профиль качества (issue #8): выключает shadow-пасс и замораживает idle у карт. */
  protected lowFx = false;

  constructor(cam: CameraConfig = {}) {
    super();
    this.viewport = new Viewport(cam.minZoom ?? MIN_ZOOM, cam.maxZoom ?? MAX_ZOOM, cam.margin ?? 24, cam.align ?? "left", 0, cam.alignY ?? "top");
  }

  // ——— делегат сцены (композиция вместо наследования): сцена реализует SceneDelegate и получает
  // SceneApi; нереализованный шов ведёт себя ПО-СТАРОМУ (coreX — поведение ядра) ———

  private d!: SceneDelegate;

  /** Привязать делегата ДО mount (сцена и движок создаются взаимно — двухфазная инициализация). */
  attach(d: SceneDelegate): void {
    this.d = d;
  }

  readonly api: SceneApi = {
    width: () => this.width,
    height: () => this.height,
    renderer: () => this.app?.renderer ?? null,
    app: () => this.app,
    appReady: () => this.app !== null,
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
    contentSize: () => ({ w: this.contentW, h: this.contentH }),
    layers: () => this.scene,
    setButtons: (btns) => {
      this.buttons = [...btns];
    },
    buttonsRef: () => this.buttons,
    preset: () => this.preset,
    setPreset: (p) => {
      this.preset = p;
    },
    reduceMotion: () => this.reduceMotion,
    lowFx: () => this.lowFx,
    flashOff: () => this.flashOff,
    render: () => this.render(),
    wake: () => this.wake(),
    after: (sec, fn) => this.after(sec, fn),
    animDuration: (id, kind) => this.animDuration(id, kind),
    needsPeek: (el) => this.needsPeek(el),
    flipGroup: (els) => this.flipGroup(els),
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
    registerZone: (zone, onDrop, accepts, textFor) => this.registerZone(zone, onDrop, accepts, textFor),
    mountMarkers: (host, lead, dragger, anchorCfg) => this.mountMarkers(host, lead, dragger, anchorCfg),
    clearMarkers: () => this.clearMarkers(),
    markersList: () => this.markerRig.list(),
    grabbersList: () => this.markerRig.grabberList(),
    resetSceneState: () => this.resetSceneState(),
    setQualityProfile: (p) => this.onProfileChange(p),
    defaultBeginDrag: (el, cp, sp) => this.coreBeginDrag(el, cp, sp),
    defaultSceneTap: (content, screen) => this.coreOnSceneTap(content, screen),
    defaultPickElement: (cx, cy) => this.corePickElement(cx, cy),
    defaultElementTapped: (el) => this.coreOnElementTapped(el),
    defaultCanDrag: (el) => this.coreCanDrag(el),
  };

  // ——— диспетчеры швов: делегат реализовал — его слово; нет — поведение ядра ———

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
    this.d.layoutChrome ? this.d.layoutChrome(w, h) : this.coreLayoutChrome(w, h);
  }
  protected chromeInsetTop(): number {
    return this.d.chromeInsetTop ? this.d.chromeInsetTop() : this.coreChromeInsetTop();
  }
  protected onSceneResize(w: number, h: number): void {
    this.d.onSceneResize ? this.d.onSceneResize(w, h) : this.coreOnSceneResize(w, h);
  }
  protected focusTargetAt(cp: Pt): { x: number; y: number; w: number; h: number } | null {
    return this.d.focusTargetAt ? this.d.focusTargetAt(cp) : this.coreFocusTargetAt(cp);
  }
  protected spreadOnElement(cp: Pt, rawX: number, rawY: number, source: SpreadSource): boolean {
    return this.d.spreadOnElement ? this.d.spreadOnElement(cp, rawX, rawY, source) : this.coreSpreadOnElement(cp, rawX, rawY, source);
  }
  protected onSpreadBegin(): void {
    this.d.onSpreadBegin ? this.d.onSpreadBegin() : this.coreOnSpreadBegin();
  }
  protected pickElement(cx: number, cy: number): SceneElement | null {
    return this.d.pickElement ? this.d.pickElement(cx, cy) : this.corePickElement(cx, cy);
  }
  protected canDrag(el: SceneElement): boolean {
    return this.d.canDrag ? this.d.canDrag(el) : this.coreCanDrag(el);
  }
  protected dragOnTap(el: SceneElement): boolean {
    return this.d.dragOnTap ? this.d.dragOnTap(el) : this.coreDragOnTap(el);
  }
  protected dragOnHold(el: SceneElement): boolean {
    return this.d.dragOnHold ? this.d.dragOnHold(el) : this.coreDragOnHold(el);
  }
  protected beginDrag(el: SceneElement, cp: Pt, sp: Pt): boolean {
    return this.d.beginDrag ? this.d.beginDrag(el, cp, sp) : this.coreBeginDrag(el, cp, sp);
  }
  protected beforeDragMove(el: SceneElement, cp: Pt): boolean {
    return this.d.beforeDragMove ? this.d.beforeDragMove(el, cp) : this.coreBeforeDragMove(el, cp);
  }
  protected dragPoint(cp: Pt): Pt {
    return this.d.dragPoint ? this.d.dragPoint(cp) : this.coreDragPoint(cp);
  }
  protected onDragMoved(p: Pt): void {
    this.d.onDragMoved ? this.d.onDragMoved(p) : this.coreOnDragMoved(p);
  }
  protected beforeDrop(el: SceneElement, cp: Pt): boolean {
    return this.d.beforeDrop ? this.d.beforeDrop(el, cp) : this.coreBeforeDrop(el, cp);
  }
  protected resolveDrop(el: SceneElement, cp: Pt): void {
    this.d.resolveDrop ? this.d.resolveDrop(el, cp) : this.coreResolveDrop(el, cp);
  }
  protected onDragCancel(): void {
    this.d.onDragCancel ? this.d.onDragCancel() : this.coreOnDragCancel();
  }
  protected afterDragEnd(): void {
    this.d.afterDragEnd ? this.d.afterDragEnd() : this.coreAfterDragEnd();
  }
  protected onElementBlocked(el: SceneElement): void {
    this.d.onElementBlocked ? this.d.onElementBlocked(el) : this.coreOnElementBlocked(el);
  }
  protected onElementTapped(el: SceneElement): void {
    this.d.onElementTapped ? this.d.onElementTapped(el) : this.coreOnElementTapped(el);
  }
  protected onSceneTap(content: Pt, screen: Pt): void {
    this.d.onSceneTap ? this.d.onSceneTap(content, screen) : this.coreOnSceneTap(content, screen);
  }
  protected hasContextAt(cp: Pt): boolean {
    return this.d.hasContextAt ? this.d.hasContextAt(cp) : this.coreHasContextAt(cp);
  }
  protected openContextMenu(cp: Pt, sp: Pt): void {
    this.d.openContextMenu ? this.d.openContextMenu(cp, sp) : this.coreOpenContextMenu(cp, sp);
  }
  protected setHome(el: SceneElement, home: Pt, depth: number): void {
    this.d.setHome ? this.d.setHome(el, home, depth) : this.coreSetHome(el, home, depth);
  }
  protected stepScene(dt: number): boolean {
    return this.d.stepScene ? this.d.stepScene(dt) : this.coreStepScene(dt);
  }
  protected reapDead(): void {
    this.d.reapDead ? this.d.reapDead() : this.coreReapDead();
  }

  // ——————————————————————————————————————————————————————————————————————
  // Сборка
  // ——————————————————————————————————————————————————————————————————————

  protected build(app: Application): void {
    this.content = new Container();
    this.chrome = new Container();
    // Порядок: контент под камерой, HUD поверх него и БЕЗ трансформа камеры.
    app.stage.addChild(this.content, this.chrome);
    this.scene = new SceneLayers(this.content);
    this.buildScene(app);
    this.layoutChrome(this.width, this.height);
    this.wire(app);
  }

  /** Разложить экранный слой под размер экрана. Зовётся после сборки и на каждом ресайзе. Опц. */
  private coreLayoutChrome(_w: number, _h: number): void {}

  /** Экранный отступ сверху, занятый HUD: сцена вычитает его из полезной высоты стола. */
  private coreChromeInsetTop(): number {
    return 0;
  }

  /** Собрать СВОЮ сцену в this.scene/this.content (полотно и слои уже готовы). Обязателен. */

  // Ввод и колесо вешаются на stage/канвас один раз за boot. hitArea обновляется на ресайзе.
  private wire(app: Application): void {
    app.stage.eventMode = "static";
    app.stage.hitArea = new Rectangle(0, 0, this.width, this.height);
    app.stage.on("pointerdown", this.onDown);
    app.stage.on("pointermove", this.onMove);
    app.stage.on("pointerup", this.onUp);
    app.stage.on("pointerupoutside", this.onUp);
    app.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    // ПКМ на десктопе = long-press на таче: контекстное меню сцены (если сцене есть что показать).
    app.canvas.addEventListener("contextmenu", this.onCtxMenu);
  }

  protected onBooted(): void {
    this.d.onBooted?.();
    this.clampView();
    this.applyView();
    this.render();
    this.wake();
    this.emitView();
  }

  /** Положить визуал элемента в слой его текущего состояния. */
  protected placeCard(el: TableElement): void {
    this.scene.place(el.root, levelOf(el.state));
  }

  // ——————————————————————————————————————————————————————————————————————
  // Камера
  // ——————————————————————————————————————————————————————————————————————

  // Камера работает не во всём канвасе, а в ПОДПРЯМОУГОЛЬНИКЕ под HUD: экран для неё ниже на
  // chromeInsetTop, а контент рисуется со сдвигом на ту же величину. Без этого верх стола навсегда
  // заезжал бы под непрозрачную панель и доскроллить до него было бы нечем (кламп упирается в 0).
  // Сцене без HUD инсет = 0, и всё вырождается в прежнее поведение.
  private camPoint(sx: number, sy: number): Pt {
    return { x: sx, y: sy - this.chromeInsetTop() };
  }

  // Синхронизировать границы камеры перед операцией (экран/контент меняются при сборке и ресайзе).
  protected syncVp(): void {
    this.viewport.setScreen(this.width, this.height - this.chromeInsetTop());
    this.viewport.setContent(this.contentW, this.contentH);
  }

  protected screenToContent(sx: number, sy: number): Pt {
    const c = this.camPoint(sx, sy);
    return this.viewport.screenToContent(c.x, c.y);
  }

  protected clampView(): void {
    this.syncVp();
    this.viewport.clamp();
  }

  protected applyView(): void {
    this.content.position.set(this.viewport.x, this.viewport.y + this.chromeInsetTop());
    this.content.scale.set(this.viewport.zoom);
  }

  // ——————————————————————————————————————————————————————————————————————
  // Дабл-тап-зум на зону (Figma-like). Общий механизм: сцена лишь говорит, что фокусируемо под
  // точкой (focusTargetAt → границы в координатах контента, или null). Движок наводит камеру на эти
  // границы по центру и зумит так, чтобы они влезали в 90% доступной области, плавно. Повторный
  // дабл-тап по той же зоне — тоггл к полному виду.
  // ——————————————————————————————————————————————————————————————————————

  /** Границы фокусируемой цели под точкой (координаты КОНТЕНТА) или null — нечего фокусировать.
   *  По умолчанию ничего не фокусируется; сцена включает нужные зоны/элементы (opt-in). */
  private coreFocusTargetAt(_cp: Pt): { x: number; y: number; w: number; h: number } | null {
    return null;
  }

  /**
   * Жест спреда ПО цели под точкой (координаты КОНТЕНТА). Один шов на ВСЕ входы; чем именно пришёл
   * жест — в `source`: `touch-zoom` (два пальца по тачскрину), `pointer-zoom` (десктоп Ctrl/⌘-колесо
   * или тачпад-пинч), `pointer-pan` (десктоп обычное колесо/скролл). `rawX`/`rawY` — СЫРЫЕ device-
   * дельты за кадр (px): pointer-pan даёт обе оси (ось выбирает конфиг стека), zoom — вертикаль в rawY,
   * пинч — прирост span в rawX. Как маппить в прогресс спреда — дело сцены/конфига. Вернуть true —
   * спред взял жест, камера его НЕ получает. По умолчанию не берём — жест уходит камере/странице.
   */
  private coreSpreadOnElement(_cp: Pt, _rawX: number, _rawY: number, _source: SpreadSource): boolean {
    return false;
  }

  /** Начался НОВЫЙ жест спреда (палец лёг / у колеса — новый залп после паузы). Сцена сбрасывает
   *  per-gesture-состояние (напр. «этот жест уже двигал спред» — для детента на пределе). Опц. */
  private coreOnSpreadBegin(): void {}

  /** Навести камеру на границы (плавный твин) — риг SceneCamera. */
  protected focusBounds(b: { x: number; y: number; w: number; h: number }): void {
    this.camera.focusBounds(b);
  }

  // Окно изменилось (issue #49). Пересобирать сцену НЕ нужно, если её геометрия не зависит от
  // экрана: меняются лишь хит-зона сцены и границы камеры. Плюс emitView — иначе скроллбары
  // остались бы с прежними долями видимого. Сцене, считающей раскладку от W/H, есть onSceneResize.
  protected onResize(w: number, h: number): void {
    if (!this.app) return;
    this.app.stage.hitArea = new Rectangle(0, 0, w, h);
    this.layoutChrome(w, h);
    this.onSceneResize(w, h);
    this.clampView();
    this.applyView();
    this.emitView();
  }

  /** Пересчитать СВОЮ раскладку под новый экран (до клампа камеры). Опц. */
  private coreOnSceneResize(_w: number, _h: number): void {}

  /** Колесо/тачпад — целиком камерный риг (зум с модификатором, пан, спреды). */
  private onWheel = (e: WheelEvent): void => this.camera.handleWheel(e);

  /**
   * Сцена стоит ВНУТРИ документа (docs-страница каталога), а не владеет кадром.
   *
   * Ставит хост: сама сцена о том, что вокруг неё, знать не может, а поведение колеса зависит
   * именно от этого — см. `wheelGoesToScene`.
   */
  private inDocument = false;

  setInDocument(v: boolean): void {
    this.inDocument = v;
  }

  /** Подписка хоста на состояние вида (скроллбары/индикатор зума). */
  setOnView(cb: ((v: ViewState) => void) | null): void {
    this.onView = cb;
    this.emitView();
  }

  protected emitView(): void {
    this.onView?.(this.viewState());
  }

  private viewState(): ViewState {
    this.syncVp();
    return this.viewport.state();
  }

  setZoom(z: number): void {
    this.syncVp();
    this.viewport.setZoom(z);
    this.applyView();
    this.wake();
    this.emitView();
  }

  setScrollX(fraction: number): void {
    this.syncVp();
    this.viewport.setScrollX(fraction);
    this.applyView();
    this.wake();
    this.emitView();
  }

  setScrollY(fraction: number): void {
    this.syncVp();
    this.viewport.setScrollY(fraction);
    this.applyView();
    this.wake();
    this.emitView();
  }

  // ——————————————————————————————————————————————————————————————————————
  // Дроп-зоны
  // ——————————————————————————————————————————————————————————————————————

  /** Завести зону: она сама рисуется в слои сцены, движок лишь помнит её реакцию и приём. */
  protected registerZone(
    zone: DropZone,
    onDrop: (p: DragPayload, at: Pt) => void,
    accepts: (p: DragPayload) => boolean,
    textFor?: (p: DragPayload) => { armed: string; hot: string },
  ): void {
    this.zones.push({ zone, onDrop, accepts, textFor });
    this.scene.surface.addChild(zone.base);
    this.scene.verb.addChild(zone.verb);
    if (zone.armedText) this.scene.verb.addChild(zone.armedText);
  }

  // Подсветка зоны под грузом — ТОЛЬКО если груз реально способен на её действие: иначе зона
  // «обещает» глаголом то, чего после дропа не сделает.
  private refreshZoneHot(p: Pt): void {
    for (const z of this.zones) {
      const eligible = this.drag !== null && z.accepts(this.drag);
      z.zone.setHot(eligible && z.zone.contains(p.x, p.y), eligible && z.textFor ? z.textFor(this.drag!).hot : undefined);
    }
  }

  // ——————————————————————————————————————————————————————————————————————
  // «Подглядеть»
  // ——————————————————————————————————————————————————————————————————————

  /** Есть ли у элемента что раскрыть — ЧИСТЫЙ предикат (armed-текст зоны читает без мутаций). */
  protected needsPeek(el: TableElement): boolean {
    return this.peeks.needs(el);
  }

  /** true — хоть один элемент ушёл в показ (consumed для драга); иначе полетят домой как обычно. */
  protected startPeek(els: readonly TableElement[]): boolean {
    return this.peeks.start(els);
  }

  // ——————————————————————————————————————————————————————————————————————
  // Хит-тест и ввод
  // ——————————————————————————————————————————————————————————————————————


  /** Все живые элементы сцены (в т.ч. недрагабельные) — для шага/рендера/теней. Обязателен. */

  /** Дом элемента: позиция покоя + глубина. null — дома нет (элемент вне раскладки). Обязателен. */

  protected hitElement(cx: number, cy: number): SceneElement | null {
    // Бокс по ВИДИМОМУ размеру (scaleVal), не раздутый DRAG_SCALE; из накрывших побеждает ВЕРХНЯЯ
    // по z. Футпринт берём из самого элемента — карта/фишка/фигура одинаково.
    const els = this.draggables();
    const boxes: HitBox[] = els.map((el) => {
      const s = el.body.scaleVal;
      const f = el.footprint;
      return { px: el.body.px, py: el.body.py, hw: f.hw * s, hh: f.hh * s, z: el.root.zIndex };
    });
    const i = topmostAt(boxes, cx, cy);
    return i >= 0 ? els[i]! : null;
  }

  protected hitButton(cx: number, cy: number): Button | null {
    for (const b of this.buttons) if (b.hitTest(cx, cy)) return b;
    return null;
  }

  /** Кнопка HUD под ЭКРАННОЙ точкой. Роутер спрашивает это первым — HUD нарисован поверх сцены. */
  protected hitChrome(sx: number, sy: number): Button | null {
    for (const b of this.chromeButtons) if (b.hitTest(sx, sy)) return b;
    return null;
  }

  // Кнопка HUD живёт в ЭКРАННЫХ координатах, а роутер ведёт нажатие в координатах КОНТЕНТА (общий
  // случай — кнопка на столе). Переводим точку обратно, чтобы «увёл палец с кнопки» работало
  // одинаково для обеих: инверсия screenToContent, ровно та же камера.
  protected contentToScreen(cx: number, cy: number): Pt {
    return { x: cx * this.viewport.zoom + this.viewport.x, y: cy * this.viewport.zoom + this.viewport.y + this.chromeInsetTop() };
  }

  // Ввод: стейт-машину ведёт InputRouter, движок лишь форвардит события и отдаёт домен в колбэки.
  private onDown = (e: { global: Pt; pointerId: number; button?: number }): void => {
    if (e.button === 2) return; // правая кнопка — целиком у contextmenu (меню), жестов не начинает
    this.viewport.stopFling(); // касание гасит инерцию
    this.input.down(e.pointerId, e.global.x, e.global.y);
  };
  private onMove = (e: { global: Pt; pointerId: number }): void => this.input.move(e.pointerId, e.global.x, e.global.y);
  private onUp = (e: { global: Pt; pointerId: number; button?: number }): void => {
    if (e.button === 2) return;
    this.input.up(e.pointerId, e.global.x, e.global.y);
  };

  /** ПКМ: preventDefault (иначе браузерное меню) + контекстное меню сцены в точке курсора. */
  private onCtxMenu = (e: MouseEvent): void => {
    e.preventDefault();
    const sp = { x: e.offsetX, y: e.offsetY };
    this.openContextMenu(this.screenToContent(sp.x, sp.y), sp);
  };

  // ——— контекстное меню (long-press по пустому месту / ПКМ): сцена включает opt-in ———

  /** Есть ли у сцены меню для точки (координаты КОНТЕНТА). false — long-press уходит в пан. */
  private coreHasContextAt(_cp: Pt): boolean {
    return false;
  }

  /** Открыть меню в точке. По умолчанию — никакого меню; сцена переопределяет. */
  private coreOpenContextMenu(_cp: Pt, _sp: Pt): void {}

  /** Тап по сцене (любая цель). База ведёт дабл-тап-зум; сцена может перехватить (закрыть меню). */
  private coreOnSceneTap(content: Pt, screen: Pt): void {
    this.camera.handleTap(content, screen);
  }

  // ——— швы домена: сцена переопределяет только то, что у неё своё ———

  /** Что схвачено в точке: сперва метка-драггер (за ручку тянут ЦЕЛЬ), иначе верхний элемент. */
  private corePickElement(cx: number, cy: number): SceneElement | null {
    const byMarker = this.markerRig.pickAt(cx, cy);
    if (byMarker !== undefined) return byMarker;
    return this.hitElement(cx, cy);
  }

  /** Можно ли тащить. По умолчанию — собственная драгабельность элемента. */
  private coreCanDrag(el: SceneElement): boolean {
    return el.draggable;
  }

  /** Два драг-интента элемента (InputHandlers.dragOnTap/dragOnHold): есть ли быстрый драг (тащим
   *  сразу) и/или драг-по-удержанию. По умолчанию только быстрый — обычный тап-драг, как и раньше.
   *  Сцена переопределяет, чтобы развести жесты (тап — одно, hold — другое). Режим сработавшего
   *  жеста доезжает до beginDrag через `grabMode`. */
  private coreDragOnTap(_el: SceneElement): boolean {
    return true;
  }
  private coreDragOnHold(_el: SceneElement): boolean {
    return false;
  }

  /** Начать драг. По умолчанию — обычный SingleDrag за одну карту. Переопределяют, чтобы тащить
   *  пачку/набор; вернуть true — «драг заведён сам», false — база заводит SingleDrag. */
  private coreBeginDrag(el: SceneElement, cp: Pt, _sp: Pt): boolean {
    // Цель захвачена за метку → груз делает её host (это может быть и пачка). Иначе — одна карта.
    const payload = this.markerRig.takePayload(cp);
    this.drag = payload ?? new SingleDrag(el, this.dragCtx, cp);
    this.drag.move(cp);
    return true;
  }

  /** Перехватить движение до того, как груз поедет (вернуть true — движение проглочено). Опц. */
  private coreBeforeDragMove(_el: SceneElement, _cp: Pt): boolean {
    return false;
  }

  /** Поправить точку ведения (напр. запереть фигуру в рамке зоны). По умолчанию — как есть. */
  private coreDragPoint(cp: Pt): Pt {
    return cp;
  }

  /** Груз проехал в точку p. База ведёт за пальцем захваченную метку; наследник добавляет своё. */
  private coreOnDragMoved(p: Pt): void {
    this.markerRig.followTo(p);
  }

  /** Перехватить дроп до разбора груза (вернуть true — дроп проглочен). Опц. */
  private coreBeforeDrop(_el: SceneElement, _cp: Pt): boolean {
    return false;
  }

  /** Что значит дроп. По умолчанию: зона под пальцем реагирует на СПОСОБНОСТИ груза (flip/burn/
   *  peek), не на его тип; не поглощён — возвращается домой пружиной. */
  private coreResolveDrop(_el: SceneElement, cp: Pt): void {
    const drag = this.drag;
    if (!drag) return;
    const zone = this.zones.find((z) => z.zone.contains(cp.x, cp.y));
    // Точку дропа даём ПАЛЬЦА, а не тела: тело едет пружиной и в момент отпускания отстаёт от
    // пальца на пол-клетки. Зона под пальцем уже выбрана им же — разрешать внутри неё по другой
    // координате значит спорить с самим собой (дроп в занятый слот доски промахивался в зазор).
    zone?.onDrop(drag, cp);
    if (!drag.consumed) drag.release();
  }

  /** Драг прерван (второй палец/уход указателя) — свернуть свои подсказки. Опц. */
  private coreOnDragCancel(): void {}

  /** Конец любого драга. База возвращает метку на место; наследник снимает своё. */
  private coreAfterDragEnd(): void {
    this.markerRig.endFollow();
  }

  /** Попытались утащить недрагабельный элемент (палец поехал). По умолчанию — «стоп»-кивок. */
  private coreOnElementBlocked(el: SceneElement): void {
    el.blockNudge();
  }

  /** ТАП по недрагабельному элементу (без сдвига). По умолчанию — ничего: тык не отказ. */
  private coreOnElementTapped(_el: SceneElement): void {}

  /**
   * Перевернуть ПАЧКУ.
   *
   * Реализация общая — она нужна каждой сцене, где есть стопка, а не только песочнице. Раньше жила
   * методом PlaygroundEngine, и витрина каталога переворот пачки не умела вовсе.
   *
   * Что делать — решает РАСПИСАНИЕ (anim/flipSchedule.ts, чистая функция под юнит-тестом): кто
   * когда переворачивается и чей дом занимает. Здесь только исполнение. Поэтому «разом» и «волной»
   * это не две ветки в движке, а два пресета — и третий добавляется без правки этого метода.
   */
  protected flipGroup(els: readonly SceneElement[]): void {
    const homes = els.map((el) => this.homeOf(el));
    if (homes.some((h) => !h)) return; // чужая пачка — молча не трогаем, лучше ничего, чем половина
    // Фил берётся у САМОЙ пачки, если он у неё свой, и только иначе — у сцены. Иначе «разные
    // стопки анимируются по-разному» было бы невозможно: на столе колода и сброс живут рядом, а
    // ведут себя не одинаково (колода складывается сухо, сброс — вальяжно).
    const own = (els[0] as unknown as { animPreset?: AnimPreset }).animPreset;
    const plan = flipSchedule(els.map((el) => el.id), own ?? this.preset);

    plan.forEach((stepPlan, i) => {
      const el = els[i]!;
      const dest = homes[stepPlan.toIndex]!;
      // Дом переезжает СРАЗУ, а флип может быть отложен: карта успевает доехать к новому месту,
      // пока до неё дойдёт волна. Если бы дом ехал вместе с флипом, каскад выглядел бы как
      // «сначала все перевернулись, потом все поехали» — две анимации вместо одной.
      this.setHome(el, dest.home, dest.depth);
      this.flipQueue.push(el, stepPlan.delay);
    });
    this.wake();
  }

  /** Переставить дом элемента. Знает только конкретная сцена — у неё свой реестр. */
  private coreSetHome(_el: SceneElement, _home: { x: number; y: number }, _depth: number): void {}

  /**
   * Фил анимаций сцены (anim/presets.ts). Держит СЦЕНА, потому что расписание переворота пачки —
   * её дело, а не отдельной карты. Картам он раздаётся при постановке (см. KitScene.add).
   */
  protected preset: AnimPreset = BASE_PRESET;

  /**
   * Отложенные действия сцены. Нужны сценариям: «съесть» — это переместить одного и уничтожить
   * другого ПОСЛЕ прихода, и без общего таймера каждый сценарий заводил бы свой setTimeout — то
   * есть время, не связанное с кадром, которое переживёт пересборку сцены и выстрелит в пустоту.
   */
  private readonly sceneTimers = new SceneTimers(() => this.wake());

  /** Выполнить через `delay` секунд ЖИЗНИ СЦЕНЫ (не настенного времени). */
  after(delay: number, fn: () => void): void {
    this.sceneTimers.after(delay, fn);
  }

  /**
   * Сколько играет анимация элемента — по стилю ЕГО пресета.
   *
   * Одна дверь на все виды, а не четыре похожих метода: длительность считается по одной формуле
   * (расписание стиля × множитель × скорость пресета), и расходиться им незачем.
   */
  animDuration(id: string, kind: AnimKind = "move"): number {
    const el = this.byId.get(id);
    const p = (el as unknown as { animPreset?: AnimPreset } | undefined)?.animPreset ?? this.preset;
    return animDurationOf(p, kind);
  }

  /** Сколько летит элемент при команде move. Оставлено как имя того, чем пользуются сценарии. */
  moveDuration(id: string): number {
    return this.animDuration(id, "move");
  }

  /** Отложенные перевороты каскада (волна доходит с задержкой). Шагается в кадре. */
  private readonly flipQueue = new DelayQueue<SceneElement>((el) => requestFlipOf(el));

  // Связка ввода — sceneInput.ts: явный SceneInputHost вместо разбросанных приватных вызовов.
  private inputHandlers(): InputHandlers<SceneElement, Button> {
    return buildSceneInput<SceneElement>({
      screenToContent: (sx, sy) => this.screenToContent(sx, sy),
      contentToScreen: (cx, cy) => this.contentToScreen(cx, cy),
      camera: () => this.camera,
      wake: () => this.wake(),
      pickElement: (cx, cy) => this.pickElement(cx, cy),
      canDrag: (el) => this.canDrag(el),
      dragOnTap: (el) => this.dragOnTap(el),
      dragOnHold: (el) => this.dragOnHold(el),
      hitButton: (cx, cy) => this.hitButton(cx, cy),
      hitChrome: (sx, sy) => this.hitChrome(sx, sy),
      isChromeButton: (b) => this.chromeButtons.includes(b),
      hoverTo: (b) => {
        // Трогаем ТОЛЬКО две сменившиеся кнопки — цикл-по-всем ронял FPS на ПК (issue #48).
        if (b === this.hoveredBtn) return;
        if (this.hoveredBtn) {
          this.hoveredBtn.hover(false);
          this.hoverRerenders++;
        }
        if (b) {
          b.hover(true);
          this.hoverRerenders++;
        }
        this.hoveredBtn = b;
        this.wake();
      },
      setGrabMode: (mode) => {
        this.grabMode = mode;
      },
      setDragScreen: (sp) => {
        this.dragScreen = { x: sp.x, y: sp.y };
      },
      peekMarkGrabbed: (id) => void this.peeks.markGrabbed(id),
      peekResolveGrabbed: () => this.peeks.resolveGrabbed(),
      beginDrag: (el, cp, sp) => void this.beginDrag(el, cp, sp),
      beforeDragMove: (el, cp) => this.beforeDragMove(el, cp),
      dragPoint: (cp) => this.dragPoint(cp),
      moveDrag: (p) => this.drag?.move(p),
      onDragMoved: (p) => this.onDragMoved(p),
      refreshZoneHot: (p) => this.refreshZoneHot(p),
      beforeDrop: (el, cp) => this.beforeDrop(el, cp),
      hasDrag: () => this.drag !== null,
      resolveDrop: (el, cp) => this.resolveDrop(el, cp),
      clearDrag: () => {
        this.drag = null;
      },
      releaseDrag: () => {
        this.drag?.release();
        this.drag = null;
      },
      afterDragEnd: () => this.afterDragEnd(),
      coolZones: () => {
        for (const z of this.zones) z.zone.setHot(false);
      },
      onDragCancel: () => this.onDragCancel(),
      onElementBlocked: (el) => this.onElementBlocked(el),
      onElementTapped: (el) => this.onElementTapped(el),
      onSceneTap: (content, screen) => this.onSceneTap(content, screen),
      hasContextAt: (cp) => this.hasContextAt(cp),
      openContextMenu: (cp, sp) => this.openContextMenu(cp, sp),
    });
  }

  // ——————————————————————————————————————————————————————————————————————
  // Возврат домой
  // ——————————————————————————————————————————————————————————————————————

  /** Вернуть ЛЮБОЙ элемент домой — той же пружиной, что и обычный релиз. */
  protected releaseElement(el: SceneElement): void {
    const h = this.homeOf(el);
    if (!h) return;
    el.setState(el.pose); // возврат в СВОЮ позу покоя (стол / поднят / держат)
    this.placeCard(el);
    el.body.setTarget({ x: h.home.x, y: h.home.y, rot: 0 });
    this.landing.book(el, h.depth); // глубина вернётся ПО ПРИЛЁТУ (sceneLanding), не сейчас
  }

  /** Кто летит домой и на какую глубину сядет — очередь посадки (разбирается в кадре). */
  private readonly landing = new LandingQueue();

  // ——————————————————————————————————————————————————————————————————————
  // Цикл кадра
  // ——————————————————————————————————————————————————————————————————————

  protected frame(dt: number): boolean {
    this.input.tick(dt); // «держи-чтобы-тащить»: копит heldFor, сама решает, когда повысить press → drag
    this.camera.edgeScroll(dt);
    const camMoving = this.camera.stepTween(dt); // наведение камеры на зону: не спим, пока не доедет
    if (this.viewport.flinging) {
      this.syncVp();
      this.viewport.stepFling(dt);
      this.applyView();
      this.emitView();
    }
    let moving = this.input.gesture !== "none" || this.viewport.flinging || camMoving;
    if (this.flipQueue.step(dt)) moving = true;
    if (this.sceneTimers.step(dt)) moving = true;
    for (const el of this.everyElement()) {
      el.step(dt);
      if (!el.resting) moving = true;
    }
    // ПОСЛЕ шага элементов, а не до него. Пока посадка разбиралась первой, она читала состояние
    // ПРОШЛОГО кадра: в тот кадр, когда карта долетала, цикл видел «все успокоились» и засыпал —
    // следующего кадра не было, и глубина так и оставалась драговой (1e6). Карта возвращалась
    // домой, но продолжала лежать поверх всей стопки.
    this.landing.step();
    this.reapDead();
    for (const b of this.buttons) {
      b.step(dt);
      if (!b.resting) moving = true;
    }
    for (const b of this.chromeButtons) {
      b.step(dt);
      if (!b.resting) moving = true;
    }
    if (this.peeks.step(dt)) moving = true; // живые показы держат тикер: отсчёт не должен замирать
    if (this.stepScene(dt)) moving = true;
    // armed: перечитываем каждый кадр из this.drag, а не разбросанными вызовами по местам, где драг
    // стартует/кончается — так короче и не пропустит ни один выход (early return и т.п.).
    for (const z of this.zones) {
      const eligible = this.drag !== null && z.accepts(this.drag);
      z.zone.setArmed(eligible, eligible && z.textFor ? z.textFor(this.drag!).armed : undefined);
      z.zone.step(dt, this.reduceMotion || this.lowFx); // покачивание armed/hot-текста
    }
    this.render();
    return moving;
  }

  /** Свои анимации сцены за кадр; вернуть «что-то ещё движется». Опц. */
  private coreStepScene(_dt: number): boolean {
    return false;
  }

  /** Убрать догоревшие/лишние элементы из своих списков. Опц. */
  private coreReapDead(): void {}

  protected render(): void {
    const els = this.everyElement();
    for (const el of els) el.sync();
    for (const b of this.buttons) b.sync();
    for (const b of this.chromeButtons) b.sync();
    this.renderScene();

    // Слитые тени по уровням: силуэты элементов уровня → одна маска+заливка (без потемнения
    // наложений). Лёгкий профиль (issue #8) выключает shadow-пасс целиком — пустой список гасит всё.
    const shadows = this.lowFx ? [] : els.filter((c) => c.shadowRect).map((c) => ({ level: levelOf(c.state), rect: c.shadowRect! }));
    this.scene.paintShadows(shadows, this.contentW, this.contentH);
  }

  /** Досинхронизировать визуалы перед теневым пассом: база — метки, наследник — своё. */
  protected renderScene(): void {
    for (const m of this.markerRig.list()) m.update();
  }

  // ——— флаги доступности: одинаково во всех сценах ———

  /** Пробросить reduce-motion всему, что дышит: дыхание — общая ось карты и фишки. */
  protected onReduceMotionChange(v: boolean): void {
    for (const el of this.everyElement()) if (el instanceof Card || el instanceof Piece) el.reduceMotion = v;
  }

  /** Пробросить «без вспышек» (issue #9) — гасит дрожь «сжечь» и у Card, и у Piece. */
  protected onFlashChange(v: boolean): void {
    for (const el of this.everyElement()) if (el instanceof Card || el instanceof Piece) el.flashOff = v;
  }

  /** Профиль качества (issue #8): reduced замораживает дыхание всего живого и гасит shadow-пасс. */
  protected onProfileChange(p: "full" | "reduced"): void {
    this.lowFx = p === "reduced";
    for (const el of this.everyElement()) if (el instanceof Card || el instanceof Piece) el.lowFx = this.lowFx;
    this.wake();
  }

  /** Сбросить общее состояние ввода/драга/зон (рестарт контента и снос). Сцена зовёт из своего.
   *  HUD тут НЕ трогаем: топбар переживает рестарт содержимого стола — он часть экрана, не сцены. */
  protected resetSceneState(): void {
    this.drag = null;
    this.buttons = [];
    this.zones = [];
    this.hoveredBtn = null;
    this.byId.clear();
    this.peeks.clear();
    this.input.reset();
  }

  protected onTeardown(app: Application): void {
    this.d.onTeardown?.(app);
    app.canvas.removeEventListener("wheel", this.onWheel);
    app.canvas.removeEventListener("contextmenu", this.onCtxMenu);
    this.chromeButtons = []; // сам HUD сносится вместе с app; список — чтобы не держать мёртвые узлы
    this.resetSceneState();
  }
}

/** Перевернуть, если элемент это умеет. Способность, а не тип: фишка не Flippable — и не перевернётся. */
function requestFlipOf(el: SceneElement): void {
  const f = el as unknown as { requestFlip?: () => boolean };
  f.requestFlip?.();
}
