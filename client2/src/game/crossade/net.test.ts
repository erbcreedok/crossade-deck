import { describe, expect, it, vi } from "vitest";
import { bindRoom, makePort, rawFrom, type BindableRoom, type RoomStateSchema } from "./net";

// ---------- подставные forEach-коллекции (духом colyseus ArraySchema/MapSchema, без импорта
// colyseus.js) ----------

function feArray<T>(items: readonly T[]) {
  return { forEach: (cb: (value: T, index: number) => void) => items.forEach((v, i) => cb(v, i)) };
}

function feMap<V>(record: Record<string, V>) {
  return {
    forEach: (cb: (value: V, key: string) => void) => Object.entries(record).forEach(([k, v]) => cb(v, k)),
  };
}

function fakeState(over: Partial<RoomStateSchema> = {}): RoomStateSchema {
  return {
    phase: "lobby",
    freeMode: false,
    deckFanned: false,
    deckRev: 0,
    inviteCode: "ABC123",
    deck: feArray([]),
    discard: feArray([]),
    play: feArray([]),
    seatOrder: feArray([]),
    players: feMap({}),
    ...over,
  };
}

describe("rawFrom — схема (духом colyseus, только forEach) → CrossadeRaw", () => {
  it("плоские поля переносятся как есть", () => {
    const raw = rawFrom(fakeState({ phase: "playing", freeMode: true, deckFanned: true, deckRev: 7 }));
    expect(raw.phase).toBe("playing");
    expect(raw.freeMode).toBe(true);
    expect(raw.deckFanned).toBe(true);
    expect(raw.deckRev).toBe(7);
    expect(raw.inviteCode).toBe("ABC123");
  });

  it("ArraySchema-подобные коллекции (forEach) разворачиваются в обычные массивы, порядок сохраняется", () => {
    const raw = rawFrom(
      fakeState({
        deck: feArray(["A♠", "K♥", "Q♦"]),
        discard: feArray(["7♣"]),
        seatOrder: feArray(["s2", "s1"]),
      }),
    );
    expect(raw.deck).toEqual(["A♠", "K♥", "Q♦"]);
    expect(raw.discard).toEqual(["7♣"]);
    expect(raw.seatOrder).toEqual(["s2", "s1"]);
  });

  it("play — массив кучек, у каждой своя ArraySchema-подобная cards", () => {
    const raw = rawFrom(
      fakeState({
        play: feArray([{ cards: feArray(["10♠", "J♠"]) }, { cards: feArray(["9♥"]) }]),
      }),
    );
    expect(raw.play).toEqual([{ cards: ["10♠", "J♠"] }, { cards: ["9♥"] }]);
  });

  it("players — MapSchema-подобная коллекция (forEach(value, key)) разворачивается в Record по sessionId", () => {
    const raw = rawFrom(
      fakeState({
        players: feMap({
          s1: {
            id: "acc-1",
            name: "Дилер",
            isDealer: true,
            isReady: true,
            isBot: false,
            connected: true,
            handOpen: false,
            hand: feArray(["A♠", "K♥"]),
          },
          s2: {
            id: "acc-2",
            name: "Бот",
            isDealer: false,
            isReady: false,
            isBot: true,
            connected: true,
            handOpen: true,
            hand: feArray([]),
          },
        }),
      }),
    );
    expect(Object.keys(raw.players).sort()).toEqual(["s1", "s2"]);
    expect(raw.players.s1).toEqual({
      id: "acc-1",
      name: "Дилер",
      isDealer: true,
      isReady: true,
      isBot: false,
      connected: true,
      handOpen: false,
      hand: ["A♠", "K♥"],
    });
    expect(raw.players.s2!.isBot).toBe(true);
    expect(raw.players.s2!.hand).toEqual([]);
  });
});

// ---------- makePort ----------

interface Sent {
  type: string;
  message?: unknown;
}

function fakeSendRoom() {
  const calls: Sent[] = [];
  return {
    calls,
    send: (type: string, message?: unknown) => calls.push({ type, message }),
  };
}

describe("makePort — исходящие команды, имена и формы РОВНО серверные", () => {
  it("ready/go/collectHands/takeAll/toggleHand/clearPlay/resetDeck/startGame — без аргументов", () => {
    const room = fakeSendRoom();
    const port = makePort(room);
    port.ready();
    port.go();
    port.collectHands();
    port.takeAll();
    port.toggleHand();
    port.clearPlay();
    port.resetDeck();
    port.startGame();
    expect(room.calls.map((c) => c.type)).toEqual([
      "ready",
      "go",
      "collect_hands",
      "take_all",
      "toggle_hand",
      "clear_play",
      "reset_deck",
      "start_game",
    ]);
    expect(room.calls.every((c) => c.message === undefined)).toBe(true);
  });

  it("dealCard(card, toSessionId) → deal_card {card, to}", () => {
    const room = fakeSendRoom();
    makePort(room).dealCard("A♠", "s2");
    expect(room.calls).toEqual([{ type: "deal_card", message: { card: "A♠", to: "s2" } }]);
  });

  it("takeCard() без индекса → take_card без message; takeCard(index) → {index}", () => {
    const room = fakeSendRoom();
    const port = makePort(room);
    port.takeCard();
    port.takeCard(3);
    expect(room.calls).toEqual([
      { type: "take_card", message: undefined },
      { type: "take_card", message: { index: 3 } },
    ]);
  });

  it("discardCard(card) → discard_card {card}", () => {
    const room = fakeSendRoom();
    makePort(room).discardCard("7♣");
    expect(room.calls).toEqual([{ type: "discard_card", message: { card: "7♣" } }]);
  });

  it("takeDiscard() без индекса и takeDiscard(index)", () => {
    const room = fakeSendRoom();
    const port = makePort(room);
    port.takeDiscard();
    port.takeDiscard(1);
    expect(room.calls).toEqual([
      { type: "take_discard", message: undefined },
      { type: "take_discard", message: { index: 1 } },
    ]);
  });

  it("playCard(card) без стопки и playCard(card, stack)", () => {
    const room = fakeSendRoom();
    const port = makePort(room);
    port.playCard("9♥");
    port.playCard("9♥", 2);
    expect(room.calls).toEqual([
      { type: "play_card", message: { card: "9♥" } },
      { type: "play_card", message: { card: "9♥", stack: 2 } },
    ]);
  });

  it("takePlay(card) → take_play {card}", () => {
    const room = fakeSendRoom();
    makePort(room).takePlay("9♥");
    expect(room.calls).toEqual([{ type: "take_play", message: { card: "9♥" } }]);
  });

  it("moveCard(card, from, to) и moveCard(..., toStack)", () => {
    const room = fakeSendRoom();
    const port = makePort(room);
    port.moveCard("9♥", "hand", "discard");
    port.moveCard("9♥", "hand", "play", 1);
    expect(room.calls).toEqual([
      { type: "move_card", message: { card: "9♥", from: "hand", to: "discard" } },
      { type: "move_card", message: { card: "9♥", from: "hand", to: "play", toStack: 1 } },
    ]);
  });

  it("setHandOrder(order) → set_hand_order {order}", () => {
    const room = fakeSendRoom();
    makePort(room).setHandOrder(["A♠", "K♥"]);
    expect(room.calls).toEqual([{ type: "set_hand_order", message: { order: ["A♠", "K♥"] } }]);
  });

  it("setHandFanned/setDeckFanned(open) → {open}", () => {
    const room = fakeSendRoom();
    const port = makePort(room);
    port.setHandFanned(true);
    port.setDeckFanned(false);
    expect(room.calls).toEqual([
      { type: "set_hand_fanned", message: { open: true } },
      { type: "set_deck_fanned", message: { open: false } },
    ]);
  });

  it("putCardToDeck(card) → put_card_to_deck {card}", () => {
    const room = fakeSendRoom();
    makePort(room).putCardToDeck("7♣");
    expect(room.calls).toEqual([{ type: "put_card_to_deck", message: { card: "7♣" } }]);
  });
});

// ---------- bindRoom ----------

class FakeBindableRoom implements BindableRoom {
  private stateCb?: (state: RoomStateSchema) => void;
  private handlers = new Map<string, (message: unknown) => void>();

  onStateChange(callback: (state: RoomStateSchema) => void): unknown {
    this.stateCb = callback;
    return callback;
  }

  onMessage<T = unknown>(type: string, callback: (message: T) => void): unknown {
    this.handlers.set(type, callback as (message: unknown) => void);
    return () => this.handlers.delete(type);
  }

  emitState(state: RoomStateSchema): void {
    this.stateCb?.(state);
  }

  emitMessage(type: string, message: unknown): void {
    this.handlers.get(type)?.(message);
  }

  handlerCount(): number {
    return this.handlers.size;
  }
}

describe("bindRoom — снимки", () => {
  it("onStateChange → снимок доходит в onState", () => {
    const room = new FakeBindableRoom();
    const onState = vi.fn();
    bindRoom(room, { self: "s1", onState, onSignal: vi.fn() });

    room.emitState(fakeState({ deckRev: 1, deck: feArray(["A♠"]) }));

    expect(onState).toHaveBeenCalledTimes(1);
    expect(onState.mock.calls[0]![0].deck).toEqual(["A♠"]);
  });

  it("prev держится внутри bindRoom — устаревшее эхо (rev меньше) не перерисовывает снимок", () => {
    const room = new FakeBindableRoom();
    const onState = vi.fn();
    bindRoom(room, { self: "s1", onState, onSignal: vi.fn() });

    room.emitState(fakeState({ deckRev: 5, deck: feArray(["A♠", "K♥"]) }));
    room.emitState(fakeState({ deckRev: 3, deck: feArray(["Z"]) })); // устаревшее эхо

    expect(onState).toHaveBeenCalledTimes(2);
    const first = onState.mock.calls[0]![0];
    const second = onState.mock.calls[1]![0];
    expect(second).toBe(first); // тот же объект — картинка не откатилась
    expect(second.deck).toEqual(["A♠", "K♥"]);
  });

  it("свежий rev пересобирает снимок как обычно", () => {
    const room = new FakeBindableRoom();
    const onState = vi.fn();
    bindRoom(room, { self: "s1", onState, onSignal: vi.fn() });

    room.emitState(fakeState({ deckRev: 5, deck: feArray(["A♠"]) }));
    room.emitState(fakeState({ deckRev: 6, deck: feArray(["Z"]) }));

    expect(onState.mock.calls[1]![0].deck).toEqual(["Z"]);
  });
});

describe("bindRoom — сигналы", () => {
  it("card_moved → {kind: 'card_moved', moves}", () => {
    const room = new FakeBindableRoom();
    const onSignal = vi.fn();
    bindRoom(room, { self: "s1", onState: vi.fn(), onSignal });

    room.emitMessage("card_moved", { moves: [{ card: "A♠", from: "deck", to: "s1" }] });

    expect(onSignal).toHaveBeenCalledWith({
      kind: "card_moved",
      moves: [{ card: "A♠", from: "deck", to: "s1" }],
    });
  });

  it("hands_collected → {kind, order, counts}", () => {
    const room = new FakeBindableRoom();
    const onSignal = vi.fn();
    bindRoom(room, { self: "s1", onState: vi.fn(), onSignal });

    room.emitMessage("hands_collected", { order: ["s1", "s2"], counts: { s1: 2, s2: 3 } });

    expect(onSignal).toHaveBeenCalledWith({
      kind: "hands_collected",
      order: ["s1", "s2"],
      counts: { s1: 2, s2: 3 },
    });
  });

  it("deck_reset → {kind, order, counts}, counts отсутствует → null", () => {
    const room = new FakeBindableRoom();
    const onSignal = vi.fn();
    bindRoom(room, { self: "s1", onState: vi.fn(), onSignal });

    room.emitMessage("deck_reset", { order: ["s1"] });

    expect(onSignal).toHaveBeenCalledWith({ kind: "deck_reset", order: ["s1"], counts: null });
  });

  it("go_shout → {kind: 'go_shout'} без состояния", () => {
    const room = new FakeBindableRoom();
    const onSignal = vi.fn();
    bindRoom(room, { self: "s1", onState: vi.fn(), onSignal });

    room.emitMessage("go_shout", {});

    expect(onSignal).toHaveBeenCalledWith({ kind: "go_shout" });
  });

  it("taunt {kind, from} → {kind: 'taunt', taunt, from}", () => {
    const room = new FakeBindableRoom();
    const onSignal = vi.fn();
    bindRoom(room, { self: "s1", onState: vi.fn(), onSignal });

    room.emitMessage("taunt", { kind: "gkh", from: "s2" });

    expect(onSignal).toHaveBeenCalledWith({ kind: "taunt", taunt: "gkh", from: "s2" });
  });

  it("action_rejected {action, reason, cards} → тот же вид сигнала", () => {
    const room = new FakeBindableRoom();
    const onSignal = vi.fn();
    bindRoom(room, { self: "s1", onState: vi.fn(), onSignal });

    room.emitMessage("action_rejected", { action: "deal_card", reason: "free_mode", cards: [] });

    expect(onSignal).toHaveBeenCalledWith({
      kind: "action_rejected",
      action: "deal_card",
      reason: "free_mode",
      cards: [],
    });
  });
});

describe("bindRoom — dispose", () => {
  it("после dispose колбэки молчат и на state, и на сообщения", () => {
    const room = new FakeBindableRoom();
    const onState = vi.fn();
    const onSignal = vi.fn();
    const { dispose } = bindRoom(room, { self: "s1", onState, onSignal });

    room.emitState(fakeState({ deckRev: 1 }));
    room.emitMessage("go_shout", {});
    expect(onState).toHaveBeenCalledTimes(1);
    expect(onSignal).toHaveBeenCalledTimes(1);

    dispose();

    room.emitState(fakeState({ deckRev: 2 }));
    room.emitMessage("go_shout", {});
    room.emitMessage("card_moved", { moves: [] });

    expect(onState).toHaveBeenCalledTimes(1);
    expect(onSignal).toHaveBeenCalledTimes(1);
  });
});
