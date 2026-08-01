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
import { makeLabel, type Pt, type SectionContext } from "../kit/context";
import { extentOf, fitZoom, MAX_FIT_ZOOM, MAX_KIT_ZOOM, MIN_FIT_ZOOM } from "./kitExtent";
import type { AnimPreset } from "../anim/presets";
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
  /** Экранная глубина: слой автора (`depth`) плюс порядок постановки. См. zOf. */
  z: number;
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
  /**
   * Из чего был сделан каждый элемент. Переживает смерть владельца — в этом весь смысл.
   *
   * Догоревшая карта помечается `dead` и выбывает из реестра (`reapDead`) — это верное поведение
   * стола, гнуть его нельзя. Но тогда «восстановить уничтоженное» становится невозможным в
   * принципе: восстанавливать не из чего, спека жила в замыкании сборки и умерла вместе с картой.
   * Поэтому спеки хранятся отдельно и чистятся только при пересборке содержимого.
   */
  private specs = new Map<string, () => void>();
  /** Элементы, поставленные текущей сборкой: им проигрывается появление, когда сборка закончится. */
  private fresh: SceneElement[] = [];

  /**
   * Слушатель габарита — зовётся после каждой сборки. Нужен хосту: высоту канваса задаёт DOM, а
   * сколько места витрине НА САМОМ ДЕЛЕ нужно, знает только сцена. Без этого стори с одной
   * кнопкой печаталась во весь экран, и 90% канваса было пустым сукном.
   */
  onExtent: ((e: { w: number; h: number }) => void) | null = null;

  private readonly cardHeight: number;
  private readonly padding: number;
  private readonly fitOnBuild: boolean;

  constructor(opts: KitSceneOptions = {}) {
    // Камера по центру, а не по левой опоре: витрина — один компонент, ему уместно стоять
    // посередине. У песочницы align:"left", потому что там вертикальная лента секций.
    //
    // margin: 0 — тоже не косметика. Верхний отступ камеры (24 по умолчанию) осмыслен там, где
    // контент выше экрана и его прижимают к верху: у песочницы. У витрины поле СВОЁ (`padding`) и
    // уже сидит внутри габарита — вторая рамка поверх него только сдвигала содержимое вниз, ровно
    // на столько же срезая его снизу. Кнопка от этого стояла не по центру.
    // Пределы зума — СВОИ, а не игровые. Игровая камера не опускается ниже 0.6, и это верно для
    // стола: там незачем разглядывать поле с высоты птичьего полёта. Витрине же приходится
    // вписывать широкую секцию в узкий экран телефона, и пол 0.6 не давал этого сделать —
    // `fitZoom` честно считал 0.39, а `viewport.setZoom` молча поднимал его обратно до 0.6, и
    // витрина обрезалась по обоим краям без всякого признака, что часть её потеряна.
    super({ align: "center", margin: 0, minZoom: MIN_FIT_ZOOM, maxZoom: MAX_KIT_ZOOM, ...(opts.camera ?? {}) });
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

  /**
   * Экран сменился — вписать витрину заново. Раскладка от него не зависит (содержимое живёт в
   * своих координатах), а вот ЗУМ зависит целиком: без этого хост, ужатый под габарит, оставался
   * бы с зумом, посчитанным по прежней высоте, и картинка не совпадала бы с рамкой.
   */
  protected override onSceneResize(w: number, h: number): void {
    if (!this.fitOnBuild) return;
    this.viewport.setZoom(fitZoom({ w: this.contentW, h: this.contentH }, { w, h }, MIN_FIT_ZOOM, MAX_FIT_ZOOM));
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
        // Через СТИЛЬ, а не setTarget: «как элемент летит» — свойство фила, и решать это должен
        // пресет, а не место вызова. spring отдаёт движение пружинам, то есть прежнее поведение.
        el.body.travelTo({ x: cmd.x, y: cmd.y }, ((el as unknown as { animPreset?: AnimPreset }).animPreset ?? this.preset).move.style, this.preset.speed);
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
        const z = zOf(depth, this.placed.length);
        this.placed.push({ el, home, z });
        this.byId.set(el.id, el);
        // Доступность и профиль качества — забота движка, а не автора витрины: иначе каждая
        // стори забывала бы их пробросить, и каталог врал бы про reduce-motion.
        const flags = el as unknown as { reduceMotion?: boolean; flashOff?: boolean; lowFx?: boolean };
        if ("reduceMotion" in el) flags.reduceMotion = this.reduceMotion;
        if ("flashOff" in el) flags.flashOff = this.flashOff;
        if ("lowFx" in el) flags.lowFx = this.lowFx;
        // Фил анимаций — тоже забота движка, а не автора витрины: иначе каждая стори забывала бы
        // его пробросить, и половина стола жила бы по одному пресету, половина по другому.
        (el as unknown as { setAnimPreset?: (a: AnimPreset) => void }).setAnimPreset?.(this.preset);
        // Появление НЕ запускаем здесь: секция назначает пресет уже после того, как расставила
        // элементы (ctx.setAnimPreset), и появление, начатое на постановке, играло бы базовым
        // филом — то есть рычаг «стиль появления» выглядел бы неработающим. Копим и запускаем
        // после сборки, когда пресеты уже розданы.
        this.fresh.push(el);
        // Ставим СРАЗУ на место (snapTo), а не пружиной: витрина открывается уже собранной,
        // а не съезжается на глазах из угла.
        el.body.snapTo({ x: home.x, y: home.y, rot: home.rot ?? 0, scale: el.restScale });
        el.root.zIndex = z;
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
        if (opts.id) this.specs.set(opts.id, () => ctx.card(opts, home, depth, bobPhase));
        const c = new Card(opts, this.tex, baseScale);
        c.bobPhase = bobPhase;
        ctx.add(c, home, depth);
      },
      // Карта под управлением API: в реестре и в цикле она есть, в хит-тесте драга — нет.
      apiCard: (opts, home) => {
        const c = new Card({ ...opts, pose: opts.pose ?? "rest" }, this.tex, baseScale);
        ctx.add(c, home);
        const last = this.placed[this.placed.length - 1];
        if (last) last.api = true;
      },
      dispatch: (cmd) => this.dispatch(cmd),
      piece: (id, home, spec, r, depth = 0, plan = {}) => {
        this.specs.set(id, () => ctx.piece(id, home, spec, r, depth, plan));
        const { build, shadow } = pieceVisual(spec, r);
        ctx.add(new Piece({ id, w: r * 2, h: r * 2, build, shadow, ...plan }), home, depth);
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
      element: (id) => this.byId.get(id),
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
      flipStack: (ids) => {
        const els = ids.map((id) => this.byId.get(id)).filter((e): e is SceneElement => !!e);
        if (els.length === ids.length) this.flipGroup(els);
      },
      setAnimPreset: (ids, preset) => {
        for (const id of ids) (this.byId.get(id) as unknown as { setAnimPreset?: (a: AnimPreset) => void } | undefined)?.setAnimPreset?.(preset);
        this.wake();
      },
      appear: (ids) => {
        for (const id of ids) {
          const el = this.byId.get(id) as unknown as { appear?: () => void } | undefined;
          // Живой — проигрываем появление заново. Мёртвого сначала СОБИРАЕМ ЗАНОВО из спеки: без
          // этого «восстановить уничтоженное» упиралось бы в то, что восстанавливать нечего.
          if (el) {
            el.appear?.();
            continue;
          }
          // Мёртвого СОБИРАЕМ ЗАНОВО из спеки и сразу проигрываем ему появление: именно в этот
          // момент анимация и нужна — карта возвращается на стол, а не мигает при загрузке.
          const spec = this.specs.get(id);
          if (!spec) continue;
          spec();
          (this.byId.get(id) as unknown as { appear?: () => void } | undefined)?.appear?.();
          this.fresh = this.fresh.filter((e) => e.id !== id);
        }
        this.wake();
      },
      after: (delay, fn) => this.after(delay, fn),
      moveDuration: (id) => this.moveDuration(id),
      wake: () => this.wake(),
      extent: (w, h) => void (this.explicitExtent = { w, h }),
    };
    this.pending?.(ctx);
  }

  // Габарит и вписывание — после сборки, когда элементы уже расставлены.
  private afterBuild(): void {
    // Появление тут НЕ запускается. Пересборка случается на каждую правку рычага, и карта
    // переявлялась бы по десять раз подряд — шум, который прячет то, ради чего рычаг крутят.
    // Появление — СОБЫТИЕ доски (раздали, вернули, добрали), и запускает его тот, кто его вызвал.
    this.fresh = [];
    const e =
      this.explicitExtent ??
      extentOf(
        this.placed.map((p) => ({ x: p.home.x, y: p.home.y, hw: p.el.footprint.hw, hh: p.el.footprint.hh })),
        this.padding,
      );
    this.contentW = e.w;
    this.contentH = e.h;
    this.syncVp();
    if (this.fitOnBuild) this.viewport.setZoom(fitZoom(e, { w: this.width, h: this.height }, MIN_FIT_ZOOM, MAX_FIT_ZOOM));
    this.clampView();
    this.applyView();
    this.render();
    this.wake();
    this.onExtent?.(e);
  }

  // Снос СОДЕРЖИМОГО (не приложения). Повторяет путь PlaygroundEngine.clearContent: сначала свои
  // узлы, потом слои сцены, потом общее состояние ввода/драга/зон. Второй путь сноса тут заводить
  // нельзя — разъедется с базовым и утечёт узлами.
  private clearContent(): void {
    this.specs.clear();
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

  /** Переставить дом и глубину — реестр витрины знает про них он один (см. flipGroup). */
  protected override setHome(el: SceneElement, home: { x: number; y: number }, depth: number): void {
    const p = this.placed.find((q) => q.el === el);
    if (!p) return;
    p.home = { ...home };
    p.z = depth;
    el.root.zIndex = depth;
    el.body.setTarget({ x: home.x, y: home.y });
  }

  /**
   * Перевернуть пачку по id — публичная дверь к общему `flipGroup`. Нужна каталогу: рычаг «лицом
   * вверх» у стопки обязан быть НАСТОЯЩИМ переворотом, а не пересборкой с другой стороной.
   */
  flipStack(ids: readonly string[]): void {
    const els = ids.map((id) => this.byId.get(id)).filter((e): e is SceneElement => !!e);
    if (els.length === ids.length) this.flipGroup(els);
  }

  /** Тир качества движка. На `reduced` теневой пасс гаснет целиком, idle-анимации замирают. */
  setProfile(p: "full" | "reduced"): void {
    this.onProfileChange(p);
  }

  /** Сменить фил анимаций витрины: сцене — для расписания пачки, картам — для их собственных. */
  setAnimPreset(p: AnimPreset): void {
    this.preset = p;
    for (const q of this.placed) (q.el as unknown as { setAnimPreset?: (a: AnimPreset) => void }).setAnimPreset?.(p);
    this.wake();
  }

  protected homeOf(el: SceneElement): { home: Pt; depth: number } | null {
    const p = this.placed.find((q) => q.el === el);
    return p ? { home: p.home, depth: p.z } : null;
  }

  protected reapDead(): void {
    const alive = this.placed.filter((p) => !p.el.dead);
    if (alive.length === this.placed.length) return;
    for (const p of this.placed) {
      if (!p.el.dead) continue;
      this.byId.delete(p.el.id);
      // УЗЕЛ ТОЖЕ СНОСИМ. Раньше мёртвый элемент выбывал только из реестров, а его Pixi-узел
      // оставался в слое — и последний кадр эффекта («сжечь» доедает карту маской, но не в ноль)
      // навсегда застывал на столе. Отсюда и «артефакт после сжигания»: догорала карта верно,
      // просто её останки никто не убирал.
      p.el.root.destroy({ children: true });
    }
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

/**
 * Глубина элемента витрины — УНИКАЛЬНАЯ, а не «слой, заданный автором».
 *
 * Слой (`depth`) задаёт автор секции, и в столбике фишек он у всех одинаковый — ноль. При равном
 * zIndex порядок решает список детей контейнера, а `place()` кладёт узел через `addChild`, то есть
 * В КОНЕЦ. Поэтому стоило взять фишку и отпустить, как она возвращалась на «свою» глубину — и всё
 * равно оказывалась поверх соседей: возврат ставил ей тот же ноль, а в списке детей она была уже
 * последней. Столбик терял порядок с первого же касания.
 *
 * Порядок постановки добавляется младшими разрядами: слой по-прежнему главнее (секция, положившая
 * что-то на depth 1, останется выше всего с depth 0), но внутри слоя глубина у каждого своя, и
 * возврат домой воспроизводит её точно. Тысяча элементов на слой — потолок, которого ни одна
 * витрина близко не касается.
 */
export function zOf(depth: number, seq: number): number {
  return depth * 1000 + seq;
}
