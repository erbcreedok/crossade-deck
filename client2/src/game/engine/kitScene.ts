import { Application, Container } from "pixi.js";
import { SceneEngine, type CameraConfig, type SceneElement } from "./sceneEngine";
import { CardTextureCache } from "../ui/CardTextureCache";
import { SANDBOX_CARD_H, TEX_H } from "./constants";
import { SB_MARGIN } from "./sandboxLayout";
import type { Button } from "../ui/Button";
import type { DropZone } from "../ui/DropZone";
import type { DragPayload } from "./drag";
import type { TableElement } from "./element";
import { extentOf, fitZoom } from "./kitExtent";

// ВИТРИНА ОДНОГО КОМПОНЕНТА на общей обвязке стола.
//
// Сцена для каталога (сторибука), но про сторибук она НЕ знает: зависимость односторонняя
// (адаптер → движок), поэтому витрину можно поднять и с обычной страницы, и из e2e. Всё, что
// делает витрину живой — камера, ввод, драг, дроп-зоны, «подглядеть», слитые тени — приходит из
// SceneEngine даром. Здесь только реестр расставленных элементов и пересборка содержимого.
//
// Почему витрины сидят на ПОЛНОЦЕННОМ движке сцены, а не на упрощённом статичном хосте: иначе
// раздел «механики» показывал бы картинку вместо поведения, а картинка не доказывает, что драг
// работает (docs/HANDOFF.md: тест «нелегальный дроп ничего не изменил» даёт тот же результат,
// что и полностью неработающий драг).

interface Pt {
  x: number;
  y: number;
}

/** Что витрине доступно при сборке. Намеренно узкий: стори РАССТАВЛЯЕТ, а не строит (см. ниже). */
export interface KitContext {
  readonly app: Application;
  /** Общий кэш текстур. Переживает rebuild — иначе текстуры перепекались бы на каждое переключение. */
  readonly tex: CardTextureCache;
  /** Масштаб карты витрины относительно исходной текстуры — тот же приём, что в песочнице. */
  readonly baseScale: number;
  /**
   * Поле витрины. Содержимое живёт в ПОЛОЖИТЕЛЬНОЙ четверти, (0,0) — левый верхний угол (та же
   * условность, что в песочнице): камера раскладывает контент в [0..w]×[0..h] и всё, что левее
   * или выше нуля, обрезает. Элемент прибит за ЦЕНТР, поэтому одиночный ставится в
   * `{ x: padding + hw, y: padding + hh }` — для этого padding и торчит наружу.
   */
  readonly padding: number;
  /** Поставить элемент: дом + глубина + учёт в хит-тесте, цикле, тенях и реестре по id. */
  add<T extends SceneElement>(el: T, home: Pt, depth?: number): T;
  /** Недрагабельный визуал: подпись, рамка, декор. */
  decor(node: Container, layer?: "surface" | "verb"): void;
  /** Кнопка: рисуется в слой стола, ввод роутит движок (сама она событий не слушает). */
  button(b: Button, at: Pt): Button;
  /** Дроп-зона с приёмом по СПОСОБНОСТЯМ груза (см. sceneEngine.registerZone). */
  zone(
    z: DropZone,
    onDrop: (p: DragPayload) => void,
    accepts: (p: DragPayload) => boolean,
    textFor?: (p: DragPayload) => { armed: string; hot: string },
  ): DropZone;
  /** Задать габарит витрины явно. Не задан — считается по краям расставленных элементов. */
  extent(w: number, h: number): void;
}

export type KitBuild = (ctx: KitContext) => void;

export interface KitSceneOptions {
  cardHeight?: number;
  camera?: CameraConfig;
  padding?: number;
  /** Вписать витрину в экран зумом при сборке (дефолт true — витрина должна быть видна целиком). */
  fitOnBuild?: boolean;
}

interface Placed {
  el: SceneElement;
  home: Pt;
  depth: number;
}

export class KitScene extends SceneEngine {
  private tex!: CardTextureCache;
  private placed: Placed[] = [];
  private decors: Container[] = [];
  private ownZones: DropZone[] = [];
  private pending: KitBuild | null = null;
  private explicitExtent: { w: number; h: number } | null = null;

  private readonly cardHeight: number;
  private readonly padding: number;
  private readonly fitOnBuild: boolean;

  constructor(opts: KitSceneOptions = {}) {
    // Камера по центру, а не по левой опоре: витрина — один компонент, ему уместно стоять
    // посередине. У песочницы align:"left", потому что там вертикальная лента секций.
    super({ align: "center", ...(opts.camera ?? {}) });
    this.cardHeight = opts.cardHeight ?? SANDBOX_CARD_H;
    this.padding = opts.padding ?? SB_MARGIN;
    this.fitOnBuild = opts.fitOnBuild ?? true;
  }

  /** Ключ пула: витрины с разными опциями не должны переиспользовать друг друга. */
  static key(o: KitSceneOptions = {}): string {
    return JSON.stringify([o.cardHeight ?? SANDBOX_CARD_H, o.padding ?? SB_MARGIN, o.fitOnBuild ?? true, o.camera ?? null]);
  }

  /** Что собрать при ближайшем boot. Зовётся ДО mount (сцена ещё не поднята). */
  setBuild(build: KitBuild): void {
    this.pending = build;
  }

  /**
   * Пересобрать СОДЕРЖИМОЕ витрины. Pixi-приложение и WebGL-контекст при этом живут дальше —
   * именно это и позволяет одному канвасу обслуживать все стори.
   */
  rebuild(build: KitBuild): void {
    this.pending = build;
    if (!this.app) return; // ещё не смонтированы — соберётся на boot
    this.clearContent();
    this.runBuild(this.app);
    this.afterBuild();
  }

  element(id: string): SceneElement | undefined {
    return this.byId.get(id);
  }

  /** Разбудить цикл после ВНЕШНЕЙ правки элемента (живой сеттер из панели контролов). Без этого
   *  спящий тикер оставил бы на экране прежний кадр, и контрол выглядел бы неработающим. */
  poke(): void {
    this.render();
    this.wake();
  }

  // ——————————————————————————————————————————————————————————————————————
  // Сборка
  // ——————————————————————————————————————————————————————————————————————

  protected buildScene(app: Application): void {
    this.tex = new CardTextureCache(app);
    this.runBuild(app);
  }

  protected onBooted(): void {
    this.afterBuild();
    super.onBooted();
  }

  private runBuild(app: Application): void {
    this.explicitExtent = null;
    const ctx: KitContext = {
      app,
      tex: this.tex,
      baseScale: this.cardHeight / TEX_H,
      padding: this.padding,
      add: (el, home, depth = 0) => {
        this.placed.push({ el, home, depth });
        this.byId.set(el.id, el);
        // Доступность и профиль качества — забота движка, а не автора витрины: иначе каждая
        // стори забывала бы их пробросить, и каталог врал бы про reduce-motion.
        const flags = el as unknown as { reduceMotion?: boolean; flashOff?: boolean; lowFx?: boolean };
        if ("reduceMotion" in el) flags.reduceMotion = this.reduceMotion;
        if ("flashOff" in el) flags.flashOff = this.flashOff;
        if ("lowFx" in el) flags.lowFx = this.lowFx;
        // Ставим СРАЗУ на место (snapTo), а не пружиной: витрина открывается уже собранной,
        // а не съезжается на глазах из угла.
        el.body.snapTo({ x: home.x, y: home.y, rot: 0, scale: el.restScale });
        el.root.zIndex = depth;
        this.placeCard(el);
        return el;
      },
      decor: (node, layer = "surface") => {
        this.decors.push(node);
        (layer === "verb" ? this.scene.verb : this.scene.surface).addChild(node);
      },
      button: (b, at) => {
        b.place(at.x, at.y);
        this.scene.surface.addChild(b.root);
        this.buttons.push(b);
        return b;
      },
      zone: (z, onDrop, accepts, textFor) => {
        this.registerZone(z, onDrop, accepts, textFor);
        this.ownZones.push(z);
        return z;
      },
      extent: (w, h) => void (this.explicitExtent = { w, h }),
    };
    this.pending?.(ctx);
  }

  // Габарит и вписывание — после сборки, когда элементы уже расставлены.
  private afterBuild(): void {
    const e =
      this.explicitExtent ??
      extentOf(
        this.placed.map((p) => ({ x: p.home.x, y: p.home.y, hw: p.el.footprint.hw, hh: p.el.footprint.hh })),
        this.padding,
      );
    this.contentW = e.w;
    this.contentH = e.h;
    this.syncVp();
    if (this.fitOnBuild) this.viewport.setZoom(fitZoom(e, { w: this.width, h: this.height }, MIN_KIT_ZOOM, MAX_KIT_ZOOM));
    this.clampView();
    this.applyView();
    this.render();
    this.wake();
  }

  // Снос СОДЕРЖИМОГО (не приложения). Повторяет путь PlaygroundEngine.clearContent: сначала свои
  // узлы, потом слои сцены, потом общее состояние ввода/драга/зон. Второй путь сноса тут заводить
  // нельзя — разъедется с базовым и утечёт узлами.
  private clearContent(): void {
    for (const p of this.placed) p.el.root.destroy({ children: true });
    this.placed = [];
    for (const d of this.decors) d.destroy({ children: true });
    this.decors = [];
    this.ownZones = [];
    this.scene.surface.removeChildren().forEach((c) => c.destroy());
    this.scene.verb.removeChildren().forEach((c) => c.destroy());
    this.scene.clearCards(this.contentW, this.contentH);
    this.resetSceneState();
  }

  protected onTeardown(app: Application): void {
    this.clearContent();
    this.tex?.destroy();
    super.onTeardown(app);
  }

  // ——————————————————————————————————————————————————————————————————————
  // Обязательные швы сцены
  // ——————————————————————————————————————————————————————————————————————

  protected draggables(): SceneElement[] {
    return this.placed.map((p) => p.el);
  }

  protected everyElement(): TableElement[] {
    return this.placed.map((p) => p.el);
  }

  protected homeOf(el: SceneElement): { home: Pt; depth: number } | null {
    const p = this.placed.find((q) => q.el === el);
    return p ? { home: p.home, depth: p.depth } : null;
  }

  protected reapDead(): void {
    const alive = this.placed.filter((p) => !p.el.dead);
    if (alive.length === this.placed.length) return;
    for (const p of this.placed) if (p.el.dead) this.byId.delete(p.el.id);
    this.placed = alive;
  }

  /** Для проверки руками и из e2e — как __fd у песочницы: канвас не отдаёт ни DOM, ни ролей. */
  testHooks(): {
    elements: { id: string; x: number; y: number; state: string; faceUp: boolean | null; concealed: boolean | null }[];
    zones: Record<string, { x: number; y: number; hot: boolean; armed: boolean }>;
    buttons: { label: string; x: number; y: number }[];
    extent: { w: number; h: number };
    zoom: number;
  } {
    const zones: Record<string, { x: number; y: number; hot: boolean; armed: boolean }> = {};
    for (const z of this.ownZones) {
      const s = this.contentToScreen(z.rect.x + z.rect.w / 2, z.rect.y + z.rect.h / 2);
      // Состояние читаем по ВИДИМОСТИ подписей — тем же способом, что песочница (её testHooks
      // делают ровно так): у зоны нет флагов наружу, а видимый глагол и есть «зона горит».
      zones[z.label] = { x: s.x, y: s.y, hot: z.verb.visible, armed: z.armedText?.visible ?? false };
    }
    return {
      elements: this.placed.map((p) => {
        const s = this.contentToScreen(p.el.body.px, p.el.body.py);
        // faceUp/concealed — не у всякого элемента (фишка их не знает), поэтому по способностям,
        // а не по типу. Без них «доска изменилась» пришлось бы доказывать глазами по скриншоту.
        const e = p.el as unknown as { faceUp?: boolean; concealed?: boolean };
        return {
          id: p.el.id,
          x: s.x,
          y: s.y,
          state: p.el.state,
          faceUp: typeof e.faceUp === "boolean" ? e.faceUp : null,
          concealed: typeof e.concealed === "boolean" ? e.concealed : null,
        };
      }),
      zones,
      buttons: this.buttons.map((b) => {
        const s = this.contentToScreen(b.x, b.y);
        return { label: b.labelText, x: s.x, y: s.y };
      }),
      extent: { w: this.contentW, h: this.contentH },
      zoom: this.viewport.zoom,
    };
  }
}

// Пределы зума витрины шире, чем у стола: компонент рассматривают вплотную (пиксели рубашки,
// кромка карты), и упереться в потолок камеры игры тут было бы обидно.
const MIN_KIT_ZOOM = 0.4;
const MAX_KIT_ZOOM = 4;
