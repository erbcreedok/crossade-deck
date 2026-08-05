import { Application, Graphics, Text } from "pixi.js";
import type { SceneElement } from "../engine/sceneEngine";
import { SceneRuntime, type SceneApi, type SceneDelegate } from "../engine/sceneRuntime";
import { TEX_H, PIXEL_FONT, COLORS, SHOUT_TEXT, SHOUT_COLORS } from "../engine/constants";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { CardTextureCache } from "../ui/CardTextureCache";
import { TopBar, TOPBAR_H } from "../ui/TopBar";
import type { TableElement } from "../engine/element";
import { dropTarget, measure } from "../slot/slot";
import { buildCrossadeTree, CARD, SEAT, type CrossadeTree } from "./tree";
import type { CrossadeState } from "./state";
import { makePort, bindRoom, type BindableRoom, type CrossadePort, type CrossadeSignal, type SendableRoom } from "./net";
import { sameOrder, sameZones } from "./diff";
import { paintSlots, ZONE_LABELS } from "./slotPaint";
import { handOrderAfterDrop } from "./handOrder";

// СЦЕНА CROSSADE — доктрина ровно та же, что у Косынки (см. solitaire/scene.ts): ввод/камера/
// драг/цикл кадра/тени/HUD-каркас (TopBar) берутся из SceneEngine и здесь НЕ пишутся заново.
//
// Отличия от Косынки, ровно те, что диктует многопользовательский стол (не партия одного игрока):
//   1. состояние — не свой движок правил, а СНИМОК СЕТИ (CrossadeState из net.ts#bindRoom):
//      applyState держит его, пересобирает дерево слотов (tree.ts) и разводит карты по домам —
//      ход отправляется НА СЕРВЕР (CrossadePort), а не решается локально;
//   2. дифай снимков ЛЕНИВЫЙ (diff.ts#sameZones): colyseus зовёт onStateChange на каждый патч
//      (чьё-то «готов», не только карты), и пересборка доски нужна только когда зоны реально
//      изменились — иначе цикл впустую дёргал бы карты на каждое чужое телодвижение;
//   3. своя рука реордерится ОПТИМИСТИЧНО: composition не меняется при перестановке, поэтому
//      applyHandOrder (state.ts) будет держать УЖЕ ПОКАЗАННЫЙ порядок и глушить эхо сервера —
//      значит новый порядок обязан появиться именно в показанном снимке, см. reorderHand ниже.

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;

export interface CrossadeSceneOptions {
  room: SendableRoom & BindableRoom;
  selfSessionId: string;
  onBack?: () => void;
}

function emptyState(selfSessionId: string): CrossadeState {
  return {
    phase: "lobby",
    freeMode: false,
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

export class CrossadeScene implements SceneDelegate {
  /** Движок-рантайм (композиция): камера/ввод/кадр — его; сцена — делегат его швов. */
  readonly rt: SceneRuntime;
  private readonly api: SceneApi;
  private tex: CardTextureCache | null = null;
  private readonly nodes = new Map<string, Card>();
  private readonly cardDepth = new Map<string, number>();
  private readonly seatLabels = new Map<string, Text>();
  private readonly zoneLabels = new Map<string, Text>();
  private readonly slotLayer = new Graphics();

  private state: CrossadeState;
  private tree: CrossadeTree;
  private readonly port: CrossadePort;
  private readonly disposeRoom: () => void;

  private topbar: TopBar | null = null;
  private notice!: Text;
  private shoutText!: Text;
  private readyBtn!: Button;
  private goBtn!: Button;
  private dealAllBtn!: Button;
  private collectBtn!: Button;
  private actionButtons: Button[] = [];

  // Подсказки текущего драга — тот же язык, что у Косынки (dragFrom/hotSlot/armedSlots).
  private dragFrom = "";
  private hotSlot: string | null = null;
  private armedSlots: ReadonlySet<string> = new Set();

  constructor(private readonly opts: CrossadeSceneOptions) {
    this.rt = new SceneRuntime({ minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, margin: 0, align: "center" });
    this.rt.attach(this);
    this.api = this.rt.api;
    this.state = emptyState(opts.selfSessionId);
    this.tree = buildCrossadeTree(this.state);
    this.port = makePort(opts.room);
    const bound = bindRoom(opts.room, { self: opts.selfSessionId, onState: this.applyState, onSignal: this.applySignal });
    this.disposeRoom = bound.dispose;
  }

  // ——— хост-API (тонкие двери в рантайм): интерфейс хостов не изменился ———

  mount(host: HTMLElement, width: number, height: number): Promise<void> {
    return this.rt.mount(host, width, height);
  }

  destroy(): void {
    this.rt.destroy();
  }

  // ——————————————————————————————————————————————————————————————————————
  // Сборка
  // ——————————————————————————————————————————————————————————————————————

  buildScene(app: Application): void {
    this.tex = new CardTextureCache(app);
    this.api.surfaceAdd(this.slotLayer);
    this.buildHud();
    this.rebuildBoard(true);
  }

  private buildHud(): void {
    this.topbar = new TopBar([{ key: "back", label: "← меню", onClick: () => this.opts.onBack?.() }]);
    this.api.chromeAdd(this.topbar.root);

    this.readyBtn = new Button({ label: "готов", size: "sm", variant: "secondary", onClick: () => this.port.ready() });
    this.goBtn = new Button({ label: "ГОУ!", size: "sm", variant: "primary", onClick: () => this.port.go() });
    this.dealAllBtn = new Button({ label: "раздать всё", size: "sm", variant: "secondary", onClick: () => this.port.startGame() });
    this.collectBtn = new Button({ label: "перераздача", size: "sm", variant: "secondary", onClick: () => this.port.collectHands() });
    for (const b of [this.readyBtn, this.goBtn, this.dealAllBtn, this.collectBtn]) this.api.chromeAdd(b.root);

    // Notice (action_rejected) — короткая надпись под топбаром, сама себя гасит через after().
    this.notice = new Text({ text: "", style: { fontFamily: PIXEL_FONT, fontSize: 18, fill: 0xe0483f, align: "center" } });
    this.notice.anchor.set(0.5, 0);
    this.notice.visible = false;
    // Клич «ГОУ!» — крупно, теми же цветами, что и у остального стола (constants.ts), не свои.
    this.shoutText = new Text({
      text: SHOUT_TEXT,
      style: { fontFamily: PIXEL_FONT, fontSize: 56, fill: SHOUT_COLORS.fill, align: "center" },
    });
    this.shoutText.anchor.set(0.5);
    this.shoutText.visible = false;
    this.api.chromeAdd(this.notice);
    this.api.chromeAdd(this.shoutText);

    this.syncHud();
  }

  layoutChrome(w: number, h: number): void {
    this.topbar?.layout(w);
    this.layoutActions();
    this.notice.position.set(w / 2, (this.topbar?.height ?? TOPBAR_H) + 8);
    this.shoutText.position.set(w / 2, h / 2);
  }

  chromeInsetTop(): number {
    return this.topbar?.height ?? TOPBAR_H;
  }

  onBooted(): void {
    this.fitBoard();
  }

  onSceneResize(): void {
    this.fitBoard();
  }

  private fitBoard(): void {
    this.api.syncVp();
    const usableH = Math.max(1, this.api.height() - this.chromeInsetTop());
    this.api.viewport().setZoom(Math.min(1, this.api.width() / this.tree.size.w, usableH / this.tree.size.h));
    this.api.clampView();
    this.api.applyView();
    this.api.emitView();
  }

  // ——————————————————————————————————————————————————————————————————————
  // Сеть → доска
  // ——————————————————————————————————————————————————————————————————————

  private applyState = (next: CrossadeState): void => {
    const prev = this.state;
    this.state = next;
    this.syncHud();
    // Ленивый дифф (diff.ts#sameZones): colyseus зовёт onStateChange на КАЖДЫЙ патч, включая те,
    // что доски не касаются (чьё-то «готов»). Пересобирать дерево и перекладывать карты тогда
    // незачем — HUD уже обновлён строчкой выше.
    if (sameZones(prev, next)) return;
    this.rebuildBoard(false);
  };

  private applySignal = (signal: CrossadeSignal): void => {
    switch (signal.kind) {
      case "action_rejected":
        this.showNotice(signal.reason || signal.action || "нельзя");
        break;
      case "go_shout":
        this.showShout();
        break;
      case "card_moved":
      case "hands_collected":
      case "deck_reset":
      case "taunt":
        // MVP: доска и так следует за applyState (снимок — единственная правда), отдельная
        // реакция на эти сигналы (кричалки, синхронный волновой возврат) — задел на потом.
        break;
    }
  };

  private showNotice(text: string): void {
    this.notice.text = text;
    this.notice.visible = true;
    this.api.wake();
    this.api.after(2, () => {
      this.notice.visible = false;
      this.api.wake();
    });
  }

  private showShout(): void {
    this.shoutText.visible = true;
    this.api.wake();
    this.api.after(1.4, () => {
      this.shoutText.visible = false;
      this.api.wake();
    });
  }

  /** HUD — читается из снимка целиком и обновляется на КАЖДЫЙ applyState, даже когда зоны не
   *  менялись (счётчик готовности и фаза — не про доску, см. sameZones). */
  private syncHud(): void {
    // Снимок сети может прийти РАНЬШЕ, чем buildScene()/buildHud() успеет собрать кнопки: bindRoom
    // подписывается уже в конструкторе, а mount() — асинхронный (ждёт шрифты). topbar — сигнал, что
    // HUD целиком собран (buildHud создаёт его и кнопки одним блоком).
    if (!this.topbar) return;
    const state = this.state;
    const self = this.selfSeat();
    const readyCount = state.seats.filter((s) => s.isReady).length;
    const room = state.inviteCode ? `Комната ${state.inviteCode}` : "Комната —";
    this.topbar?.setStatus(`${room} · за столом ${state.seats.length} · готовы ${readyCount}`);

    this.readyBtn.setLabel(self?.isReady ? "не готов" : "готов");

    const isDealer = self?.isDealer ?? false;
    if (!isDealer) this.actionButtons = [this.readyBtn];
    else if (state.phase === "lobby") this.actionButtons = [this.goBtn, this.dealAllBtn];
    else this.actionButtons = [this.collectBtn];

    this.layoutActions();
    this.api.setChromeButtons([...(this.topbar?.buttons ?? []), ...this.actionButtons]);
  }

  /** Своё место за столом — то, откуда читаются isDealer/isReady для HUD и жестов раздачи. */
  private selfSeat() {
    return this.state.seats.find((s) => s.sessionId === this.state.selfSessionId) ?? null;
  }

  private isDealer(): boolean {
    return this.selfSeat()?.isDealer ?? false;
  }

  private layoutActions(): void {
    const all = [this.readyBtn, this.goBtn, this.dealAllBtn, this.collectBtn];
    for (const b of all) b.root.visible = this.actionButtons.includes(b);
    const midY = this.topbar?.midY ?? TOPBAR_H / 2;
    let x = this.api.width() - 12;
    for (const b of [...this.actionButtons].reverse()) {
      x -= b.w / 2;
      b.place(x, midY);
      x -= b.w / 2 + 8;
    }
    // Сообщить панели, сколько справа занято: иначе её статус уезжает ПОД кнопки действий.
    this.topbar?.setRightInset(this.api.width() - (x + 8));
  }

  /** Свести доску со снимком: дерево → дома → карты. snap — поставить сразу (первый монтаж),
   *  иначе карта ДОЛЕТАЕТ пружиной, как всё в проекте. */
  private rebuildBoard(snap: boolean): void {
    const state = this.state;
    this.tree = buildCrossadeTree(state);
    if (!this.tex) return; // сцена ещё не собрана — дерево уже актуально, рисовать не на чем

    const alive = new Set<string>();
    this.cardDepth.clear();
    // Порядок слотов доски (для устойчивого z между пачками — см. Косынку, tree.depthOf): те же
    // ключи, что несёт tree.origins, и в том же порядке, в каком их собрал buildCrossadeTree.
    const slotOrder = new Map<string, number>();
    Object.keys(this.tree.origins).forEach((id, i) => slotOrder.set(id, i));

    const place = (cardId: string, indexInPile: number): void => {
      alive.add(cardId);
      const slot = this.tree.slotOf(cardId);
      const home = this.tree.homeOf(cardId);
      if (!slot || !home) return;
      // Лицом вверх — везде, КРОМЕ колоды: номинал колоды не виден никому, пока карта не покинула
      // её (см. CLAUDE.md «Dealing is always on») — структурное правило, не поле снимка.
      const faceUp = slot !== "deck";
      const node = this.nodeFor(cardId, faceUp);
      if (node.faceUp !== faceUp) node.requestFlip();
      const depth = (slotOrder.get(slot) ?? 0) * 1000 + indexInPile;
      this.cardDepth.set(cardId, depth);
      node.root.zIndex = depth;
      node.setState(node.pose);
      this.api.placeCard(node);
      const target = { x: home.x, y: home.y, rot: 0, scale: node.restScale };
      if (snap) node.body.snapTo(target);
      else node.body.setTarget(target);
    };

    state.deck.forEach((c, i) => place(c, i));
    state.discard.forEach((c, i) => place(c, i));
    state.play.forEach((stack) => stack.forEach((c, i) => place(c, i)));
    state.selfHand.forEach((c, i) => place(c, i));

    for (const [cardId, node] of this.nodes) {
      if (alive.has(cardId)) continue;
      node.destroy();
      this.nodes.delete(cardId);
      this.api.byId.delete(cardId);
    }

    this.api.setContentSize(this.tree.size.w, this.tree.size.h);
    this.syncSeats();
    this.paintBoard();
    this.api.clampView();
    this.api.applyView();
    this.api.emitView();
    this.api.wake();
  }

  private nodeFor(cardId: string, faceUp: boolean): Card {
    const existing = this.nodes.get(cardId);
    if (existing) return existing;
    const node = new Card({ id: cardId, card: cardId, faceUp, flippable: true }, this.tex!, CARD.h / TEX_H);
    this.nodes.set(cardId, node);
    this.api.byId.set(cardId, node);
    return node;
  }

  /** Места игроков — только имя + счёт карт (MVP, см. CROSSADE-DESIGN.md): чужие карты не рисуем. */
  private syncSeats(): void {
    const seen = new Set<string>();
    for (const seat of this.state.seats) {
      seen.add(seat.sessionId);
      let label = this.seatLabels.get(seat.sessionId);
      if (!label) {
        label = new Text({ style: { fontFamily: PIXEL_FONT, fontSize: 13, align: "center" } });
        label.anchor.set(0.5, 0);
        this.api.surfaceAdd(label);
        this.seatLabels.set(seat.sessionId, label);
      }
      const dealerMark = seat.isDealer ? " ♛" : "";
      label.text = `${seat.name}${dealerMark}\n${seat.handCount}`;
      label.style.fill = seat.connected ? COLORS.seatName : COLORS.seatNameOff;
      const at = this.tree.origins[`seat:${seat.sessionId}`];
      if (at) label.position.set(at.x + SEAT.w / 2, at.y);
    }
    for (const [id, label] of this.seatLabels) {
      if (seen.has(id)) continue;
      label.destroy();
      this.seatLabels.delete(id);
    }
  }

  private paintBoard(): void {
    const ids = Object.keys(this.tree.origins).filter((id) => id === "deck" || id === "discard" || id.startsWith("play:"));
    paintSlots(this.slotLayer, { origins: this.tree.origins, ids, cell: CARD, armed: this.armedSlots, hot: this.hotSlot });
    // Места игроков: контур ТОЛЬКО пока они armed/hot (раздача драгом, этап 5) — в покое место
    // остаётся просто текстом (см. syncSeats), см. заголовок slotPaint.ts.
    const seatIds = Object.keys(this.tree.origins).filter(
      (id) => id.startsWith("seat:") && (this.armedSlots.has(id) || this.hotSlot === id),
    );
    if (seatIds.length) {
      paintSlots(this.slotLayer, { origins: this.tree.origins, ids: seatIds, cell: SEAT, armed: this.armedSlots, hot: this.hotSlot, clear: false });
    }
    for (const [id, text] of Object.entries(ZONE_LABELS)) {
      const at = this.tree.origins[id];
      if (!at) continue;
      let label = this.zoneLabels.get(id);
      if (!label) {
        label = new Text({ text, style: { fontFamily: PIXEL_FONT, fontSize: 13, fill: COLORS.gold, align: "center" } });
        label.anchor.set(0.5, 1);
        this.api.surfaceAdd(label);
        this.zoneLabels.set(id, label);
      }
      label.position.set(at.x + CARD.w / 2, at.y - 6);
    }
  }

  // ——————————————————————————————————————————————————————————————————————
  // Швы домена: только то, чего у голой сцены со столом нет
  // ——————————————————————————————————————————————————————————————————————

  draggables(): SceneElement[] {
    return [...this.nodes.values()];
  }

  everyElement(): TableElement[] {
    return [...this.nodes.values()];
  }

  homeOf(el: SceneElement): { home: { x: number; y: number }; depth: number } | null {
    const home = this.tree.homeOf(el.id);
    return home ? { home, depth: this.cardDepth.get(el.id) ?? 0 } : null;
  }

  /** Тащить можно: карту своей руки — всегда; верх колоды — либо в freeMode («взять себе», этап 4),
   *  либо в лобби ДИЛЕРУ («раздать драгом», этап 5, только верхнюю карту — колода вслепую, см.
   *  CLAUDE.md «Dealing is always on»); верх сброса/play-кучки — только в freeMode. Никакой другой
   *  элемент не драгается. */
  canDrag(el: SceneElement): boolean {
    const slot = this.tree.slotOf(el.id);
    if (slot === "hand") return true;
    if (!slot) return false;
    if (slot === "deck") {
      if (topOf(this.state.deck) !== el.id) return false;
      if (this.state.freeMode) return true;
      return this.state.phase === "lobby" && this.isDealer();
    }
    if (!this.state.freeMode) return false;
    if (slot === "discard") return topOf(this.state.discard) === el.id;
    if (slot.startsWith("play:") && slot !== "play:new") {
      const stack = this.state.play[Number(slot.slice(5))];
      return stack ? topOf(stack) === el.id : false;
    }
    return false;
  }

  beginDrag(el: SceneElement, cp: { x: number; y: number }, sp: { x: number; y: number }): boolean {
    this.dragFrom = this.tree.slotOf(el.id) ?? "";
    this.armedSlots = this.legalTargets(this.dragFrom);
    this.paintBoard();
    return this.api.defaultBeginDrag(el, cp, sp);
  }

  onDragMoved(p: { x: number; y: number }): void {
    const target = dropTarget(this.tree.root, p);
    const id = target?.group.id ?? null;
    const hot = id && this.armedSlots.has(id) ? id : null;
    if (hot === this.hotSlot) return;
    this.hotSlot = hot;
    this.paintBoard();
    this.api.wake();
  }

  /** Что значит дроп: слот под пальцем спрашивается у ДЕРЕВА (то же, что рисует карты), ход
   *  отдаётся серверу через CrossadePort — сцена ничьих правил не проверяет и не дублирует. */
  resolveDrop(el: SceneElement, cp: { x: number; y: number }): void {
    const drag = this.api.drag();
    if (!drag) return;
    const from = this.tree.slotOf(el.id);
    const target = dropTarget(this.tree.root, cp);
    const to = target?.group.id ?? null;

    if (from === "hand" && to === "hand") {
      this.reorderHand(el.id, target!.index);
    } else if (!to) {
      // Мимо слота: карта летит домой НИЖЕ (drag.release()). У колоды это заодно и «тап»-жест —
      // колода caps.drop не носит (см. crossade/tree.ts#deckSlot), так что дроп ВООБЩЕ где угодно
      // над ней (в том числе почти без сдвига пальца) резолвится в `to === null`; отличить «тапнул»
      // от «подвинул на миллиметр и передумал» InputRouter не умеет (canDrag решает жест целиком
      // на pointerdown, см. inputRouter.ts) — а тянуть верхнюю карту куда-то мимо любого слота
      // читается точно так же, как тап: «взять», раз рука тут единственная осмысленная цель.
      if (from === "deck" && this.state.freeMode) this.port.takeCard();
    } else if (from === "hand" && to === "discard") {
      this.port.discardCard(el.id);
    } else if (from === "hand" && to.startsWith("play:")) {
      if (to === "play:new") this.port.playCard(el.id);
      else this.port.playCard(el.id, Number(to.slice(5)));
    } else if (from === "deck" && to.startsWith("seat:")) {
      // Раздача драгом (этап 5): сервер сам решит, ready ли получатель — сюда прилетает
      // action_rejected, если нет (см. handMessages.ts#deal_card), и showNotice его покажет.
      this.port.dealCard(el.id, to.slice(5));
    } else if (from === "deck" && to === "hand") {
      this.port.takeCard();
    } else if (from === "discard" && to === "hand") {
      this.port.takeDiscard();
    } else if (from && from.startsWith("play:") && to === "hand") {
      this.port.takePlay(el.id);
    }
    // Прочие переходы (не описаны в CROSSADE-DESIGN.md §4, напр. play:0 → play:1 напрямую) — не
    // MVP: карта просто летит на своё прежнее место, ничего на сервер не уходит.

    drag.release();
  }

  /**
   * Реордер своей руки — ЕДИНСТВЕННЫЙ переход, который сцена применяет ОПТИМИСТИЧНО (мутирует
   * this.state, а не ждёт сервер). Иначе не сработало бы вовсе: applyHandOrder (state.ts) держит
   * ПРЕЖНИЙ показанный порядок, пока состав руки не меняется (перестановка — тот же набор), а
   * значит эхо сервера всегда «подтверждает» старый порядок и новый никогда бы не отобразился.
   *
   * Мутируем `this.state.selfHand` ИМЕННО ПОЛЕМ, не заменяем весь объект: net.ts#bindRoom держит
   * этот же CrossadeState как свой внутренний `prev` между снимками (тот же объект, что мы храним
   * здесь), и следующий вызов applyHandOrder(serverHand, prev.selfHand) обязан увидеть НАШ порядок,
   * а не тот, что был до реордера — иначе следующий же чужой патч (кто-то нажал «готов») откатил бы
   * руку на экране обратно.
   */
  private reorderHand(cardId: string, toIndex: number): void {
    const hand = this.state.selfHand;
    const next = handOrderAfterDrop(hand, cardId, toIndex); // чистая splice-логика — см. handOrder.ts
    if (sameOrder(next, hand)) return; // дропнули туда же — ничего не изменилось, слать нечего
    this.state.selfHand = next;
    this.rebuildBoard(false);
    this.port.setHandOrder(next);
  }

  onDragCancel(): void {
    this.clearDragHints();
  }

  afterDragEnd(): void {
    this.clearDragHints();
  }

  private clearDragHints(): void {
    this.dragFrom = "";
    this.hotSlot = null;
    this.armedSlots = new Set();
    this.paintBoard();
  }

  /** Зоны, готовые принять груз из слота `from` — легальность считает сервер, здесь только
   *  подсказка «куда можно»: рука отдаёт в сброс/любую play-кучку; колода/сброс/play отдают в руку
   *  (этап 4); а колода дилера в лобби — на любое место за столом, включая своё (этап 5, «сдать
   *  себе»); см. CROSSADE-DESIGN.md §4/§5. */
  private legalTargets(from: string): ReadonlySet<string> {
    const out = new Set<string>();
    if (from === "hand") {
      out.add("hand"); // реордер — тоже легальный переход, просто рука не носит контур (paintBoard)
      out.add("discard");
      for (const id of Object.keys(this.tree.origins)) if (id.startsWith("play:")) out.add(id);
    } else if (from === "deck" && this.state.phase === "lobby") {
      for (const id of Object.keys(this.tree.origins)) if (id.startsWith("seat:")) out.add(id);
    } else if (from === "deck" || from === "discard" || from.startsWith("play:")) {
      out.add("hand");
    }
    return out;
  }

  /** Дев-хук для e2e и ручной проверки: ЭКРАННАЯ геометрия доски (канвас не отдаёт ни DOM-узлов,
   *  ни ролей — тот же приём, что у Косынки/песочницы). */
  testHooks(): {
    slots: Record<string, { x: number; y: number; w: number; h: number }>;
    cards: Record<string, { x: number; y: number; faceUp: boolean; state: string }>;
    seats: Record<string, { x: number; y: number; text: string }>;
    topbar: Record<string, { x: number; y: number; w: number; h: number }>;
    actions: Record<string, { x: number; y: number; w: number; h: number; visible: boolean }>;
    notice: string;
    zoom: number;
  } {
    const z = this.api.viewport().zoom;
    const slots: Record<string, { x: number; y: number; w: number; h: number }> = {};
    for (const child of this.tree.root.children) {
      const at = this.tree.origins[child.id];
      if (!at) continue;
      const sz = measure(child);
      const tl = this.api.contentToScreen(at.x, at.y);
      slots[child.id] = { x: tl.x, y: tl.y, w: sz.w * z, h: sz.h * z };
    }
    const cards: Record<string, { x: number; y: number; faceUp: boolean; state: string }> = {};
    for (const [id, node] of this.nodes) {
      const p = this.api.contentToScreen(node.body.px, node.body.py);
      cards[id] = { x: p.x, y: p.y, faceUp: node.faceUp, state: node.state };
    }
    const seats: Record<string, { x: number; y: number; text: string }> = {};
    for (const [id, label] of this.seatLabels) {
      const p = this.api.contentToScreen(label.x, label.y);
      seats[id] = { x: p.x, y: p.y, text: label.text };
    }
    const rectOf = (b: Button) => ({ x: b.x, y: b.y, w: b.w, h: b.h, visible: b.root.visible });
    return {
      slots,
      cards,
      seats,
      topbar: this.topbar?.rects() ?? {},
      actions: { ready: rectOf(this.readyBtn), go: rectOf(this.goBtn), dealAll: rectOf(this.dealAllBtn), collect: rectOf(this.collectBtn) },
      notice: this.notice.visible ? this.notice.text : "",
      zoom: z,
    };
  }

  onTeardown(app: Application): void {
    this.disposeRoom();
    for (const node of this.nodes.values()) node.destroy();
    this.nodes.clear();
    for (const label of this.seatLabels.values()) label.destroy();
    this.seatLabels.clear();
    for (const label of this.zoneLabels.values()) label.destroy();
    this.zoneLabels.clear();
    this.tex?.destroy();
    this.tex = null;
    this.topbar = null;
  }
}
