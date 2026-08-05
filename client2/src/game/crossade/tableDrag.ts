// ДРАГ И ДРОП СЕТЕВОГО СТОЛА — коллаборатор: владелец подсказок текущего жеста (какие зоны зажжены
// и какая под пальцем) и единственное место, где намерение хода превращается в отправку.
//
// Правила — не здесь: что поднимается, что зажигается и что значит дроп считает чистый moveRules.ts,
// отправляет moveIntent.ts. Этот класс отвечает за ПОРЯДОК действий вокруг них — тот порядок, в
// котором легко ошибиться молча:
//   • подсказки перекрашиваются только когда цель СМЕНИЛАСЬ (иначе перерисовка на каждую точку);
//   • задержка «жду ответа» заводится ДО отправки — при нулевой задержке (локальный мастер) эхо
//     приходит СИНХРОННО внутри port.*(), и одобрение обязано застать ожидание заведённым;
//   • карта всегда летит на прежнее место (release): новое ей укажет снимок сервера, а
//     нераспознанный дроп ничего и не менял.

import type { DragPayload } from "../engine/drag";
import type { SceneElement } from "../engine/sceneEngine";
import type { Pt } from "../engine/sceneContract";
import type { NetTree } from "./netTree";
import type { CrossadeState } from "./state";
import { dropTarget } from "../slot/slot";
import { armedTargets, canDragFrom, routeDrop } from "./moveRules";
import { isServerMove, sendMove, type ServerMove } from "./moveIntent";
import { handOrderAfterDrop } from "./handOrder";
import { sameOrder } from "./diff";
import type { CrossadePort } from "./net";

/** Свой жест наружу: live-стол транслирует его в сеть, дебаг-стол запоминает точку захвата. Три
 *  фазы всегда приходят вместе, поэтому это один объект, а не три шва. */
export interface OwnGesture {
  begin(el: SceneElement, cp: Pt): void;
  point(p: Pt): void;
  end(): void;
}

export interface TableDragDeps {
  tree(): NetTree;
  state(): CrossadeState;
  port(): CrossadePort;
  /** Карту уже держит ожидание ответа — второй раз её не поднять. */
  held(cardId: string): boolean;
  /** Перерисовать контуры слотов (подсказки сменились) и разбудить цикл. */
  repaint(): void;
  wake(): void;
  drag(): DragPayload | null;
  defaultBeginDrag(el: SceneElement, cp: Pt, sp: Pt): boolean;
  /** Задержать карту в точке дропа до ответа сервера: true — домой её не отпускаем. */
  hold(move: ServerMove, el: SceneElement, cp: Pt): boolean;
  /** Своя рука в показанном порядке и запись нового порядка ПОЛЕМ снимка (см. reorderHand). */
  hand(): readonly string[];
  setHand(next: string[]): void;
  /** Свести доску с изменённым снимком. */
  rebuild(): void;
  /** null — стол своих жестов никуда не транслирует. */
  gesture(): OwnGesture | null;
}

/** Подсказки текущего жеста: зоны, готовые принять груз, и та, что под пальцем. Их читает отрисовка
 *  слотов — своего мнения о жесте у неё нет. */
export interface DragHints {
  armed: ReadonlySet<string>;
  hot: string | null;
}

export class SceneTableDrag {
  armed: ReadonlySet<string> = new Set();
  hot: string | null = null;

  constructor(private readonly deps: TableDragDeps) {}

  canDrag(el: SceneElement): boolean {
    if (this.deps.held(el.id)) return false; // судьбу карты уже решает сервер
    return canDragFrom({ slot: this.deps.tree().slotOf(el.id), card: el.id, state: this.deps.state() });
  }

  begin(el: SceneElement, cp: Pt, sp: Pt): boolean {
    const tree = this.deps.tree();
    this.armed = armedTargets(tree.slotOf(el.id) ?? "", Object.keys(tree.origins), this.deps.state().phase);
    this.deps.repaint();
    this.deps.gesture()?.begin(el, cp);
    return this.deps.defaultBeginDrag(el, cp, sp);
  }

  moved(p: Pt): void {
    this.deps.gesture()?.point(p);
    const id = this.deps.tree().slotAt(p);
    const hot = id && this.armed.has(id) ? id : null;
    if (hot === this.hot) return;
    this.hot = hot;
    this.deps.repaint();
    this.deps.wake();
  }

  /** Слот под пальцем спрашивается у ДЕРЕВА — у того же, что рисует карты. */
  resolve(el: SceneElement, cp: Pt): void {
    const drag = this.deps.drag();
    if (!drag) return;
    const tree = this.deps.tree();
    const target = dropTarget(tree.root, cp);
    const move = routeDrop({
      from: tree.slotOf(el.id),
      to: target?.group.id ?? null,
      card: el.id,
      index: target?.index ?? null,
      freeMode: this.deps.state().freeMode,
    });

    if (move && isServerMove(move)) {
      const held = this.deps.hold(move, el, cp);
      sendMove(this.deps.port(), move);
      if (held) return;
    } else if (move) {
      this.reorderHand(move.card, move.toIndex);
    }
    drag.release();
  }

  /**
   * Реордер своей руки — ЕДИНСТВЕННЫЙ переход, который применяется ОПТИМИСТИЧНО (мутирует снимок, а
   * не ждёт сервер). Иначе не сработало бы вовсе: applyHandOrder (state.ts) держит ПРЕЖНИЙ
   * показанный порядок, пока состав руки не меняется (перестановка — тот же набор), а значит эхо
   * сервера всегда «подтверждает» старый порядок и новый никогда бы не отобразился.
   *
   * Порядок пишется ИМЕННО ПОЛЕМ снимка, объект не заменяется: net.ts#bindRoom держит тот же
   * CrossadeState своим внутренним `prev` между снимками, и следующий applyHandOrder(serverHand,
   * prev.selfHand) обязан увидеть НАШ порядок — иначе следующий же чужой патч (кто-то нажал
   * «готов») откатил бы руку на экране обратно.
   */
  private reorderHand(cardId: string, toIndex: number): void {
    const hand = this.deps.hand();
    const next = handOrderAfterDrop(hand, cardId, toIndex); // чистая splice-логика — см. handOrder.ts
    if (sameOrder(next, hand)) return; // дропнули туда же — ничего не изменилось, слать нечего
    this.deps.setHand(next);
    this.deps.rebuild();
    this.deps.port().setHandOrder(next);
  }

  end(): void {
    this.deps.gesture()?.end();
    this.armed = new Set();
    this.hot = null;
    this.deps.repaint();
  }
}
