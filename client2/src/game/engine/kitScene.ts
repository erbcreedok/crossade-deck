import { Application, Container } from "pixi.js";
import { SceneEngine, type CameraConfig, type SceneElement } from "./sceneEngine";
import { CardTextureCache } from "../ui/CardTextureCache";
import { Card } from "../ui/Card";
import { Piece } from "../ui/Piece";
import { pieceVisual } from "../ui/pieceKinds";
import { SANDBOX_CARD_H, TEX_H, TEX_W } from "./constants";
import { SB_MARGIN } from "./sandboxLayout";
import type { Button } from "../ui/Button";
import type { DropZone } from "../ui/DropZone";
import type { TableElement } from "./element";
import { GroupDrag, SingleDrag } from "./drag";
import type { MarkerHost, MarkerState } from "./marker";
import type { Command } from "./command";
import { gripConfig } from "../kit/markerIcons";
import { attachControls } from "../ui/controls";
import { makeLabel, type SectionContext } from "../kit/context";
import { extentOf, fitZoom } from "./kitExtent";
import { kitSceneKey, type KitSceneOptions } from "./kitSceneKey";

export type { KitSceneOptions };

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

/**
 * Что витрине доступно при сборке. Намеренно узкий: стори РАССТАВЛЯЕТ, а не строит (см. ниже).
 *
 * Расширяет SectionContext (kit/context.ts) — общий контракт витрины и песочницы. Ровно из-за него
 * стори может позвать НАСТОЯЩУЮ секцию стенда (kit/buttons.ts и т.п.), а не её копию: обе сцены
 * умеют одно и то же, различаясь лишь тем, куда именно ложится узел.
 */
export interface KitContext extends SectionContext {
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
  /** Задать габарит витрины явно. Не задан — считается по краям расставленных элементов. */
  extent(w: number, h: number): void;
}

export type KitBuild = (ctx: KitContext) => void;


interface Placed {
  el: SceneElement;
  home: Pt;
  depth: number;
  /** Двигается командами, а не пальцем (ctx.apiCard) — из хит-теста драга исключена. */
  api?: boolean;
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

  /** Ключ пула. Реализация и её ОБРАТНАЯ сторона — в kitSceneKey.ts (там же тест обратимости). */
  static key(o: KitSceneOptions = {}): string {
    return kitSceneKey(o);
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

  /** Кнопка витрины по порядку постановки. У Button нет id — адресовать её иначе нечем, а живые
   *  правки из панели («подпись», «недоступна») применяются именно к экземпляру. */
  button(i = 0): Button | undefined {
    return this.buttons[i];
  }

  /**
   * Исполнить команду управления доской. Тот же порт команд, что у песочницы (engine/command.ts):
   * витрина обязана дёргать ИМЕННО его, иначе раздел «Управление» показывал бы обход двери, а не
   * саму дверь.
   */
  dispatch(cmd: Command): void {
    const el = this.byId.get(cmd.id);
    if (!el) return;
    switch (cmd.t) {
      case "flip":
        if ("requestFlip" in el && !(el as unknown as { requestFlip(): boolean }).requestFlip()) return;
        break;
      case "move":
        el.body.setTarget({ x: cmd.x, y: cmd.y, rot: 0 });
        break;
      case "conceal":
        if ("setConcealed" in el) (el as unknown as { setConcealed(v: boolean): void }).setConcealed(cmd.v);
        break;
      case "setValue":
        if ("setValue" in el) (el as unknown as { setValue(v: string): void }).setValue(cmd.value);
        break;
    }
    this.wake();
  }

  /** Состояние цели для меток: сколько её элементов живо и сколько стоит дома (не в драге). */
  private presence(ids: readonly string[]): MarkerState {
    let atHome = 0;
    let total = 0;
    for (const id of ids) {
      const el = this.byId.get(id);
      if (!el) continue; // уничтожен/сгорел
      total++;
      if (el.state !== "drag") atHome++;
    }
    return { atHome, total };
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
    const baseScale = this.cardHeight / TEX_H;
    const ctx: KitContext = {
      app,
      tex: this.tex,
      baseScale,
      cardW: TEX_W * baseScale,
      cardH: this.cardHeight,
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
      label: (text, x, y, size, fill, wrap, anchorX, layer = "surface") => {
        const t = makeLabel(text, x, y, size, fill, wrap, anchorX);
        this.decors.push(t);
        (layer === "verb" ? this.scene.verb : this.scene.surface).addChild(t);
        return t;
      },
      // Витрина рождает карту СРАЗУ (в отличие от песочницы с её отложенными спеками): слои
      // разведены контейнерами, так что подписи под картой не окажутся, в каком бы порядке
      // секция ни строилась.
      card: (opts, home, depth = 0, bobPhase = 0) => {
        const c = new Card(opts, this.tex, baseScale);
        c.bobPhase = bobPhase;
        ctx.add(c, home, depth);
      },
      // Карта под управлением API: в реестре и в цикле она есть, в хит-тесте драга — нет.
      apiCard: (opts, home) => {
        const c = new Card({ ...opts, rest: opts.rest ?? "idle" }, this.tex, baseScale);
        ctx.add(c, home);
        const last = this.placed[this.placed.length - 1];
        if (last) last.api = true;
      },
      dispatch: (cmd) => this.dispatch(cmd),
      piece: (id, home, spec, r, depth = 0) => {
        const { build, shadow } = pieceVisual(spec, r);
        ctx.add(new Piece({ id, w: r * 2, h: r * 2, build, shadow }), home, depth);
      },
      // Метки. Механизм — общий (SceneEngine.mountMarkers), «как выглядит грип» — общее с
      // песочницей (kit/markerIcons). Витрина отличается только тем, что груз собирается прямо
      // из своего реестра: никаких стопок-объектов у неё нет, есть список id.
      solo: (id, slot, anchor) => {
        const host: MarkerHost = {
          slotPos: () => slot,
          state: () => this.presence([id]),
          makePayload: (cp) => {
            const el = this.byId.get(id);
            return el ? new SingleDrag(el, this.dragCtx, cp) : null;
          },
        };
        return { ...this.mountMarkers(host, () => this.byId.get(id) ?? null, gripConfig(this.cardHeight), anchor), host };
      },
      pile: (ids, slot, anchor) => {
        const host: MarkerHost = {
          slotPos: () => slot,
          state: () => this.presence(ids),
          makePayload: (cp) => {
            const els = ids.map((i) => this.byId.get(i)).filter((e): e is SceneElement => !!e);
            // «Врассыпную»: пачка сохраняет свою форму относительно пальца. Сжатие в руку — рычаг
            // песочницы (dragSqueeze), у витрины его нет и притворяться нечем.
            return els.length ? new GroupDrag(els, els.map((e) => ({ dx: e.body.px - cp.x, dy: e.body.py - cp.y })), this.dragCtx) : null;
          },
        };
        return { ...this.mountMarkers(host, () => this.byId.get(ids[ids.length - 1] ?? "") ?? null, gripConfig(this.cardHeight), anchor), host };
      },
      button: (b, at) => {
        if (at) b.place(at.x, at.y);
        this.scene.surface.addChild(b.root);
        this.buttons.push(b);
        return b;
      },
      zone: (z, onDrop, accepts, textFor) => {
        this.registerZone(z, onDrop, accepts, textFor);
        this.ownZones.push(z);
        return z;
      },
      needsPeek: (el) => this.needsPeek(el),
      controls: (cfg, at, onChange) =>
        attachControls(
          cfg,
          {
            layer: this.scene.surface,
            register: (b) => {
              this.scene.surface.addChild(b.root);
              this.buttons.push(b);
            },
            onChange: onChange ?? (() => this.wake()),
          },
          at,
        ),
      wake: () => this.wake(),
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
    this.clearMarkers();
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
    return this.placed.filter((p) => !p.api).map((p) => p.el);
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
    /** Экранные центры меток-грипов. Метка — не элемент и не кнопка; без этого за неё не потянуть
     *  ни руками из консоли, ни из e2e: у канваса нет ни узлов, ни ролей. */
    grips: { x: number; y: number; interactive: boolean }[];
    /** ВСЕ метки (грипы и якоря) с габаритом рисунка и видимостью. Габарит нужен, чтобы отличить
     *  ОДНУ иконку от другой: сравнение кадров тут не работает — карты стенда левитируют, и кадр
     *  отличается сам по себе, что бы ни поменялось. */
    markers: { x: number; y: number; w: number; h: number; shown: boolean; interactive: boolean }[];
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
      grips: this.grabbers.map((g) => {
        const s = this.contentToScreen(g.marker.gfx.position.x, g.marker.gfx.position.y);
        return { x: s.x, y: s.y, interactive: g.marker.interactive };
      }),
      markers: this.markers.map((m) => {
        const s = this.contentToScreen(m.gfx.position.x, m.gfx.position.y);
        const b = m.gfx.getLocalBounds();
        return { x: s.x, y: s.y, w: Math.round(b.width), h: Math.round(b.height), shown: m.shown(), interactive: m.interactive };
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
