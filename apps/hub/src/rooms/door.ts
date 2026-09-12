// ДВЕРЬ ХАБА В МОСТ: кто носит мосту комнаты и что делает с его тремя ответами.
//
// Мост не знает ни нашего сервера, ни игр — поэтому всё, что знает про то и другое, живёт здесь:
// откуда берутся комнаты, куда уходит «войти», чем становится «создать» и что значит «одному».

import { roomsBridge, type Bridge, type NewTable, type Room } from "@game-presets/rooms";
import { closeRoom, findRooms, openRoom, reserveCode, storedAccount, type RoomCard } from "@crossade/wire";
import { CATALOGUE } from "../hub/catalogue.js";
import { axesOf, roomForBridge, type GameLook } from "./wiring.js";

/** Откуда дверь берёт комнаты и куда девает правки. Подменяется целиком — в тесте и в Mini App. */
export interface RoomsGateway {
  list(game: string | undefined, me: string | undefined): Promise<RoomCard[] | undefined>;
  open(o: Parameters<typeof openRoom>[0]): Promise<RoomCard | undefined>;
  freshCode(): Promise<string | undefined>;
  close(room: string, by: string): Promise<boolean>;
  me(): string | undefined;
}

export const liveRooms: RoomsGateway = {
  // `undefined` — СЕРВЕР МОЛЧИТ, и это не то же самое, что «комнат нет»: пустой список говорит, что
  // столов не открыли, а молчание — что спросить не у кого. Мост показывает разные экраны.
  list: async (game, me) => {
    try {
      return await findRooms(game, me);
    } catch {
      return undefined;
    }
  },
  open: (o) => openRoom(o),
  freshCode: () => reserveCode(),
  close: (room, by) => closeRoom(room, by),
  me: () => storedAccount()?.id,
};

/** Игры, которые мост показывает: те же, что на полке, и только застольные. */
export function bridgeGames(): GameLook[] {
  return CATALOGUE.filter((one) => one.atTable).map((one) => ({
    id: one.id,
    name: one.label,
    sign: one.sign ?? "♠",
  }));
}

export interface RoomsDoorOptions {
  readonly gateway?: RoomsGateway | undefined;
  /** Сесть за стол с этим кодом — адрес и игра дело хаба. */
  readonly onSit: (game: string, code: string) => void;
  /** Стол без комнаты: играть одному. */
  readonly onSolo: (game: string) => void;
  readonly ask?: ((question: string, now: string) => Promise<string | undefined>) | undefined;
}

export interface RoomsDoor {
  /** Показать столы этой игры. */
  show(game: string): Promise<void>;
  /** Сказать то, чего по экрану не видно: «стол закрылся». */
  say(game: string, words: string): Promise<void>;
  readonly bridge: Bridge;
  stop(): void;
}

export function roomsDoor(container: HTMLElement, o: RoomsDoorOptions): RoomsDoor {
  const gate = o.gateway ?? liveRooms;
  const games = bridgeGames();
  let game: string | undefined;
  let stopped = false;

  const bridge = roomsBridge(container, {
    games,
    get game() {
      return game;
    },
    onEnter: (code) => o.onSit(game ?? games[0]!.id, code),
    onCreate: (table: NewTable) => void make(table),
    onSolo: () => o.onSolo(game ?? games[0]!.id),
    freshCode: () => gate.freshCode(),
    ...(o.ask ? { ask: o.ask } : {}),
  });

  const make = async (table: NewTable): Promise<void> => {
    const made = await gate.open({
      game: table.game,
      // «Мест за столом» на стенде создания — это СТУЛЬЯ. Сколько людей комната держит, спрашивают
      // не здесь: её предел один на все столы.
      chairs: table.seats,
      mode: table.mode,
      forever: table.forever,
      code: table.code,
      ...axesOf(table.openness),
      ...(gate.me() ? { by: gate.me()! } : {}),
    });
    if (stopped) return;
    // Не открылось — стол не подменяется молчанием: человек возвращается к списку и видит, почему.
    if (!made?.code) {
      await show(table.game, "Не вышло открыть стол — сервер не ответил.");
      return;
    }
    o.onSit(table.game, made.code);
  };

  const show = async (id: string, words?: string): Promise<void> => {
    game = id;
    const look = games.find((one) => one.id === id) ?? games[0]!;
    const me = gate.me();
    // СНАЧАЛА ЭКРАН, ПОТОМ ОТВЕТ. Пустой список, пока сервер думает, читается как «никого нет» — а
    // это другой экран и другие кнопки.
    bridge.show({ rooms: [], who: me ? "member" : "guest", answer: "loading", ...(words ? { said: words } : {}) });
    const cards = await gate.list(id, me);
    if (stopped || game !== id) return;
    const now = Date.now();
    const rooms: Room[] = (cards ?? []).map((card) =>
      roomForBridge(card, games.find((one) => one.id === card.game) ?? look, now),
    );
    bridge.show({
      rooms,
      who: me ? "member" : "guest",
      answer: cards === undefined ? "silent" : "rooms",
      ...(words ? { said: words } : {}),
    });
  };

  return {
    bridge,
    show: (id) => show(id),
    say: (id, words) => show(id, words),
    stop() {
      stopped = true;
      bridge.stop();
    },
  };
}

export { closeRoom };
