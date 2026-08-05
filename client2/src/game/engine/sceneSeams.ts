// ШВЫ СЦЕНЫ, РАЗРЕШЁННЫЕ ЗАРАНЕЕ — вместо диспетчеров «делегат или ядро» на каждый вызов:
// makeSeams(engine, delegate) один раз собирает объект, где каждый шов — либо метод делегата,
// либо поведение ядра (core-функции ниже). Движок и модули зовут e.seams.X без ветвлений.
// Core-функции экспортированы отдельно: api.defaultX обязан давать ПОВЕДЕНИЕ ЯДРА независимо
// от того, что переопределила сцена (сцена зовёт их из своих же швов).

import type { Application } from "pixi.js";
import { SingleDrag } from "./drag";
import { dropZoneUnder } from "./sceneFrame";
import type { TableElement } from "./element";
import type { Pt, SceneDelegate } from "./sceneContract";
import type { SceneElement, SceneEngine } from "./sceneEngine";
import type { SpreadSource } from "./sceneCamera";

/** Все швы в разрешённом виде (обязательные — от делегата, опциональные — делегат или ядро). */
export interface SceneSeams {
  buildScene(app: Application): void;
  draggables(): SceneElement[];
  everyElement(): TableElement[];
  homeOf(el: SceneElement): { home: Pt; depth: number } | null;
  layoutChrome(w: number, h: number): void;
  chromeInsetTop(): number;
  onBooted(): void;
  onSceneResize(w: number, h: number): void;
  focusTargetAt(cp: Pt): { x: number; y: number; w: number; h: number } | null;
  spreadOnElement(cp: Pt, rawX: number, rawY: number, source: SpreadSource): boolean;
  onSpreadBegin(): void;
  pickElement(cx: number, cy: number): SceneElement | null;
  canDrag(el: SceneElement): boolean;
  dragOnTap(el: SceneElement): boolean;
  dragOnHold(el: SceneElement): boolean;
  beginDrag(el: SceneElement, cp: Pt, sp: Pt): boolean;
  beforeDragMove(el: SceneElement, cp: Pt): boolean;
  dragPoint(cp: Pt): Pt;
  onDragMoved(p: Pt): void;
  beforeDrop(el: SceneElement, cp: Pt): boolean;
  resolveDrop(el: SceneElement, cp: Pt): void;
  onDragCancel(): void;
  afterDragEnd(): void;
  onElementBlocked(el: SceneElement): void;
  onElementTapped(el: SceneElement): void;
  onSceneTap(content: Pt, screen: Pt): void;
  hasContextAt(cp: Pt): boolean;
  openContextMenu(cp: Pt, sp: Pt): void;
  setHome(el: SceneElement, home: Pt, depth: number): void;
  stepScene(dt: number): boolean;
  reapDead(): void;
  onTeardown(app: Application): void;
}

// ——— поведение ядра (бывшие дефолты protected-виртуалов) ———

/** Что схвачено в точке: сперва метка-драггер (за ручку тянут ЦЕЛЬ), иначе верхний элемент. */
export function corePickElement(e: SceneEngine, cx: number, cy: number): SceneElement | null {
  const byMarker = e.markerRig.pickAt(cx, cy);
  if (byMarker !== undefined) return byMarker;
  return e.hitElement(cx, cy);
}

/** Можно ли тащить. По умолчанию — собственная драгабельность элемента. */
export function coreCanDrag(_e: SceneEngine, el: SceneElement): boolean {
  return el.draggable;
}

/** Начать драг. По умолчанию — SingleDrag за одну карту; цель за меткой даёт свой груз (пачку). */
export function coreBeginDrag(e: SceneEngine, el: SceneElement, cp: Pt, _sp: Pt): boolean {
  const payload = e.markerRig.takePayload(cp);
  e.drag = payload ?? new SingleDrag(el, e.dragCtx, cp);
  e.drag.move(cp);
  return true;
}

/** Что значит дроп. Попадание считает ФИГУРА: зона выбирается по нахлёсту тащимого предмета
 *  (палец решает ничьи и ловит отставшую пружиной фигуру — engine/dropPick). Не поглощён —
 *  возвращается домой. */
export function coreResolveDrop(e: SceneEngine, _el: SceneElement, cp: Pt): void {
  const drag = e.drag;
  if (!drag) return;
  dropZoneUnder(e, cp)?.onDrop(drag, cp);
  if (!drag.consumed) drag.release();
}

/** Тап по сцене. База ведёт дабл-тап-зум; сцена может перехватить (закрыть меню и т.п.). */
export function coreOnSceneTap(e: SceneEngine, content: Pt, screen: Pt): void {
  e.camera.handleTap(content, screen);
}

/** ТАП по недрагабельному элементу — по умолчанию ничего (тык не отказ). */
export function coreOnElementTapped(_e: SceneEngine, _el: SceneElement): void {}

/** Собрать объект швов один раз при attach. */
export function makeSeams(e: SceneEngine, d: SceneDelegate): SceneSeams {
  return {
    buildScene: (app) => d.buildScene(app),
    draggables: () => d.draggables(),
    everyElement: () => d.everyElement(),
    homeOf: (el) => d.homeOf(el),
    layoutChrome: d.layoutChrome ? (w, h) => d.layoutChrome!(w, h) : () => {},
    chromeInsetTop: d.chromeInsetTop ? () => d.chromeInsetTop!() : () => 0,
    onBooted: () => d.onBooted?.(),
    onSceneResize: d.onSceneResize ? (w, h) => d.onSceneResize!(w, h) : () => {},
    focusTargetAt: d.focusTargetAt ? (cp) => d.focusTargetAt!(cp) : () => null,
    spreadOnElement: d.spreadOnElement ? (cp, rx, ry, src) => d.spreadOnElement!(cp, rx, ry, src) : () => false,
    onSpreadBegin: d.onSpreadBegin ? () => d.onSpreadBegin!() : () => {},
    pickElement: d.pickElement ? (cx, cy) => d.pickElement!(cx, cy) : (cx, cy) => corePickElement(e, cx, cy),
    canDrag: d.canDrag ? (el) => d.canDrag!(el) : (el) => coreCanDrag(e, el),
    dragOnTap: d.dragOnTap ? (el) => d.dragOnTap!(el) : () => true,
    dragOnHold: d.dragOnHold ? (el) => d.dragOnHold!(el) : () => false,
    beginDrag: d.beginDrag ? (el, cp, sp) => d.beginDrag!(el, cp, sp) : (el, cp, sp) => coreBeginDrag(e, el, cp, sp),
    beforeDragMove: d.beforeDragMove ? (el, cp) => d.beforeDragMove!(el, cp) : () => false,
    dragPoint: d.dragPoint ? (cp) => d.dragPoint!(cp) : (cp) => cp,
    // База ведёт за пальцем захваченную метку; сцена, переопределив, добавляет своё.
    onDragMoved: d.onDragMoved ? (p) => d.onDragMoved!(p) : (p) => e.markerRig.followTo(p),
    beforeDrop: d.beforeDrop ? (el, cp) => d.beforeDrop!(el, cp) : () => false,
    resolveDrop: d.resolveDrop ? (el, cp) => d.resolveDrop!(el, cp) : (el, cp) => coreResolveDrop(e, el, cp),
    onDragCancel: d.onDragCancel ? () => d.onDragCancel!() : () => {},
    afterDragEnd: d.afterDragEnd ? () => d.afterDragEnd!() : () => e.markerRig.endFollow(),
    // Попытка утащить недрагабельное — «стоп»-кивок.
    onElementBlocked: d.onElementBlocked ? (el) => d.onElementBlocked!(el) : (el) => el.blockNudge(),
    onElementTapped: d.onElementTapped ? (el) => d.onElementTapped!(el) : (el) => coreOnElementTapped(e, el),
    onSceneTap: d.onSceneTap ? (content, screen) => d.onSceneTap!(content, screen) : (content, screen) => coreOnSceneTap(e, content, screen),
    hasContextAt: d.hasContextAt ? (cp) => d.hasContextAt!(cp) : () => false,
    openContextMenu: d.openContextMenu ? (cp, sp) => d.openContextMenu!(cp, sp) : () => {},
    setHome: d.setHome ? (el, home, depth) => d.setHome!(el, home, depth) : () => {},
    stepScene: d.stepScene ? (dt) => d.stepScene!(dt) : () => false,
    reapDead: d.reapDead ? () => d.reapDead!() : () => {},
    onTeardown: (app) => d.onTeardown?.(app),
  };
}
