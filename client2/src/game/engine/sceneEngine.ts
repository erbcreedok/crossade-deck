import { Application, Container, Rectangle } from "pixi.js";
import { CanvasApp } from "./canvasApp";
import { SceneLayers, levelOf } from "./sceneLayers";
import { Viewport, wheelGoesToScene, type ViewState } from "./viewport";
import { InputRouter, type InputHandlers } from "./inputRouter";
import { Marker, withAnchor, withDragger, type MarkerConfig, type MarkerHost, type ShowPolicy } from "./marker";
import { SingleDrag, type DragContext, type DragPayload } from "./drag";
import { topmostAt, type HitBox } from "./cardHit";
import { Button } from "../ui/Button";
import { Card, type Pose } from "../ui/Card";
import { Piece } from "../ui/Piece";
import type { DropZone } from "../ui/DropZone";
import type { Draggable, Peekable, TableElement } from "./element";
import { flipSchedule } from "../anim/flipSchedule";
import { moveStyle } from "../anim/moveStyles";
import { destroyStyle } from "../anim/destroyStyles";
import { appearStyle } from "../anim/appearStyles";
import { BASE_PRESET, type AnimPreset } from "../anim/presets";
import { fitBoundsView } from "./focusView";

/** Какая из анимаций элемента: у каждой своё расписание в пресете. */
export type AnimKind = "move" | "flip" | "destroy" | "appear";

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
export interface Grabber {
  marker: Marker;
  host: MarkerHost;
  lead: () => SceneElement | null;
}

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
/** Чувствительность зума колесом/тачпадом: exp(-deltaY * ZOOM_SENS). */
export const ZOOM_SENS = 0.0015;
/** Сколько секунд дропзона «подглядеть» держит карту раскрытой до авто-возврата. */
export const PEEK_DUR = 3;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export abstract class SceneEngine extends CanvasApp {
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
  private panVel = { x: 0, y: 0 }; // сглаженная скорость пана (px/сек) — для инерции
  private lastPanT = 0;
  private pinch = { dist: 1, zoom: 1, midContentX: 0, midContentY: 0 };

  // ——— дабл-тап-зум на зону (общий механизм; сцена решает, что фокусируемо — focusTargetAt) ———
  private lastTap: { t: number; x: number; y: number } | null = null;
  private focusedKey: string | null = null; // на какую зону сейчас наведено (для тоггла)
  private camTween: { fromX: number; fromY: number; fromZoom: number; toX: number; toY: number; toZoom: number; t: number; dur: number } | null = null;

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
  protected markers: Marker[] = [];
  protected grabbers: Grabber[] = [];
  /** За какую метку сейчас тянут (follow/endFollow). */
  protected grabbedMarker: Marker | null = null;
  /** Host захватываемой цели — живёт между pickElement и beginDrag. */
  protected pendingHost: MarkerHost | null = null;

  /** Навесить пару меток (драггер + якорь) на ЛЮБОЙ host и учесть их в хит-тесте захвата. */
  protected mountMarkers(
    host: MarkerHost,
    lead: () => SceneElement | null,
    dragger: Omit<MarkerConfig, "show"> & { show?: ShowPolicy },
    anchorCfg: Omit<MarkerConfig, "show" | "follow" | "hit"> & { show?: ShowPolicy },
  ): { dragger: Marker; anchor: Marker } {
    const d = withDragger(host, this.scene.verb, this.scene.cards.drag, dragger);
    const a = withAnchor(host, this.scene.surface, anchorCfg);
    this.markers.push(d, a);
    this.grabbers.push({ marker: d, host, lead });
    return { dragger: d, anchor: a };
  }

  /** Снести метки (пересборка содержимого). Зовут из своего clearContent. */
  protected clearMarkers(): void {
    for (const m of this.markers) m.destroy();
    this.markers = [];
    this.grabbers = [];
    this.grabbedMarker = null;
    this.pendingHost = null;
  }

  // ——— «подглядеть» ———
  // id → сессия показа. undo — замыкание из Peekable.peekReveal, возвращающее элемент КАК БЫЛО:
  // reveal и restore одной парой, рассинхрону неоткуда взяться. grabbed — показанный элемент
  // перехватили повторным драгом; тогда восстановление ждёт КОНЦА драга или истечения PEEK_DUR.
  protected peeking = new Map<string, { el: SceneElement; undo: () => void; t: number; grabbed: boolean }>();

  /** Лёгкий профиль качества (issue #8): выключает shadow-пасс и замораживает idle у карт. */
  protected lowFx = false;

  constructor(cam: CameraConfig = {}) {
    super();
    this.viewport = new Viewport(cam.minZoom ?? MIN_ZOOM, cam.maxZoom ?? MAX_ZOOM, cam.margin ?? 24, cam.align ?? "left", 0, cam.alignY ?? "top");
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
  protected layoutChrome(_w: number, _h: number): void {}

  /** Экранный отступ сверху, занятый HUD: сцена вычитает его из полезной высоты стола. */
  protected chromeInsetTop(): number {
    return 0;
  }

  /** Собрать СВОЮ сцену в this.scene/this.content (полотно и слои уже готовы). Обязателен. */
  protected abstract buildScene(app: Application): void;

  // Ввод и колесо вешаются на stage/канвас один раз за boot. hitArea обновляется на ресайзе.
  private wire(app: Application): void {
    app.stage.eventMode = "static";
    app.stage.hitArea = new Rectangle(0, 0, this.width, this.height);
    app.stage.on("pointerdown", this.onDown);
    app.stage.on("pointermove", this.onMove);
    app.stage.on("pointerup", this.onUp);
    app.stage.on("pointerupoutside", this.onUp);
    app.canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  protected onBooted(): void {
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
  protected focusTargetAt(_cp: Pt): { x: number; y: number; w: number; h: number } | null {
    return null;
  }

  /** Колесо/скролл по цели под курсором (координаты КОНТЕНТА + дельты колеса). Вернуть true —
   *  перехвачено (спред-стек и т.п.), пан/зум не выполняется. По умолчанию не перехватываем. */
  protected wheelOnElement(_cp: Pt, _dx: number, _dy: number): boolean {
    return false;
  }

  private handleTap(content: Pt, screen: Pt): void {
    const now = performance.now();
    const prev = this.lastTap;
    this.lastTap = { t: now, x: screen.x, y: screen.y };
    // Двойной тап: два подряд близко и быстро. Порог позиции щедрый — палец на телефоне гуляет.
    if (prev && now - prev.t < 320 && Math.hypot(screen.x - prev.x, screen.y - prev.y) < 28) {
      this.lastTap = null;
      const b = this.focusTargetAt(content);
      if (!b) return;
      const key = `${Math.round(b.x)}:${Math.round(b.y)}:${Math.round(b.w)}:${Math.round(b.h)}`;
      if (this.focusedKey === key) {
        this.focusedKey = null;
        this.focusBounds({ x: 0, y: 0, w: this.contentW, h: this.contentH }); // тоггл → полный вид стола
      } else {
        this.focusedKey = key;
        this.focusBounds(b);
      }
    }
  }

  /** Навести камеру на границы: центр в центр доступной области, зум под 90% её размера. Плавно. */
  protected focusBounds(b: { x: number; y: number; w: number; h: number }): void {
    if (b.w <= 0 || b.h <= 0) return;
    this.syncVp();
    const target = fitBoundsView(b, { w: this.width, h: this.height - this.chromeInsetTop() }, { min: this.viewport.minZoom, max: this.viewport.maxZoom });
    this.camTween = { fromX: this.viewport.x, fromY: this.viewport.y, fromZoom: this.viewport.zoom, toX: target.x, toY: target.y, toZoom: target.zoom, t: 0, dur: 0.3 };
    this.wake();
  }

  /** Шаг анимации камеры за кадр (ease-out). Вернуть «ещё едет». */
  private stepCamTween(dt: number): boolean {
    const c = this.camTween;
    if (!c) return false;
    c.t += dt;
    const k = Math.min(1, c.dur > 0 ? c.t / c.dur : 1);
    const e = 1 - Math.pow(1 - k, 3); // easeOutCubic
    this.viewport.zoom = c.fromZoom + (c.toZoom - c.fromZoom) * e;
    this.viewport.x = c.fromX + (c.toX - c.fromX) * e;
    this.viewport.y = c.fromY + (c.toY - c.fromY) * e;
    this.applyView();
    this.emitView();
    if (k >= 1) this.camTween = null;
    return true;
  }

  /** Прервать наведение камеры (ручной жест/зум перебивает и сбрасывает «наведено на зону»). */
  private cancelFocus(): void {
    this.camTween = null;
    this.focusedKey = null;
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
  protected onSceneResize(_w: number, _h: number): void {}

  private zoomAround(sx: number, sy: number, factor: number): void {
    this.syncVp();
    const c = this.camPoint(sx, sy);
    this.viewport.zoomAround(c.x, c.y, factor);
    this.applyView();
    this.wake();
    this.emitView();
  }

  // Зум колесом — ТОЛЬКО с модификатором (кроссплатформенно): Ctrl на Windows/Linux/Mac или
  // Cmd на Mac. Пинч тачпада браузер шлёт как колесо с ctrlKey — тоже зум. Без модификатора
  // любое колесо/скролл (мышь и тачпад) — это ПАН. Shift не берём: в браузерах это гориз.скролл.
  private wheelIsZoom(e: WheelEvent): boolean {
    return e.ctrlKey || e.metaKey;
  }

  private onWheel = (e: WheelEvent): void => {
    // ГЛАВНОЕ ПРАВИЛО: не отбирать колесо, если двигать нечего.
    //
    // Раньше preventDefault стоял безусловно, и страница под канвасом переставала скроллиться —
    // при том что панорамировать было некуда, контент влезал целиком. Со стороны это читается не
    // как «канвас не хочет скроллиться», а как зависший сайт: колесо крутится, не происходит
    // ничего. В каталоге это norma: витрина по умолчанию вписана целиком, переполнения нет.
    //
    // Зум с модификатором забираем всегда — он осмыслен и при вписанном контенте.
    this.syncVp();
    // Колесо/скролл ПО элементу (без модификатора-зума): сцена вправе перехватить его на своей
    // цели под курсором (спред-стек и т.п.) РАНЬШЕ пана/зума. Перехватила — колесо съедено.
    if (!this.wheelIsZoom(e)) {
      const rect = this.app!.canvas.getBoundingClientRect();
      const cp = this.screenToContent(e.clientX - rect.left, e.clientY - rect.top);
      if (this.wheelOnElement(cp, e.deltaX, e.deltaY)) {
        e.preventDefault();
        return;
      }
    }
    const canPan = (e.deltaX !== 0 && this.viewport.overflowX) || (e.deltaY !== 0 && this.viewport.overflowY);
    if (!wheelGoesToScene({ zoom: this.wheelIsZoom(e), canPan, inDocument: this.inDocument })) return; // колесо уходит странице
    e.preventDefault();
    this.cancelFocus(); // колесо (зум/пан) перебивает наведение на зону
    // deltaY в пиксели: в строчном/страничном режиме домножаем.
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * this.height : e.deltaY;
    if (this.wheelIsZoom(e)) {
      const rect = this.app!.canvas.getBoundingClientRect();
      this.zoomAround(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-dy * ZOOM_SENS));
    } else {
      // Тачпад: двумя пальцами тащим канвас (пан), а не зумим.
      this.syncVp();
      this.viewport.panBy(-e.deltaX, -dy);
      this.applyView();
      this.wake();
      this.emitView();
    }
  };

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

  // Авто-скролл у кромки: пока держишь элемент у края экрана, вид панится в ту сторону — скорость
  // растёт с глубиной захода в кромку. Элемент остаётся ПОД пальцем (пересчёт по экранной точке
  // при новом виде), так что он «уезжает» на открывшуюся область стола.
  private edgeScroll(dt: number): void {
    if (this.input.gesture !== "drag" || !this.drag) return;
    const margin = Math.max(48, Math.min(this.width, this.height) * 0.12);
    const SPEED = 780; // экранных px/сек на самой кромке
    const { x: sx, y: sy } = this.dragScreen;
    const ramp = (d: number): number => {
      const r = clamp(d / margin, 0, 1);
      return r * r; // мягче у границы зоны, резче у самого края
    };
    let dx = 0;
    let dy = 0;
    if (sx < margin) dx = ramp(margin - sx);
    else if (sx > this.width - margin) dx = -ramp(sx - (this.width - margin));
    if (sy < margin) dy = ramp(margin - sy);
    else if (sy > this.height - margin) dy = -ramp(sy - (this.height - margin));
    if (dx === 0 && dy === 0) return;

    const bx = this.viewport.x;
    const by = this.viewport.y;
    this.viewport.x += dx * SPEED * dt;
    this.viewport.y += dy * SPEED * dt;
    this.clampView();
    if (this.viewport.x === bx && this.viewport.y === by) return; // упёрлись в край — двигать нечего
    this.applyView();
    const p = this.screenToContent(sx, sy);
    this.drag.move(p); // груз остаётся под пальцем на открывшейся области
    this.refreshZoneHot(p);
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

  /** Есть ли у элемента что раскрыть — ЧИСТЫЙ предикат (armed-текст зоны читает его без мутаций). */
  protected needsPeek(el: TableElement): boolean {
    return "canPeek" in el ? (el as unknown as Peekable).canPeek : false;
  }

  // true, если хоть один элемент реально ушёл в показ — это и есть consumed для SingleDrag/GroupDrag:
  // не начали ни одного → элемент(ы) летят домой как обычно. КАК раскрывать и как вернуть — знает
  // сам элемент (peekReveal → undo); движок лишь держит undo.
  protected startPeek(els: readonly TableElement[]): boolean {
    let any = false;
    for (const el of els) {
      const undo = "peekReveal" in el ? (el as unknown as Peekable).peekReveal() : null;
      if (!undo) continue; // раскрывать нечего (уже видно) — элемент не поглощён, полетит домой
      this.peeking.set(el.id, { el: el as SceneElement, undo, t: 0, grabbed: false });
      any = true;
    }
    if (any) this.wake();
    return any;
  }

  // Вернуть элемент КАК БЫЛО и закрыть сессию показа. releaseHome — отпустить домой (истёк таймер
  // и элемент НЕ держат). Под пальцем домой не гоним: его увезёт обычный release по концу драга.
  private endPeek(id: string, releaseHome: boolean): void {
    const p = this.peeking.get(id);
    if (!p) return;
    this.peeking.delete(id);
    p.undo();
    if (releaseHome) this.releaseElement(p.el);
  }

  // Конец драга: показанные элементы, что держали, вернуть КАК БЫЛО, НЕ отпуская домой — домой их
  // увезёт обычный release/дроп. Зовётся ДО диспатча дропа, чтобы повторный дроп на «подглядеть»
  // раскрыл с уже восстановленного базового вида (иначе поймал бы «раскрытое»).
  private resolveGrabbedPeeks(): void {
    for (const [id, p] of this.peeking) if (p.grabbed) this.endPeek(id, false);
  }

  // ——————————————————————————————————————————————————————————————————————
  // Хит-тест и ввод
  // ——————————————————————————————————————————————————————————————————————

  /** Все перетаскиваемые элементы сцены — единый список для хит-теста. Обязателен. */
  protected abstract draggables(): SceneElement[];

  /** Все живые элементы сцены (в т.ч. недрагабельные) — для шага/рендера/теней. Обязателен. */
  protected abstract everyElement(): TableElement[];

  /** Дом элемента: позиция покоя + глубина. null — дома нет (элемент вне раскладки). Обязателен. */
  protected abstract homeOf(el: SceneElement): { home: Pt; depth: number } | null;

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
  private onDown = (e: { global: Pt; pointerId: number }): void => {
    this.viewport.stopFling(); // касание гасит инерцию
    this.input.down(e.pointerId, e.global.x, e.global.y);
  };
  private onMove = (e: { global: Pt; pointerId: number }): void => this.input.move(e.pointerId, e.global.x, e.global.y);
  private onUp = (e: { global: Pt; pointerId: number }): void => this.input.up(e.pointerId, e.global.x, e.global.y);

  // ——— швы домена: сцена переопределяет только то, что у неё своё ———

  /** Что схвачено в точке. По умолчанию — верхний элемент под пальцем. */
  protected pickElement(cx: number, cy: number): SceneElement | null {
    // Сперва метка-драггер: за ручку тянут ЦЕЛЬ (стопку, столбик, фигуру), а не то, что под ней.
    const g = this.grabbers.find((gr) => gr.marker.interactive && gr.marker.hitTest(cx, cy));
    if (g) {
      this.pendingHost = g.host;
      this.grabbedMarker = g.marker;
      return g.lead(); // лид: верхняя карта стопки / сам соло-элемент
    }
    return this.hitElement(cx, cy);
  }

  /** Можно ли тащить. По умолчанию — собственная драгабельность элемента. */
  protected canDrag(el: SceneElement): boolean {
    return el.draggable;
  }

  /**
   * «Держи, чтобы тащить» ДЛЯ ЭТОГО элемента (kit/stackInteraction.ts CardDrag.trigger==="hold").
   * По умолчанию выключено — обычный тап-драг, как и раньше (see InputHandlers.holdToDrag).
   */
  protected holdToDrag(_el: SceneElement): boolean {
    return false;
  }

  /** Начать драг. По умолчанию — обычный SingleDrag за одну карту. Переопределяют, чтобы тащить
   *  пачку/набор; вернуть true — «драг заведён сам», false — база заводит SingleDrag. */
  protected beginDrag(el: SceneElement, cp: Pt, _sp: Pt): boolean {
    // Цель захвачена за метку → груз делает её host (это может быть и пачка). Иначе — одна карта.
    const payload = this.pendingHost?.makePayload?.(cp) ?? null;
    this.pendingHost = null;
    if (payload) {
      this.drag = payload;
      this.grabbedMarker?.beginFollow(); // грип едет за пальцем поверх пачки
    } else {
      this.grabbedMarker = null;
      this.drag = new SingleDrag(el, this.dragCtx, cp);
    }
    this.drag.move(cp);
    return true;
  }

  /** Перехватить движение до того, как груз поедет (вернуть true — движение проглочено). Опц. */
  protected beforeDragMove(_el: SceneElement, _cp: Pt): boolean {
    return false;
  }

  /** Поправить точку ведения (напр. запереть фигуру в рамке зоны). По умолчанию — как есть. */
  protected dragPoint(cp: Pt): Pt {
    return cp;
  }

  /** Груз проехал в точку p. База ведёт за пальцем захваченную метку; наследник добавляет своё. */
  protected onDragMoved(p: Pt): void {
    this.grabbedMarker?.followTo(p);
  }

  /** Перехватить дроп до разбора груза (вернуть true — дроп проглочен). Опц. */
  protected beforeDrop(_el: SceneElement, _cp: Pt): boolean {
    return false;
  }

  /** Что значит дроп. По умолчанию: зона под пальцем реагирует на СПОСОБНОСТИ груза (flip/burn/
   *  peek), не на его тип; не поглощён — возвращается домой пружиной. */
  protected resolveDrop(_el: SceneElement, cp: Pt): void {
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
  protected onDragCancel(): void {}

  /** Конец любого драга. База возвращает метку на место; наследник снимает своё. */
  protected afterDragEnd(): void {
    this.grabbedMarker?.endFollow();
    this.grabbedMarker = null;
  }

  /** Попытались утащить недрагабельный элемент (палец поехал). По умолчанию — «стоп»-кивок. */
  protected onElementBlocked(el: SceneElement): void {
    el.blockNudge();
  }

  /** ТАП по недрагабельному элементу (без сдвига). По умолчанию — ничего: тык не отказ. */
  protected onElementTapped(_el: SceneElement): void {}

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
      if (stepPlan.delay <= 0) requestFlipOf(el);
      else this.pendingFlips.push({ el, t: stepPlan.delay });
    });
    this.wake();
  }

  /** Переставить дом элемента. Знает только конкретная сцена — у неё свой реестр. */
  protected setHome(_el: SceneElement, _home: { x: number; y: number }, _depth: number): void {}

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
  private timers: { t: number; fn: () => void }[] = [];

  /** Выполнить через `delay` секунд ЖИЗНИ СЦЕНЫ (не настенного времени). */
  after(delay: number, fn: () => void): void {
    if (delay <= 0) return void fn();
    this.timers.push({ t: delay, fn });
    this.wake();
  }

  private stepTimers(dt: number): boolean {
    if (!this.timers.length) return false;
    const left: { t: number; fn: () => void }[] = [];
    for (const x of this.timers) {
      const t = x.t - dt;
      if (t <= 0) x.fn();
      else left.push({ t, fn: x.fn });
    }
    this.timers = left;
    return true;
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
    const speed = p.speed > 0 ? p.speed : 1;
    if (kind === "move") {
      const st = moveStyle(p.move.style);
      // У пружины расписания нет — время задаёт физика; берём оценку, иначе сценарий сработал бы
      // мгновенно и снял бы жертву до прихода.
      return st.frame ? st.dur / speed : 0.45;
    }
    if (kind === "destroy") return (destroyStyle(p.destroy.style).dur * p.destroy.scale) / speed;
    if (kind === "appear") return (appearStyle(p.appear.style).dur * p.appear.scale) / speed;
    // У переворота расписание живёт в ТАЙМИНГЕ пресета, а не в стиле: стиль решает форму движения.
    return p.flip.dur / speed;
  }

  /** Сколько летит элемент при команде move. Оставлено как имя того, чем пользуются сценарии. */
  moveDuration(id: string): number {
    return this.animDuration(id, "move");
  }

  /** Отложенные перевороты каскада. Шагаются в кадре — своего таймера у сцены нет и не нужно. */
  private pendingFlips: { el: SceneElement; t: number }[] = [];

  private stepPendingFlips(dt: number): boolean {
    if (!this.pendingFlips.length) return false;
    const left: { el: SceneElement; t: number }[] = [];
    for (const p of this.pendingFlips) {
      const t = p.t - dt;
      if (t <= 0) requestFlipOf(p.el);
      else left.push({ el: p.el, t });
    }
    this.pendingFlips = left;
    return true; // пока очередь не пуста, цикл засыпать не имеет права
  }

  // Хит-тесты и реакции на жесты. Стейт-машина — в InputRouter, домен — в швах выше.
  private inputHandlers(): InputHandlers<SceneElement, Button> {
    return {
      screenToContent: (sx, sy) => this.screenToContent(sx, sy),
      pickCard: (cx, cy) => this.pickElement(cx, cy),
      cardDraggable: (el) => this.canDrag(el),
      holdToDrag: (el) => this.holdToDrag(el),
      pickButton: (cx, cy) => this.hitButton(cx, cy),
      pickOverlay: (sx, sy) => this.hitChrome(sx, sy),
      buttonContains: (b, cx, cy) => {
        if (!this.chromeButtons.includes(b)) return b.hitTest(cx, cy);
        const s = this.contentToScreen(cx, cy);
        return b.hitTest(s.x, s.y);
      },

      onCardGrab: (el, cp, sp) => {
        this.dragScreen = { x: sp.x, y: sp.y };
        // Перехват показа повторным драгом: НЕ абортим мгновенно. Помечаем grabbed и гасим peekBob
        // (под пальцем элемент явно не «завис» — резонанс-парение ни к чему); скрытность НЕ трогаем,
        // она вернётся по КОНЦУ драга или по истечении PEEK_DUR, что раньше. Так показанную карту
        // можно утащить, и она вернётся в исходный вид сама.
        const pk = this.peeking.get(el.id);
        if (pk) {
          pk.grabbed = true;
          if ("peekBob" in pk.el) (pk.el as unknown as { peekBob: boolean }).peekBob = false;
        }
        this.beginDrag(el, cp, sp);
      },

      onCardMove: (el, cp, sp) => {
        this.dragScreen = { x: sp.x, y: sp.y };
        if (this.beforeDragMove(el, cp)) return;
        const p = this.dragPoint(cp);
        this.drag?.move(p);
        this.onDragMoved(p);
        this.refreshZoneHot(p);
      },

      onCardDrop: (el, cp) => {
        if (!this.beforeDrop(el, cp) && this.drag) {
          this.resolveGrabbedPeeks(); // держали показанный элемент → вернуть вид ДО диспатча дропа
          this.resolveDrop(el, cp);
          this.drag = null;
        }
        this.afterDragEnd();
        for (const z of this.zones) z.zone.setHot(false);
      },

      onCardCancel: () => {
        if (this.drag) this.resolveGrabbedPeeks(); // отмена драга показанного — тоже вернуть вид
        this.onDragCancel();
        this.drag?.release();
        this.drag = null;
        this.afterDragEnd();
      },

      onCardBlocked: (el) => this.onElementBlocked(el),
      onCardTap: (el) => this.onElementTapped(el),
      onTap: (content, screen) => this.handleTap(content, screen),

      onButtonDown: (b) => b.setPressed(true),
      onButtonMove: (b, inside) => b.setPressed(inside),
      onButtonUp: (b, inside) => {
        if (inside) b.click();
        b.setPressed(false);
      },

      onPanStart: () => {
        this.viewport.stopFling();
        this.panVel = { x: 0, y: 0 };
        this.lastPanT = 0;
      },
      onPan: (dx, dy) => {
        this.cancelFocus(); // реальный пан перебивает наведение и сбрасывает «наведено на зону»
        // Копим сглаженную скорость пана (px/сек) для инерции после отпускания.
        const t = performance.now();
        if (this.lastPanT) {
          const dtp = Math.min(0.1, (t - this.lastPanT) / 1000);
          if (dtp > 0) this.panVel = { x: 0.5 * this.panVel.x + 0.5 * (dx / dtp), y: 0.5 * this.panVel.y + 0.5 * (dy / dtp) };
        }
        this.lastPanT = t;
        this.syncVp();
        this.viewport.panBy(dx, dy);
        this.applyView();
        this.emitView();
      },
      onPanEnd: () => {
        this.viewport.startFling(this.panVel.x, this.panVel.y);
        this.wake();
      },
      onPinchStart: (mx, my, dist) => {
        this.cancelFocus();
        const c = this.screenToContent(mx, my);
        this.pinch = { dist, zoom: this.viewport.zoom, midContentX: c.x, midContentY: c.y };
      },
      onPinch: (mx, my, dist) => {
        const c = this.camPoint(mx, my);
        this.viewport.zoom = clamp((this.pinch.zoom * dist) / this.pinch.dist, this.viewport.minZoom, this.viewport.maxZoom);
        this.viewport.x = c.x - this.pinch.midContentX * this.viewport.zoom;
        this.viewport.y = c.y - this.pinch.midContentY * this.viewport.zoom;
        this.clampView();
        this.applyView();
        this.emitView();
      },

      onHover: (b) => {
        // Трогаем ТОЛЬКО две сменившиеся кнопки (снятую и наведённую), а не перебираем весь список
        // каждый раз: на ПК с десятками кнопок цикл-по-всем при быстром ховере ронял FPS (issue #48).
        // Роутер и так шлёт onHover лишь при смене цели, так что b ≠ hoveredBtn.
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
      afterAny: () => this.wake(),
    };
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
    // Глубину возвращаем НЕ СЕЙЧАС, а по прилёту. Раньше она ставилась сразу, и отпущенная карта
    // весь полёт домой ехала ПОД соседями — ныряла под стопку и выныривала на месте. Физически это
    // бессмыслица: карта в воздухе, а рисуется под теми, что лежат на столе.
    this.landing = this.landing.filter((l) => l.el !== el);
    this.landing.push({ el, z: h.depth });
  }

  /** Кто летит домой и на какую глубину сядет. Разбирается в кадре, по факту приземления. */
  private landing: { el: SceneElement; z: number }[] = [];

  private stepLanding(): boolean {
    if (!this.landing.length) return false;
    const still: { el: SceneElement; z: number }[] = [];
    for (const l of this.landing) {
      if (l.el.dead) continue;
      if (l.el.body.isResting()) l.el.root.zIndex = l.z;
      else still.push(l);
    }
    this.landing = still;
    return false; // сама по себе посадка кадров не требует — её двигают пружины
  }

  // ——————————————————————————————————————————————————————————————————————
  // Цикл кадра
  // ——————————————————————————————————————————————————————————————————————

  protected frame(dt: number): boolean {
    this.input.tick(dt); // «держи-чтобы-тащить»: копит heldFor, сама решает, когда повысить press → drag
    this.edgeScroll(dt);
    const camMoving = this.stepCamTween(dt); // наведение камеры на зону: не спим, пока не доедет
    if (this.viewport.flinging) {
      this.syncVp();
      this.viewport.stepFling(dt);
      this.applyView();
      this.emitView();
    }
    let moving = this.input.gesture !== "none" || this.viewport.flinging || camMoving;
    if (this.stepPendingFlips(dt)) moving = true;
    if (this.stepTimers(dt)) moving = true;
    for (const el of this.everyElement()) {
      el.step(dt);
      if (!el.resting) moving = true;
    }
    // ПОСЛЕ шага элементов, а не до него. Пока посадка разбиралась первой, она читала состояние
    // ПРОШЛОГО кадра: в тот кадр, когда карта долетала, цикл видел «все успокоились» и засыпал —
    // следующего кадра не было, и глубина так и оставалась драговой (1e6). Карта возвращалась
    // домой, но продолжала лежать поверх всей стопки.
    this.stepLanding();
    this.reapDead();
    for (const b of this.buttons) {
      b.step(dt);
      if (!b.resting) moving = true;
    }
    for (const b of this.chromeButtons) {
      b.step(dt);
      if (!b.resting) moving = true;
    }
    if (this.peeking.size > 0) {
      moving = true; // держим тикер живым, иначе на успокоившейся сцене отсчёт показа замрёт
      for (const [id, p] of this.peeking) {
        p.t += dt;
        // Истёк показ: вернуть КАК БЫЛО. Держат элемент (grabbed) — restore лишь возвращает вид,
        // элемент остаётся в драге; не держат — отпускаем домой обычным releaseElement.
        if (p.t >= PEEK_DUR) this.endPeek(id, !p.grabbed);
      }
    }
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
  protected stepScene(_dt: number): boolean {
    return false;
  }

  /** Убрать догоревшие/лишние элементы из своих списков. Опц. */
  protected reapDead(): void {}

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
    for (const m of this.markers) m.update();
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
    this.peeking.clear();
    this.input.reset();
  }

  protected onTeardown(app: Application): void {
    app.canvas.removeEventListener("wheel", this.onWheel);
    this.chromeButtons = []; // сам HUD сносится вместе с app; список — чтобы не держать мёртвые узлы
    this.resetSceneState();
  }
}

/** Перевернуть, если элемент это умеет. Способность, а не тип: фишка не Flippable — и не перевернётся. */
function requestFlipOf(el: SceneElement): void {
  const f = el as unknown as { requestFlip?: () => boolean };
  f.requestFlip?.();
}
