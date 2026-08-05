import { Text } from "pixi.js";
import { PIXEL_FONT, COLORS } from "../engine/constants";
import { measure } from "../slot/slot";
import { buildCrossadeTree, CARD, SEAT, type CrossadeTree } from "./tree";
import { NetTableScene, type NetTableOptions } from "./tableScene";
import { emptyTableState, selfSeatOf, type CrossadeSeat, type CrossadeState } from "./state";
import type { CrossadeSignal } from "./net";
import { paintSlots, ZONE_LABELS } from "./slotPaint";
import { CrossadeHud } from "./hud";
import { SceneShout } from "./notice";
import type { SeatStyle } from "./seatLabels";
import type { DragHints } from "./tableDrag";

// СЦЕНА CROSSADE — полный сетевой стол: колода, сброс, play-зона, места, HUD. Общее с дебаг-столом
// (проводка рантайма, сведение доски со снимком, правила драга/дропа, реордер руки) живёт в
// crossade/tableScene.ts — здесь только то, чего у усечённого стола нет:
//
//   • состав доски: колода и сброс (у дебаг-стола их дерево не раскладывает);
//   • HUD (hud.ts): статус комнаты, готовность, дилерские действия;
//   • клич «ГОУ!» (notice.ts#SceneShout) — событие на весь стол, а не сообщение;
//   • подписи зон и контур места, зажигающийся только под раздачу драгом.
//
// Ввод/камера/драг/цикл кадра/тени берутся из SceneEngine и здесь НЕ пишутся заново.

export interface CrossadeSceneOptions extends NetTableOptions {
  onBack?: () => void;
}

export class CrossadeScene extends NetTableScene<CrossadeTree> {
  private hud: CrossadeHud | null = null;
  private shout: SceneShout | null = null;
  private readonly zoneLabels = new Map<string, Text>();

  constructor(private readonly opts: CrossadeSceneOptions) {
    super(opts, emptyTableState(opts.selfSessionId));
  }

  // ——— состав стола ———

  protected buildTree(state: CrossadeState): CrossadeTree {
    return buildCrossadeTree(state);
  }

  /** Порядок вызовов задаёт z между зонами (см. tableScene.ts#rebuildBoard). */
  protected placeCards(state: CrossadeState, place: (cardId: string, indexInPile: number) => void): void {
    state.deck.forEach((c, i) => place(c, i));
    state.discard.forEach((c, i) => place(c, i));
    state.play.forEach((stack) => stack.forEach((c, i) => place(c, i)));
    state.selfHand.forEach((c, i) => place(c, i));
  }

  // ——— хром ———

  protected buildChrome(): void {
    this.hud = new CrossadeHud(
      {
        chromeAdd: (c) => this.api.chromeAdd(c),
        setChromeButtons: (btns) => this.api.setChromeButtons(btns),
        width: () => this.api.width(),
        onBack: () => this.opts.onBack?.(),
      },
      this.port,
    );
    this.shout = new SceneShout(this.api);
    this.syncHud();
  }

  layoutChrome(w: number, h: number): void {
    this.hud?.layoutChrome(w);
    this.notice?.place(w / 2, this.chromeInsetTop() + 8);
    this.shout?.place(w / 2, h / 2);
  }

  chromeInsetTop(): number {
    return this.hud?.height ?? 0;
  }

  /** Снимок может прийти РАНЬШЕ, чем buildScene() соберёт хром: bindRoom подписывается уже в
   *  конструкторе, а mount() асинхронный (ждёт шрифты) — отсюда и `?.`. */
  private syncHud(): void {
    this.hud?.sync(this.state, this.selfSeat());
  }

  private selfSeat(): CrossadeSeat | null {
    return selfSeatOf(this.state);
  }

  // ——— сеть ———

  protected onSnapshot(): void {
    this.syncHud();
  }

  protected onSignal(signal: CrossadeSignal): void {
    // Остальные сигналы (card_moved, hands_collected, deck_reset, taunt) доска и так отыгрывает
    // через снимок — снимок единственная правда; своя реакция на них (кричалки, волновой возврат) —
    // задел на потом.
    if (signal.kind === "go_shout") this.shout?.show();
  }

  // ——— места ———

  /** Имя + счёт карт, дилер под короной, отключённый пригашен. Чужие карты не рисуются вовсе:
   *  «другим не видно» здесь не правило отображения, а отсутствие данных в снимке. */
  protected seatStyle(): SeatStyle {
    return {
      seats: this.state.seats,
      caption: (seat) => `${seat.name}${seat.isDealer ? " ♛" : ""}\n${seat.handCount}`,
      fill: (seat) => (seat.connected ? COLORS.seatName : COLORS.seatNameOff),
      cell: SEAT,
    };
  }

  // ——— отрисовка слотов ———

  protected paintBoard({ armed, hot }: DragHints): void {
    const ids = Object.keys(this.tree.origins).filter((id) => id === "deck" || id === "discard" || id.startsWith("play:"));
    paintSlots(this.slotLayer, { origins: this.tree.origins, ids, cell: CARD, armed, hot });
    // Места игроков: контур ТОЛЬКО пока они armed/hot (раздача драгом) — в покое место остаётся
    // просто текстом (см. подписи мест), см. заголовок slotPaint.ts.
    const seatIds = Object.keys(this.tree.origins).filter((id) => id.startsWith("seat:") && (armed.has(id) || hot === id));
    if (seatIds.length) {
      paintSlots(this.slotLayer, { origins: this.tree.origins, ids: seatIds, cell: SEAT, armed, hot, clear: false });
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

  protected onTeardownExtra(): void {
    for (const label of this.zoneLabels.values()) label.destroy();
    this.zoneLabels.clear();
    this.hud = null;
    this.shout = null;
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
    for (const [id, label] of this.seatLabels.entries()) {
      const p = this.api.contentToScreen(label.x, label.y);
      seats[id] = { x: p.x, y: p.y, text: label.text };
    }
    const hud = this.hud?.rects() ?? { topbar: {}, actions: {} };
    return { slots, cards, seats, topbar: hud.topbar, actions: hud.actions, notice: this.notice?.shown() ?? "", zoom: z };
  }
}
