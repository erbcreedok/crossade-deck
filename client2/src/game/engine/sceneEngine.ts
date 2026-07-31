import { Application, Container, Rectangle } from "pixi.js";
import { CanvasApp } from "./canvasApp";
import { SceneLayers, levelOf } from "./sceneLayers";
import { Viewport, type ViewState } from "./viewport";
import { InputRouter, type InputHandlers } from "./inputRouter";
import { SingleDrag, type DragContext, type DragPayload } from "./drag";
import { topmostAt, type HitBox } from "./cardHit";
import { Button } from "../ui/Button";
import { Card, type RestState } from "../ui/Card";
import { Piece } from "../ui/Piece";
import type { DropZone } from "../ui/DropZone";
import type { Draggable, Peekable, TableElement } from "./element";

// ОБЩАЯ ОБВЯЗКА СЦЕНЫ — слой между тонким Host'ом (CanvasApp: Pixi, тикер, ресайз) и конкретной
// сценой (песочница, Косынка, будущие игры). Здесь живёт всё, что у любой сцены со столом ОДИНАКОВО
// и потому не должно писаться заново:
//
//   • полотно контента + слои сцены (SceneLayers) и раскладка элементов по планам;
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
// Почему это вынесено (SOLITAIRE-REBUILD-HANDOFF §3): пасьянс, написанный ДО общего слоя, оброс
// собственным разбором pointer-событий, своей камерой и своим драгом — параллельной реализацией
// вместо переиспользования. Общий слой закрывает саму возможность повторить это.

export type { ViewState };

/** Элемент сцены: база TableElement + драгабельность + геометрия покоя (для хит-теста и возврата). */
export type SceneElement = TableElement &
  Draggable & {
    readonly rest: RestState;
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
  onDrop: (p: DragPayload) => void;
  accepts: (p: DragPayload) => boolean;
  textFor?: (p: DragPayload) => { armed: string; hot: string };
}

/** Настройки камеры сцены. Умолчания — ровно те, на которых откатана песочница: контрол и жесты
 *  обязаны совпадать во всех сценах, поэтому расходиться тут можно только осознанно. */
export interface CameraConfig {
  minZoom?: number;
  maxZoom?: number;
  margin?: number;
  align?: "left" | "center";
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
    flipGroup: (els) => this.flipGroup(els),
    startPeek: (els) => this.startPeek(els),
  };

  // ——— дроп-зоны ———
  protected zones: ZoneReg[] = [];

  // ——— «подглядеть» ———
  // id → сессия показа. undo — замыкание из Peekable.peekReveal, возвращающее элемент КАК БЫЛО:
  // reveal и restore одной парой, рассинхрону неоткуда взяться. grabbed — показанный элемент
  // перехватили повторным драгом; тогда восстановление ждёт КОНЦА драга или истечения PEEK_DUR.
  protected peeking = new Map<string, { el: SceneElement; undo: () => void; t: number; grabbed: boolean }>();

  /** Лёгкий профиль качества (issue #8): выключает shadow-пасс и замораживает idle у карт. */
  protected lowFx = false;

  constructor(cam: CameraConfig = {}) {
    super();
    this.viewport = new Viewport(cam.minZoom ?? MIN_ZOOM, cam.maxZoom ?? MAX_ZOOM, cam.margin ?? 24, cam.align ?? "left");
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

  /** Положить визуал элемента в слой его текущего плана. */
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
    e.preventDefault();
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
    onDrop: (p: DragPayload) => void,
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
    return this.hitElement(cx, cy);
  }

  /** Можно ли тащить. По умолчанию — собственная драгабельность элемента. */
  protected canDrag(el: SceneElement): boolean {
    return el.draggable;
  }

  /** Начать драг. По умолчанию — обычный SingleDrag за одну карту. Переопределяют, чтобы тащить
   *  пачку/набор; вернуть true — «драг заведён сам», false — база заводит SingleDrag. */
  protected beginDrag(el: SceneElement, cp: Pt, _sp: Pt): boolean {
    this.drag = new SingleDrag(el, this.dragCtx, cp);
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

  /** Груз проехал в точку p (метки, раздвигание соседей, ховер-подсказки грида). Опц. */
  protected onDragMoved(_p: Pt): void {}

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
    zone?.onDrop(drag);
    if (!drag.consumed) drag.release();
  }

  /** Драг прерван (второй палец/уход указателя) — свернуть свои подсказки. Опц. */
  protected onDragCancel(): void {}

  /** Конец любого драга — снять свои временные состояния (метки и т.п.). Опц. */
  protected afterDragEnd(): void {}

  /** Тапнули по недрагабельному элементу. По умолчанию — «стоп»-кивок. */
  protected onElementBlocked(el: SceneElement): void {
    el.blockNudge();
  }

  /** Перевернуть пачку целиком (реверс слотов + синхронный флип). По умолчанию — не умеем. */
  protected flipGroup(_els: readonly TableElement[]): void {}

  // Хит-тесты и реакции на жесты. Стейт-машина — в InputRouter, домен — в швах выше.
  private inputHandlers(): InputHandlers<SceneElement, Button> {
    return {
      screenToContent: (sx, sy) => this.screenToContent(sx, sy),
      pickCard: (cx, cy) => this.pickElement(cx, cy),
      cardDraggable: (el) => this.canDrag(el),
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
    el.setState(el.rest); // возврат в СВОЙ план покоя (стол / левитация / удержание)
    el.root.zIndex = h.depth; // и на свою глубину — не поверх соседей по стопке
    this.placeCard(el);
    el.body.setTarget({ x: h.home.x, y: h.home.y, rot: 0 });
  }

  // ——————————————————————————————————————————————————————————————————————
  // Цикл кадра
  // ——————————————————————————————————————————————————————————————————————

  protected frame(dt: number): boolean {
    this.edgeScroll(dt);
    if (this.viewport.flinging) {
      this.syncVp();
      this.viewport.stepFling(dt);
      this.applyView();
      this.emitView();
    }
    let moving = this.input.gesture !== "none" || this.viewport.flinging;
    for (const el of this.everyElement()) {
      el.step(dt);
      if (!el.resting) moving = true;
    }
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

  /** Досинхронизировать свои визуалы (метки, индикаторы) перед теневым пассом. Опц. */
  protected renderScene(): void {}

  // ——— флаги доступности: одинаково во всех сценах ———

  /** Пробросить reduce-motion в каждую живую Card (Piece декоративных циклов не имеет). */
  protected onReduceMotionChange(v: boolean): void {
    for (const el of this.everyElement()) if (el instanceof Card) el.reduceMotion = v;
  }

  /** Пробросить «без вспышек» (issue #9) — гасит дрожь «сжечь» и у Card, и у Piece. */
  protected onFlashChange(v: boolean): void {
    for (const el of this.everyElement()) if (el instanceof Card || el instanceof Piece) el.flashOff = v;
  }

  /** Профиль качества (issue #8): reduced замораживает idle каждой Card и гасит shadow-пасс. */
  protected onProfileChange(p: "full" | "reduced"): void {
    this.lowFx = p === "reduced";
    for (const el of this.everyElement()) if (el instanceof Card) el.lowFx = this.lowFx;
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
