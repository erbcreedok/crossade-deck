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
