// СВЯЗКА ВВОДА — модуль SceneEngine: маппинг событий InputRouter на швы сцены и камеру.
// Стейт-машина жестов — в inputRouter.ts, домен — в швах делегата; здесь только провода.
// Хост (SceneInputHost) — явный список того, что нужно вводу от движка: читается как контракт.

import type { Button } from "../ui/Button";
import type { InputHandlers } from "./inputRouter";
import type { DragMode } from "./inputRouter";
import type { SceneCamera } from "./sceneCamera";
import type { Pt } from "./sceneContract";

export interface SceneInputHost<El extends { id: string }> {
  screenToContent(sx: number, sy: number): Pt;
  contentToScreen(cx: number, cy: number): Pt;
  camera(): SceneCamera;
  wake(): void;
  // элементы и их драгабельность (диспетчеры швов делегата)
  pickElement(cx: number, cy: number): El | null;
  canDrag(el: El): boolean;
  dragOnTap(el: El): boolean;
  dragOnHold(el: El): boolean;
  // кнопки: стола (контент), хрома (экран)
  hitButton(cx: number, cy: number): Button | null;
  hitChrome(sx: number, sy: number): Button | null;
  isChromeButton(b: Button): boolean;
  /** Сменить наведённую кнопку (трогаются ТОЛЬКО две сменившиеся — issue #48). */
  hoverTo(b: Button | null): void;
  // жизненный цикл драга
  setGrabMode(mode: DragMode): void;
  setDragScreen(sp: Pt): void;
  peekMarkGrabbed(id: string): void;
  peekResolveGrabbed(): void;
  beginDrag(el: El, cp: Pt, sp: Pt): void;
  beforeDragMove(el: El, cp: Pt): boolean;
  dragPoint(cp: Pt): Pt;
  moveDrag(p: Pt): void;
  onDragMoved(p: Pt): void;
  refreshZoneHot(p: Pt): void;
  beforeDrop(el: El, cp: Pt): boolean;
  hasDrag(): boolean;
  resolveDrop(el: El, cp: Pt): void;
  clearDrag(): void;
  releaseDrag(): void;
  afterDragEnd(): void;
  coolZones(): void;
  onDragCancel(): void;
  // одиночные жесты
  onElementBlocked(el: El): void;
  onElementTapped(el: El): void;
  onSceneTap(content: Pt, screen: Pt): void;
  hasContextAt(cp: Pt): boolean;
  openContextMenu(cp: Pt, sp: Pt): void;
}

export function buildSceneInput<El extends { id: string }>(h: SceneInputHost<El>): InputHandlers<El, Button> {
  return {
    screenToContent: (sx, sy) => h.screenToContent(sx, sy),
    pickPiece: (cx, cy) => h.pickElement(cx, cy),
    pieceDraggable: (el) => h.canDrag(el),
    dragOnTap: (el) => h.dragOnTap(el),
    dragOnHold: (el) => h.dragOnHold(el),
    pickButton: (cx, cy) => h.hitButton(cx, cy),
    pickOverlay: (sx, sy) => h.hitChrome(sx, sy),
    buttonContains: (b, cx, cy) => {
      if (!h.isChromeButton(b)) return b.hitTest(cx, cy);
      const s = h.contentToScreen(cx, cy);
      return b.hitTest(s.x, s.y);
    },

    onPieceGrab: (el, cp, sp, mode) => {
      h.setGrabMode(mode); // какой жест сработал (tap/hold) — beginDrag выберет по нему интент
      h.setDragScreen(sp);
      // Перехват показа повторным драгом: НЕ абортим мгновенно — помечаем grabbed (peeks сам
      // гасит peekBob); скрытность вернётся по КОНЦУ драга или по истечении PEEK_DUR.
      h.peekMarkGrabbed(el.id);
      h.beginDrag(el, cp, sp);
    },

    onPieceMove: (el, cp, sp) => {
      h.setDragScreen(sp);
      if (h.beforeDragMove(el, cp)) return;
      const p = h.dragPoint(cp);
      h.moveDrag(p);
      h.onDragMoved(p);
      h.refreshZoneHot(p);
    },

    onPieceDrop: (el, cp) => {
      if (!h.beforeDrop(el, cp) && h.hasDrag()) {
        h.peekResolveGrabbed(); // держали показанный элемент → вернуть вид ДО диспатча дропа
        h.resolveDrop(el, cp);
        h.clearDrag();
      }
      h.afterDragEnd();
      h.coolZones();
    },

    onPieceCancel: () => {
      if (h.hasDrag()) h.peekResolveGrabbed(); // отмена драга показанного — тоже вернуть вид
      h.onDragCancel();
      h.releaseDrag();
      h.afterDragEnd();
    },

    onPieceBlocked: (el) => h.onElementBlocked(el),
    onPieceTap: (el) => h.onElementTapped(el),
    onTap: (content, screen) => h.onSceneTap(content, screen),
    longPressAt: (cx, cy) => h.hasContextAt({ x: cx, y: cy }),
    onLongPress: (cp, sp) => h.openContextMenu(cp, sp),

    onButtonDown: (b) => b.setPressed(true),
    onButtonMove: (b, inside) => b.setPressed(inside),
    onButtonUp: (b, inside) => {
      // Сначала визуально отпустить, ПОТОМ действие: click() может снести саму кнопку
      // (строка контекстного меню закрывает меню) — трогать её после нельзя (мёртвая Graphics).
      b.setPressed(false);
      if (inside) b.click();
    },

    // Пан/пинч камеры — целиком камерный риг (инерция, спред-приоритет, якорь зума).
    onPanStart: () => h.camera().panStart(),
    onPan: (dx, dy) => h.camera().pan(dx, dy),
    onPanEnd: () => h.camera().panEnd(),
    onPinchStart: (mx, my, dist, spanX) => h.camera().pinchStart(mx, my, dist, spanX),
    onPinch: (mx, my, dist, spanX) => h.camera().pinch(mx, my, dist, spanX),

    onHover: (b) => h.hoverTo(b),
    afterAny: () => h.wake(),
  };
}

// ——— сборка хоста из движка (данные — SceneEngine, швы — e.seams) ———

import type { InputRouter } from "./inputRouter";
import type { SceneEngine } from "./sceneEngine";
import { refreshZoneHot } from "./sceneFrame";
import { contentToScreen, hitButtonAt, hitChromeAt, screenToContent } from "./sceneView";

export function makeEngineInput(e: SceneEngine): InputHandlers<import("./sceneEngine").SceneElement, Button> {
  return buildSceneInput({
    screenToContent: (sx, sy) => screenToContent(e, sx, sy),
    contentToScreen: (cx, cy) => contentToScreen(e, cx, cy),
    camera: () => e.camera,
    wake: () => e.wake(),
    pickElement: (cx, cy) => e.seams.pickElement(cx, cy),
    canDrag: (el) => e.seams.canDrag(el),
    dragOnTap: (el) => e.seams.dragOnTap(el),
    dragOnHold: (el) => e.seams.dragOnHold(el),
    hitButton: (cx, cy) => hitButtonAt(e, cx, cy),
    hitChrome: (sx, sy) => hitChromeAt(e, sx, sy),
    isChromeButton: (b) => e.chromeButtons.includes(b),
    hoverTo: (b) => {
      // Трогаем ТОЛЬКО две сменившиеся кнопки — цикл-по-всем ронял FPS на ПК (issue #48).
      if (b === e.hoveredBtn) return;
      if (e.hoveredBtn) {
        e.hoveredBtn.hover(false);
        e.hoverRerenders++;
      }
      if (b) {
        b.hover(true);
        e.hoverRerenders++;
      }
      e.hoveredBtn = b;
      e.wake();
    },
    setGrabMode: (mode) => {
      e.grabMode = mode;
    },
    setDragScreen: (sp) => {
      e.dragScreen = { x: sp.x, y: sp.y };
    },
    peekMarkGrabbed: (id) => void e.peeks.markGrabbed(id),
    peekResolveGrabbed: () => e.peeks.resolveGrabbed(),
    beginDrag: (el, cp, sp) => void e.seams.beginDrag(el, cp, sp),
    beforeDragMove: (el, cp) => e.seams.beforeDragMove(el, cp),
    dragPoint: (cp) => e.seams.dragPoint(cp),
    moveDrag: (p) => e.drag?.move(p),
    onDragMoved: (p) => e.seams.onDragMoved(p),
    refreshZoneHot: (p) => refreshZoneHot(e, p),
    beforeDrop: (el, cp) => e.seams.beforeDrop(el, cp),
    hasDrag: () => e.drag !== null,
    resolveDrop: (el, cp) => e.seams.resolveDrop(el, cp),
    clearDrag: () => {
      e.drag = null;
    },
    releaseDrag: () => {
      e.drag?.release();
      e.drag = null;
    },
    afterDragEnd: () => e.seams.afterDragEnd(),
    coolZones: () => {
      for (const z of e.zones) z.zone.setHot(false);
    },
    onDragCancel: () => e.seams.onDragCancel(),
    onElementBlocked: (el) => e.seams.onElementBlocked(el),
    onElementTapped: (el) => e.seams.onElementTapped(el),
    onSceneTap: (content, screen) => e.seams.onSceneTap(content, screen),
    hasContextAt: (cp) => e.seams.hasContextAt(cp),
    openContextMenu: (cp, sp) => e.seams.openContextMenu(cp, sp),
  });
}
