// КОНТРАКТ СЦЕНЫ ↔ ДВИЖОК — только типы (переносимо): SceneDelegate — швы, которые сцена
// реализует (обязательны лишь реестры и сборка; нереализованный шов = поведение ядра), SceneApi —
// двери движка, через которые сцена и её коллабораторы действуют. Единственная точка правды о
// том, ЧТО умеет сцена и ЧТО ей доступно.

import type { Application, Container } from "pixi.js";
import type { Button } from "../ui/Button";
import type { DragContext, DragPayload } from "./drag";
import type { TableElement } from "./element";
import type { DragMode } from "./inputRouter";
import type { Grabber, SceneElement } from "./sceneEngine";
import type { SpreadSource } from "./sceneCamera";
import type { Marker, MarkerConfig, MarkerHost, ShowPolicy } from "./marker";
import type { SceneLayers } from "./sceneLayers";
import type { DropZone } from "../ui/DropZone";
import type { AnimPreset } from "../anim/presets";
import type { Viewport } from "./viewport";

export interface Pt {
  x: number;
  y: number;
}

/** Зарегистрированная дроп-зона: сама зона + что она делает и что принимает. */
export interface ZoneReg {
  zone: DropZone;
  onDrop: (p: DragPayload, at: Pt) => void;
  accepts: (p: DragPayload) => boolean;
  textFor?: (p: DragPayload) => { armed: string; hot: string };
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
  /** Карта ЭКРАННОЙ руки под экранной точкой (HUD, вне камеры) — драгабельная фигура поверх стола. */
  pickHandCard?(sx: number, sy: number): SceneElement | null;
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
  /** Кнопки В КООРДИНАТАХ КОНТЕНТА (на столе), в отличие от хрома (экран). */
  setButtons(btns: readonly Button[]): void;
  /** ЖИВОЙ массив кнопок стола (каталог докидывает их по ходу сборки). */
  buttonsRef(): Button[];
  /** Слои сцены (surface/verb/clearCards) — каталог кладёт декор и глаголы сам. */
  layers(): SceneLayers;
  contentSize(): { w: number; h: number };
  appReady(): boolean;
  app(): Application | null;
  preset(): AnimPreset;
  setPreset(p: AnimPreset): void;
  reduceMotion(): boolean;
  lowFx(): boolean;
  flashOff(): boolean;
  /** Принудительный синк визуалов сейчас (витрина после сборки). */
  render(): void;
  animDuration(id: string, kind?: "move" | "flip" | "destroy" | "appear"): number;
  needsPeek(el: TableElement): boolean;
  flipGroup(els: readonly SceneElement[]): void;
  registerZone(
    zone: DropZone,
    onDrop: (p: DragPayload, at: Pt) => void,
    accepts: (p: DragPayload) => boolean,
    textFor?: (p: DragPayload) => { armed: string; hot: string },
  ): void;
  mountMarkers(
    host: MarkerHost,
    lead: () => SceneElement | null,
    dragger: Omit<MarkerConfig, "show"> & { show?: ShowPolicy },
    anchorCfg: Omit<MarkerConfig, "show" | "follow" | "hit"> & { show?: ShowPolicy },
  ): { dragger: Marker; anchor: Marker };
  clearMarkers(): void;
  markersList(): readonly Marker[];
  grabbersList(): readonly Grabber[];
  /** Сброс сценового состояния движка (пересборка витрины) и профиль качества. */
  resetSceneState(): void;
  setQualityProfile(p: "full" | "reduced"): void;
  /** Дефолтные ветки движка, которые делегат может звать из своих швов. */
  defaultBeginDrag(el: SceneElement, cp: Pt, sp: Pt): boolean;
  defaultSceneTap(content: Pt, screen: Pt): void;
  defaultPickElement(cx: number, cy: number): SceneElement | null;
  defaultElementTapped(el: SceneElement): void;
  defaultCanDrag(el: SceneElement): boolean;
}

