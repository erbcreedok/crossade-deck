// Сетевой мост Crossade: колизеус-комната ↔ чистое состояние/сигналы (state.ts). Три швы:
//
//   1. rawFrom(roomState) — серверная схема (GameState, см. server/src/GameState.ts) как обычный
//      JS-объект (CrossadeRaw), с которого snapshotFrom (state.ts) строит снимок стола.
//      MapSchema/ArraySchema колизеуса читаются только через forEach — этого хватает, и юниты
//      идут на подставных объектах (ничего похожего на colyseus.js тут не импортируется).
//   2. CrossadePort — исходящие команды поверх room.send(); имена и формы аргументов — 1:1 с
//      серверными обработчиками (см. server/src/messages/{handMessages,roomMessages,
//      playMessages,deckMessages}.ts).
//   3. bindRoom — подписка на комнату: onStateChange даёт снимки (см. дальше про disposed), а
//      onMessage превращает по-разному устроенные сообщения сервера в ОДИН тип CrossadeSignal с
//      дискриминантом kind — сцена (этап 4) разбирает один union, а не пять колбэков.
//
// Ориентир по форме моста — client/src/room/useRoomSignals.ts (макет-референс): те же события,
// свой код, без React (в этом модуле React запрещён — см. CROSSADE-DESIGN.md).

import { snapshotFrom, type CrossadeRaw, type CrossadeState } from "./state";

// ---------------------------------------------------------------------------------------------
// 1. rawFrom — схема (duck-typed) → CrossadeRaw
// ---------------------------------------------------------------------------------------------

/** То общее, что нужно от ArraySchema<T>: перебор по порядку. Реальный ArraySchema (и plain
 *  Array<T>) подходят сюда сами — форма совпадает структурно, адаптер не нужен. */
export interface ForEachArray<T> {
  forEach(callback: (value: T, index: number) => void): void;
}

/** То общее, что нужно от MapSchema<V> (ключ — всегда sessionId, строка). */
export interface ForEachMap<V> {
  forEach(callback: (value: V, key: string) => void): void;
}

export interface RawPlayerSchema {
  id: string;
  name: string;
  isDealer: boolean;
  isReady: boolean;
  isBot: boolean;
  connected: boolean;
  handOpen: boolean;
  hand: ForEachArray<string>;
}

export interface RawPlayStackSchema {
  cards: ForEachArray<string>;
}

/** Форма server/src/GameState.ts#GameState, но со схемными коллекциями (ArraySchema/MapSchema —
 *  или их подставные двойники в тестах), а не с уже развёрнутыми массивами/Record. */
export interface RoomStateSchema {
  phase: "lobby" | "playing" | "finished";
  freeMode: boolean;
  deckFanned: boolean;
  deckRev: number;
  inviteCode: string;
  deck: ForEachArray<string>;
  discard: ForEachArray<string>;
  play: ForEachArray<RawPlayStackSchema>;
  seatOrder: ForEachArray<string>;
  players: ForEachMap<RawPlayerSchema>;
}

function toArray<T>(source: ForEachArray<T>): T[] {
  const out: T[] = [];
  source.forEach((value) => out.push(value));
  return out;
}

/** Схема комнаты (или подставной двойник с теми же forEach) → плоский CrossadeRaw для
 *  snapshotFrom. Единственное место, где мы «разворачиваем» ArraySchema/MapSchema. */
export function rawFrom(state: RoomStateSchema): CrossadeRaw {
  const players: Record<string, CrossadeRaw["players"][string]> = {};
  state.players.forEach((p, sessionId) => {
    players[sessionId] = {
      id: p.id,
      name: p.name,
      isDealer: p.isDealer,
      isReady: p.isReady,
      isBot: p.isBot,
      connected: p.connected,
      handOpen: p.handOpen,
      hand: toArray(p.hand),
    };
  });

  return {
    phase: state.phase,
    freeMode: state.freeMode,
    deckFanned: state.deckFanned,
    deckRev: state.deckRev,
    inviteCode: state.inviteCode,
    deck: toArray(state.deck),
    discard: toArray(state.discard),
    play: toArray(state.play).map((stack) => ({ cards: toArray(stack.cards) })),
    seatOrder: toArray(state.seatOrder),
    players,
  };
}

// ---------------------------------------------------------------------------------------------
// 2. CrossadePort — исходящие команды поверх room.send
// ---------------------------------------------------------------------------------------------

/** То общее, что нужно от Room для отправки: room.send(type, message?). */
export interface SendableRoom {
  send(type: string, message?: unknown): void;
}

/** Исходящие команды стола. Имена сообщений и форма аргументов — РОВНО серверные, см. заголовок
 *  файла. Необязательные аргументы (index/stack/toStack) при отсутствии не шлются вовсе — сервер
 *  одинаково трактует «поля нет» и «поле undefined» (`message?.index === undefined`). */
export interface CrossadePort {
  ready(): void;
  go(): void;
  collectHands(): void;
  dealCard(card: string, toSessionId: string): void;
  takeCard(index?: number): void;
  takeAll(): void;
  discardCard(card: string): void;
  takeDiscard(index?: number): void;
  playCard(card: string, stack?: number): void;
  takePlay(card: string): void;
  moveCard(card: string, from: string, to: string, toStack?: number): void;
  setHandOrder(order: readonly string[]): void;
  toggleHand(): void;
  setHandFanned(open: boolean): void;
  setDeckFanned(open: boolean): void;
  putCardToDeck(card: string): void;
  clearPlay(): void;
  resetDeck(): void;
  startGame(): void;
}

export function makePort(room: SendableRoom): CrossadePort {
  return {
    ready: () => room.send("ready"),
    go: () => room.send("go"),
    collectHands: () => room.send("collect_hands"),
    dealCard: (card, toSessionId) => room.send("deal_card", { card, to: toSessionId }),
    takeCard: (index) => room.send("take_card", index === undefined ? undefined : { index }),
    takeAll: () => room.send("take_all"),
    discardCard: (card) => room.send("discard_card", { card }),
    takeDiscard: (index) => room.send("take_discard", index === undefined ? undefined : { index }),
    playCard: (card, stack) => room.send("play_card", stack === undefined ? { card } : { card, stack }),
    takePlay: (card) => room.send("take_play", { card }),
    moveCard: (card, from, to, toStack) =>
      room.send("move_card", toStack === undefined ? { card, from, to } : { card, from, to, toStack }),
    setHandOrder: (order) => room.send("set_hand_order", { order: [...order] }),
    toggleHand: () => room.send("toggle_hand"),
    setHandFanned: (open) => room.send("set_hand_fanned", { open }),
    setDeckFanned: (open) => room.send("set_deck_fanned", { open }),
    putCardToDeck: (card) => room.send("put_card_to_deck", { card }),
    clearPlay: () => room.send("clear_play"),
    resetDeck: () => room.send("reset_deck"),
    startGame: () => room.send("start_game"),
  };
}

// ---------------------------------------------------------------------------------------------
// 3. bindRoom — подписка: снимки + сигналы
// ---------------------------------------------------------------------------------------------

export interface CardMove {
  card: string;
  from: string;
  to: string;
}

/** Одно из «сообщений-событий» сервера (не состояние — см. useRoomSignals.ts), приведённое к
 *  единой форме с дискриминантом kind. */
export type CrossadeSignal =
  | { kind: "card_moved"; moves: CardMove[] }
  | { kind: "hands_collected"; order: string[]; counts: Record<string, number> | null }
  | { kind: "deck_reset"; order: string[]; counts: Record<string, number> | null }
  | { kind: "go_shout" }
  | { kind: "taunt"; taunt: string; from: string }
  | { kind: "action_rejected"; action: string; reason: string; cards: string[] };

export interface BindRoomOpts {
  /** sessionId зрителя — чья рука видна всегда (см. state.ts#snapshotFrom). */
  self: string;
  onState(snapshot: CrossadeState): void;
  onSignal(signal: CrossadeSignal): void;
}

/** То общее, что нужно от Room для подписки. onStateChange/onMessage у настоящего colyseus.js
 *  НЕ отдают простую unsubscribe-функцию, годную под duck-typing (onStateChange — сигнал:
 *  снять подписку можно только его же `.remove(cb)`, а не значением, которое вернул вызов
 *  регистрации) — поэтому dispose здесь не снятие подписки, а флаг disposed, глушащий колбэки. */
export interface BindableRoom {
  onStateChange(callback: (state: RoomStateSchema) => void): unknown;
  onMessage<T = unknown>(type: string, callback: (message: T) => void): unknown;
}

export function bindRoom(room: BindableRoom, opts: BindRoomOpts): { dispose(): void } {
  let disposed = false;
  let prev: CrossadeState | undefined;

  room.onStateChange((state) => {
    if (disposed) return;
    // prev держится ЗДЕСЬ (не в state.ts) — это и есть stale-check/удержание порядка руки между
    // кадрами сети, а snapshotFrom остаётся чистой функцией без памяти между вызовами.
    prev = snapshotFrom(rawFrom(state), opts.self, prev);
    opts.onState(prev);
  });

  function on<T>(type: string, toSignal: (message: T) => CrossadeSignal): void {
    room.onMessage<T>(type, (message) => {
      if (disposed) return;
      opts.onSignal(toSignal(message));
    });
  }

  on<{ moves?: CardMove[] }>("card_moved", (m) => ({ kind: "card_moved", moves: m?.moves ?? [] }));
  on<{ order?: string[]; counts?: Record<string, number> }>("hands_collected", (m) => ({
    kind: "hands_collected",
    order: m?.order ?? [],
    counts: m?.counts ?? null,
  }));
  on<{ order?: string[]; counts?: Record<string, number> }>("deck_reset", (m) => ({
    kind: "deck_reset",
    order: m?.order ?? [],
    counts: m?.counts ?? null,
  }));
  on<unknown>("go_shout", () => ({ kind: "go_shout" }));
  on<{ kind?: string; from?: string }>("taunt", (m) => ({
    kind: "taunt",
    taunt: m?.kind ?? "",
    from: m?.from ?? "",
  }));
  on<{ action?: string; reason?: string; cards?: string[] }>("action_rejected", (m) => ({
    kind: "action_rejected",
    action: m?.action ?? "",
    reason: m?.reason ?? "",
    cards: m?.cards ?? [],
  }));

  return {
    dispose() {
      disposed = true;
    },
  };
}
