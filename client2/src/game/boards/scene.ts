import { Application, Graphics, Text } from "pixi.js";
import { SceneEngine, type SceneElement } from "../engine/sceneEngine";
import { TEX_H, PIXEL_FONT, COLORS } from "../engine/constants";
import { Card } from "../ui/Card";
import { CardTextureCache } from "../ui/CardTextureCache";
import { Button } from "../ui/Button";
import { buildPiece, type PieceSpec } from "../ui/pieceKinds";
import type { Piece } from "../ui/Piece";
import type { TableElement } from "../engine/element";
import { dropTarget } from "../slot/slot";
import { CARD } from "../crossade/tree";
import { buildBoardTree, type BoardTree } from "./boardTree";
import { localDriver, type BoardDriver } from "./driver";
import { handKey, type BoardState } from "./state";
import { baseZoneId, elementById, zoneOf, type BoardCommand, type BoardSpec, type ElementDef } from "./spec";
import { handOrderAfterDrop } from "../crossade/handOrder";

// СЦЕНА БОРДЫ — ОДНА, generic (BOARDS-DESIGN §4): конкретная борда — данные BoardSpec, не
// подкласс. Доктрина сцен проекта: снимок состояния — единственная правда, ход уходит в ПОРТ
// (dispatch → смарт-мок applyCommand), сцена правил не проверяет; камера/ввод/драг/тени — из
// SceneEngine. Кнопки ActionBar — те же команды порта, что и палец (два драйвера одной двери).

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const SEAT_STRIP_CARD_H = 83;

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
}

type BoardNode = Card | Piece;

export class BoardScene extends SceneEngine {
  private tex: CardTextureCache | null = null;
  private readonly nodes = new Map<string, BoardNode>();
  private readonly cardDepth = new Map<string, number>();
  private readonly seatLabels = new Map<string, Text>();
  private readonly zoneLabels = new Map<string, Text>();
  private readonly decorLayer = new Graphics();
  private readonly hintLayer = new Graphics();
  private actionButtons: Button[] = [];
  private diceText: Text | null = null;

  private readonly spec: BoardSpec;
  private readonly defs: ReadonlyMap<string, ElementDef>;
  private readonly selfSeat: string;
  private readonly driver: BoardDriver;
  private state: BoardState;
  private tree: BoardTree;

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
    this.tree = buildBoardTree(this.spec, this.state, this.selfSeat);
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
    this.buildActionBar();
    this.rebuildBoard(true);
  }

  private buildActionBar(): void {
    for (const action of this.spec.actions) {
      const b = new Button({ label: action.label, size: "sm", variant: "secondary", onClick: () => this.dispatch(action.command) });
      this.chrome.addChild(b.root);
      this.actionButtons.push(b);
    }
    this.diceText = new Text({ text: "", style: { fontFamily: PIXEL_FONT, fontSize: 20, fill: COLORS.gold } });
    this.diceText.anchor.set(1, 0.5);
    this.chrome.addChild(this.diceText);
    this.chromeButtons = this.actionButtons;
  }

  protected layoutChrome(w: number, h: number): void {
    let x = 12;
    const y = h - 26;
    for (const b of this.actionButtons) {
      b.place(x + b.w / 2, y);
      x += b.w + 8;
    }
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
      const home = this.tree.homeOf(id);
      if (!slot || !home) return;
      const node = this.nodeFor(id);
      const depth = (slotOrder.get(slot) ?? 0) * 1000 + indexInPile;
      this.cardDepth.set(id, depth);
      node.root.zIndex = depth;
      node.setState(node.pose);
      this.placeCard(node);
      const scale = this.scaleIn(node, slot);
      if (node instanceof Card && node.faceUp !== this.faceUpIn(id, slot)) node.requestFlip();
      const target = { x: home.x, y: home.y, rot: 0, scale };
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
    this.syncDice();
    this.clampView();
    this.applyView();
    this.emitView();
    this.wake();
  }

  /** Лицом или рубашкой лежит карта В ЭТОМ слоте: колода и чужие руки — рубашкой. */
  private faceUpIn(id: string, slot: string): boolean {
    const def = this.defs.get(id);
    if (def?.kind !== "card") return true;
    const zone = zoneOf(slot);
    if (zone === "seat") return false;
    const zs = this.spec.zones.find((z) => z.id === zone);
    return !(zs?.layout.kind === "pile" && zs.id === "deck");
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
      label.style.fill = isTurn ? COLORS.gold : seat.occupant ? COLORS.seatName : COLORS.seatNameOff;
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
      for (const [key, at] of Object.entries(this.tree.origins)) {
        if (zoneOf(key) !== zid) continue;
        const r = this.tree.cellRects[key] ?? { x: at.x, y: at.y, w: cell.w, h: cell.h };
        if (zone.background === "chessboard") {
          const m = key.match(/r(\d+)c(\d+)$/);
          const dark = m ? (Number(m[1]) + Number(m[2])) % 2 === 1 : false;
          g.rect(r.x, r.y, r.w, r.h).fill({ color: dark ? 0x27352c : 0x3a4a3f });
          g.rect(r.x, r.y, r.w, r.h).stroke({ width: 1, color: 0x1e2a23 });
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

  /** Подсветка целевого слота под пальцем — по cellRects/размеру слота из дерева. */
  private paintHints(): void {
    const g = this.hintLayer;
    g.clear();
    if (!this.dragging || !this.hotSlot) return;
    const r = this.tree.cellRects[this.hotSlot];
    if (r) {
      g.roundRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4, 8).stroke({ width: 3, color: COLORS.gold });
      return;
    }
    const at = this.tree.origins[this.hotSlot];
    if (at) g.roundRect(at.x - 4, at.y - 4, CARD.w + 8, CARD.h + 8, 8).stroke({ width: 3, color: COLORS.gold });
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

  protected homeOf(el: SceneElement): { home: { x: number; y: number }; depth: number } | null {
    const home = this.tree.homeOf(el.id);
    return home ? { home, depth: this.cardDepth.get(el.id) ?? 0 } : null;
  }

  /** Смарт-мок щедрый: тащится верх любого слота стола и любая карта своей руки. Чужая рука —
   *  нет (приватность), правила «чей ход» ничего не запрещают (индикация, BOARDS-DESIGN §3). */
  protected canDrag(el: SceneElement): boolean {
    if (this.opts.interactive === false) return false;
    const slot = this.tree.slotOf(el.id);
    if (!slot) return false;
    const zone = zoneOf(slot);
    if (zone === "seat") return false;
    if (slot === handKey(this.selfSeat)) return true;
    const members = this.state.field.slots[slot]?.members ?? [];
    return members[members.length - 1] === el.id;
  }

  protected beginDrag(el: SceneElement, cp: { x: number; y: number }, sp: { x: number; y: number }): boolean {
    this.dragging = true;
    return super.beginDrag(el, cp, sp);
  }

  protected onDragMoved(p: { x: number; y: number }): void {
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
    const from = this.tree.slotOf(el.id);
    const target = dropTarget(this.tree.root, cp);
    const to = target?.group.id ?? null;
    const myHand = handKey(this.selfSeat);
    if (from === myHand && to === myHand && this.spec.hand?.reorder) {
      // Реордер руки — та же дверь порта, что и любой ход (сервер потом получит эту же команду).
      const members = this.state.field.slots[myHand]?.members ?? [];
      const order = handOrderAfterDrop(members, el.id, target?.index ?? members.length);
      this.dispatch({ t: "reorderHand", seat: this.selfSeat, order });
    } else if (from && to && to !== from && zoneOf(to) !== "seat") {
      this.dispatch({ t: "move", el: el.id, from, to });
    }
    drag.release(); // состояние уже новое: дом = целевой слот, release долетает туда
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
