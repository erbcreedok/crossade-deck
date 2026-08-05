import { Application, Graphics } from "pixi.js";
import { SceneEngine, type SceneElement } from "../../engine/sceneEngine";
import { COLORS } from "../../engine/constants";
import { Card } from "../../ui/Card";
import { CardTextureCache } from "../../ui/CardTextureCache";
import type { TableElement } from "../../engine/element";
import { dropTarget } from "../../slot/slot";
import { freeZoneAt, isDeckSlot, planDrop, reorderModeOf, type DropWorld } from "../geometry/dropPlan";
import { CARD } from "../../crossade/tree";
import { buildBoardTree, type BoardTree, type FreePositions } from "../geometry/boardTree";
import { localDriver, type BoardDriver } from "../core/driver";
import { handKey, type BoardState } from "../core/state";
import { baseZoneId, elementById, slotKey, zoneOf, type BoardCommand, type BoardSpec, type ElementDef } from "../core/spec";
import { DropBar } from "../../ui/DropBar";
import type { ScenePresence } from "./scenePresence";
import type { SceneChrome } from "./chrome";
import type { SceneMenu } from "./menu";
import type { SceneDecor } from "./decor";
import type { SceneNodes } from "./nodesStore";
import type { SceneBlockDrag } from "./blockDrag";
import type { SceneDeckActions } from "./deckActions";
import { buildBoardParts } from "./parts";
import { hintShape, menuTargetAt, type MenuTargetKind } from "../geometry/sceneAreas";
import { migrateState } from "../core/migrate";
import type { BoardSceneOptions } from "./options";

// СЦЕНА БОРДЫ — ОДНА, generic (BOARDS-DESIGN §4): конкретная борда — данные BoardSpec, не
// подкласс. Доктрина сцен проекта: снимок состояния — единственная правда, ход уходит в ПОРТ
// (dispatch → смарт-мок applyCommand), сцена правил не проверяет; камера/ввод/драг/тени — из
// SceneEngine. Кнопки ActionBar — те же команды порта, что и палец (два драйвера одной двери).

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const SEAT_STRIP_CARD_H = 83;

export type { MenuTargetKind } from "../geometry/sceneAreas";
export type { BoardSceneOptions, SceneMenus, SceneTool } from "./options";

export class BoardScene extends SceneEngine {
  private tex: CardTextureCache | null = null;
  private readonly nodeStore: SceneNodes;
  private readonly hintLayer = new Graphics();

  private spec: BoardSpec;
  private defs: ReadonlyMap<string, ElementDef>;
  private readonly selfSeat: string;
  private driver: BoardDriver;
  private state: BoardState;
  private tree: BoardTree;

  // Экранный HUD, меню, декор, блок-драг и действия колоды — коллабораторы (композиция).
  private readonly chromeHud: SceneChrome;
  private readonly menuOwner: SceneMenu;
  private readonly decor: SceneDecor;
  private readonly blockDrag: SceneBlockDrag;
  private readonly deckActions: SceneDeckActions;

  // Фиксированные дроп-зоны у низа экрана (мобильный ПКМ): видны только во время драга.
  private readonly dropBar = new DropBar();

  // Live-присутствие — коллаборатор (glow локов, курсоры, ведение чужих драгов): сцена кормит
  // его видом и данными через узкий шов, вся presence-логика — в scenePresence.ts.
  private readonly presence: ScenePresence;
  private grabbedEl: string | null = null;

  private hotSlot: string | null = null;
  private dragging = false;


  constructor(private readonly opts: BoardSceneOptions) {
    super({ minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, margin: 0, align: "center" });
    this.spec = opts.spec;
    this.defs = elementById(opts.spec);
    this.selfSeat = opts.selfSeat ?? "p1";
    this.driver = opts.driver ?? localDriver(opts.spec, opts.seats, opts.occupants);
    this.state = this.driver.boot();
    this.driver.onState((s) => {
      this.state = s;
      this.rebuildBoard(false);
    });
    this.tree = buildBoardTree(this.spec, this.state, this.selfSeat, this.freeMaps());
    const parts = buildBoardParts(
      {
        state: () => this.state,
        tree: () => this.tree,
        spec: () => this.spec,
        def: (id) => this.defs.get(id),
        tex: () => this.tex,
        renderer: () => this.app?.renderer ?? null,
        selfSeat: this.selfSeat,
        dispatch: (cmd) => this.dispatch(cmd),
        wake: () => this.wake(),
        after: (sec, fn) => this.after(sec, fn),
        size: () => ({ w: this.width, h: this.height }),
        accent: () => this.accentColor(),
        register: (id, node) => this.byId.set(id, node),
        unregister: (id) => this.byId.delete(id),
        placeCard: (node) => this.placeCard(node),
        dragCtx: () => this.dragCtx,
        setDrag: (d) => {
          this.drag = d;
        },
        chromeAdd: (c) => this.chrome.addChild(c),
        surfaceAdd: (c) => this.scene.surface.addChild(c),
        setMenuButtons: (btns) => {
          this.chromeButtons = [...this.chromeHud.buttons(), ...btns];
        },
        forgetHovered: (btns) => {
          if (this.hoveredBtn && btns.includes(this.hoveredBtn)) this.hoveredBtn = null;
        },
        faceUpIn: (id, slot) => this.faceUpIn(id, slot),
        isDeckSlot: (slot) => this.isDeckSlot(slot),
        hitElementId: (cp) => this.hitElement(cp.x, cp.y)?.id ?? null,
        menuTarget: (cp) => this.menuTarget(cp),
      },
      opts,
    );
    this.nodeStore = parts.nodeStore;
    this.presence = parts.presence;
    this.blockDrag = parts.blockDrag;
    this.deckActions = parts.deckActions;
    this.chromeHud = parts.chromeHud;
    this.menuOwner = parts.menuOwner;
    this.decor = parts.decor;
    opts.presence?.hub.onChange((v) => {
      this.presence.view = v;
      this.presence.paint();
      this.wake();
    });
  }

  // ——— live-присутствие: лок «кто первый», курсоры (свой — тоже своим цветом) ———

  /** Акцент сцены: в live — ЦВЕТ ЭТОГО игрока (профиль, свой курсор, подсветки), иначе золото. */
  protected accentColor(): number {
    const p = this.opts.presence;
    return p ? p.palette(p.who) : COLORS.gold;
  }

  /** Курсор этого клиента: остальным — в хаб, себе — точкой своего цвета на борде. */
  reportCursor(sx: number, sy: number, active = true): void {
    const p = this.opts.presence;
    if (!p) return;
    const cp = active ? this.screenToContent(sx, sy) : null;
    this.presence.ownCursor = cp;
    p.hub.cursor(p.who, cp);
    this.presence.paint();
    this.wake();
  }

  // ——— контекстное меню настроек (long-press по гриду/борде, ПКМ на десктопе) ———

  /** Цель меню под точкой — чистая menuTargetAt (sceneAreas); без хост-меню цели нет. */
  private menuTarget(cp: { x: number; y: number }): MenuTargetKind | null {
    return this.opts.menus ? menuTargetAt(this.spec.zones, this.tree.cellRects, cp) : null;
  }

  protected hasContextAt(cp: { x: number; y: number }): boolean {
    return this.menuTarget(cp) !== null;
  }

  protected openContextMenu(cp: { x: number; y: number }, sp: { x: number; y: number }): void {
    this.menuOwner.openAt(cp, sp);
  }

  /** Сменить СПЕКУ, не трогая драйвер (live: настройки и мигрированный снимок раздаёт комната —
   *  сцена лишь пересобирает геометрию; свежий снимок приедет обычным onState следом). */
  applySpec(spec: BoardSpec): void {
    this.spec = spec;
    this.defs = elementById(spec);
    this.rebuildBoard(false);
  }

  /** Сменить спеку на лету: жители пересыпаются migrateState, драйвер пересоздаётся с готовым
   *  снимком. Работает только со СВОИМ localDriver (standalone); зовёт хост меню (menus). */
  reconfigure(spec: BoardSpec, seats?: number): void {
    this.spec = spec;
    this.defs = elementById(spec);
    this.state = migrateState(this.state, spec, seats); // визуалы чистит сама миграция
    this.driver = localDriver(spec, seats, undefined, this.state);
    this.driver.onState((s) => {
      this.state = s;
      this.rebuildBoard(false);
    });
    this.rebuildBoard(false);
  }

  /** Тап мимо меню закрывает его (по строкам меню тап не доходит — их ловит chromeButtons). */
  protected onSceneTap(content: { x: number; y: number }, screen: { x: number; y: number }): void {
    if (this.menuOwner.isOpen() && !this.menuOwner.contains(screen.x, screen.y)) {
      this.menuOwner.close();
      return; // закрытие меню — весь смысл тапа, дабл-тап-зум не кормим
    }
    super.onSceneTap(content, screen);
  }

  // ——— порт команд: одна дверь для пальца, кнопок, консоли и (потом) сервера ———

  dispatch(cmd: BoardCommand): void {
    this.opts.onCommand?.(cmd);
    this.driver.dispatch(cmd);
  }

  // ——— сборка ———

  protected buildScene(app: Application): void {
    this.tex = new CardTextureCache(app);
    this.scene.surface.addChild(this.decor.layer, this.hintLayer);
    this.content.addChild(this.presence.root); // ПОСЛЕДНИМ ребёнком контента: локи и курсоры поверх карт
    this.chrome.addChildAt(this.dropBar.root, 0); // свой НИЖНИЙ слой HUD: меню и кнопки — поверх
    this.chromeHud.build(this.spec.actions, this.opts.tools ?? []);
    this.chromeButtons = this.chromeHud.buttons();
    this.rebuildBoard(true);
  }

  /** Строка статуса хоста у инструментов (live: «ник · комната 1234»). Пустая — спрятать. */
  setBadge(text: string): void {
    this.chromeHud.setBadge(text);
  }

  protected layoutChrome(w: number, h: number): void {
    this.chromeHud.layout(w, h);
  }

  protected onBooted(): void {
    this.fitBoard();
    super.onBooted();
  }

  protected onSceneResize(): void {
    this.fitBoard();
  }

  private fitBoard(): void {
    this.syncVp();
    const usableH = Math.max(1, this.height - 52); // низ занят ActionBar
    this.viewport.setZoom(Math.min(1, this.width / this.tree.size.w, usableH / this.tree.size.h));
    this.clampView();
    this.applyView();
    this.emitView();
  }

  // ——— состояние → доска ———

  /** Позиции free-зон для дерева — прямо из состояния (стол одинаков у всех клиентов). */
  private freeMaps(): FreePositions {
    return this.state.free;
  }

  private rebuildBoard(snap: boolean): void {
    this.tree = buildBoardTree(this.spec, this.state, this.selfSeat, this.freeMaps());
    if (!this.tex) return;
    this.nodeStore.sync(this.state, this.tree, snap);
    this.contentW = this.tree.size.w;
    this.contentH = this.tree.size.h;
    this.decor.sync();
    this.paintHints();
    this.presence.paint();
    this.chromeHud.syncDice(this.state.dice);
    this.clampView();
    this.applyView();
    this.emitView();
    this.wake();
  }

  /** Лицом или рубашкой лежит карта В ЭТОМ слоте: колода, свободная стопка и чужие руки — рубашкой. */
  private faceUpIn(id: string, slot: string): boolean {
    const def = this.defs.get(id);
    if (def?.kind !== "card") return true;
    const zone = zoneOf(slot);
    if (zone === "seat") return false;
    const zs = this.spec.zones.find((z) => z.id === baseZoneId(zone));
    return !((zs?.layout.kind === "pile" && zs.id === "deck") || zs?.layout.kind === "free");
  }

  private isFreeZone(zoneId: string): boolean {
    return this.spec.zones.find((z) => z.id === baseZoneId(zoneId))?.layout.kind === "free";
  }

  /** Слот-КОЛОДА free-зоны (слот 0) — правило чистого dropPlan. */
  private isDeckSlot(slot: string): boolean {
    return isDeckSlot(this.dropWorld(), slot);
  }

  /** Дом элемента. Сдвиги free-зон (колода-блок, свободные стопки) уже В ДЕРЕВЕ (FreePositions) —
   *  рендер, возврат и хит-тест читают одну геометрию. */
  private homeVec(id: string): { x: number; y: number } | null {
    return this.tree.homeOf(id);
  }


  /** Подсветка целевого слота под пальцем: фигуру считает чистый hintShape (sceneAreas),
   *  сцена только обводит акцентом (в live — цветом игрока, не общим золотом). */
  private paintHints(): void {
    const g = this.hintLayer;
    g.clear();
    if (!this.dragging || !this.hotSlot) return;
    const shape = hintShape({
      hotSlot: this.hotSlot,
      zone: this.spec.zones.find((z) => z.id === baseZoneId(zoneOf(this.hotSlot!))),
      cellRects: this.tree.cellRects,
      origins: this.tree.origins,
      members: this.state.field.slots[this.hotSlot]?.members.length ?? 0,
      card: CARD,
    });
    if (!shape) return;
    if (shape.kind === "circle") g.circle(shape.cx, shape.cy, shape.r).stroke({ width: 3, color: this.accentColor() });
    else g.roundRect(shape.x, shape.y, shape.w, shape.h, 8).stroke({ width: 3, color: this.accentColor() });
  }

  // ——— швы домена ———

  protected draggables(): SceneElement[] {
    return this.nodeStore.list();
  }

  protected everyElement(): TableElement[] {
    return this.nodeStore.list();
  }

  /** Что фокусируется дабл-тапом (opt-in): карта-элемент под пальцем ГАСИТ жест (колода не зумится);
   *  иначе — самая ВНУТРЕННЯЯ focusable-зона, чей бокс накрыл точку (грид раньше бокса). */
  protected focusTargetAt(cp: { x: number; y: number }): { x: number; y: number; w: number; h: number } | null {
    if (this.hitElement(cp.x, cp.y)) return null;
    let best: { x: number; y: number; w: number; h: number } | null = null;
    for (const zone of this.spec.zones) {
      if (!zone.focusable) continue;
      const r = this.tree.cellRects[`${zone.id}:0`];
      if (!r || cp.x < r.x || cp.x > r.x + r.w || cp.y < r.y || cp.y > r.y + r.h) continue;
      if (!best || r.w * r.h < best.w * best.h) best = r;
    }
    return best;
  }

  protected homeOf(el: SceneElement): { home: { x: number; y: number }; depth: number } | null {
    const home = this.homeVec(el.id);
    return home ? { home, depth: this.nodeStore.depth(el.id) } : null;
  }

  /** Смарт-мок щедрый: тащится верх любого слота стола и любая карта своей руки. Чужая рука —
   *  нет (приватность), правила «чей ход» ничего не запрещают (индикация, BOARDS-DESIGN §3). */
  protected canDrag(el: SceneElement): boolean {
    if (this.opts.interactive === false) return false;
    // Live: элемент в чужих руках не берётся — кто первый схватил, тот и управляет.
    const p = this.opts.presence;
    if (p) {
      const owner = p.hub.heldBy(el.id);
      if (owner && owner !== p.who) return false;
    }
    const slot = this.tree.slotOf(el.id);
    if (!slot) return false;
    const zone = zoneOf(slot);
    if (zone === "seat") return false;
    if (slot === handKey(this.selfSeat)) return true;
    // Реордер-зона (flow-грид): жители разложены веером по позициям — хватается ЛЮБОЙ, не верх.
    if (reorderModeOf(this.dropWorld(), slot)) return true;
    const members = this.state.field.slots[slot]?.members ?? [];
    return members[members.length - 1] === el.id;
  }

  /** У жителей КОЛОДЫ ДВА драг-интента: тап тащит верхнюю карту, hold — всю колоду блоком.
   *  Свободные стопки (слоты ≥ 1) блоком не таскаются — это просто карты, лежащие где положили. */
  protected dragOnHold(el: SceneElement): boolean {
    const slot = this.tree.slotOf(el.id);
    return !!slot && this.isDeckSlot(slot);
  }

  protected beginDrag(el: SceneElement, cp: { x: number; y: number }, sp: { x: number; y: number }): boolean {
    this.menuOwner.close(); // начался драг — меню больше не к месту
    // Live-лок: гонка на первом касании решается хабом; отказ — элемент уже у другого.
    const p = this.opts.presence;
    if (p) {
      if (!p.hub.grab(p.who, el.id)) return false;
      this.grabbedEl = el.id;
    }
    this.dragging = true;
    const slot = this.tree.slotOf(el.id);
    const zone = slot ? baseZoneId(zoneOf(slot)) : null;
    if (slot && zone && this.isDeckSlot(slot) && this.grabMode === "hold" && this.blockDrag.begin(zone, slot, cp)) {
      // Тащим ВСЮ стопку как блок (SceneBlockDrag): жест берёт весь слот, а не верхнюю карту.
      // Колода в пальцах → снизу прилипают фикс-зоны её меню (мобильный заменитель ПКМ).
      this.dropBar.show([{ key: "menu", label: "настройка" }, { key: "shuffle", label: "перемешать" }], this.width, this.height, this.accentColor());
      this.presence.paint(); // grab эмитил присутствие ДО того, как стало известно, что это блок-драг
      return true;
    }
    const ok = super.beginDrag(el, cp, sp);
    // Одиночная карта в пальцах: у неё тоже есть меню — зона «настройка».
    if (ok) this.dropBar.show([{ key: "menu", label: "настройка" }], this.width, this.height, this.accentColor());
    return ok;
  }

  protected onDragMoved(p: { x: number; y: number }): void {
    if (this.dropBar.visible) {
      this.dropBar.hotAt(this.dragScreen.x, this.dragScreen.y);
      this.wake();
    }
    // Драг-стрим: остальным клиентам — ЦЕНТР карты в пальцах (не точка хвата), темп курсора.
    // Блок-драг колоды — той же строкой с флагом block: зрители двигают ВСЮ стопку той же дельтой.
    const pr = this.opts.presence;
    if (pr && this.grabbedEl) {
      const node = this.nodeStore.get(this.grabbedEl);
      if (node) pr.hub.drag(pr.who, this.grabbedEl, { x: node.body.px, y: node.body.py }, this.blockDrag.active());
    }
    if (this.blockDrag.active()) return; // блок-драг колоды: бокс не подсвечиваем никак
    const target = dropTarget(this.tree.root, p);
    // Приоритет подсветки: конкретная цель (колода/стопка/центр/рука) → сам бокс free-зоны
    // (псевдо-слот «zone:box»: карта ляжет свободно) → ничего.
    const fz = freeZoneAt(this.dropWorld(), p);
    const hot = target?.group.id ?? (fz ? slotKey(fz, "box") : null);
    if (hot === this.hotSlot) return;
    this.hotSlot = hot;
    this.paintHints();
    this.wake();
  }

  protected resolveDrop(el: SceneElement, cp: { x: number; y: number }): void {
    const drag = this.drag;
    if (!drag) return;
    // Дроп в фикс-зону у низа экрана: груз летит домой, действие зоны выполняется.
    const bar = this.dropBar.visible ? this.dropBar.hotAt(this.dragScreen.x, this.dragScreen.y) : null;
    if (bar) {
      const slot = this.tree.slotOf(el.id);
      const wasBlock = this.blockDrag.active();
      this.blockDrag.cancel(); // сдвиг колоды не меняем — стопка вернётся, откуда поднята
      drag.release();
      if (slot) {
        if (bar === "shuffle") {
          this.deckActions.shuffle(slot);
        } else {
          const ctx = wasBlock ? ({ kind: "deck", slot } as const) : ({ kind: "card", id: el.id } as const);
          this.menuOwner.openFor(ctx, { x: this.dragScreen.x, y: this.dragScreen.y - 200 });
        }
      }
      return;
    }
    if (this.blockDrag.active()) {
      // Блок-драг колоды: решает коллаборатор (внутри бокса — offsetFree, мимо — без изменений).
      this.blockDrag.resolveAt(cp);
      drag.release();
      return;
    }
    const target = dropTarget(this.tree.root, cp);
    const plan = planDrop(this.dropWorld(), {
      el: el.id,
      from: this.tree.slotOf(el.id),
      target: target ? { slot: target.group.id, index: target.index } : null,
      cp,
      myHand: handKey(this.selfSeat),
      handReorder: this.spec.hand?.reorder ?? false,
      carriedFaceUp: (() => {
        const node = this.nodeStore.get(el.id);
        return node instanceof Card ? node.faceUp : null;
      })(),
    });
    if (plan.kind === "command") this.dispatch(plan.cmd);
    drag.release(); // состояние уже новое: дом = целевой слот, release долетает туда
  }

  /** Мир дропа для чистых планировщиков (dropPlan): только чтение дерева и поля. */
  private dropWorld(): DropWorld {
    return {
      zones: this.spec.zones,
      cellRects: this.tree.cellRects,
      members: (slot) => this.state.field.slots[slot]?.members ?? [],
      homeOf: (id) => this.tree.homeOf(id),
      occupiedKeys: () => Object.keys(this.state.field.slots).filter((k) => (this.state.field.slots[k]?.members.length ?? 0) > 0),
    };
  }

  protected onDragCancel(): void {
    this.clearDragHints();
  }

  protected afterDragEnd(): void {
    this.clearDragHints();
  }

  private clearDragHints(): void {
    this.dragging = false;
    this.hotSlot = null;
    this.blockDrag.cancel(); // отмена/конец блок-драга: не тащим сдвиг в следующий жест
    this.dropBar.hide(); // фикс-зоны живут только пока элемент в пальцах
    if (this.grabbedEl && this.opts.presence) {
      const p = this.opts.presence;
      p.hub.drag(p.who, this.grabbedEl, null); // конец стрима: дальше карту ведёт снимок
      p.hub.release(p.who, this.grabbedEl);
      this.grabbedEl = null;
    }
    this.paintHints();
  }

  /** Дев-хук для стори/e2e: экранная геометрия + состояние (канвас не отдаёт DOM). */
  testHooks(): {
    slots: Record<string, { x: number; y: number }>;
    cards: Record<string, { x: number; y: number; slot: string | null }>;
    seats: BoardState["seats"];
    turn: BoardState["turn"];
    dice: number[];
  } {
    const slots: Record<string, { x: number; y: number }> = {};
    for (const [id, at] of Object.entries(this.tree.origins)) slots[id] = this.contentToScreen(at.x, at.y);
    const cards: Record<string, { x: number; y: number; slot: string | null }> = {};
    for (const [id, node] of this.nodeStore.all()) {
      const p = this.contentToScreen(node.body.px, node.body.py);
      cards[id] = { x: p.x, y: p.y, slot: this.tree.slotOf(id) };
    }
    return { slots, cards, seats: this.state.seats, turn: this.state.turn, dice: [...this.state.dice] };
  }

  protected onTeardown(app: Application): void {
    this.menuOwner.destroy();
    this.dropBar.destroy();
    this.presence.destroy();
    this.decor.destroy();
    this.nodeStore.destroy();
    this.tex?.destroy();
    this.tex = null;
    super.onTeardown(app);
  }
}
