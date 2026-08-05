// КАМЕРНЫЙ РИГ — коллаборатор SceneEngine поверх Viewport: дабл-тап-фокус на зону (Figma-like,
// плавный твин), колесо/тачпад (зум с модификатором, пан без; спреды перехватывают жест первыми)
// и авто-скролл у кромки при драге. Движок отдаёт доступ узким швом CameraHost; протектед-контракт
// сцен (clampView/applyView/emitView) остаётся у движка.

import type { DragPayload } from "./drag";
import { fitBoundsView } from "./focusView";
import { wheelGoesToScene, type Viewport } from "./viewport";

/** Каким входом пришёл жест спреда: два пальца, Ctrl/⌘-колесо (пинч тачпада) или обычный скролл. */
export type SpreadSource = "touch-zoom" | "pointer-zoom" | "pointer-pan";

interface Pt {
  x: number;
  y: number;
}

/** Чувствительность зума колесом/тачпадом: exp(-deltaY * ZOOM_SENS). */
export const ZOOM_SENS = 0.0015;
/** Пауза колеса дольше этого = НОВЫЙ жест (сброс детента спреда, onSpreadBegin). */
export const WHEEL_GESTURE_GAP_MS = 140;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export interface CameraHost {
  viewport(): Viewport;
  size(): { w: number; h: number };
  insetTop(): number;
  contentSize(): { w: number; h: number };
  syncVp(): void;
  clampView(): void;
  applyView(): void;
  emitView(): void;
  wake(): void;
  screenToContent(sx: number, sy: number): Pt;
  canvasRect(): DOMRect;
  /** Спред-жест по цели (стек и т.п.) перехватывает колесо/пинч — камере жест не достаётся. */
  spreadOnElement(cp: Pt, rawX: number, rawY: number, source: SpreadSource): boolean;
  onSpreadBegin(): void;
  /** Границы фокусируемой цели под точкой контента (дабл-тап-зум) или null. */
  focusTargetAt(cp: Pt): { x: number; y: number; w: number; h: number } | null;
  /** Сцена стоит внутри документа: колесо без цели уходит странице. */
  inDocument(): boolean;
  /** Текущий драг для авто-скролла у кромки (null — не идёт). */
  dragInfo(): { payload: DragPayload | null; screen: Pt; dragging: boolean };
  refreshZoneHot(p: Pt): void;
}

export class SceneCamera {
  private lastTap: { t: number; x: number; y: number } | null = null;
  private focusedKey: string | null = null; // на какую зону сейчас наведено (для тоггла)
  private tween: { fromX: number; fromY: number; fromZoom: number; toX: number; toY: number; toZoom: number; t: number; dur: number } | null = null;
  private lastWheelSpreadT = 0;

  constructor(private readonly host: CameraHost) {}

  /** Тап по сцене: два подряд близко и быстро — дабл-тап-зум на фокусируемую цель (тоггл). */
  handleTap(content: Pt, screen: Pt): void {
    const now = performance.now();
    const prev = this.lastTap;
    this.lastTap = { t: now, x: screen.x, y: screen.y };
    // Порог позиции щедрый — палец на телефоне гуляет.
    if (prev && now - prev.t < 320 && Math.hypot(screen.x - prev.x, screen.y - prev.y) < 28) {
      this.lastTap = null;
      const b = this.host.focusTargetAt(content);
      if (!b) return;
      const key = `${Math.round(b.x)}:${Math.round(b.y)}:${Math.round(b.w)}:${Math.round(b.h)}`;
      const full = this.host.contentSize();
      if (this.focusedKey === key) {
        this.focusedKey = null;
        this.focusBounds({ x: 0, y: 0, w: full.w, h: full.h }); // тоггл → полный вид стола
      } else {
        this.focusedKey = key;
        this.focusBounds(b);
      }
    }
  }

  /** Навести камеру на границы: центр в центр доступной области, зум под 90% её размера. Плавно. */
  focusBounds(b: { x: number; y: number; w: number; h: number }): void {
    if (b.w <= 0 || b.h <= 0) return;
    this.host.syncVp();
    const vp = this.host.viewport();
    const size = this.host.size();
    const target = fitBoundsView(b, { w: size.w, h: size.h - this.host.insetTop() }, { min: vp.minZoom, max: vp.maxZoom });
    this.tween = { fromX: vp.x, fromY: vp.y, fromZoom: vp.zoom, toX: target.x, toY: target.y, toZoom: target.zoom, t: 0, dur: 0.3 };
    this.host.wake();
  }

  /** Шаг анимации камеры за кадр (ease-out). Вернуть «ещё едет». */
  stepTween(dt: number): boolean {
    const c = this.tween;
    if (!c) return false;
    c.t += dt;
    const k = Math.min(1, c.dur > 0 ? c.t / c.dur : 1);
    const e = 1 - Math.pow(1 - k, 3); // easeOutCubic
    const vp = this.host.viewport();
    vp.zoom = c.fromZoom + (c.toZoom - c.fromZoom) * e;
    vp.x = c.fromX + (c.toX - c.fromX) * e;
    vp.y = c.fromY + (c.toY - c.fromY) * e;
    this.host.applyView();
    this.host.emitView();
    if (k >= 1) this.tween = null;
    return true;
  }

  /** Прервать наведение (ручной жест/зум перебивает и сбрасывает «наведено на зону»). */
  cancelFocus(): void {
    this.tween = null;
    this.focusedKey = null;
  }

  zoomAround(sx: number, sy: number, factor: number): void {
    this.host.syncVp();
    this.host.viewport().zoomAround(sx, sy - this.host.insetTop(), factor);
    this.host.applyView();
    this.host.wake();
    this.host.emitView();
  }

  // Зум колесом — ТОЛЬКО с модификатором (кроссплатформенно): Ctrl или Cmd; пинч тачпада браузер
  // шлёт как колесо с ctrlKey — тоже зум. Без модификатора любое колесо/скролл — ПАН.
  private wheelIsZoom(e: WheelEvent): boolean {
    return e.ctrlKey || e.metaKey;
  }

  /** Колесо/тачпад. ГЛАВНОЕ ПРАВИЛО: не отбирать колесо, если двигать нечего — иначе страница
   *  под канвасом перестаёт скроллиться и сайт читается как зависший. */
  handleWheel(e: WheelEvent): void {
    this.host.syncVp();
    const rect = this.host.canvasRect();
    const size = this.host.size();
    const cp = this.host.screenToContent(e.clientX - rect.left, e.clientY - rect.top);
    const dyPx = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * size.h : e.deltaY;
    // Граница жеста для детента: у колеса нет pointerdown/up — новый «залп» после паузы = новый жест.
    const t = performance.now();
    if (t - this.lastWheelSpreadT > WHEEL_GESTURE_GAP_MS) this.host.onSpreadBegin();
    this.lastWheelSpreadT = t;
    // Спреду отдаём СЫРЫЕ device-дельты (px): как их маппить — дело input-конфига стека.
    const dxPx = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaMode === 2 ? e.deltaX * size.w : e.deltaX;

    if (this.wheelIsZoom(e)) {
      // Десктопный ЗУМ-жест: над стеком со spread-триггером «zoom» он ведёт спред, иначе зум камеры.
      if (this.host.spreadOnElement(cp, 0, dyPx, "pointer-zoom")) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      this.cancelFocus();
      this.zoomAround(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-dyPx * ZOOM_SENS));
      return;
    }

    // Обычное колесо/скролл: над стеком со spread-триггером «pan» — спред; иначе пан камеры (если
    // есть куда двигать, иначе колесо уходит странице).
    if (this.host.spreadOnElement(cp, dxPx, dyPx, "pointer-pan")) {
      e.preventDefault();
      return;
    }
    const vp = this.host.viewport();
    const canPan = (e.deltaX !== 0 && vp.overflowX) || (e.deltaY !== 0 && vp.overflowY);
    if (!wheelGoesToScene({ zoom: false, canPan, inDocument: this.host.inDocument() })) return; // колесо уходит странице
    e.preventDefault();
    this.cancelFocus(); // пан перебивает наведение на зону
    vp.panBy(-e.deltaX, -dyPx);
    this.host.applyView();
    this.host.wake();
    this.host.emitView();
  }

  /** Авто-скролл у кромки: пока держишь элемент у края, вид панится в ту сторону; элемент
   *  остаётся ПОД пальцем (пересчёт по экранной точке при новом виде). */
  edgeScroll(dt: number): void {
    const { payload, screen, dragging } = this.host.dragInfo();
    if (!dragging || !payload) return;
    const size = this.host.size();
    const margin = Math.max(48, Math.min(size.w, size.h) * 0.12);
    const SPEED = 780; // экранных px/сек на самой кромке
    const ramp = (d: number): number => {
      const r = clamp(d / margin, 0, 1);
      return r * r; // мягче у границы зоны, резче у самого края
    };
    let dx = 0;
    let dy = 0;
    if (screen.x < margin) dx = ramp(margin - screen.x);
    else if (screen.x > size.w - margin) dx = -ramp(screen.x - (size.w - margin));
    if (screen.y < margin) dy = ramp(margin - screen.y);
    else if (screen.y > size.h - margin) dy = -ramp(screen.y - (size.h - margin));
    if (dx === 0 && dy === 0) return;

    const vp = this.host.viewport();
    const bx = vp.x;
    const by = vp.y;
    vp.x += dx * SPEED * dt;
    vp.y += dy * SPEED * dt;
    this.host.clampView();
    if (vp.x === bx && vp.y === by) return; // упёрлись в край — двигать нечего
    this.host.applyView();
    const p = this.host.screenToContent(screen.x, screen.y);
    payload.move(p); // груз остаётся под пальцем на открывшейся области
    this.host.refreshZoneHot(p);
    this.host.emitView();
  }
}
