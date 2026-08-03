import { Application, Graphics, Text } from "pixi.js";
import { SceneEngine, type SceneElement } from "../engine/sceneEngine";
import { TEX_H, TEX_W, PIXEL_FONT, COLORS } from "../engine/constants";
import { Card } from "../ui/Card";
import { CardTextureCache } from "../ui/CardTextureCache";
import type { TableElement } from "../engine/element";
import { dropTarget } from "../slot/slot";
import { CARD, SEAT } from "../crossade/tree";
import { buildMultiplayerTree, type MultiplayerTree } from "./tree";
import type { CrossadeState } from "../crossade/state";
import { makePort, bindRoom, type BindableRoom, type CrossadePort, type CrossadeSignal, type SendableRoom } from "../crossade/net";
import { sameOrder, sameZones } from "../crossade/diff";
import { paintSlots } from "../crossade/slotPaint";
import { handOrderAfterDrop } from "../crossade/handOrder";
import {
  approvedIn,
  pendingIndicatorVisible,
  rejectedCards,
  PENDING_SPINNER_SPEED,
  PENDING_TIMEOUT_S,
  type PendingKind,
} from "./pending";

// СЦЕНА ДЕБАГ-СТОЛА MULTIPLAYER — усечённый CrossadeScene (см. crossade/scene.ts, доктрина та же):
// снимок сети — единственная правда, ход уходит в порт, сцена правил не дублирует. Всё, чего тут
// НЕТ по сравнению с Crossade, вычеркнуто дизайном (docs/MULTIPLAYER-DESIGN.md): колода, сброс,
// фазы, дилер, HUD-кнопки — у дебаг-стола одна общая зона и своя рука, руки уже розданы мастером.
//
// Room сюда приходит duck-типом (SendableRoom & BindableRoom) — в стори это LocalClient локального
// мастера (localTable.ts), на проде может быть настоящая colyseus-комната. Сцена разницы не видит.

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;

export interface MultiplayerSceneOptions {
  room: SendableRoom & BindableRoom;
  selfSessionId: string;
}

function emptyState(selfSessionId: string): CrossadeState {
  return {
    phase: "playing",
    freeMode: true,
    deckFanned: false,
    deckRev: 0,
    inviteCode: "",
    deck: [],
    discard: [],
    play: [],
    seats: [],
    selfSessionId,
    selfHand: [],
  };
}

function topOf(arr: readonly string[]): string | undefined {
  return arr[arr.length - 1];
}

export class MultiplayerScene extends SceneEngine {
  private tex: CardTextureCache | null = null;
  protected readonly nodes = new Map<string, Card>();
  private readonly cardDepth = new Map<string, number>();
  protected readonly seatLabels = new Map<string, Text>();
  private readonly slotLayer = new Graphics();
  private notice!: Text;

  protected state: CrossadeState;
  protected tree: MultiplayerTree;
  protected readonly port: CrossadePort;
  private readonly disposeRoom: () => void;

  private hotSlot: string | null = null;
  private armedSlots: ReadonlySet<string> = new Set();

  /** Ходы, ждущие одобрения сервера (pending.ts): карта висит в точке дропа поднятой, пока эхо
   *  снимка не положит её в целевую зону (или отказ/таймаут не вернёт домой). token — страховка
   *  таймеров after(): отменять их нечем, поэтому сработавший таймер сам проверяет, что ждёт всё
   *  ЕЩЁ ТОТ ЖЕ ход, а не следующий той же картой. spinner/overlay — индикатор затянувшегося
   *  запроса, оба живут ДЕТЬМИ node.root: наследуют все трансформы карты (дыхание, полёт,
   *  масштаб позы) и потому не нуждаются в своей синхронизации позиции. touchLocal — точка
   *  касания на карте в её ЛОКАЛЬНЫХ (текстурных) координатах: спиннер встаёт под палец. */
  private readonly pending = new Map<
    string,
    {
      kind: PendingKind;
      token: number;
      age: number;
      touchLocal: { x: number; y: number };
      spinner: Graphics | null;
      overlay: Graphics | null;
    }
  >();
  private pendingToken = 0;
  /** Смещение центра карты от пальца на СТАРТЕ драга — им считается точка касания на элементе. */
  private grabOffset = { x: 0, y: 0 };

  constructor(opts: MultiplayerSceneOptions) {
    super({ minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, margin: 0, align: "center" });
    this.state = emptyState(opts.selfSessionId);
    this.tree = this.buildTree(this.state);
    this.port = makePort(opts.room);
    const bound = bindRoom(opts.room, { self: opts.selfSessionId, onState: this.applyState, onSignal: this.applySignal });
    this.disposeRoom = bound.dispose;
  }

  // ——— швы наследников (LiveTableScene): дерево, состав карт, вид карты, жесты ———

  /** Какое дерево слотов строит эта сцена. Зовётся и из КОНСТРУКТОРА БАЗЫ — поля наследника в
   *  этот момент ещё не инициализированы, переопределение обязано это переживать. */
  protected buildTree(state: CrossadeState): MultiplayerTree {
    return buildMultiplayerTree(state);
  }

  /** Раздать place() все карты доски. Сброс в базовом дереве слота не имеет и потому не рисуется
   *  (place молча пропускает карту без слота) — наследник со сбросом получает его бесплатно. */
  protected placeCards(state: CrossadeState, place: (cardId: string, indexInPile: number) => void): void {
    state.play.forEach((stack) => stack.forEach((c, i) => place(c, i)));
    state.discard.forEach((c, i) => place(c, i));
    state.selfHand.forEach((c, i) => place(c, i));
  }

  /** Лицом или рубашкой создаётся карта. База — всё лицом (рука своя, зона открыта). */
  protected faceUpFor(_cardId: string): boolean {
    return true;
  }

  /** Масштаб карты по id — рубашки чужих рук у наследника мельче стольных. */
  protected cardScaleFor(_cardId: string): number {
    return CARD.h / TEX_H;
  }

  /** Жесты драга для трансляции (live-режим): база молчит. Фаза "release" приходит без точки. */
  protected emitGesture(_phase: "grab" | "move" | "release", _cardId: string, _cp: { x: number; y: number } | null): void {}

  protected buildScene(app: Application): void {
    this.tex = new CardTextureCache(app);
    this.scene.surface.addChild(this.slotLayer);
    this.notice = new Text({ text: "", style: { fontFamily: PIXEL_FONT, fontSize: 18, fill: 0xe0483f, align: "center" } });
    this.notice.anchor.set(0.5, 0);
    this.notice.visible = false;
    this.chrome.addChild(this.notice);
    this.rebuildBoard(true);
  }

  protected layoutChrome(w: number): void {
    this.notice.position.set(w / 2, 8);
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
    this.viewport.setZoom(Math.min(1, this.width / this.tree.size.w, this.height / this.tree.size.h));
    this.clampView();
    this.applyView();
    this.emitView();
  }

  // ——— сеть → доска ———

  private applyState = (next: CrossadeState): void => {
    const prev = this.state;
    this.state = next;
    // Одобрения — ДО пересборки: снятая с ожидания карта должна лечь этим же rebuildBoard, иначе
    // она осталась бы висеть до следующего чужого хода.
    for (const [card, p] of this.pending) {
      if (approvedIn(p.kind, card, { play: next.play, discard: next.discard, selfHand: next.selfHand })) this.clearPending(card);
    }
    // Ленивый дифф — то же правило, что у Crossade: пересборка только когда зоны реально изменились.
    if (sameZones(prev, next)) return;
    this.rebuildBoard(false);
  };

  private applySignal = (signal: CrossadeSignal): void => {
    if (signal.kind !== "action_rejected") return;
    for (const card of rejectedCards(signal.cards, this.pending.keys())) this.failPending(card);
    this.showNotice(signal.reason || signal.action || "нельзя");
  };

  protected showNotice(text: string): void {
    this.notice.text = text;
    this.notice.visible = true;
    this.wake();
    this.after(2, () => {
      this.notice.visible = false;
      this.wake();
    });
  }

  /** Свести доску со снимком (см. crossade/scene.ts#rebuildBoard — механика 1:1, состав слотов свой). */
  protected rebuildBoard(snap: boolean): void {
    const state = this.state;
    this.tree = this.buildTree(state);
    if (!this.tex) return; // сцена ещё не собрана — дерево уже актуально, рисовать не на чем

    const alive = new Set<string>();
    this.cardDepth.clear();
    const slotOrder = new Map<string, number>();
    Object.keys(this.tree.origins).forEach((id, i) => slotOrder.set(id, i));

    const place = (cardId: string, indexInPile: number): void => {
      alive.add(cardId);
      // Ожидающая карта НЕ разводится по дому: она висит в точке дропа (поза lifted, драговый z),
      // пока сервер не ответит — см. pending.ts. alive при этом отмечен: сносить её нельзя.
      if (this.pending.has(cardId)) return;
      const slot = this.tree.slotOf(cardId);
      const home = this.tree.homeOf(cardId);
      if (!slot || !home) return;
      const node = this.nodeFor(cardId);
      const depth = (slotOrder.get(slot) ?? 0) * 1000 + indexInPile;
      this.cardDepth.set(cardId, depth);
      node.root.zIndex = depth;
      node.setState(node.pose);
      this.placeCard(node);
      const target = { x: home.x, y: home.y, rot: 0, scale: node.restScale };
      if (snap) node.body.snapTo(target);
      else node.body.setTarget(target);
    };

    this.placeCards(state, place);

    for (const [cardId, node] of this.nodes) {
      if (alive.has(cardId)) continue;
      node.destroy();
      this.nodes.delete(cardId);
      this.byId.delete(cardId);
    }

    this.contentW = this.tree.size.w;
    this.contentH = this.tree.size.h;
    this.syncSeats();
    this.paintBoard();
    this.clampView();
    this.applyView();
    this.emitView();
    this.wake();
  }

  /** Лицо/рубашку и масштаб решают швы faceUpFor/cardScaleFor (у базы — всё лицом стольного
   *  размера: рука своя, зона открыта). flippable: true — НЕ приглашение переворачивать (сцена
   *  flip не зовёт), а способ не носить замочек: flippable: false рисует lock-бейдж (Card.ts). */
  protected nodeFor(cardId: string): Card {
    const existing = this.nodes.get(cardId);
    if (existing) return existing;
    const node = new Card(
      { id: cardId, card: cardId, faceUp: this.faceUpFor(cardId), flippable: true },
      this.tex!,
      this.cardScaleFor(cardId),
    );
    this.nodes.set(cardId, node);
    this.byId.set(cardId, node);
    return node;
  }

  /** Места игроков — имя + счёт карт, своё место помечено. Чужие карты не рисуются вовсе:
   *  «другим не видно» здесь не правило отображения, а отсутствие данных (см. snapshotFrom). */
  private syncSeats(): void {
    const seen = new Set<string>();
    for (const seat of this.seatsToShow()) {
      seen.add(seat.sessionId);
      let label = this.seatLabels.get(seat.sessionId);
      if (!label) {
        label = new Text({ style: { fontFamily: PIXEL_FONT, fontSize: 13, align: "center" } });
        label.anchor.set(0.5, 0);
        this.scene.surface.addChild(label);
        this.seatLabels.set(seat.sessionId, label);
      }
      const mark = seat.sessionId === this.state.selfSessionId ? " ◄ вы" : "";
      label.text = `${seat.name}${mark}\n${seat.handCount}`;
      label.style.fill = this.seatLabelFill(seat.sessionId);
      const at = this.tree.origins[`seat:${seat.sessionId}`];
      if (at) label.position.set(at.x + this.seatCell().w / 2, at.y + this.seatLabelOffsetY());
    }
    for (const [id, label] of this.seatLabels) {
      if (seen.has(id)) continue;
      label.destroy();
      this.seatLabels.delete(id);
    }
  }

  /** Какие места показывать подписями. Live прячет своё — там «рука и есть индикатор себя». */
  protected seatsToShow(): CrossadeState["seats"] {
    return this.state.seats;
  }

  /** Цвет подписи места. Live красит в цвет игрока (presence). */
  protected seatLabelFill(sessionId: string): number {
    return sessionId === this.state.selfSessionId ? COLORS.gold : COLORS.seatName;
  }

  /** Габарит ячейки места — у Live он шире (ряд рубашек, не пустая рамка). */
  protected seatCell(): { w: number; h: number } {
    return SEAT;
  }

  /** Сдвиг подписи места от origin. У Live origin указывает на ряд рубашек, имя — строкой выше. */
  protected seatLabelOffsetY(): number {
    return 0;
  }

  private paintBoard(): void {
    const ids = Object.keys(this.tree.origins).filter((id) => id.startsWith("play:") || id === "discard");
    paintSlots(this.slotLayer, { origins: this.tree.origins, ids, cell: CARD, armed: this.armedSlots, hot: this.hotSlot });
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

  /** Тащить можно карту своей руки, ВЕРХ любой кучки и ВЕРХ сброса (если он есть на этом столе) —
   *  зоны общие, забирает любой игрок. Ожидающую одобрения — нельзя: её судьбу уже решает сервер. */
  protected canDrag(el: SceneElement): boolean {
    if (this.pending.has(el.id)) return false;
    const slot = this.tree.slotOf(el.id);
    if (slot === "hand") return true;
    if (slot === "discard") return topOf(this.state.discard) === el.id;
    if (slot?.startsWith("play:") && slot !== "play:new") {
      const stack = this.state.play[Number(slot.slice(5))];
      return stack ? topOf(stack) === el.id : false;
    }
    return false;
  }

  protected beginDrag(el: SceneElement, cp: { x: number; y: number }, sp: { x: number; y: number }): boolean {
    this.grabOffset = { x: el.body.px - cp.x, y: el.body.py - cp.y };
    this.armedSlots = this.legalTargets(this.tree.slotOf(el.id) ?? "");
    this.paintBoard();
    this.dragCardId = el.id;
    this.emitGesture("grab", el.id, cp);
    return super.beginDrag(el, cp, sp);
  }

  /** Чью карту сейчас ведёт СВОЙ палец — для эмиссии release, у которого нет точки. */
  private dragCardId: string | null = null;

  protected onDragMoved(p: { x: number; y: number }): void {
    if (this.dragCardId) this.emitGesture("move", this.dragCardId, p);
    const target = dropTarget(this.tree.root, p);
    const id = target?.group.id ?? null;
    const hot = id && this.armedSlots.has(id) ? id : null;
    if (hot === this.hotSlot) return;
    this.hotSlot = hot;
    this.paintBoard();
    this.wake();
  }

  /** Дроп — команда порту, правила решает мастер/сервер (см. crossade/scene.ts#resolveDrop).
   *  Переходы «в другую зону» НЕ отпускаются домой: карта повисает в точке дропа до ответа
   *  сервера (beginPending) — иначе при заметной задержке она успевала долететь до руки и лишь
   *  потом прыгала в зону. Реордер своей руки — локальный и оптимистичный, ему ждать нечего. */
  protected resolveDrop(el: SceneElement, cp: { x: number; y: number }): void {
    const drag = this.drag;
    if (!drag) return;
    const from = this.tree.slotOf(el.id);
    const target = dropTarget(this.tree.root, cp);
    const to = target?.group.id ?? null;

    // Ожидание заводится ДО отправки: при нулевой задержке (локальный мастер) эхо приходит
    // СИНХРОННО внутри port.*(), и одобрение должно застать pending уже заведённым — иначе оно
    // пролетает мимо, карта виснет в lifted до таймаута и «грузится» на ровном месте.
    if (from === "hand" && to?.startsWith("play:")) {
      this.beginPending(el.id, "play_card", cp);
      if (to === "play:new") this.port.playCard(el.id);
      else this.port.playCard(el.id, Number(to.slice(5)));
      return;
    }
    if (from === "hand" && to === "discard") {
      this.beginPending(el.id, "discard_card", cp);
      this.port.discardCard(el.id);
      return;
    }
    if (from?.startsWith("play:") && to === "hand") {
      this.beginPending(el.id, "take_play", cp);
      this.port.takePlay(el.id);
      return;
    }
    if (from === "discard" && to === "hand") {
      this.beginPending(el.id, "take_discard", cp);
      this.port.takeDiscard();
      return;
    }
    if (from === "hand" && to === "hand") this.reorderHand(el.id, target!.index);
    // Прочие переходы (кучка → кучка напрямую) — не этот стол: карта летит на прежнее место.
    drag.release();
  }

  // ——— ожидание одобрения (pending.ts) ———

  private static readonly PENDING_TICK_S = 0.15;

  /** Повесить карту в точке дропа до ответа сервера: поза lifted (дыхание и тень подъёма — её
   *  собственные), драговый z остаётся, индикатор и таймаут ведёт tickPending/after.
   *  Точка покоя — по ПАЛЬЦУ (cp + смещение захвата), не по телу: тело едет пружиной и на быстром
   *  жесте отстаёт — замороженное по телу, ожидание выглядело бы «застрял на полпути» (то же
   *  правило, что у разрешения дропа, см. catalog-rules.md). */
  private beginPending(cardId: string, kind: PendingKind, cp: { x: number; y: number }): void {
    const node = this.nodes.get(cardId);
    if (!node) return;
    const token = ++this.pendingToken;
    // Точка касания в локальных (текстурных) координатах карты: смещение захвата, снятое на
    // pointerdown в мировых единицах, обратно через мировой масштаб карты в покое.
    const worldScale = node.width / TEX_W;
    this.pending.set(cardId, {
      kind,
      token,
      age: 0,
      touchLocal: { x: -this.grabOffset.x / worldScale, y: -this.grabOffset.y / worldScale },
      spinner: null,
      overlay: null,
    });
    node.setState("lifted");
    node.body.setTarget({ x: cp.x + this.grabOffset.x, y: cp.y + this.grabOffset.y, rot: 0 });
    this.tickPending(cardId, token);
    this.after(PENDING_TIMEOUT_S, () => {
      const p = this.pending.get(cardId);
      if (p?.token !== token) return;
      this.failPending(cardId);
      this.showNotice("нет ответа");
    });
  }

  /** Пульс ожидания: растит возраст и после порога (pendingIndicatorVisible) один раз собирает
   *  индикатор — спиннер в точке касания + оверлей-притемнение, оба детьми node.root. Тикает
   *  after()-цепочкой — общего cancel у таймеров сцены нет, поэтому каждый тик сам проверяет,
   *  что его ход ещё ждёт (token). Вращает спиннер НЕ он, а stepScene — покадрово. */
  private tickPending(cardId: string, token: number): void {
    const p = this.pending.get(cardId);
    if (!p || p.token !== token) return;
    p.age += MultiplayerScene.PENDING_TICK_S;
    const node = this.nodes.get(cardId);
    if (node && !p.overlay && pendingIndicatorVisible(p.age)) {
      // Оверлей — по контуру карты (та же геометрия, что маска пыли в Card.ts): «карта занята,
      // сервер думает». Лёгкий: сквозь него читается и номинал, и дыхание.
      p.overlay = new Graphics()
        .roundRect(-TEX_W / 2 + 2, -TEX_H / 2 + 2, TEX_W - 4, TEX_H - 4, 16)
        .fill({ color: 0x000000, alpha: 0.22 });
      // Спиннер — незамкнутая дуга под пальцем (точка касания), классика «идёт запрос».
      p.spinner = new Graphics()
        .arc(0, 0, 26, 0, Math.PI * 1.5)
        .stroke({ width: 7, color: COLORS.gold, cap: "round" });
      p.spinner.position.set(p.touchLocal.x, p.touchLocal.y);
      node.root.addChild(p.overlay, p.spinner);
      this.wake();
    }
    this.after(MultiplayerScene.PENDING_TICK_S, () => this.tickPending(cardId, token));
  }

  /** Вращение спиннеров ожидания — покадрово, пока хоть один виден (возврат true не даёт циклу
   *  уснуть под ними). */
  protected stepScene(dt: number): boolean {
    let spinning = false;
    for (const p of this.pending.values()) {
      if (!p.spinner) continue;
      p.spinner.rotation += dt * PENDING_SPINNER_SPEED;
      spinning = true;
    }
    return spinning;
  }

  /** Снять ожидание (одобрено или провалено) — карту дальше ведёт вызывающий. */
  protected clearPending(cardId: string): void {
    const p = this.pending.get(cardId);
    if (!p) return;
    p.spinner?.destroy();
    p.overlay?.destroy();
    this.pending.delete(cardId);
  }

  /** Отказ или молчание: «стоп»-покачивание и домой той же пружиной, что обычный релиз. */
  private failPending(cardId: string): void {
    this.clearPending(cardId);
    const node = this.nodes.get(cardId);
    if (!node) return;
    node.blockNudge();
    this.releaseElement(node);
    this.wake();
  }

  /** Оптимистичный реордер своей руки — дословно правило crossade/scene.ts#reorderHand: мутируем
   *  ПОЛЕ state.selfHand (bindRoom держит тот же объект как prev), иначе эхо сервера откатит руку. */
  private reorderHand(cardId: string, toIndex: number): void {
    const hand = this.state.selfHand;
    const next = handOrderAfterDrop(hand, cardId, toIndex);
    if (sameOrder(next, hand)) return;
    this.state.selfHand = next;
    this.rebuildBoard(false);
    this.port.setHandOrder(next);
  }

  protected onDragCancel(): void {
    this.endOwnGesture();
    this.clearDragHints();
  }

  protected afterDragEnd(): void {
    this.endOwnGesture();
    this.clearDragHints();
  }

  private endOwnGesture(): void {
    if (!this.dragCardId) return;
    this.emitGesture("release", this.dragCardId, null);
    this.dragCardId = null;
  }

  private clearDragHints(): void {
    this.hotSlot = null;
    this.armedSlots = new Set();
    this.paintBoard();
  }

  private legalTargets(from: string): ReadonlySet<string> {
    const out = new Set<string>();
    const hasDiscard = this.tree.origins.discard !== undefined;
    if (from === "hand") {
      out.add("hand"); // реордер — легальный переход, контур рука не носит (paintBoard рисует play)
      if (hasDiscard) out.add("discard");
      for (const id of Object.keys(this.tree.origins)) if (id.startsWith("play:")) out.add(id);
    } else if (from.startsWith("play:") || from === "discard") {
      out.add("hand");
    }
    return out;
  }

  /** Дев-хук для e2e/стори — экранная геометрия (канвас не отдаёт ни DOM-узлов, ни ролей). */
  testHooks(): {
    slots: Record<string, { x: number; y: number }>;
    cards: Record<string, { x: number; y: number; slot: string | null }>;
    hand: string[];
    play: string[][];
    pending: string[];
  } {
    const slots: Record<string, { x: number; y: number }> = {};
    for (const [id, at] of Object.entries(this.tree.origins)) slots[id] = this.contentToScreen(at.x, at.y);
    const cards: Record<string, { x: number; y: number; slot: string | null }> = {};
    for (const [id, node] of this.nodes) {
      const p = this.contentToScreen(node.body.px, node.body.py);
      cards[id] = { x: p.x, y: p.y, slot: this.tree.slotOf(id) };
    }
    return {
      slots,
      cards,
      hand: [...this.state.selfHand],
      play: this.state.play.map((s) => [...s]),
      pending: [...this.pending.keys()],
    };
  }

  protected onTeardown(app: Application): void {
    this.disposeRoom();
    for (const p of this.pending.values()) {
      p.spinner?.destroy();
      p.overlay?.destroy();
    }
    this.pending.clear();
    for (const node of this.nodes.values()) node.destroy();
    this.nodes.clear();
    for (const label of this.seatLabels.values()) label.destroy();
    this.seatLabels.clear();
    this.tex?.destroy();
    this.tex = null;
    super.onTeardown(app);
  }
}
