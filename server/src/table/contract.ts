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
  /** На каком стуле сидит. Люди сидят всегда; бот стола — без стула. */
  seat?: string;
  /** `@username` в Telegram — по нему бот узнаёт раздающего в команде. */
  username?: string;
  /** Это бот стола (`@CrossaderBot`): ходит по командам админа, стула у него нет. */
  bot?: true;
}

/** Масти и два джокера: `r` — красный, `b` — чёрный (ранг у них `JK`). */
export type Suit = "s" | "h" | "d" | "c" | "r" | "b";
export interface Face {
  rank: string;
  suit: Suit;
}

/**
 * ГДЕ ЛЕЖИТ ВЕЩЬ. Колода — стопка (берётся только верхняя), рука — ряд со своим порядком, и принадлежит
 * она СТУЛУ, а не человеку: человек ушёл — стул с картами остался. Сукно — точки в единицах стола
 * (ширина карты), и порядок в нём — это порядок «кто сверху».
 */
export type Where =
  | { in: "deck" }
  | { in: "hand"; chair: string; i: number }
  | { in: "felt"; x: number; y: number; up: boolean; angle: number; under?: boolean };

/** Карта, какой её видит конкретный зритель: `face` есть, только если ему её видно. */
export interface SeenCard {
  id: string;
  face?: Face;
}

export interface FeltCard extends SeenCard {
  x: number;
  y: number;
  up: boolean;
  /**
   * Поворот карты на сукне, в градусах по часовой, в осях СТОЛА. Карта ложится так, как стояла на экране
   * у того, кто её бросил: при повёрнутой камере это не ноль, и боком брошенная карта лежит боком.
   */
  angle: number;
  /** Лежит ПОД колодой (козырь в дураке). Кладёт так только бот; взятая рукой карта это теряет. */
  under?: boolean;
}

/**
 * ФЛАГИ СТУЛА — права, которые висят на месте, а не на человеке.
 *
 *   pin     другие не двигают стул
 *   lock    другие не берут карты из его руки и не кладут в неё
 *   hide    другие видят его руку рубашкой (хозяин свою — всегда как держит); по умолчанию включён
 *   forever стул не удаляется правилом `dropEmptyChairs`, даже пустой и без карт
 *
 * «Другие» — все, кроме того, кто сидит. Флаг запрещает и админу: он может снять флаг, но пока флаг
 * стоит, действует и на него.
 */
export interface ChairFlags {
  pin: boolean;
  lock: boolean;
  hide: boolean;
  forever: boolean;
}
export type ChairFlag = keyof ChairFlags;
export const CHAIR_FLAGS: readonly ChairFlag[] = ["pin", "lock", "hide", "forever"];

/**
 * ПОЗА РУКИ — как хозяин держит карты; видят все, рисуют по ней худ, окно стула и стул на столе.
 *
 *   fan     веером (иначе — прямо)
 *   shrink  сжаты: видна одна верхняя карта. Ограничение только в интерфейсе — сервер карты не прячет
 *   tuck    скрыты: рука за худом, торчит краешек; тянуть можно всё, что торчит
 *
 * Меняет хозяин и админ.
 */
export interface HandPose {
  fan: boolean;
  shrink: boolean;
  tuck: boolean;
}
export const HAND_POSE_KEYS = ["fan", "shrink", "tuck"] as const;
export const DEFAULT_POSE: HandPose = { fan: true, shrink: false, tuck: false };

/** Одноразовая перестановка руки: не держится — следующая карта ляжет, куда её положат. */
export type Arrange = "suit" | "rank" | "reverse" | "shuffle";

export interface Chair extends ChairFlags {
  id: string;
  /** Место за столом — угол в градусах от своей стороны (шесть часов), по часовой. */
  angle: number;
  /** Кто сидит. `null` — стул покинут. */
  owner: string | null;
  pose: HandPose;
  hand: SeenCard[];
}

/**
 * ПРАВИЛА СТОЛА — то, что можно менять на лету, посреди игры. Пока их никто не переключает, но это
 * данные, а не код: новое правило — новое поле здесь и ветка там, где оно действует.
 */
export interface TableRules {
  /** Покинутый стул без карт и не вечный — удаляется. */
  dropEmptyChairs: boolean;
}
export const DEFAULT_RULES: TableRules = { dropEmptyChairs: true };

/**
 * СЛЕД КАРТЫ — кто её последним переносил, откуда и когда. Пишется при каждом дропе, сдвиг по сукну тоже
 * перенос. Имена сохраняются в момент хода: ушедший из-за стола остаётся подписанным.
 * `hand` — чья это была рука, если карта пришла из руки. `at` — часы сервера (`Welcome.now`).
 */
export interface Trail {
  by: string;
  byName: string;
  from: "deck" | "hand" | "felt";
  hand?: string;
  at: number;
}

/** Всё, что зритель знает о столе. Сервер собирает его для каждого отдельно (`Table.seenBy`). */
export interface Snapshot {
  v: number;
  people: Person[];
  chairs: Chair[];
  deck: SeenCard[];
  felt: FeltCard[];
  /** Следы карт по id — у карт, которые хоть раз переносили. */
  trails: Record<string, Trail>;
  /** Сколько раз колоду перемешали — сменилось, значит зрителю играть перемешивание. */
  shuffles: number;
  /** Кто что держит: id вещи → key человека. */
  locks: Record<string, string>;
  rules: TableRules;
  /** Кто админ — создатель комнаты, пока он за столом. `null` — его нет. */
  admin: string | null;
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
  /** Перевернуть порядок руки своего стула. */
  | { t: "flip" }
  /**
   * Переставить руку своего стула — один раз. Шафл присылает готовый порядок (`ids`): мешает клиент, чтобы
   * показать его сразу, а сервер проверяет, что это те же карты.
   */
  | { t: "arrange"; how: Arrange; ids?: string[] }
  /** Поменять позу руки: своей — хозяин, любой — админ. */
  | { t: "pose"; chair: string; pose: Partial<HandPose> }
  /** Встать со стула, оставшись за столом. Стул дальше — по правилу стола. */
  | { t: "stand" }
  /** Сесть на покинутый стул. */
  | { t: "sit"; chair: string }
  /** Поставить или снять флаг стула. */
  | { t: "flag"; chair: string; flag: ChairFlag; on: boolean }
  /** Поменять правило стола — только админ. */
  | { t: "rules"; rules: Partial<TableRules> }
  /** Разошлись версии — пришли мне стол целиком. */
  | { t: "sync" };

// ── ОТ СЕРВЕРА К КЛИЕНТАМ: дифы. Каждый уже отредактирован под того, кому летит. ───────────────

export type Op =
  | { t: "join"; person: Person }
  | { t: "leave"; key: string }
  /** Стул появился или изменился — целиком, с рукой, какой её видно зрителю. */
  | { t: "chair"; chair: Chair }
  /** Стул убран. Карты, если были, легли закрытой стопкой на его место (`felt`). */
  | { t: "unchair"; id: string; felt: FeltCard[] }
  | { t: "lock"; id: string; by: string }
  | { t: "unlock"; id: string }
  /** Вещь переехала. `card.face` есть, только если на новом месте зрителю её видно. */
  | { t: "move"; card: SeenCard; from: Where; to: Where; trail?: Trail }
  | { t: "order"; chair: string; ids: string[] }
  /** Колода целиком заменена: перемешана (новые id — чтобы увиденную карту нельзя было отследить) или набрана заново. */
  | { t: "deck"; deck: SeenCard[]; shuffled: boolean }
  | { t: "rules"; rules: TableRules }
  | { t: "admin"; key: string | null };

export interface Patch {
  v: number;
  ops: Op[];
}

/** Почему намерение не случилось — клиент откатывает у себя то, что успел показать. */
export type Refusal = "busy" | "locked" | "not-held" | "not-top" | "gone" | "bad" | "chair-locked" | "not-yours" | "taken";
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
  /** Клиент → сервер: `CarryOut`; сервер → остальные: `Carry`. Мимо версий и истории стола. */
  carry: "carry",
} as const;

/**
 * ЧТО НЕСЁТ ЧУЖОЙ ПАЛЕЦ — поток, а не ход: пока карта в воздухе, держащий шлёт, над чем она сейчас
 * (`CARRY_EVERY_MS`), и сервер пересылает это остальным. В патчи и снимок это не пишется: версии не
 * растут, история не копится, опоздавший получает последнее вместе с `welcome`.
 *
 * `over` — место, а не пиксели: у каждого своя камера, и «над рукой стула X на месте i» каждый рисует
 * там, где эта рука у него. Лицо — как карту было видно этому зрителю там, откуда её взяли.
 */
export interface CarryOut {
  id: string;
  over: Where;
}
export interface Carry extends CarryOut {
  by: string;
  card: SeenCard;
  from: Where;
  /** Несёт команда бота (от его лица или от лица раздающего) — видно всем, и самому раздающему тоже. */
  auto?: true;
}
/** Как часто палец в воздухе шлёт, над чем он. Сглаживание у зрителя — на столько же. */
export const CARRY_EVERY_MS = 50;

export interface Welcome {
  you: Person;
  snapshot: Snapshot;
  title: string;
  /** Что сейчас в воздухе у других — чтобы вошедший посреди жеста увидел его, а не пустое место. */
  carries: Carry[];
  /** Часы сервера в момент отправки — по ним клиент считает «10 сек назад» у следов. */
  now: number;
}

/** Сколько живёт блокировка без `hold`. Палец, который держит дольше, шлёт `hold` чаще этого. */
/** `carry` продлевает блокировку так же, как `hold`: палец, который двигается, её держит. */
export const LOCK_TTL_MS = 15_000;
export const HOLD_EVERY_MS = 5_000;

// ── КОМАНДЫ СТОЛА: админ через бота ────────────────────────────────────────────────────────────

/**
 * ТРИ НЕЗАВИСИМЫХ СЛОЯ. Колода — из чего играем (36/52, джокеры). Пресет — колода и рассадка под игру.
 * Раздача — по правилам самой раздачи. Перераздать — та же раздача ещё раз; сменить игру — другой пресет.
 */
export type DeckSize = 36 | 52;
export type Game = "durak" | "krest" | "belka";
export type DealRule = "each" | Game;

export type TableCommand =
  | { t: "collect" }
  | { t: "shuffle" }
  /** Белка — всегда 36 и без джокеров; `size`/`jokers` у неё игнорируются. */
  | { t: "preset"; game: Game; size?: DeckSize; jokers?: boolean }
  | {
      t: "deal";
      rule: DealRule;
      /** Сколько каждому — для `each` и `durak` (по умолчанию 6). */
      n?: number;
      /** Кто раздаёт — ключ, имя или `@username`. По умолчанию — админ. */
      dealer?: string;
      /** Не раздавать покинутым стульям. */
      skipEmpty?: boolean;
      /** Раздавать от лица раздающего: его цвет, его курсор, «двигал он». Иначе — от лица бота. */
      asDealer?: boolean;
      /** Карты не собраны — собрать и перемешать без вопросов. */
      force?: boolean;
    };

/** `POST /table/rooms/:room/run` */
export interface RunCommand {
  by: string;
  command: TableCommand;
}
export type RunError = "not-admin" | "busy" | "needs-collect" | "not-enough-cards" | "not-enough-players" | "no-dealer" | "empty" | "bad";
export type RunResult = { ok: true } | { error: RunError };

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
