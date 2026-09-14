// КОНТРАКТ СТОЛА — всё, чем клиент, сервер и бот обмениваются, и ничего сверх. Этот файл читают
// все трое: сервер (`TableRoom`), HTML-клиент (`table-client/`, собирается прямо из него) и бот
// (через HTTP). Поэтому здесь только типы и чистые константы — ни одного импорта из Node.
//
// ДВЕ ОСИ ВХОДА, И ОНИ НЕЗАВИСИМЫ:
//   `door`   — КАК человек доказал, кто он: подписью Telegram (`telegram`) или никак (`guest`);
//   `client` — ЧЕМ он пришёл: HTML-клиентом, дев-китом, чем угодно ещё.
// Mini App и браузер различаются дверью, а не клиентом: тот же HTML открывается и там, и там.

/** Имя комнаты в Colyseus. Одно на все клиенты стола. */
export const TABLE_ROOM = "table_room";

export type Door = "telegram" | "guest";
export type ClientKind = "html" | "kit" | (string & {});

/** Что клиент кладёт в `joinOrCreate(TABLE_ROOM, …)`. */
export interface JoinOptions {
  /** Подписанный id комнаты (`roomIds.ts`) — без подписи комнату не открыть. */
  room: string;
  client: ClientKind;
  door: Door;
  /** `door: "telegram"` — строка `Telegram.WebApp.initData` как есть. */
  initData?: string;
  /** `door: "guest"` — как назваться. Сервер пускает гостей, только если ему это разрешено. */
  name?: string;
}

export interface Person {
  key: string;
  name: string;
  ink: string;
  door: Door;
  photo?: string;
}

export type Suit = "s" | "h" | "d" | "c";
export interface Face {
  rank: string;
  suit: Suit;
}

/**
 * ГДЕ ЛЕЖИТ ВЕЩЬ. Колода — стопка (берётся только верхняя), рука — ряд со своим порядком, сукно —
 * точки в единицах стола (ширина карты), и порядок в нём — это порядок «кто сверху».
 */
export type Where =
  | { in: "deck" }
  | { in: "hand"; who: string; i: number }
  | { in: "felt"; x: number; y: number; up: boolean };

/** Карта, какой её видит конкретный зритель: `face` есть, только если ему её видно. */
export interface SeenCard {
  id: string;
  face?: Face;
}

export interface FeltCard extends SeenCard {
  x: number;
  y: number;
  up: boolean;
}

/** Всё, что зритель знает о столе. Сервер собирает его для каждого отдельно (`Table.seenBy`). */
export interface Snapshot {
  v: number;
  people: Person[];
  deck: SeenCard[];
  felt: FeltCard[];
  hands: Record<string, SeenCard[]>;
  /** Кто что держит: id вещи → key человека. */
  locks: Record<string, string>;
}

// ── ОТ КЛИЕНТА К СЕРВЕРУ: намерения. Сервер решает, случились ли они. ───────────────────────────

export type Intent =
  /** Взять вещь в руку пальцем. Пока держишь — никто другой её не тронет. */
  | { t: "grab"; id: string }
  /** «Я всё ещё держу» — без этого блокировка истекает (`LOCK_TTL_MS`). */
  | { t: "hold"; id: string }
  /** Положить то, что держишь. */
  | { t: "drop"; id: string; to: Where }
  /** Отпустить, не перекладывая. */
  | { t: "release"; id: string }
  /** Перевернуть порядок своей руки. */
  | { t: "flip" }
  /** Разошлись версии — пришли мне стол целиком. */
  | { t: "sync" };

// ── ОТ СЕРВЕРА К КЛИЕНТАМ: дифы. Каждый уже отредактирован под того, кому летит. ───────────────

export type Op =
  | { t: "join"; person: Person; hand: SeenCard[] }
  | { t: "leave"; key: string }
  | { t: "lock"; id: string; by: string }
  | { t: "unlock"; id: string }
  /** Вещь переехала. `card.face` есть, только если на новом месте зрителю её видно. */
  | { t: "move"; card: SeenCard; from: Where; to: Where }
  | { t: "order"; who: string; ids: string[] };

export interface Patch {
  v: number;
  ops: Op[];
}

/** Почему намерение не случилось — клиент откатывает у себя то, что успел показать. */
export type Refusal = "locked" | "not-held" | "not-top" | "gone" | "bad";
export interface Refused {
  intent: Intent;
  why: Refusal;
}

/** Имена сообщений Colyseus — одно место, чтобы клиент и сервер не разошлись в опечатке. */
export const MSG = {
  hello: "hello",
  welcome: "welcome",
  intent: "intent",
  patch: "patch",
  refused: "refused",
} as const;

export interface Welcome {
  you: Person;
  snapshot: Snapshot;
  title: string;
}

/** Сколько живёт блокировка без `hold`. Палец, который держит дольше, шлёт `hold` чаще этого. */
export const LOCK_TTL_MS = 15_000;
export const HOLD_EVERY_MS = 5_000;

// ── HTTP: бот ↔ сервер стола ↔ реле на Fly ─────────────────────────────────────────────────────

/** Где комната живёт в Telegram. Комната без кода: её имя — подписанный id. */
export type Home =
  | { kind: "chat"; chat: string }
  | { kind: "inline"; message: string };

export interface RoomCard {
  room: string;
  title: string;
  home: Home;
  people: Person[];
  createdAt: number;
}

/** `POST /table/rooms` */
export interface OpenRoom {
  home: Home;
  title?: string;
  by: string;
}

/** `PATCH /table/rooms/:room` */
export interface RenameRoom {
  title: string;
}

/**
 * МАЯК: сервер стола раз в `BEACON_EVERY_MS` сообщает реле, где он сейчас и какой это запуск.
 * Новый `boot` — значит Colyseus перезапускался, и все прежние комнаты умерли вместе с ним.
 */
export interface Beacon {
  url: string;
  boot: string;
}

export interface RelayStatus {
  up: boolean;
  url: string | null;
  boot: string | null;
  seenAt: number | null;
}

export const BEACON_EVERY_MS = 20_000;
/** Сколько тишины от маяка реле терпит, прежде чем сказать «стола нет». */
export const BEACON_TTL_MS = 60_000;

/** Заголовок, которым бот и сервер стола доказывают друг другу, что свои. */
export const SECRET_HEADER = "x-table-secret";
