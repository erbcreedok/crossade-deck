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
  /** Стопка `pile`; `i` — место снизу (0 — низ); нет или под локом — наверх. */
  | { in: "deck"; pile: string; i?: number }
  | { in: "hand"; chair: string; i: number }
  | { in: "felt"; x: number; y: number; up: boolean; angle: number; under?: boolean };

/**
 * Карта, какой её видит конкретный зритель: `face` есть, только если ему её видно.
 *
 * `up` — ПЕРЕВЁРНУТА (двойной тап). У карты на сукне сторона всегда в `FeltCard.up`; здесь — у карты в
 * колоде (лицом вверх) и в руке. Карта в руке по умолчанию лицом к хозяину; перевёрнутая — рубашкой к нему
 * и лицом наружу. Поэтому одна и та же рука выглядит по-разному:
 *   худ и окно стула   лицо у НЕперевёрнутой (хозяину всегда, другим — если стул не скрыт);
 *   стул на столе      лицо у перевёрнутой, если стул не скрыт.
 * Скрытый стул другим — рубашки везде.
 */
export interface SeenCard {
  id: string;
  face?: Face;
  up?: boolean;
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
 *   lock    другие не берут карты из его руки и не кладут в неё
 *   hide    другие видят его руку рубашкой (хозяин свою — всегда как держит); по умолчанию включён
 *   forever стул не удаляется правилом `dropEmptyChairs`, даже пустой и без карт
 *
 * «Другие» — все, кроме того, кто сидит. Флаг запрещает и админу: он может снять флаг, но пока флаг
 * стоит, действует и на него.
 */
export interface ChairFlags {
  lock: boolean;
  hide: boolean;
  forever: boolean;
}
export type ChairFlag = keyof ChairFlags;
export const CHAIR_FLAGS: readonly ChairFlag[] = ["lock", "hide", "forever"];

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

/**
 * МЕСТО СТОПКИ НА СУКНЕ — в единицах стола; её таскают за индикатор. `forever` — стопка стоит и пустой (пустым
 * контуром); снят — стопка из одной карты рушится: карта ложится на сукно на её место, а пустая исчезает. Колода (`MAIN_PILE`) — стопка, с которой работают команды бота: её нет —
 * команда ставит новую посередине.
 */
export interface DeckSpot {
  x: number;
  y: number;
  forever: boolean;
  /** Приколота: двигать нельзя. Приколоть может любой, открепить — только админ. */
  pin: boolean;
  /**
   * ЛОК — стопку не меняют изнутри: не переставляют, не тянут из середины, не переворачивают (ни карту, кроме
   * верхней, ни всю), не сортируют и не мешают. Верхняя карта доступна, класть сверху можно.
   */
  lock: boolean;
  /**
   * ПРИЁМКА ЗАКРЫТА — лок на количество: карту в стопку не положить и из неё не взять, даже верхнюю. Лок
   * (`lock`) — на порядок. Оба ставит и снимает админ, и действуют они и на него; команды бота — нет.
   */
  shut: boolean;
  /**
   * МЕРЖ ЗАКРЫТ — стопку целиком не переложить в другую стопку или в руку, и другую стопку в неё тоже. Одиночные
   * карты (и лассо — оно берёт картами) ходят как обычно. Ставит и снимает админ, действует и на него.
   */
  seal: boolean;
  /** Поворот колоды на сукне, в градусах по часовой в осях стола: как стояла на экране у поставившего. */
  angle: number;
  /**
   * КАРТЫ ПОД КОЛОДОЙ — те, что лежали на сукне, когда колоду поставили. Карта, снятая с сукна, отсюда
   * уходит: положенная снова, она ляжет уже поверх колоды.
   */
  below: string[];
}
export const DEFAULT_SPOT: DeckSpot = { x: 0, y: 0, forever: true, pin: false, lock: false, shut: false, seal: false, angle: 0, below: [] };

/** Замки стопки, которые ставит админ: порядок, количество, мерж. */
export const PILE_GUARDS = ["lock", "shut", "seal"] as const;
export type PileGuard = (typeof PILE_GUARDS)[number];

/** Колода стола — стопка команд бота. Остальные стопки собирают игроки (`gather`), и они не вечные. */
export const MAIN_PILE = "deck";

/** СТОПКА — место, флаги и карты снизу вверх. `shuffles` — сколько раз её перемешали: сменилось — играть перемешивание. */
export interface Pile extends DeckSpot {
  id: string;
  cards: SeenCard[];
  shuffles: number;
}

/** Какой стороной карты ложатся в стопку при сборке: как лежали, все рубашкой вверх, все лицом вверх. */
export const GATHER_SIDES = ["keep", "down", "up"] as const;
export type GatherSide = (typeof GATHER_SIDES)[number];

/** Что делают с колодой из её тултипа: перемешать, по масти (внутри — по номиналу), перевернуть стопку. */
export const DECK_DOS = ["shuffle", "sort", "flip"] as const;
export type DeckDo = (typeof DECK_DOS)[number];

/** Одноразовая перестановка руки: не держится — следующая карта ляжет, куда её положат. */
export type Arrange = "suit" | "rank" | "reverse" | "shuffle";

export interface Chair extends ChairFlags {
  id: string;
  /** Стул крупье: стоит вне кольца, места игрока не занимает, и играть с него нельзя. */
  croupier?: true;
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
  /** Лица карт — одни на весь стол, выбирает админ. */
  faces: CardFaces;
  /** Рубашка — одна на весь стол, выбирает админ. */
  back: CardBack;
}

/**
 * КОЛОДА НА ВИД — лица и рубашка из готовых растров `game-presets/cards` (`decks/baked/`). Четыре цвета и
 * кириллица — личные настройки человека, не стола; здесь их нет.
 */
export const CARD_FACES = ["classic", "minimal"] as const;
export type CardFaces = (typeof CARD_FACES)[number];
export const CARD_BACKS = ["plaid", "argyle", "club", "lattice", "crest", "ink"] as const;
export type CardBack = (typeof CARD_BACKS)[number];

export const DEFAULT_RULES: TableRules = { dropEmptyChairs: true, faces: "classic", back: "plaid" };

/** Лица по пресету: белка — классика, остальные — минимал. Рубашку пресет не трогает. */
export const PRESET_FACES: Record<Game, CardFaces> = { belka: "classic", durak: "minimal", krest: "minimal" };

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
  /** Стопки — в порядке «кто сверху»: поставленная последней лежит поверх остальных. */
  piles: Pile[];
  felt: FeltCard[];
  /** Следы карт по id — у карт, которые хоть раз переносили. */
  trails: Record<string, Trail>;
  /** Кто что держит: id вещи → key человека. */
  locks: Record<string, string>;
  /**
   * ВЫДЕЛЕНИЕ ЛАССО — id карты → key выделившего. Выделение — лок: чужую выделенную карту не выделить, не взять,
   * не перевернуть и не собрать. Держится, пока выделивший не снимет его или не уйдёт со стола.
   */
  picks: Record<string, string>;
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
  /** Перевернуть карту на месте — двойной тап. Можно там же, где можно взять. */
  | { t: "turn"; id: string }
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
  /** Переставить стопку по сукну — любой. В руку стопку не кладут. */
  | { t: "deckMove"; pile: string; x: number; y: number; angle?: number }
  /** Перемешать, отсортировать или перевернуть стопку — любой. */
  | { t: "deckDo"; pile: string; how: DeckDo }
  /** Поставить или снять вечность стопки — любой. */
  | { t: "deckForever"; pile: string; on: boolean }
  /** Приколоть стопку — любой; открепить — только админ. */
  | { t: "deckPin"; pile: string; on: boolean }
  /** Лок стопки или закрытая приёмка — только админ. */
  | { t: "deckGuard"; pile: string; guard: PileGuard; on: boolean }
  /**
   * СОБРАТЬ КАРТЫ В СТОПКУ — откуда бы ни были, по порядку `ids` снизу вверх: в новую стопку на сукне (`at`)
   * или поверх стоящей (`pile`). Карта, которую взять нельзя, или стопка, которая не примет, — карта остаётся.
   */
  | { t: "gather"; ids: string[]; side: GatherSide; to: { pile: string } | { x: number; y: number; angle: number } }
  /** Выделить карты (`on`) или снять с них своё выделение. Чужие выделенные и чужие в пальце пропускаются. */
  | { t: "pick"; ids: string[]; on: boolean }
  /** Снять всё своё выделение. */
  | { t: "unpick" }
  /**
   * ПЕРЕНЕСТИ РАЗОМ — выделенное лассо: каждая карта по своему месту, по правилам дропа, одним патчем. Брать карты
   * заранее не нужно; что взять или положить нельзя — остаётся.
   */
  | { t: "moveMany"; moves: { id: string; to: Where }[] }
  /**
   * ПЕРЕЛОЖИТЬ СТОПКУ ЦЕЛИКОМ — в руку или в другую стопку, по правилам обычных карт, порядок снизу вверх сохраняется.
   * В стопку, где все карты одной стороной, все ложатся этой стороной; в стопку вперемешку или пустую — как лежали.
   * Приколотую не переложить, из стопки с закрытой приёмкой не взять, чужое в пальце или чужое выделение — отказ.
   * Мерж закрыт (`seal`) у одной из двух — отказ. Вечная стопка, переложенная целиком, вечность теряет и уходит.
   */
  | { t: "pileDrop"; pile: string; to: Extract<Where, { in: "hand" | "deck" }> }
  /** Перевернуть разом — выделенное лассо, каждую карту на месте, одним патчем. */
  | { t: "turnMany"; ids: string[] }
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
  /** Карта перевёрнута на месте: `card` — какой её теперь видно зрителю, `up` — новая сторона. */
  | { t: "turn"; card: SeenCard; up: boolean; trail: Trail }
  /** Карты стопки целиком заменены: перемешаны (новые id — чтобы увиденную карту нельзя было отследить) или набраны заново. */
  | { t: "deck"; pile: string; cards: SeenCard[]; shuffled: boolean }
  /**
   * Стопка переехала, сменила флаги, появилась или исчезла (`null`). `top` — легла поверх остальных стопок
   * (её поставили); новая стопка всегда встаёт сверху.
   */
  | { t: "spot"; pile: string; spot: DeckSpot | null; top?: true }
  /** Карты выделены (`by`) или выделение с них снято (`null`). */
  | { t: "pick"; ids: string[]; by: string | null }
  | { t: "rules"; rules: TableRules }
  | { t: "admin"; key: string | null };

export interface Patch {
  v: number;
  ops: Op[];
}

import type { Eye } from "./eyes.js";

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
  /** Клиент → сервер: `SayOut`; сервер → остальные: `Say` (`say.ts`). Тоже мимо версий. */
  say: "say",
  /** Клиент → сервер: пустое; сервер → ему же: `string[]` — id его стикеров. */
  stickers: "stickers",
  /** Клиент → сервер: `ShotOut`; сервер → остальные: `Shot` — стикер выстрелом (`say.ts`). */
  shot: "shot",
  /** Клиент → сервер: `TableCommand` от админа — то же, что команда из бота, но кнопкой в столе. */
  command: "command",
  /** Клиент → сервер: `MicOut` — начал или кончил писать; сервер → остальным: `Mic` (`voice.ts`). */
  mic: "mic",
  /** Клиент → сервер: `LiveOut` — кусок речи на ходу; сервер → остальным: `Live` (`live.ts`). Тоже мимо истории. */
  live: "live",
  /** Клиент → сервер: `SignalOut` — записка тому, с кем сводимся; сервер → ему: `Signal` (`rtc.ts`). */
  rtc: "rtc",
  /** Клиент → сервер: `WatchOut` — что у него открыто; сервер → всем: `Eye[]` (`eyes.ts`). Тоже мимо версий. */
  eyes: "eyes",
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
  /** Несут выделенное лассо, стянутое к пальцу: эти карты (своё выделение) висят под пальцем вместе с ведущей. */
  with?: string[];
}
export interface Carry extends Omit<CarryOut, "with"> {
  by: string;
  card: SeenCard;
  from: Where;
  /** Карты, стянутые к пальцу, — какими их видно зрителю и откуда они. */
  with?: { card: SeenCard; from: Where }[];
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
  /** Кто на что смотрит сейчас — вошедший сразу видит чужие глаза. */
  eyes: Eye[];
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
export const GAMES = ["durak", "krest", "belka"] as const;
export type Game = (typeof GAMES)[number];

/**
 * ЧТО ПРЕСЕТ ИГРЫ ДЕЛАЕТ СО СТОЛОМ — тоже данные.
 *
 * `deck` — из чего играем, если игра решает сама (белка всегда 36 без джокеров); `null` — берём то,
 * что выбрал человек. `cross` — четверо крестом, 1 напротив 3, как садятся в белке; `sixesRow` —
 * вынести шестёрки на край.
 */
export interface GamePreset {
  deck: { size: DeckSize; jokers: boolean } | null;
  cross: boolean;
  sixesRow: boolean;
}

export const GAME_PRESETS: Record<Game, GamePreset> = {
  durak: { deck: null, cross: false, sixesRow: false },
  krest: { deck: null, cross: false, sixesRow: false },
  belka: { deck: { size: 36, jokers: false }, cross: true, sixesRow: true },
};
export type DealRule = "each" | Game;

/**
 * ЧТО ЗНАЧИТ «РАЗДАТЬ» В ЭТОЙ ИГРЕ — ДАННЫЕ, А НЕ ВЕТКИ.
 *
 * Игры отличаются друг от друга ровно этими пятью числами. Новая игра — новая строка здесь; ни одна
 * строчка кода раздачи при этом не трогается, и ни одно название игры не попадает в рантайм
 * (`rules.law.test.ts` следит за этим).
 */
export interface DealPreset {
  /** Сколько карт каждому. `"all"` — всю колоду по кругу, пока она не кончится. */
  each: number | "all";
  /** Можно ли спросить у человека другое число. Белке нельзя: восемь — это и есть белка. */
  askable: boolean;
  /** Сколько игроков ровно; `0` — сколько сядет. */
  seats: number;
  /** Пустые стулья из круга вон, даже если человек не просил. */
  skipEmpty: boolean;
  /** Шестёрки лежат по краю и не собираются ни сборкой, ни раздачей. */
  sixesOut: boolean;
  /** Последняя карта ложится козырем под колоду. */
  trump: boolean;
}

export const DEAL_PRESETS: Record<DealRule, DealPreset> = {
  each: { each: 1, askable: true, seats: 0, skipEmpty: false, sixesOut: false, trump: false },
  durak: { each: 6, askable: true, seats: 0, skipEmpty: false, sixesOut: false, trump: true },
  belka: { each: 8, askable: false, seats: 4, skipEmpty: true, sixesOut: true, trump: false },
  krest: { each: "all", askable: false, seats: 0, skipEmpty: false, sixesOut: false, trump: false },
};

export type TableCommand =
  | { t: "collect" }
  /** Посадить крупье или убрать его. Убранный роняет свои карты на стол закрытой стопкой. */
  | { t: "croupier"; on: boolean }
  | { t: "shuffle" }
  /** Белка — всегда 36 и без джокеров; `size`/`jokers` у неё игнорируются. */
  | { t: "preset"; game: Game; size?: DeckSize; jokers?: boolean }
  /** Вид колоды: лица, рубашка или оба. */
  | { t: "look"; faces?: CardFaces; back?: CardBack }
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
  /** `chatTitle` — как чат называется в Telegram: из него растёт имя стола. */
  | { kind: "chat"; chat: string; chatTitle?: string }
  | { kind: "inline"; message: string };

export interface RoomCard {
  room: string;
  title: string;
  /** Кто открыл комнату — он же её админ. Пусто — комната заведена входом, админа у неё нет. */
  by: string;
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
