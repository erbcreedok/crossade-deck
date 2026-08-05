// ВИД СЦЕНЫ — модуль движка: геометрия камеры (экран↔контент с учётом HUD-инсета), сборка
// камерного рига, ресайз и DOM-проводка ввода (pointer/wheel/ПКМ). Функции над движком: данные
// живут в SceneEngine, поведение — здесь (правило пересборки: ядро-фасад < 300 строк).

import { Rectangle, type Application } from "pixi.js";
import { topmostAt, type HitBox } from "./cardHit";
import type { Button } from "../ui/Button";
import { SceneCamera } from "./sceneCamera";
import type { Pt } from "./sceneContract";
import type { SceneElement, SceneEngine } from "./sceneEngine";
import type { ViewState } from "./viewport";

// Камера работает не во всём канвасе, а в ПОДПРЯМОУГОЛЬНИКЕ под HUD: экран для неё ниже на
// chromeInsetTop, а контент рисуется со сдвигом на ту же величину. Без этого верх стола навсегда
// заезжал бы под непрозрачную панель и доскроллить до него было бы нечем (кламп упирается в 0).

/** Синхронизировать границы камеры (экран/контент меняются при сборке и ресайзе). */
export function syncVp(e: SceneEngine): void {
  e.viewport.setScreen(e.width, e.height - e.seams.chromeInsetTop());
  e.viewport.setContent(e.contentW, e.contentH);
}

export function screenToContent(e: SceneEngine, sx: number, sy: number): Pt {
  return e.viewport.screenToContent(sx, sy - e.seams.chromeInsetTop());
}

// Кнопка HUD живёт в ЭКРАННЫХ координатах, а роутер ведёт нажатие в координатах КОНТЕНТА.
// Переводим точку обратно — инверсия screenToContent, ровно та же камера.
export function contentToScreen(e: SceneEngine, cx: number, cy: number): Pt {
  return { x: cx * e.viewport.zoom + e.viewport.x, y: cy * e.viewport.zoom + e.viewport.y + e.seams.chromeInsetTop() };
}

export function clampView(e: SceneEngine): void {
  syncVp(e);
  e.viewport.clamp();
}

export function applyView(e: SceneEngine): void {
  e.content.position.set(e.viewport.x, e.viewport.y + e.seams.chromeInsetTop());
  e.content.scale.set(e.viewport.zoom);
}

export function viewStateOf(e: SceneEngine): ViewState {
  syncVp(e);
  return e.viewport.state();
}

/** Хостовые сеттеры вида (зум/скролл): одна дисциплина «синк → операция → apply/wake/emit». */
export function withView(e: SceneEngine, op: () => void): void {
  syncVp(e);
  op();
  applyView(e);
  e.wake();
  e.emitView();
}

/** Окно изменилось (issue #49): хит-зона, хром, своя раскладка сцены, кламп, скроллбары. */
export function resizeScene(e: SceneEngine, w: number, h: number): void {
  if (!e.app) return;
  e.app.stage.hitArea = new Rectangle(0, 0, w, h);
  e.seams.layoutChrome(w, h);
  e.seams.onSceneResize(w, h);
  clampView(e);
  applyView(e);
  e.emitView();
}

/** Камерный риг поверх Viewport: колесо/фокус/пан/пинч/edge-scroll — sceneCamera.ts. */
export function makeCamera(e: SceneEngine): SceneCamera {
  return new SceneCamera({
    viewport: () => e.viewport,
    size: () => ({ w: e.width, h: e.height }),
    insetTop: () => e.seams.chromeInsetTop(),
    contentSize: () => ({ w: e.contentW, h: e.contentH }),
    syncVp: () => syncVp(e),
    clampView: () => clampView(e),
    applyView: () => applyView(e),
    emitView: () => e.emitView(),
    wake: () => e.wake(),
    screenToContent: (sx, sy) => screenToContent(e, sx, sy),
    canvasRect: () => e.app!.canvas.getBoundingClientRect(),
    spreadOnElement: (cp, rx, ry, src) => e.seams.spreadOnElement(cp, rx, ry, src),
    onSpreadBegin: () => e.seams.onSpreadBegin(),
    focusTargetAt: (cp) => e.seams.focusTargetAt(cp),
    inDocument: () => e.inDocument,
    dragInfo: () => ({ payload: e.drag, screen: e.dragScreen, dragging: e.input.gesture === "drag" }),
    refreshZoneHot: (pp) => e.refreshZoneHot(pp),
  });
}

/** DOM-проводка ввода: pointer-события в роутер, колесо — в камеру, ПКМ — контекстное меню.
 *  Возвращает disposer (teardown снимает слушатели канваса). */
export function wireStage(e: SceneEngine, app: Application): () => void {
  const onDown = (ev: { global: Pt; pointerId: number; button?: number }): void => {
    if (ev.button === 2) return; // правая кнопка — целиком у contextmenu, жестов не начинает
    e.viewport.stopFling(); // касание гасит инерцию
    e.input.down(ev.pointerId, ev.global.x, ev.global.y);
  };
  const onMove = (ev: { global: Pt; pointerId: number }): void => e.input.move(ev.pointerId, ev.global.x, ev.global.y);
  const onUp = (ev: { global: Pt; pointerId: number; button?: number }): void => {
    if (ev.button === 2) return;
    e.input.up(ev.pointerId, ev.global.x, ev.global.y);
  };
  const onWheel = (ev: WheelEvent): void => e.camera.handleWheel(ev);
  // ПКМ: preventDefault (иначе браузерное меню) + контекстное меню сцены в точке курсора.
  const onCtx = (ev: MouseEvent): void => {
    ev.preventDefault();
    e.seams.openContextMenu(screenToContent(e, ev.offsetX, ev.offsetY), { x: ev.offsetX, y: ev.offsetY });
  };
  app.stage.eventMode = "static";
  app.stage.hitArea = new Rectangle(0, 0, e.width, e.height);
  app.stage.on("pointerdown", onDown);
  app.stage.on("pointermove", onMove);
  app.stage.on("pointerup", onUp);
  app.stage.on("pointerupoutside", onUp);
  app.canvas.addEventListener("wheel", onWheel, { passive: false });
  app.canvas.addEventListener("contextmenu", onCtx);
  return () => {
    app.canvas.removeEventListener("wheel", onWheel);
    app.canvas.removeEventListener("contextmenu", onCtx);
  };
}

// ——— хит-тесты ———

/** Верхний элемент под точкой: бокс по ВИДИМОМУ размеру (scaleVal), из накрывших — верхняя по z. */
export function hitElementAt(e: SceneEngine, cx: number, cy: number): SceneElement | null {
  const els = e.seams.draggables();
  const boxes: HitBox[] = els.map((el) => {
    const s = el.body.scaleVal;
    const f = el.footprint;
    return { px: el.body.px, py: el.body.py, hw: f.hw * s, hh: f.hh * s, z: el.root.zIndex };
  });
  const i = topmostAt(boxes, cx, cy);
  return i >= 0 ? els[i]! : null;
}

export function hitButtonAt(e: SceneEngine, cx: number, cy: number): Button | null {
  for (const b of e.buttons) if (b.hitTest(cx, cy)) return b;
  return null;
}

/** Кнопка HUD под ЭКРАННОЙ точкой — роутер спрашивает первым: HUD нарисован поверх сцены. */
export function hitChromeAt(e: SceneEngine, sx: number, sy: number): Button | null {
  for (const b of e.chromeButtons) if (b.hitTest(sx, sy)) return b;
  return null;
}
