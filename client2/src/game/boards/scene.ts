import { Application, Container, Graphics, Text } from "pixi.js";
import { SceneEngine, type SceneElement } from "../engine/sceneEngine";
import { TEX_H, PIXEL_FONT, COLORS } from "../engine/constants";
import { Card } from "../ui/Card";
import { CardTextureCache } from "../ui/CardTextureCache";
import { Button } from "../ui/Button";
import { buildPiece, type PieceSpec } from "../ui/pieceKinds";
import type { Piece } from "../ui/Piece";
import type { TableElement } from "../engine/element";
import { dropTarget } from "../slot/slot";
import { dashedRectSegments } from "../ui/dashedRectSegments";
import { dashedCircleArcs } from "../ui/dashedCircleArcs";
import { blockDropOffset } from "./freeBox";
import { GroupDrag } from "../engine/drag";
import { CARD } from "../crossade/tree";
import { buildBoardTree, type BoardTree } from "./boardTree";
import { localDriver, type BoardDriver } from "./driver";
import { handKey, type BoardState } from "./state";
import { baseZoneId, elementById, zoneOf, type BoardCommand, type BoardSpec, type ElementDef } from "./spec";
import { handOrderAfterDrop } from "../crossade/handOrder";
import { ContextMenu, type MenuRow } from "../ui/ContextMenu";
import { DropBar } from "../ui/DropBar";
import { migrateState } from "./migrate";
import { autoDealPlan } from "./dealPlan";
import { SHUFFLE_FX_SECONDS, shufflePoses } from "./shuffleFx";
import type { PresenceHub, PresenceView } from "./presence";

// СЦЕНА БОРДЫ — ОДНА, generic (BOARDS-DESIGN §4): конкретная борда — данные BoardSpec, не
// подкласс. Доктрина сцен проекта: снимок состояния — единственная правда, ход уходит в ПОРТ
// (dispatch → смарт-мок applyCommand), сцена правил не проверяет; камера/ввод/драг/тени — из
// SceneEngine. Кнопки ActionBar — те же команды порта, что и палец (два драйвера одной двери).

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const SEAT_STRIP_CARD_H = 83;

/** Пустая цель контекстного меню: борда целиком (free-бокс) или грид-стол. */
export type MenuTargetKind = "board" | "table";

/** Шов меню к хосту (DIP): сцена спрашивает строки, хост решает, что настраивается и как. */
export interface SceneMenus {
  /** Меню борды/стола. null — у хоста нет меню для этой цели. */
  menuFor(target: MenuTargetKind): { title: string; rows: readonly MenuRow[] } | null;
  /** Дорастить меню КОЛОДЫ строками хоста (напр. «колода · 36»). */
  deckExtras?(): readonly MenuRow[];
}

/** Канвас-кнопка хоста (правый верхний угол). */
export interface SceneTool {
  key: string;
  label: string;
  onClick: () => void;
}

export interface BoardSceneOptions {
  spec: BoardSpec;
  /** Сколько мест открыть (для динамических бордов). */
  seats?: number;
  /** Чьими глазами смотрим (его рука снизу). */
  selfSeat?: string;
  /** Лог команд порта — в панель Actions стори. */
  onCommand?: (cmd: BoardCommand) => void;
  /** Рассадка от комнаты: имя на стуле или null. Без неё — фантомы «Игрок N» (standalone). */
  occupants?: readonly (string | null)[];
  /** false — «только смотреть»: наблюдатель без права «мешать» (room.ts#canTouch). */
  interactive?: boolean;
  /** Кто исполняет команды: без драйвера — локальный мок (standalone); live-стори передаёт
   *  клиента общего мастера (boardTable.ts). Сцена разницы не видит. */
  driver?: BoardDriver;
  /** Контекстные меню настроек (long-press по гриду-борде / ПКМ) — ШОВ К ХОСТУ (DIP): сцена
   *  не знает, ЧТО настраивается; хост (песочница) отдаёт готовые строки и сам вызывает
   *  reconfigure. Меню колоды/карты у сцены свои (это её механика), хост может дорастить
   *  меню колоды через deckExtras (напр. размер колоды). */
  menus?: SceneMenus;
  /** Канвас-кнопки хоста в правом верхнем углу (live-режим песочницы и т.п.). HTML в игровом
   *  экране запрещён доктриной — интерфейс рисует движок. */
  tools?: readonly SceneTool[];
  /** Live-присутствие (песочница, админов нет): лок «кто первый схватил», чужие курсоры и цвета.
   *  Хаб общий на всех клиентов стола (presence.ts); своего цвета сцена не рисует — палец и так свой. */
  presence?: { hub: PresenceHub; who: string; palette: (who: string) => number; label?: (who: string) => string };
}

type BoardNode = Card | Piece;

/** Обмен местами: перетащенный встаёт на позицию цели, вытесненный — на его прежнюю. */
function swappedOrder(members: readonly string[], el: string, toIndex: number): string[] {
  const fromIndex = members.indexOf(el);
  if (fromIndex < 0 || toIndex < 0 || toIndex >= members.length || fromIndex === toIndex) return [...members];
  const out = [...members];
  [out[fromIndex], out[toIndex]] = [out[toIndex]!, out[fromIndex]!];
  return out;
}

export class BoardScene extends SceneEngine {
  private tex: CardTextureCache | null = null;
  private readonly nodes = new Map<string, BoardNode>();
  private readonly cardDepth = new Map<string, number>();
  private readonly seatLabels = new Map<string, Text>();
  private readonly zoneLabels = new Map<string, Text>();
  private readonly decorLayer = new Graphics();
  private readonly hintLayer = new Graphics();
  private actionButtons: Button[] = [];
  private toolButtons: Button[] = [];
  private badgeText: Text | null = null;
  private diceText: Text | null = null;

  private spec: BoardSpec;
  private defs: ReadonlyMap<string, ElementDef>;
  private readonly selfSeat: string;
  private driver: BoardDriver;
  private state: BoardState;
  private tree: BoardTree;

  // Контекстное меню настроек (opt-in через opts.menus).
  private menu: ContextMenu | null = null;
  private menuAt = { x: 0, y: 0 };
  private menuCtx: { kind: MenuTargetKind } | { kind: "deck"; slot: string } | { kind: "card"; id: string } = { kind: "table" };

  // Локальные visual-оверрайды карт (меню одиночной карты): поворот и принудительное лицо/рубашка.
  private readonly cardFx = new Map<string, { rot?: number; face?: boolean }>();

  // Фиксированные дроп-зоны у низа экрана (мобильный ПКМ): видны только во время драга.
  private readonly dropBar = new DropBar();

  // Live-присутствие: слой чужих локов (цветная рамка на удержанном элементе) и курсоров.
  private readonly presenceRoot = new Container();
  private readonly presenceLayer = new Graphics();
  private readonly cursorLabels = new Map<string, Text>();
  private presenceView: PresenceView | null = null;
  private grabbedEl: string | null = null;
  private ownCursor: { x: number; y: number } | null = null;

  private hotSlot: string | null = null;
  private dragging = false;

  // Свободные стопки (zone.layout.kind === "free"): их сдвиг от дерева-дома. Дерево кладёт стопку
  // в фиксированный origin (рамка-квадрат там и рисуется), а живёт она в origin + этот сдвиг —
  // так блок ездит по всему полю, не ломая слот-геометрию. Ключ — id базовой зоны.
  private readonly freeOffset = new Map<string, { x: number; y: number }>();
  // Идёт блок-драг свободной стопки: её зона + точка захвата (для дельты сдвига на дропе).
  private blockZone: string | null = null;
  private blockGrab = { x: 0, y: 0 };

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
    this.tree = buildBoardTree(this.spec, this.state, this.selfSeat);
    opts.presence?.hub.onChange((v) => {
      this.presenceView = v;
      this.paintPresence();
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
    this.ownCursor = cp;
    p.hub.cursor(p.who, cp);
    this.paintPresence();
    this.wake();
  }

  private paintPresence(): void {
    const g = this.presenceLayer;
    g.clear();
    const v = this.presenceView;
    const p = this.opts.presence;
    const seen = new Set<string>();
    if (v && p) {
      // Локи: цветная рамка держателя вокруг элемента. СВОЙ захват — тоже своим цветом
      // (выделение колоды/карты в пальцах читается «это моё»), рамка едет за драгом (onDragMoved).
      for (const [el, who] of Object.entries(v.held)) {
        const node = this.nodes.get(el);
        if (!node) continue;
        const w = CARD.w * node.body.scaleVal + 10;
        const h = CARD.h * node.body.scaleVal + 10;
        g.roundRect(node.body.px - w / 2, node.body.py - h / 2, w, h, 8).stroke({ width: 3, color: p.palette(who), alpha: 0.9 });
      }
      // Свой курсор — точкой своего цвета (без подписи: своё имя под пальцем — шум).
      if (this.ownCursor) {
        g.circle(this.ownCursor.x, this.ownCursor.y, 6).fill({ color: p.palette(p.who), alpha: 0.85 });
      }
      // Чужие курсоры: цветная точка с именем (призрак ходит только курсором — это весь его след).
      for (const [who, at] of Object.entries(v.cursors)) {
        if (who === p.who) continue;
        seen.add(who);
        const color = p.palette(who);
        g.circle(at.x, at.y, 7).fill({ color, alpha: 0.9 });
        g.circle(at.x, at.y, 11).stroke({ width: 2, color, alpha: 0.5 });
        let label = this.cursorLabels.get(who);
        if (!label) {
          label = new Text({ text: p.label?.(who) ?? who, style: { fontFamily: PIXEL_FONT, fontSize: 12, fill: color } });
          label.anchor.set(0, 0);
          this.presenceRoot.addChild(label);
          this.cursorLabels.set(who, label);
        }
        label.position.set(at.x + 12, at.y + 10);
      }
    }
    for (const [who, label] of this.cursorLabels) {
      if (seen.has(who)) continue;
      label.destroy();
      this.cursorLabels.delete(who);
    }
  }

  // ——— контекстное меню настроек (long-press по гриду/борде, ПКМ на десктопе) ———

  /** Цель меню под точкой: НЕ-free зона с рамкой (грид-стол) → "table"; free-бокс → "board".
   *  Область зоны — ОБЪЕДИНЕНИЕ её ячеек: у фикс-слотов (ring/grid) rect'ы лежат по слотам,
   *  и «стол» — это вся их рамка, а не первая клетка. */
  private menuTargetAt(cp: { x: number; y: number }): MenuTargetKind | null {
    if (!this.opts.menus) return null;
    let best: { kind: MenuTargetKind; area: number } | null = null;
    for (const zone of this.spec.zones) {
      let r: { x0: number; y0: number; x1: number; y1: number } | null = null;
      for (const [key, cell] of Object.entries(this.tree.cellRects)) {
        if (baseZoneId(zoneOf(key)) !== zone.id) continue;
        r = r
          ? { x0: Math.min(r.x0, cell.x), y0: Math.min(r.y0, cell.y), x1: Math.max(r.x1, cell.x + cell.w), y1: Math.max(r.y1, cell.y + cell.h) }
          : { x0: cell.x, y0: cell.y, x1: cell.x + cell.w, y1: cell.y + cell.h };
      }
      if (!r || cp.x < r.x0 || cp.x > r.x1 || cp.y < r.y0 || cp.y > r.y1) continue;
      const kind: MenuTargetKind = zone.layout.kind === "free" ? "board" : "table";
      const area = (r.x1 - r.x0) * (r.y1 - r.y0);
      // Самая внутренняя (меньшая) цель побеждает: грид лежит в центре бокса.
      if (!best || area < best.area) best = { kind, area };
    }
    return best?.kind ?? null;
  }

  protected hasContextAt(cp: { x: number; y: number }): boolean {
    return this.menuTargetAt(cp) !== null;
  }

  protected openContextMenu(cp: { x: number; y: number }, sp: { x: number; y: number }): void {
    this.closeMenu();
    // Сперва ЭЛЕМЕНТ под точкой: у колоды (free-стопки) и одиночной карты — свои меню действий.
    const el = this.hitElement(cp.x, cp.y);
    const slot = el ? this.tree.slotOf(el.id) : null;
    if (el && slot) {
      this.menuCtx = this.isFreeZone(baseZoneId(zoneOf(slot))) ? { kind: "deck", slot } : { kind: "card", id: el.id };
    } else {
      const target = this.menuTargetAt(cp);
      if (!target) return;
      this.menuCtx = { kind: target };
    }
    this.menuAt = { x: sp.x, y: sp.y };
    this.showMenu();
  }

  private menuRows(): { title: string; rows: readonly MenuRow[] } {
    const ctx = this.menuCtx;
    if (ctx.kind === "deck") {
      const rows: MenuRow[] = [
        { key: "shuffle", label: "перемешать", close: true, onSelect: () => this.shuffleDeck(ctx.slot) },
        { key: "deal", label: "раздать по 2", close: true, onSelect: () => this.autoDeal(ctx.slot) },
        ...(this.opts.menus?.deckExtras?.() ?? []),
      ];
      return { title: "колода", rows };
    }
    if (ctx.kind === "card") {
      const fx = this.cardFx.get(ctx.id) ?? {};
      const turned = (fx.rot ?? 0) !== 0;
      const slot = this.tree.slotOf(ctx.id);
      const faceUp = fx.face ?? (slot ? this.faceUpIn(ctx.id, slot) : true);
      return {
        title: "карта",
        rows: [
          { key: "turn", label: "поворот", value: turned ? "90°" : "0°", onSelect: () => this.toggleCardFx(ctx.id, "rot") },
          { key: "flip", label: "лицом", value: faceUp ? "вверх" : "вниз", onSelect: () => this.toggleCardFx(ctx.id, "face") },
        ],
      };
    }
    const hostMenu = this.opts.menus?.menuFor(ctx.kind);
    return hostMenu ?? { title: ctx.kind === "board" ? "борда" : "стол", rows: [] };
  }

  private showMenu(): void {
    const { title, rows } = this.menuRows();
    if (!rows.length) return;
    // После строки-настройки меню обновляется по месту (значение/состав строк сменились);
    // строка-действие (close) закрывает меню — действию мешать незачем.
    const wrapped = rows.map((row) => ({
      ...row,
      onSelect: () => {
        row.onSelect();
        if (row.close) this.closeMenu();
        else this.refreshMenu();
      },
    }));
    this.menu = new ContextMenu({ title, rows: wrapped });
    this.menu.place(this.menuAt.x, this.menuAt.y, this.width, this.height);
    this.chrome.addChild(this.menu.root);
    this.chromeButtons = [...this.actionButtons, ...this.toolButtons, ...this.menu.buttons];
    this.wake();
  }

  /** Обновить открытое меню по месту (после смены настройки состав/значения строк другие). */
  private refreshMenu(): void {
    if (!this.menu) return;
    this.closeMenu();
    this.showMenu();
  }

  /** Меню одиночной карты: поворот 90° / принудительный флип. Локальный визуал (cardFx). */
  private toggleCardFx(id: string, what: "rot" | "face"): void {
    const fx = { ...(this.cardFx.get(id) ?? {}) };
    if (what === "rot") fx.rot = (fx.rot ?? 0) === 0 ? Math.PI / 2 : 0;
    else {
      const slot = this.tree.slotOf(id);
      const cur = fx.face ?? (slot ? this.faceUpIn(id, slot) : true);
      fx.face = !cur;
    }
    this.cardFx.set(id, fx);
    this.rebuildBoard(false);
  }

  private closeMenu(): void {
    if (!this.menu) return;
    // Ховер мог указывать на строку меню: забыть ДО destroy, иначе снятие ховера трогает мёртвую Graphics.
    if (this.hoveredBtn && this.menu.buttons.includes(this.hoveredBtn)) this.hoveredBtn = null;
    this.menu.destroy();
    this.menu = null;
    this.chromeButtons = [...this.actionButtons, ...this.toolButtons];
    this.wake();
  }

  /** «Шурух»: верх стопки разлетается детерминированным веером и слетается уже перемешанным. */
  private shuffleDeck(slot: string): void {
    const members = this.state.field.slots[slot]?.members ?? [];
    const poses = shufflePoses(members.length);
    poses.forEach((pose, i) => {
      const id = members[members.length - 1 - i]!;
      const node = this.nodes.get(id);
      const home = this.homeVec(id);
      if (!node || !home) return;
      node.body.setTarget({ x: home.x + pose.dx, y: home.y + pose.dy, rot: pose.rot, scale: node.restScale });
    });
    this.after(SHUFFLE_FX_SECONDS, () => this.dispatch({ t: "shuffle", zone: baseZoneId(zoneOf(slot)) }));
    this.wake();
  }

  /** Автораздача: ВСЕГДА по две карты каждому занятому месту, пара «вшик-вшик», дальше — пауза.
   *  Каждый вылет — обычная команда move через порт: живой мастер увидит ровно те же ходы. */
  private autoDeal(slot: string): void {
    for (const step of autoDealPlan(this.state.seats, this.state.dealer)) {
      this.after(step.delay, () => {
        const members = this.state.field.slots[slot]?.members ?? [];
        const top = members[members.length - 1];
        if (top) this.dispatch({ t: "move", el: top, from: slot, to: handKey(step.seat) });
      });
    }
    this.wake();
  }

  /** Сменить спеку на лету: жители пересыпаются migrateState, драйвер пересоздаётся с готовым
   *  снимком. Работает только со СВОИМ localDriver (standalone); зовёт хост меню (menus). */
  reconfigure(spec: BoardSpec, seats?: number): void {
    this.spec = spec;
    this.defs = elementById(spec);
    this.state = migrateState(this.state, spec, seats);
    this.driver = localDriver(spec, seats, undefined, this.state);
    this.driver.onState((s) => {
      this.state = s;
      this.rebuildBoard(false);
    });
    this.rebuildBoard(false);
  }

  /** Тап мимо меню закрывает его (по строкам меню тап не доходит — их ловит chromeButtons). */
  protected onSceneTap(content: { x: number; y: number }, screen: { x: number; y: number }): void {
    if (this.menu && !this.menu.contains(screen.x, screen.y)) {
      this.closeMenu();
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
    this.scene.surface.addChild(this.decorLayer, this.hintLayer);
    this.presenceRoot.addChild(this.presenceLayer);
    this.content.addChild(this.presenceRoot); // ПОСЛЕДНИМ ребёнком контента: локи и курсоры поверх карт
    this.chrome.addChildAt(this.dropBar.root, 0); // свой НИЖНИЙ слой HUD: меню и кнопки — поверх
    this.buildActionBar();
    this.rebuildBoard(true);
  }

  private buildActionBar(): void {
    for (const action of this.spec.actions) {
      const b = new Button({ label: action.label, size: "sm", variant: "secondary", onClick: () => this.dispatch(action.command) });
      this.chrome.addChild(b.root);
      this.actionButtons.push(b);
    }
    // Инструменты хоста (live и т.п.) — канвасом в правом верхнем углу: HTML в игре запрещён.
    for (const tool of this.opts.tools ?? []) {
      const b = new Button({ label: tool.label, size: "sm", variant: "secondary", onClick: tool.onClick });
      this.chrome.addChild(b.root);
      this.toolButtons.push(b);
    }
    this.badgeText = new Text({ text: "", style: { fontFamily: PIXEL_FONT, fontSize: 14, fill: COLORS.gold } });
    this.badgeText.anchor.set(1, 0.5);
    this.chrome.addChild(this.badgeText);
    this.diceText = new Text({ text: "", style: { fontFamily: PIXEL_FONT, fontSize: 20, fill: COLORS.gold } });
    this.diceText.anchor.set(1, 0.5);
    this.chrome.addChild(this.diceText);
    this.chromeButtons = [...this.actionButtons, ...this.toolButtons];
  }

  /** Строка статуса хоста у инструментов (live: «ник · комната 1234»). Пустая строка — спрятать. */
  setBadge(text: string): void {
    if (!this.badgeText) return;
    this.badgeText.text = text;
    this.badgeText.style.fill = this.accentColor(); // профиль — цветом игрока
    this.layoutChrome(this.width, this.height);
    this.wake();
  }

  protected layoutChrome(w: number, h: number): void {
    let x = 12;
    const y = h - 26;
    for (const b of this.actionButtons) {
      b.place(x + b.w / 2, y);
      x += b.w + 8;
    }
    // Инструменты — от правого края, бейдж — слева от них.
    let rx = w - 12;
    for (const b of [...this.toolButtons].reverse()) {
      b.place(rx - b.w / 2, 30);
      rx -= b.w + 8;
    }
    this.badgeText?.position.set(rx, 30);
    this.diceText?.position.set(w - 12, y);
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

  private rebuildBoard(snap: boolean): void {
    this.tree = buildBoardTree(this.spec, this.state, this.selfSeat);
    if (!this.tex) return;

    const alive = new Set<string>();
    this.cardDepth.clear();
    const slotOrder = new Map<string, number>();
    Object.keys(this.tree.origins).forEach((id, i) => slotOrder.set(id, i));

    const place = (id: string, indexInPile: number): void => {
      alive.add(id);
      const slot = this.tree.slotOf(id);
      const home = this.homeVec(id);
      if (!slot || !home) return;
      const node = this.nodeFor(id);
      const depth = (slotOrder.get(slot) ?? 0) * 1000 + indexInPile;
      this.cardDepth.set(id, depth);
      node.root.zIndex = depth;
      node.setState(node.pose);
      this.placeCard(node);
      const scale = this.scaleIn(node, slot);
      const fx = this.cardFx.get(id);
      const wantFace = fx?.face ?? this.faceUpIn(id, slot);
      if (node instanceof Card && node.faceUp !== wantFace) node.requestFlip();
      const target = { x: home.x, y: home.y, rot: fx?.rot ?? 0, scale };
      if (snap) node.body.snapTo(target);
      else node.body.setTarget(target);
    };

    for (const key of Object.keys(this.state.field.slots)) {
      const members = this.state.field.slots[key]!.members;
      members.forEach((id, i) => place(id, i));
    }

    for (const [id, node] of this.nodes) {
      if (alive.has(id)) continue;
      node.destroy();
      this.nodes.delete(id);
      this.byId.delete(id);
    }

    this.contentW = this.tree.size.w;
    this.contentH = this.tree.size.h;
    this.syncSeats();
    this.paintDecor();
    this.paintHints();
    this.paintPresence();
    this.syncDice();
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

  /** Сдвиг свободной стопки для слота (0 для обычных зон). */
  private offsetOf(slot: string): { x: number; y: number } {
    const zone = baseZoneId(zoneOf(slot));
    return (this.isFreeZone(zone) ? this.freeOffset.get(zone) : null) ?? { x: 0, y: 0 };
  }

  /** Дом элемента = дерево-дом + сдвиг его свободной стопки. Общая точка для рендера и возврата. */
  private homeVec(id: string): { x: number; y: number } | null {
    const base = this.tree.homeOf(id);
    if (!base) return null;
    const slot = this.tree.slotOf(id);
    const off = slot ? this.offsetOf(slot) : { x: 0, y: 0 };
    return { x: base.x + off.x, y: base.y + off.y };
  }

  /** Масштаб узла в слоте: в полосе чужого места карта ужимается до строки рубашек. */
  private scaleIn(node: BoardNode, slot: string): number {
    if (!(node instanceof Card)) return node.restScale;
    const strip = zoneOf(slot) === "seat";
    return (strip ? SEAT_STRIP_CARD_H / CARD.h : 1) * node.restScale;
  }

  private nodeFor(id: string): BoardNode {
    const existing = this.nodes.get(id);
    if (existing) return existing;
    const def = this.defs.get(id);
    let node: BoardNode;
    if (!def || def.kind === "card") {
      node = new Card({ id, card: def?.kind === "card" ? def.face : "A♠", faceUp: true, flippable: true }, this.tex!, CARD.h / TEX_H);
    } else {
      const spec: PieceSpec =
        def.kind === "piece" ? { kind: "chess", dark: def.dark, glyph: def.glyph } : { kind: "chip", color: 0x2e6b45, denom: String(def.denom) };
      node = buildPiece(id, spec, 30, this.app?.renderer ?? null);
    }
    this.nodes.set(id, node);
    this.byId.set(id, node);
    return node;
  }

  /** Подписи мест: имя/«свободно», у чьего хода — золотая метка. Свой ход виден у руки. */
  private syncSeats(): void {
    // Соло-борда (одно место, песочница): ни хода, ни дилера, ни соседей — подпись места была бы
    // шумом «► Игрок 1 ♛» под пустым столом. Гасим все метки мест и выходим.
    if (this.state.seats.length <= 1) {
      for (const [id, label] of this.seatLabels) {
        label.destroy();
        this.seatLabels.delete(id);
      }
      return;
    }
    const seen = new Set<string>();
    for (const [i, seat] of this.state.seats.entries()) {
      const isTurn = this.state.turn.at === i;
      const key = seat.id === this.selfSeat ? `hand:${seat.id}` : `seat:${seat.id}`;
      // У борды без рук (шахматы) своему месту негде жить в дереве — подпись встаёт в левый
      // низ стола: маркер хода и «♛» обязаны быть видимы и там.
      const origin = this.tree.origins[key] ?? (seat.id === this.selfSeat ? { x: 40, y: this.tree.size.h - 4 } : undefined);
      if (!origin) continue;
      seen.add(seat.id);
      let label = this.seatLabels.get(seat.id);
      if (!label) {
        label = new Text({ style: { fontFamily: PIXEL_FONT, fontSize: 13, align: "left" } });
        label.anchor.set(0, 1);
        this.scene.surface.addChild(label);
        this.seatLabels.set(seat.id, label);
      }
      const who = seat.occupant ?? "свободно";
      const dealer = seat.id === this.state.dealer ? " ♛" : "";
      label.text = `${isTurn ? "► " : ""}${who}${dealer}`;
      const p = this.opts.presence;
      const isMe = !!p && seat.occupant !== null && seat.occupant === (p.label?.(p.who) ?? p.who);
      label.style.fill = isMe ? this.accentColor() : isTurn ? COLORS.gold : seat.occupant ? COLORS.seatName : COLORS.seatNameOff;
      label.position.set(origin.x, origin.y - 6);
    }
    for (const [id, label] of this.seatLabels) {
      if (seen.has(id)) continue;
      label.destroy();
      this.seatLabels.delete(id);
    }
  }

  /** Декор: фон-клетки (шахматная раскраска), контуры зон, подписи. perSeat-экземпляры
   *  («gear@p2») находят свою спеку через baseZoneId и получают КАЖДЫЙ свою подпись. */
  private paintDecor(): void {
    const g = this.decorLayer;
    g.clear();
    // Рантайм-зоны: экземпляр → первый слот (для подписи).
    const runtime = new Map<string, string>();
    for (const key of Object.keys(this.tree.origins)) {
      const z = zoneOf(key);
      if (!runtime.has(z)) runtime.set(z, key);
    }
    const seen = new Set<string>();
    for (const [zid, firstKey] of runtime) {
      const zone = this.spec.zones.find((z) => z.id === baseZoneId(zid));
      if (!zone) continue;
      const cell = zone.cell ?? { w: 100, h: 143 };
      // Ячейки зоны: слоты (origins) ∪ декор-ячейки без слота (cellRects «:phN» — пустые позиции
      // радиального круга). Заготовки — просто рамки, дроп в них решает контейнер, не они.
      const rects = new Map<string, { x: number; y: number; w: number; h: number }>();
      for (const [key, at] of Object.entries(this.tree.origins)) {
        if (zoneOf(key) !== zid) continue;
        rects.set(key, this.tree.cellRects[key] ?? { x: at.x, y: at.y, w: cell.w, h: cell.h });
      }
      for (const [key, r] of Object.entries(this.tree.cellRects)) {
        if (zoneOf(key) === zid && !rects.has(key)) rects.set(key, r);
      }
      for (const [key, r] of rects) {
        if (zone.background === "chessboard") {
          const m = key.match(/r(\d+)c(\d+)$/);
          const dark = m ? (Number(m[1]) + Number(m[2])) % 2 === 1 : false;
          g.rect(r.x, r.y, r.w, r.h).fill({ color: dark ? 0x27352c : 0x3a4a3f });
          g.rect(r.x, r.y, r.w, r.h).stroke({ width: 1, color: 0x1e2a23 });
        } else if (zone.shape === "circle") {
          // РОВНЫЙ круг, вписанный в бокс зоны; пунктир — дугами чистой функции (Pixi dash не умеет).
          const cx = r.x + r.w / 2;
          const cy = r.y + r.h / 2;
          const rad = Math.min(r.w, r.h) / 2;
          if (zone.frame === "dashed") {
            for (const a of dashedCircleArcs(rad, 12, 9)) {
              g.moveTo(cx + rad * Math.cos(a.start), cy + rad * Math.sin(a.start)).arc(cx, cy, rad, a.start, a.end);
            }
            g.stroke({ width: 1.5, color: 0x50604f, alpha: 0.85 });
          } else {
            g.circle(cx, cy, rad).stroke({ width: 1.5, color: 0x50604f, alpha: 0.8 });
          }
        } else if (zone.frame === "dashed") {
          // Стиль дроп-зоны: пунктирная рамка (Pixi v8 dash сам не умеет — сегменты чистой функцией).
          for (const s of dashedRectSegments(r.x, r.y, r.w, r.h, 12, 9)) g.moveTo(s.x1, s.y1).lineTo(s.x2, s.y2);
          g.stroke({ width: 1.5, color: 0x50604f, alpha: 0.85 });
        } else {
          g.roundRect(r.x, r.y, r.w, r.h, 6).stroke({ width: 1.5, color: 0x50604f, alpha: 0.8 });
        }
      }
      if (!zone.title) continue;
      seen.add(zid);
      let label = this.zoneLabels.get(zid);
      if (!label) {
        label = new Text({ text: zone.title, style: { fontFamily: PIXEL_FONT, fontSize: 13, fill: COLORS.gold } });
        label.anchor.set(0, 1);
        this.scene.surface.addChild(label);
        this.zoneLabels.set(zid, label);
      }
      const at = this.tree.origins[firstKey]!;
      label.position.set(at.x, at.y - 6);
    }
    // Экземпляры, исчезнувшие с пересборкой (ушёл игрок) — снести подписи.
    for (const [zid, label] of this.zoneLabels) {
      if (seen.has(zid)) continue;
      label.destroy();
      this.zoneLabels.delete(zid);
    }
  }

  /** Подсветка целевого слота под пальцем — по cellRects/размеру слота из дерева.
   *  ФОРМА подсветки следует форме зоны: круглая зона подсвечивается КРУГОМ, не квадратом. */
  private paintHints(): void {
    const g = this.hintLayer;
    g.clear();
    if (!this.dragging || !this.hotSlot) return;
    const accent = this.accentColor(); // в live подсветки — цвета ИГРОКА, не общее золото
    const r = this.tree.cellRects[this.hotSlot];
    if (r) {
      const zone = this.spec.zones.find((z) => z.id === baseZoneId(zoneOf(this.hotSlot!)));
      if (zone?.shape === "circle") {
        g.circle(r.x + r.w / 2, r.y + r.h / 2, Math.min(r.w, r.h) / 2 + 3).stroke({ width: 3, color: accent });
      } else {
        g.roundRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4, 8).stroke({ width: 3, color: accent });
      }
      return;
    }
    const at = this.tree.origins[this.hotSlot];
    if (at) g.roundRect(at.x - 4, at.y - 4, CARD.w + 8, CARD.h + 8, 8).stroke({ width: 3, color: accent });
  }

  private syncDice(): void {
    if (!this.diceText) return;
    this.diceText.text = this.state.dice.length ? `🎲 ${this.state.dice.join(" + ")}` : "";
  }

  // ——— швы домена ———

  protected draggables(): SceneElement[] {
    return [...this.nodes.values()];
  }

  protected everyElement(): TableElement[] {
    return [...this.nodes.values()];
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
    return home ? { home, depth: this.cardDepth.get(el.id) ?? 0 } : null;
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
    if (this.reorderModeOf(slot)) return true;
    const members = this.state.field.slots[slot]?.members ?? [];
    return members[members.length - 1] === el.id;
  }

  /** У жителей free-стопки ДВА драг-интента: тап тащит верхнюю карту, hold — всю колоду блоком. */
  protected dragOnHold(el: SceneElement): boolean {
    const slot = this.tree.slotOf(el.id);
    return !!slot && this.isFreeZone(baseZoneId(zoneOf(slot)));
  }

  protected beginDrag(el: SceneElement, cp: { x: number; y: number }, sp: { x: number; y: number }): boolean {
    this.closeMenu(); // начался драг — меню больше не к месту
    // Live-лок: гонка на первом касании решается хабом; отказ — элемент уже у другого.
    const p = this.opts.presence;
    if (p) {
      if (!p.hub.grab(p.who, el.id)) return false;
      this.grabbedEl = el.id;
    }
    this.dragging = true;
    const slot = this.tree.slotOf(el.id);
    const zone = slot ? baseZoneId(zoneOf(slot)) : null;
    if (slot && zone && this.isFreeZone(zone) && this.grabMode === "hold") {
      // Тащим ВСЮ стопку как блок: жест берёт весь слот, а не верхнюю карту (одиночную не вынуть).
      // GroupDrag ведёт все карты жёстко за пальцем со СВОИМИ текущими сдвигами (форма стопки цела);
      // на дропе сцена сдвинет freeOffset, и release посадит каждую в новый дом.
      const members = this.state.field.slots[slot]?.members ?? [];
      const nodes = members.map((id) => this.nodes.get(id)).filter((n): n is BoardNode => !!n);
      if (nodes.length) {
        const offsets = nodes.map((n) => ({ dx: n.body.px - cp.x, dy: n.body.py - cp.y }));
        this.blockZone = zone;
        this.blockGrab = { x: cp.x, y: cp.y };
        this.drag = new GroupDrag(nodes, offsets, this.dragCtx);
        this.drag.move(cp);
        // Колода в пальцах → снизу прилипают фикс-зоны её меню (мобильный заменитель ПКМ).
        this.dropBar.show([{ key: "menu", label: "настройка" }, { key: "shuffle", label: "перемешать" }], this.width, this.height, this.accentColor());
        return true;
      }
    }
    const ok = super.beginDrag(el, cp, sp);
    // Одиночная карта в пальцах: у неё тоже есть меню — зона «настройка».
    if (ok) this.dropBar.show([{ key: "menu", label: "настройка" }], this.width, this.height, this.accentColor());
    return ok;
  }

  /** Пока что-то удержано, слой присутствия перерисовывается ПОКАДРОВО: тела едут пружинами
   *  после события, и рамка, снятая в момент move, отставала бы от груза. */
  protected stepScene(dt: number): boolean {
    if (this.opts.presence && this.presenceView && Object.keys(this.presenceView.held).length) this.paintPresence();
    return super.stepScene(dt);
  }

  protected onDragMoved(p: { x: number; y: number }): void {
    if (this.dropBar.visible) {
      this.dropBar.hotAt(this.dragScreen.x, this.dragScreen.y);
      this.wake();
    }
    if (this.blockZone) return; // блок-драг колоды: бокс не подсвечиваем никак
    const target = dropTarget(this.tree.root, p);
    const hot = target?.group.id ?? null;
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
      const wasBlock = this.blockZone;
      this.blockZone = null; // сдвиг колоды не меняем — стопка вернётся, откуда поднята
      drag.release();
      if (slot) {
        if (bar === "shuffle") {
          this.shuffleDeck(slot);
        } else {
          this.menuCtx = wasBlock ? { kind: "deck", slot } : { kind: "card", id: el.id };
          this.menuAt = { x: this.dragScreen.x, y: this.dragScreen.y - 200 };
          this.showMenu();
        }
      }
      return;
    }
    if (this.blockZone) {
      // Блок-драг колоды: бросить можно ТОЛЬКО в её бокс (рамка зоны). Внутри — копим сдвиг, держа
      // стопку целиком в боксе; мимо — сдвиг не меняем, release вернёт стопку к месту подъёма.
      // Вся геометрия — в чистой blockDropOffset (freeBox.ts), под юнит-тестом.
      const box = this.tree.cellRects[`${this.blockZone}:0`];
      const members = this.state.field.slots[`${this.blockZone}:0`]?.members ?? [];
      const base = members.length ? this.tree.homeOf(members[0]!) : null;
      if (box && base) {
        const spread = 0.5 * Math.max(0, members.length - 1); // стаггер стопки (см. boardTree free)
        const half = { w: CARD.w / 2 + spread, h: CARD.h / 2 + spread };
        const cur = this.freeOffset.get(this.blockZone) ?? { x: 0, y: 0 };
        this.freeOffset.set(this.blockZone, blockDropOffset(box, cur, this.blockGrab, cp, base, half));
      }
      this.blockZone = null;
      drag.release();
      return;
    }
    const from = this.tree.slotOf(el.id);
    const target = dropTarget(this.tree.root, cp);
    const to = target?.group.id ?? null;
    const myHand = handKey(this.selfSeat);
    if (from === myHand && to === myHand && this.spec.hand?.reorder) {
      // Реордер руки — та же дверь порта, что и любой ход (сервер потом получит эту же команду).
      const members = this.state.field.slots[myHand]?.members ?? [];
      const order = handOrderAfterDrop(members, el.id, target?.index ?? members.length);
      this.dispatch({ t: "reorderHand", seat: this.selfSeat, order });
    } else if (from && to === from && this.reorderModeOf(from)) {
      // Дроп внутри реордер-зоны (flow-грид): вставка на позицию или обмен местами.
      // У вставки индекс — ЩЕЛЬ (его даёт dropTarget), у обмена — КЛЕТКА: цель обмена ищется
      // как ближайший к пальцу житель, индекс вставки тут соврал бы на полклетки.
      const members = this.state.field.slots[from]?.members ?? [];
      const mode = this.reorderModeOf(from)!;
      const order =
        mode === "swap"
          ? swappedOrder(members, el.id, this.nearestMemberIndex(members, el.id, cp))
          : handOrderAfterDrop(members, el.id, target?.index ?? members.length);
      this.dispatch({ t: "reorderSlot", key: from, order });
    } else if (from && to && to !== from && zoneOf(to) !== "seat") {
      this.dispatch({ t: "move", el: el.id, from, to });
    }
    drag.release(); // состояние уже новое: дом = целевой слот, release долетает туда
  }

  /** Ближайший к точке дропа житель контейнера (кроме самого груза) — цель обмена. */
  private nearestMemberIndex(members: readonly string[], dragged: string, cp: { x: number; y: number }): number {
    let best = -1;
    let bestD = Infinity;
    members.forEach((m, i) => {
      if (m === dragged) return;
      const h = this.tree.homeOf(m);
      if (!h) return;
      const d = Math.hypot(h.x - cp.x, h.y - cp.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  /** Режим внутризонного реордера слота: из спеки зоны; flow-грид реордерится по умолчанию. */
  private reorderModeOf(slot: string): "insert" | "swap" | null {
    const zone = this.spec.zones.find((z) => z.id === baseZoneId(zoneOf(slot)));
    if (!zone) return null;
    return zone.reorder ?? (zone.layout.kind === "flow" ? "insert" : null);
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
    this.blockZone = null; // отмена/конец блок-драга: не тащим сдвиг в следующий жест
    this.dropBar.hide(); // фикс-зоны живут только пока элемент в пальцах
    if (this.grabbedEl && this.opts.presence) {
      this.opts.presence.hub.release(this.opts.presence.who, this.grabbedEl);
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
    for (const [id, node] of this.nodes) {
      const p = this.contentToScreen(node.body.px, node.body.py);
      cards[id] = { x: p.x, y: p.y, slot: this.tree.slotOf(id) };
    }
    return { slots, cards, seats: this.state.seats, turn: this.state.turn, dice: [...this.state.dice] };
  }

  protected onTeardown(app: Application): void {
    this.closeMenu();
    this.dropBar.destroy();
    for (const l of this.cursorLabels.values()) l.destroy();
    this.cursorLabels.clear();
    for (const node of this.nodes.values()) node.destroy();
    this.nodes.clear();
    for (const l of this.seatLabels.values()) l.destroy();
    this.seatLabels.clear();
    for (const l of this.zoneLabels.values()) l.destroy();
    this.zoneLabels.clear();
    this.tex?.destroy();
    this.tex = null;
    super.onTeardown(app);
  }
}
