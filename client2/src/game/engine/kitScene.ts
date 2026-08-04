import { Application, Container } from "pixi.js";
import { SceneEngine, type CameraConfig, type SceneElement, type SpreadSource } from "./sceneEngine";
import { CardTextureCache } from "../ui/CardTextureCache";
import { Card } from "../ui/Card";
import { buildPiece } from "../ui/pieceKinds";
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
import { extentOfPlaced, fitZoom, MAX_FIT_ZOOM, MAX_KIT_ZOOM, MIN_FIT_ZOOM } from "./kitExtent";
import type { AnimPreset } from "../anim/presets";
import { kitSceneKey, type KitSceneOptions } from "./kitSceneKey";
import type { StackLayout, StackOffset } from "../kit/stackLayout";
import { dribbleWobble, pivotFrom, recenterShift, spreadInput, spreadOffsetAt, spreadTick, wobbleOffset, DEFAULT_SPREAD_SENSITIVITY, SPREAD_STATE0, type PieceDrag, type DragTrigger, type SpreadConfig, type SpreadState, type StackDrag } from "../kit/stackInteraction";

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
  /**
   * Включить СПРЕД у стопки: горизонтальный раздвиг жестом (kit/stackInteraction.ts — spread.*Trigger
   * решает, каким устройством) поверх базовой раскладки. Матчасть там же — чистая, без Pixi; тут
   * только регистрация записи, шаг и приём жеста живут в самой сцене (spreadOnElement/stepScene).
   */
  spreadStack(ids: string[], at: Pt, layout: StackLayout, cell: { w: number; h: number }, cfg: SpreadConfig): void;
  /**
   * Включить ДРАГ КАРТ и/или ДРАГ ВСЕЙ СТОПКИ. `pieceDrag`: каким жестом берут отдельную карту
   * (`tap`/`hold`) и какую отдают («любую» под пальцем / только верхнюю — `pick`); `null` — карты
   * по отдельности не тащатся. `stackDrag`: стопка тащится ЦЕЛИКОМ (любая карта — ручка для всей
   * пачки); `null` — такого нет. Оба МОГУТ быть включены разом: у каждого свой триггер (tap/hold), и
   * жест выбирает интент (разные триггеры → тап тащит одно, hold другое; совпали → стек). Матчасть —
   * `kit/stackInteraction.ts`; тут только регистрация, решение — в
   * `KitScene.canDrag`/`dragOnTap`/`dragOnHold`/`beginDrag`.
   */
  dragConfig(ids: string[], pieceDrag: PieceDrag | null, stackDrag?: StackDrag | null): void;
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
  /**
   * Фил анимаций КОНКРЕТНОГО элемента. Живёт рядом со спекой и по той же причине: «вернуть»
   * собирает уничтоженный элемент заново, и без этой памяти он воскресал с БАЗОВЫМ филом —
   * выбранный стиль работал ровно один раз, а дальше раздел показывал не то, что выбрано.
   */
  private elPresets = new Map<string, AnimPreset>();
  /** Элементы, поставленные текущей сборкой: им проигрывается появление, когда сборка закончится. */
  private fresh: SceneElement[] = [];
  /**
   * Стопки со спредом. Реестр отдельный от `placed`: спред — это ПОВЕРХ раскладки, а не свойство
   * элемента, и одна стопка тут может занимать несколько мест в `placed`. См. spreadOnElement/stepScene.
   */
  private spreadStacks: { ids: string[]; at: Pt; layout: StackLayout; cell: { w: number; h: number }; cfg: SpreadConfig; state: SpreadState }[] = [];
  /**
   * Стопки с настроенным драгом карт. Отдельный реестр от `spreadStacks` — спред и драг-карт
   * это две НЕЗАВИСИМЫЕ механики (kit/stackInteraction.ts StackInteraction), у стопки может быть
   * только одна из них, обе или ни одной. См. dragOnTap/dragOnHold/canDrag.
   */
  private dragStacks: { ids: string[]; pieceDrag: PieceDrag | null; stackDrag: StackDrag | null }[] = [];

  /**
   * Двигал ли ТЕКУЩИЙ жест спред. Нужно для ДЕТЕНТА на пределе: жест, который сам наполнил спред,
   * дойдя до края, ОСТАНАВЛИВАЕТСЯ (не отдаёт зум/пан камере) — чтобы палец «почувствовал» лимит.
   * Камеру активирует лишь СЛЕДУЮЩИЙ жест, начатый уже на пределе. Сбрасывается на onSpreadBegin.
   */
  private spreadMovedThisGesture = false;

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
    super({ align: "center", alignY: "center", margin: 0, minZoom: MIN_FIT_ZOOM, maxZoom: MAX_KIT_ZOOM, ...(opts.camera ?? {}) });
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
      case "move": {
        // Дом переезжает ВМЕСТЕ с предметом: «переместить» на столе значит «теперь он живёт здесь».
        // Пока дом оставался прежним, любой дроп в слот доски отыгрывался назад — зона честно
        // раскладывала фигуры командой move, а `resolveDrop` следом звал `release()`, и тот тянул
        // фигуру на СТАРЫЙ дом. Со стороны это выглядело как «дроп не работает».
        const h = this.homeOf(el);
        if (h) this.setHome(el, { x: cmd.x, y: cmd.y }, h.depth);
        // Через СТИЛЬ, а не setTarget: «как элемент летит» — свойство фила, и решать это должен
        // пресет, а не место вызова. spring отдаёт движение пружинам, то есть прежнее поведение.
        el.body.travelTo({ x: cmd.x, y: cmd.y }, ((el as unknown as { animPreset?: AnimPreset }).animPreset ?? this.preset).move.style, this.preset.speed);
        break;
      }
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
        // Пресет ЭЛЕМЕНТА (если ему такой назначали) важнее общего: он переживает пересборку и
        // воскрешение из спеки.
        (el as unknown as { setAnimPreset?: (a: AnimPreset) => void }).setAnimPreset?.(this.elPresets.get(el.id) ?? this.preset);
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
        ctx.add(buildPiece(id, spec, r, this.app?.renderer, plan), home, depth);
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
        for (const id of ids) {
          this.elPresets.set(id, preset);
          (this.byId.get(id) as unknown as { setAnimPreset?: (a: AnimPreset) => void } | undefined)?.setAnimPreset?.(preset);
        }
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
      animDuration: (id, kind) => this.animDuration(id, kind),
      wake: () => this.wake(),
      extent: (w, h) => void (this.explicitExtent = { w, h }),
      spreadStack: (ids, at, layout, cell, cfg) => {
        // ЯКОРЬ спреда берём из ФАКТИЧЕСКОЙ позиции первой карты (её уже положил stackState), а не из
        // сырого `at`: stackState сдвигает стопку на -minX/-minY (левый-верхний край в at — конвенция
        // каталога), а раскладка спреда этого сдвига не знает. Без выравнивания первое пробуждение
        // петли (первый клик) разом двигало бы весь стек на (minX,minY) — вверх-влево. anchor такой,
        // что at + layout(0) == позиция первой карты, и при amount=0 контроллер точно повторяет
        // раскладку stackState (нулевой прыжок).
        const first = this.byId.get(ids[0] ?? "");
        const b0 = layout(0, ids.length, cell);
        const anchor = first ? { x: first.body.px - b0.dx, y: first.body.py - b0.dy } : at;
        this.spreadStacks.push({ ids, at: anchor, layout, cell, cfg, state: SPREAD_STATE0 });
      },
      dragConfig: (ids, pieceDrag, stackDrag = null) => {
        this.dragStacks.push({ ids: [...ids], pieceDrag, stackDrag });
      },
    };
    this.pending?.(ctx);
  }

  // Габарит и вписывание — после сборки, когда элементы уже расставлены.
  private afterBuild(): void {
    // Появление тут НЕ запускается. Пересборка случается на каждую правку рычага, и карта
    // переявлялась бы по десять раз подряд — шум, который прячет то, ради чего рычаг крутят.
    // Появление — СОБЫТИЕ доски (раздали, вернули, добрали), и запускает его тот, кто его вызвал.
    this.fresh = [];
    // Полуразмеры берутся В ПОЗЕ элемента (см. extentOfPlaced): удерживаемой карте иначе срезало
    // верх на канвасе, поджатом ровно по габариту.
    const e = this.explicitExtent ?? extentOfPlaced(this.placed.map((p) => ({ home: p.home, footprint: p.el.footprint, restScale: p.el.restScale })), this.padding);
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
    this.elPresets.clear();
    this.spreadStacks = [];
    this.dragStacks = [];
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

  /** Спред-стек под точкой контента (по габариту живых карт + половина ячейки) или null. Хит-тест
   *  жеста спреда: первая стопка, чей габарит содержит точку жеста, забирает его. */
  private spreadStackAt(cp: Pt): (typeof this.spreadStacks)[number] | null {
    for (const entry of this.spreadStacks) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const id of entry.ids) {
        const el = this.byId.get(id);
        if (!el) continue;
        minX = Math.min(minX, el.body.px);
        maxX = Math.max(maxX, el.body.px);
        minY = Math.min(minY, el.body.py);
        maxY = Math.max(maxY, el.body.py);
      }
      if (!Number.isFinite(minX)) continue; // все карты стопки уже сгорели/пересобраны
      const hw = entry.cell.w / 2;
      const hh = entry.cell.h / 2;
      if (cp.x < minX - hw || cp.x > maxX + hw || cp.y < minY - hh || cp.y > maxY + hh) continue;
      return entry;
    }
    return null;
  }

  /**
   * Жест ПО стеку → спред. Вход один для всех устройств; чем пришёл жест — в `source`. Реагируем ли
   * на него, решает КОНФИГ стека (kit/stackInteraction.ts): `touch-zoom` — по `touchTrigger==="zoom"`;
   * `pointer-zoom` (десктоп Ctrl/тачпад) — по `pointerTrigger==="zoom"`; `pointer-pan` (обычное
   * колесо) — по `pointerTrigger==="pan"`. Не тот жест для этого стека → возвращаем false, и он
   * целиком уходит камере (зум/пан вьюпорта — дефолтный фоллтру).
   *
   * СПРЕД — ВНУТРЕННИЙ слой, камера — ВНЕШНИЙ. Пока спреду есть куда двигаться, жест его и ведёт
   * (true — камеру не трогаем). Обратный жест сразу снова ведёт спред (правило «изменился ли target»).
   *
   * На ПРЕДЕЛЕ (target упёрся в 0/maxGap и жест давит дальше — `target` за кадр не изменился) есть
   * ДЕТЕНТ: если ЭТОТ жест сам двигал спред (`spreadMovedThisGesture`), он тут ОСТАНАВЛИВАЕТСЯ —
   * глотаем (true), камеру не трогаем, чтобы почувствовать лимит. Камеру активирует лишь СЛЕДУЮЩИЙ
   * жест, начатый уже на пределе (тогда флаг ещё false → false, и камера получает жест). Так «дойти
   * до края спреда» и «двигать камеру» — два раздельных жеста, а не один непрерывный.
   */
  protected override spreadOnElement(cp: Pt, rawX: number, rawY: number, source: SpreadSource): boolean {
    const entry = this.spreadStackAt(cp);
    if (!entry) return false;
    const inp = entry.cfg.input;
    const armed = source === "touch-zoom" ? inp.touchTrigger === "zoom" : source === "pointer-zoom" ? inp.pointerTrigger === "zoom" : inp.pointerTrigger === "pan";
    if (!armed) return false; // этот жест на этом стеке спред не трогает — уходит камере
    // Device-дельты → «прогресс спреда» (0..1), где ПОЛОЖИТЕЛЬНОЕ = раздвигать. Конвенции знака:
    //  • touch-zoom: пинч-span растёт (пальцы врозь) → раздвигать (+rawX);
    //  • pointer-zoom: Ctrl-колесо к себе (deltaY<0) → раздвигать (−rawY);
    //  • pointer-pan: раздвиг горизонтальный, ось выбирается (auto=доминирующая, горизонталь при
    //    равенстве). По X: вправо (deltaX>0) раздвигает (+); по Y (fallback): к себе (deltaY<0) → (−).
    const sens = inp.sensitivity ?? DEFAULT_SPREAD_SENSITIVITY;
    let dProgress: number;
    if (source === "pointer-pan") {
      const axis = inp.axis ?? "auto";
      const useX = axis === "x" || (axis === "auto" && Math.abs(rawX) >= Math.abs(rawY));
      const sel = useX ? rawX : rawY;
      dProgress = (useX ? sel : -sel) * sens;
    } else if (source === "pointer-zoom") {
      dProgress = -rawY * sens;
    } else {
      dProgress = rawX * sens; // touch-zoom
    }
    if (inp.invert) dProgress = -dProgress;
    const next = spreadInput(entry.state, dProgress);
    if (next.target !== entry.state.target) {
      entry.state = next;
      this.spreadMovedThisGesture = true;
      this.wake();
      return true;
    }
    // Спред на пределе. Детент: жест, который сам его наполнил, тут стоит (глотаем, камеру не трогаем).
    // Жест, начатый уже на пределе (спред им не двигали), отдаёт себя камере.
    return this.spreadMovedThisGesture;
  }

  /** Новый жест — забываем, двигал ли прошлый спред (детент на пределе, см. spreadOnElement). */
  protected override onSpreadBegin(): void {
    this.spreadMovedThisGesture = false;
  }

  /** Форма спреда по ВСЕМ фигурам стека при текущем amount + рецентровка на `origin` (точка отброса
   *  стоит на месте — веер/линия/кольцо расширяются вокруг неё). Без wobble — его накладывает вызов. */
  private spreadOffsets(entry: { ids: string[]; layout: StackLayout; cell: { w: number; h: number }; cfg: SpreadConfig; state: SpreadState }): StackOffset[] {
    const n = entry.ids.length;
    const origin = entry.cfg.origin ?? "bottom";
    const angleDeg = entry.cfg.angleDeg ?? 0;
    const rests = entry.ids.map((_, i) => entry.layout(i, n, entry.cell));
    const pivot = pivotFrom(origin, rests);
    const spreads = rests.map((base, i) => spreadOffsetAt(entry.cfg, { i, n, cell: entry.cell, gain: entry.cfg.gain, base, pivot, layout: entry.layout, angleDeg }, entry.state.amount));
    const shift = recenterShift(origin, rests, spreads);
    return spreads.map((o) => ({ dx: o.dx + shift.dx, dy: o.dy + shift.dy, rot: o.rot }));
  }

  /** Шаг спред-стеков: анимация amount→target + close-поведение, раскладка карт поверх базовой. */
  protected override stepScene(dt: number): boolean {
    let moving = false;
    // Стопка тащится ЦЕЛИКОМ (GroupDrag): её лид — верхняя карта (drag.ts GroupDrag.lead), но
    // едут ВСЕ карты пачки. Спред обязан отпустить их всех, а не только лида — иначе руки тянут
    // группу за пальцем, а спред тем же кадром тянет её карты обратно на раскладку, и группа рвётся.
    const dragEntry = this.drag ? this.dragEntryOf(this.drag.lead.id) : undefined;
    const groupDragIds = dragEntry?.stackDrag ? new Set(dragEntry.ids) : null;
    for (const entry of this.spreadStacks) {
      entry.state = spreadTick(entry.state, dt, entry.cfg);
      const spreads = this.spreadOffsets(entry); // форма по всем + рецентровка на origin
      entry.ids.forEach((id, i) => {
        if (id === this.drag?.lead.id) return; // тащат руками — спред её не двигает
        if (groupDragIds?.has(id)) return; // карта пачки, которую тащат целиком — тоже не спредим
        const el = this.byId.get(id);
        if (!el) return;
        const o = spreads[i]!;
        const wob = entry.cfg.close.kind === "dribble" ? dribbleWobble(i, entry.state.phase) : 0;
        const w = wobbleOffset(i, wob);
        el.body.setTarget({ x: entry.at.x + o.dx, y: entry.at.y + o.dy + w.dy, rot: o.rot + w.rot });
      });
      if (entry.state.amount > 0.05 || entry.state.phase > 0) moving = true;
    }
    return moving;
  }

  /** Запись драг-конфига стопки, в которой числится элемент, или undefined — элемент не в реестре. */
  private dragEntryOf(id: string): { ids: string[]; pieceDrag: PieceDrag | null; stackDrag: StackDrag | null } | undefined {
    return this.dragStacks.find((s) => s.ids.includes(id));
  }

  /**
   * Пик карты по конфигу стопки: `stackDrag != null` — ЛЮБАЯ карта стопки хватается (ручка для всей
   * пачки, см. beginDrag); иначе — по ПРЕДИКАТУ `pieceDrag.pick` (kit/stackInteraction.ts): его
   * зовём с позицией карты в стопке (0 — низ, n-1 — верх). `pieceDrag == null` — карты не тащат вовсе.
   * Готовые предикаты — PICK_ANY/PICK_FIRST; клиент может дать свой (только пики и т.п.). Элементы
   * вне драг-реестра решаются базой — рычаг на них не распространяется.
   */
  protected override canDrag(el: SceneElement): boolean {
    if (!super.canDrag(el)) return false;
    const entry = this.dragEntryOf(el.id);
    if (!entry) return true;
    if (entry.stackDrag) return true;
    if (!entry.pieceDrag) return false;
    const i = entry.ids.indexOf(el.id);
    if (i < 0) return false; // карты уже нет в живом порядке стопки
    return entry.pieceDrag.pick({ id: el.id, i, n: entry.ids.length });
  }

  /**
   * Драг карты и драг всей стопки — ДВА НЕЗАВИСИМЫХ интента, у каждого свой триггер (tap/hold). Роутер
   * зовёт `dragOnTap`/`dragOnHold`, чтобы узнать, что доступно этим жестом, и выбирает по жесту —
   * поэтому `stackDrag` больше НЕ перебивает `pieceDrag`: если триггеры разные, тап делает одно, hold
   * другое; если совпали — выигрывает стек (см. beginDrag). Интент «доступен» = его триггер равен
   * жесту И он применим к этому элементу (у pieceDrag — предикат pick; stackDrag берётся за любую карту).
   */
  protected override dragOnTap(el: SceneElement): boolean {
    return this.hasDragIntent(el, "tap");
  }
  protected override dragOnHold(el: SceneElement): boolean {
    return this.hasDragIntent(el, "hold");
  }

  /** Есть ли у элемента драг-интент (card или stack) с данным триггером. Вне реестра — обычный
   *  тап-драг базы (тап есть, hold нет). */
  private hasDragIntent(el: SceneElement, trigger: DragTrigger): boolean {
    const entry = this.dragEntryOf(el.id);
    if (!entry) return trigger === "tap";
    if (entry.stackDrag?.trigger === trigger) return true;
    return entry.pieceDrag?.trigger === trigger && this.piecePickApplies(entry, el);
  }

  /** Хватается ли ИМЕННО эта карта по предикату pieceDrag.pick (0 — низ, n-1 — верх). */
  private piecePickApplies(entry: { ids: string[]; pieceDrag: PieceDrag | null }, el: SceneElement): boolean {
    if (!entry.pieceDrag) return false;
    const i = entry.ids.indexOf(el.id);
    return i >= 0 && entry.pieceDrag.pick({ id: el.id, i, n: entry.ids.length });
  }

  /**
   * Начать драг ТЕМ интентом, чей триггер совпал с сработавшим жестом (`grabMode`): `stackDrag` →
   * едет вся живая пачка группой (`GroupDrag`, форма сохраняется — тот же приём, что у блок-драга
   * песочницы, boards/scene.ts); `pieceDrag` → одиночная карта (база). При совпадении триггеров у
   * обоих выигрывает стек. Если жесту не отвечает ни один интент (страховка — роутер и так не должен
   * был захватывать) — возвращаем false, база тоже не заводит драг.
   */
  protected override beginDrag(el: SceneElement, cp: Pt, sp: Pt): boolean {
    const entry = this.dragEntryOf(el.id);
    if (entry) {
      if (entry.stackDrag?.trigger === this.grabMode) {
        const nodes = entry.ids.map((id) => this.byId.get(id)).filter((e): e is SceneElement => !!e);
        if (nodes.length) {
          const offsets = nodes.map((n) => ({ dx: n.body.px - cp.x, dy: n.body.py - cp.y }));
          this.drag = new GroupDrag(nodes, offsets, this.dragCtx);
          this.drag.move(cp);
          return true;
        }
      }
      // Не стек этим жестом → карта, но лишь если карточный интент отвечает этому жесту и применим.
      if (!(entry.pieceDrag?.trigger === this.grabMode && this.piecePickApplies(entry, el))) return false;
    }
    return super.beginDrag(el, cp, sp);
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
    // Карта спред-стека живёт в СПРЕД-позиции (её каждый кадр ставит stepScene), а не в статичном
    // доме stackState. Возврат после граба/дропа обязан вести туда же — иначе клик/микро-драг
    // верхней карты дёргает её к нераздвинутой раскладке (вверх-влево), и стопка «прыгает».
    const sp = this.spreadHomeOf(el.id);
    if (sp) return sp;
    const p = this.placed.find((q) => q.el === el);
    return p ? { home: p.home, depth: p.z } : null;
  }

  /** Дом карты в спред-стеке = якорь + текущий раздвиг (та же формула, что в stepScene). null —
   *  карта не в спред-стеке. Глубину берём из placed. */
  private spreadHomeOf(id: string): { home: Pt; depth: number } | null {
    const entry = this.spreadStacks.find((s) => s.ids.includes(id));
    if (!entry) return null;
    const i = entry.ids.indexOf(id);
    const off = this.spreadOffsets(entry)[i]!;
    const wob = entry.cfg.close.kind === "dribble" ? dribbleWobble(i, entry.state.phase) : 0;
    const w = wobbleOffset(i, wob);
    const z = this.placed.find((q) => q.el.id === id)?.z ?? 0;
    return { home: { x: entry.at.x + off.dx, y: entry.at.y + off.dy + w.dy }, depth: z };
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
