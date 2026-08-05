// ЯДРО СЦЕНЫ — ФАСАД (правило: < 300 строк). Данные стола живут здесь; ПОВЕДЕНИЕ — в модулях
// движка, функциями над этим объектом: швы делегата — sceneSeams (разрешаются один раз в attach),
// двери сцены — sceneApiBuild, камера/геометрия/DOM-проводка — sceneView (+ риг sceneCamera),
// цикл кадра/рендер/возврат домой — sceneFrame, связка роутера — sceneInput, метки — sceneMarkers,
// показы — scenePeeks, таймеры/каскады — sceneTimers, посадка — sceneLanding.
//
// Сцена НЕ наследует движок: она реализует SceneDelegate (sceneContract) и действует через
// SceneApi. Поля ниже публичны ДЛЯ МОДУЛЕЙ ДВИЖКА (package-private в TS нет) — снаружи папки
// engine их не трогает никто: сценам хватает api.
//
// Почему общий слой (разбор: issue #78): пасьянс, написанный до него, оброс параллельной камерой
// и разбором pointer-событий — общий слой закрывает саму возможность это повторить.

import { Container, type Application } from "pixi.js";
import { CanvasApp } from "./canvasApp";
import { SceneLayers, levelOf } from "./sceneLayers";
import { Viewport, type ViewState } from "./viewport";
import { InputRouter, type DragMode } from "./inputRouter";
import { Marker, type MarkerConfig, type MarkerHost, type ShowPolicy } from "./marker";
import { SceneMarkers, type Grabber as MarkerGrabber } from "./sceneMarkers";
import type { DragContext, DragPayload } from "./drag";
import { Button } from "../ui/Button";
import type { Pose } from "../ui/Card";
import { TableItem } from "../ui/tableItem";
import type { Draggable, TableElement } from "./element";
import { animDurationOf, type AnimKind } from "../anim/durations";
import { BASE_PRESET, type AnimPreset } from "../anim/presets";
import { LandingQueue } from "./sceneLanding";
import type { SceneCamera } from "./sceneCamera";
import type { Pt, SceneApi, SceneDelegate, ZoneReg } from "./sceneContract";
import { ScenePeeks } from "./scenePeeks";
import { DelayQueue, SceneTimers } from "./sceneTimers";
import { makeSeams, type SceneSeams } from "./sceneSeams";
import { buildSceneApi } from "./sceneApiBuild";
import { makeEngineInput } from "./sceneInput";
import { applyView, clampView, hitElementAt, makeCamera, resizeScene, screenToContent, syncVp, viewStateOf, wireStage, withView } from "./sceneView";
import { flipGroup, refreshZoneHot, releaseElement, renderAll, requestFlipOf, stepFrame } from "./sceneFrame";

export type { AnimKind } from "../anim/durations";
export type { ViewState };
export type { SpreadSource } from "./sceneCamera";
export type { ZoneReg } from "./sceneContract";
export { ZOOM_SENS, WHEEL_GESTURE_GAP_MS } from "./sceneCamera";
/** Сколько секунд дропзона «подглядеть» держит карту раскрытой до авто-возврата. */
export { PEEK_DUR } from "./scenePeeks";

/** Элемент сцены: база TableElement + драгабельность + геометрия покоя (хит-тест и возврат). */
export type SceneElement = TableElement &
  Draggable & {
    readonly pose: Pose;
    readonly restScale: number;
    readonly footprint: { hw: number; hh: number };
  };

/** Всё, за что тянут ЧЕРЕЗ МЕТКУ (стопки, столбики, соло-цели) — единый список для хит-теста. */
export type Grabber = MarkerGrabber<SceneElement>;

/** Настройки камеры сцены. Умолчания — те, на которых откатана песочница: контрол и жесты
 *  обязаны совпадать во всех сценах, расходиться можно только осознанно. */
export interface CameraConfig {
  minZoom?: number;
  maxZoom?: number;
  margin?: number;
  align?: "left" | "center";
  alignY?: "center" | "top";
}

export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 2.6;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class SceneEngine extends CanvasApp {
  // ——— данные стола (пишут модули движка; сценам — только api) ———
  content!: Container;
  scene!: SceneLayers;
  /** Экранный слой поверх сцены (HUD): вне камеры — не панится и не зумится. */
  chrome!: Container;
  chromeButtons: Button[] = [];
  /** Размер полотна контента (не экрана) — от него клампы камеры и тени. */
  contentW = 1;
  contentH = 1;
  readonly viewport: Viewport;
  camera!: SceneCamera;
  buttons: Button[] = [];
  hoveredBtn: Button | null = null; // наведённая кнопка (ПК): гасим/зажигаем только её
  hoverRerenders = 0; // счётчик перерисовок от ховера — e2e-замер отсутствия лагов
  byId = new Map<string, SceneElement>(); // реестр по id — для API/меток/наборов
  drag: DragPayload | null = null; // текущий груз (одна карта или пачка)
  dragScreen = { x: 0, y: 0 }; // экранная позиция пальца — для авто-скролла у кромки
  zones: ZoneReg[] = [];
  /** Каким жестом (tap/hold) захватили текущий драг — beginDrag выбирает интент по нему. */
  grabMode: DragMode = "tap";
  /** Фил анимаций сцены: расписание переворота пачки — дело сцены, не отдельной карты. */
  preset: AnimPreset = BASE_PRESET;
  /** Лёгкий профиль качества (issue #8): гасит shadow-пасс и idle-дыхание. */
  lowFx = false;
  /** Сцена стоит ВНУТРИ документа (docs-страница) — колесо без цели уходит странице. */
  inDocument = false;

  // ——— коллабораторы ———
  readonly markerRig = new SceneMarkers<SceneElement>();
  readonly peeks = new ScenePeeks({ wake: () => this.wake(), releaseElement: (el) => releaseElement(this, el as SceneElement) });
  readonly sceneTimers = new SceneTimers(() => this.wake());
  /** Отложенные перевороты каскада (волна доходит с задержкой). Шагается в кадре. */
  readonly flipQueue = new DelayQueue<SceneElement>((el) => requestFlipOf(el));
  /** Кто летит домой и на какую глубину сядет — очередь посадки (разбирается в кадре). */
  readonly landing = new LandingQueue();
  readonly input = new InputRouter<SceneElement, Button>(makeEngineInput(this));
  readonly dragCtx: DragContext = {
    raise: (el) => {
      el.setState("drag");
      el.root.zIndex = 1e6;
      this.placeCard(el);
    },
    returnHome: (el) => releaseElement(this, el as SceneElement),
    flipGroup: (els) => flipGroup(this, els as readonly SceneElement[]),
    startPeek: (els) => this.peeks.start(els),
  };

  /** Швы делегата, разрешённые в attach (делегат или поведение ядра — sceneSeams). */
  seams!: SceneSeams;
  readonly api: SceneApi = buildSceneApi(this);
  private onView: ((v: ViewState) => void) | null = null;
  private unwire: (() => void) | null = null;

  constructor(cam: CameraConfig = {}) {
    super();
    this.viewport = new Viewport(cam.minZoom ?? MIN_ZOOM, cam.maxZoom ?? MAX_ZOOM, cam.margin ?? 24, cam.align ?? "left", 0, cam.alignY ?? "top");
  }

  /** Привязать делегата ДО mount (двухфазная инициализация: сцена и движок создаются взаимно). */
  attach(d: SceneDelegate): void {
    this.seams = makeSeams(this, d);
    this.camera = makeCamera(this);
  }

  // ——— жизненный цикл (переопределения CanvasApp) ———

  protected build(app: Application): void {
    this.content = new Container();
    this.chrome = new Container();
    // Порядок: контент под камерой, HUD поверх него и БЕЗ трансформа камеры.
    app.stage.addChild(this.content, this.chrome);
    this.scene = new SceneLayers(this.content);
    this.seams.buildScene(app);
    this.seams.layoutChrome(this.width, this.height);
    this.unwire = wireStage(this, app);
  }

  protected onBooted(): void {
    this.seams.onBooted();
    clampView(this);
    applyView(this);
    this.render();
    this.wake();
    this.emitView();
  }

  protected frame(dt: number): boolean {
    return stepFrame(this, dt);
  }

  protected onResize(w: number, h: number): void {
    resizeScene(this, w, h);
  }

  protected onTeardown(app: Application): void {
    this.seams.onTeardown(app);
    this.unwire?.();
    this.unwire = null;
    this.chromeButtons = []; // HUD сносится вместе с app; список — чтобы не держать мёртвые узлы
    this.resetSceneState();
  }

  /** Сброс общего состояния ввода/драга/зон (рестарт контента и снос). HUD не трогаем. */
  resetSceneState(): void {
    this.drag = null;
    this.buttons = [];
    this.zones = [];
    this.hoveredBtn = null;
    this.byId.clear();
    this.peeks.clear();
    this.input.reset();
  }

  // ——— малые общие операции (модули и api зовут их по имени) ———

  /** Положить визуал элемента в слой его текущего состояния. */
  placeCard(el: TableElement): void {
    this.scene.place(el.root, levelOf(el.state));
  }

  hitElement(cx: number, cy: number): SceneElement | null {
    return hitElementAt(this, cx, cy);
  }

  refreshZoneHot(p: Pt): void {
    refreshZoneHot(this, p);
  }

  /** Завести дроп-зону: рисуется в слои сцены, движок помнит реакцию и приём. */
  registerZone(zone: ZoneReg["zone"], onDrop: ZoneReg["onDrop"], accepts: ZoneReg["accepts"], textFor?: ZoneReg["textFor"]): void {
    this.zones.push({ zone, onDrop, accepts, textFor });
    this.scene.surface.addChild(zone.base);
    this.scene.verb.addChild(zone.verb);
    if (zone.armedText) this.scene.verb.addChild(zone.armedText);
  }

  /** Навесить пару меток (драггер + якорь) — sceneMarkers.ts. */
  mountMarkers(
    host: MarkerHost,
    lead: () => SceneElement | null,
    dragger: Omit<MarkerConfig, "show"> & { show?: ShowPolicy },
    anchorCfg: Omit<MarkerConfig, "show" | "follow" | "hit"> & { show?: ShowPolicy },
  ): { dragger: Marker; anchor: Marker } {
    return this.markerRig.mount({ verb: this.scene.verb, surface: this.scene.surface, dragLayer: this.scene.cards.drag }, host, lead, dragger, anchorCfg);
  }

  /** Выполнить через `delay` секунд ЖИЗНИ СЦЕНЫ (не настенного времени — переживает пересборку). */
  after(delay: number, fn: () => void): void {
    this.sceneTimers.after(delay, fn);
  }

  /** Сколько играет анимация элемента — формула одна на все виды (anim/durations). */
  animDuration(id: string, kind: AnimKind = "move"): number {
    const el = this.byId.get(id);
    const p = (el as unknown as { animPreset?: AnimPreset } | undefined)?.animPreset ?? this.preset;
    return animDurationOf(p, kind);
  }

  moveDuration = (id: string): number => this.animDuration(id, "move");

  /** Принудительный синк визуалов (витрина после сборки; кадр зовёт сам из stepFrame). */
  render(): void {
    renderAll(this);
  }

  // ——— хостовые сеттеры вида ———

  setInDocument(v: boolean): void {
    this.inDocument = v;
  }

  /** Подписка хоста на состояние вида (скроллбары/индикатор зума). */
  setOnView(cb: ((v: ViewState) => void) | null): void {
    this.onView = cb;
    this.emitView();
  }

  emitView(): void {
    this.onView?.(viewStateOf(this));
  }

  setZoom(z: number): void {
    withView(this, () => this.viewport.setZoom(z));
  }

  setScrollX(fraction: number): void {
    withView(this, () => this.viewport.setScrollX(fraction));
  }

  setScrollY(fraction: number): void {
    withView(this, () => this.viewport.setScrollY(fraction));
  }

  /** Тир качества (issue #8): reduced замораживает дыхание и гасит shadow-пасс. */
  setProfile(p: "full" | "reduced"): void {
    this.onProfileChange(p);
  }

  // ——— флаги доступности: одинаково во всех сценах ———

  protected onReduceMotionChange(v: boolean): void {
    for (const el of this.seams.everyElement()) if (el instanceof TableItem) el.reduceMotion = v;
  }

  protected onFlashChange(v: boolean): void {
    for (const el of this.seams.everyElement()) if (el instanceof TableItem) el.flashOff = v;
  }

  protected onProfileChange(p: "full" | "reduced"): void {
    this.lowFx = p === "reduced";
    for (const el of this.seams.everyElement()) if (el instanceof TableItem) el.lowFx = this.lowFx;
    this.wake();
  }

  /** Синхронизировать границы камеры и перевод координат — модуль sceneView (нужны хостам). */
  screenToContent(sx: number, sy: number): Pt {
    return screenToContent(this, sx, sy);
  }

  syncVp(): void {
    syncVp(this);
  }
}
