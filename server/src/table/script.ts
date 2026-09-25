// КОМАНДЫ СТОЛА — что сделать, по шагам. Здесь только план: ни часов, ни сети.
//
// Команда админа (`TableCommand`) превращается в список шагов, и каждый шаг — то, что сделала бы рука:
// взять карту, пронести, положить. Комната (`TableRoom.run`) проигрывает их с паузами, и сидящие за
// столом видят раздачу, а не стол, который вдруг стал другим.
//
// ТРИ СЛОЯ НЕ СМЕШИВАЮТСЯ. Колода — из чего играем. Пресет — колода и рассадка. Раздача — по своим
// правилам и больше ничего: она не меняет ни колоду, ни стулья.
//
// ПОРЯДОК РАЗДАЧИ — по часовой, со следующего после раздающего; раздающему — последним. Поэтому при
// раздаче всей колоды у раздающего карт не больше, чем у всех, а у следующего — не меньше.

import { DEAL_PRESETS, GAME_PRESETS, MAIN_PILE, PRESET_FACES, type DealRule, type DeckSize, type Face, type Game, type RunError, type Suit, type TableCommand, type TableRules, type Where , type DealDir } from "./contract.js";
import type { Table } from "./table.js";
import { freeAngle, seatPoint } from "./ring.js";

/** Сколько длится шаг — у сидящих за столом должно успевать читаться. */
export const PACE = {
  /** Карта с колоды в руку. */
  deal: 150,
  /** Карта в колоду при сборке. */
  collect: 80,
  /** Охапка карт разом: пауза между охапками, а не между картами. */
  sweep: 420,
  /** Перемешивание — одно на всю колоду. */
  shuffle: 1400,
  /** Шестёрка на край, козырь под колоду. */
  lay: 260,
  /** Стул переезжает на новое место. */
  chair: 500,
};

export type Step =
  | { t: "move"; id: string; to: Where; ms: number }
  | { t: "shuffle"; ms: number }
  | { t: "restock"; faces: Face[] }
  /**
   * ОХАПКА КАРТ РАЗОМ — одним движением, а не по одной.
   *
   * Сбор колоды со стола на четверых — это полсотни карт, и по одной они едут почти минуту: человек
   * сидит и смотрит, как крупье возит карту за картой. Стопкой это одно движение, и за столом так и
   * делают: сгрёб сукно, забрал руку соседа, забрал следующую.
   */
  | { t: "sweep"; ids: string[]; to: Where; ms: number }
  /**
   * СТОПКА ЦЕЛИКОМ — колода, круг, любая стопка на сукне. Их нельзя черпать по карте: с колоды
   * берут только верхнюю, и охапка карт из середины была бы воровством в обход правила.
   */
  | { t: "sweepPile"; pile: string; to: { in: "deck"; pile: string; i?: number } | { in: "hand"; chair: string; i: number }; ms: number }
  /** Этих карт на столе больше нет — уходят прямо оттуда, где лежали. */
  | { t: "unmake"; ids: string[] }
  /** Этих карт не хватало — появляются в руке крупье. */
  | { t: "make"; faces: Face[] }
  | { t: "chair"; id: string; angle: number; ms: number }
  | { t: "rules"; rules: Partial<TableRules> };

/**
 * ЧЕМ БЫЛА РАЗДАЧА — чтобы её можно было повторить одним нажатием. Стулья и стартовый записаны теми,
 * какими план их вывел, а не теми, какие просили: иначе «те же самые» разошлись бы с тем, что легло.
 */
export interface DealMemo {
  rule: DealRule;
  n?: number;
  seats: string[];
  from: string;
  dir: DealDir;
}

export type Plan = { steps: Step[]; actor: "bot" | string; deal?: DealMemo } | { error: RunError };

const RANKS36 = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANKS52 = ["2", "3", "4", "5", ...RANKS36];
const SUITS: Suit[] = ["s", "h", "d", "c"];

/** Колода: 36 или 52, с двумя джокерами или без. Порядок — новой колоды; перемешивает отдельный шаг. */
export function deckOf(size: DeckSize, jokers: boolean): Face[] {
  const ranks = size === 52 ? RANKS52 : RANKS36;
  const cards: Face[] = SUITS.flatMap((suit) => ranks.map((rank) => ({ rank, suit })));
  if (jokers) cards.push({ rank: "JK", suit: "r" }, { rank: "JK", suit: "b" });
  return cards;
}

/** Там, куда в руку ложится последняя: сервер прижмёт индекс к длине руки. */
const toHand = (chair: string): Where => ({ in: "hand", chair, i: 9999 });
const DECK: Where = { in: "deck", pile: MAIN_PILE };

/** Козырь: лицом вверх, поперёк, под колодой — торчит наружу половиной. */
const TRUMP: Where = { in: "felt", x: 0.55, y: 0, up: true, angle: 90, under: true };

/** Шестёрки белки — открытым рядом у кромки, между стулом раздающего и следующим по часовой. */
function sixesRow(anchor: number): Where[] {
  const a = anchor + 45;
  const mid = seatPoint(a, 5.4);
  const t = (a * Math.PI) / 180;
  const along = { x: Math.cos(t), y: -Math.sin(t) };
  return [-1.65, -0.55, 0.55, 1.65].map((d) => ({ in: "felt", x: mid.x + along.x * d, y: mid.y + along.y * d, up: true, angle: turn(-a), under: false }));
}

const turn = (deg: number) => {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  return d === -180 ? 180 : d;
};

/** Собрать всё в колоду: сперва сукно сверху вниз, потом руки. Шестёрки белки остаются на краю, если `keep`. */
/**
 * СОБРАТЬ ВСЁ — В РУКИ КРУПЬЕ, а не в стопку рядом с ним.
 *
 * Так это и выглядит за настоящим столом: сдающий берёт колоду В РУКУ, а не оставляет её лежать.
 * Правило общее для всех игр и всех наборов крупье. Крупье за столом нет — собираем в колоду:
 * держать карты некому.
 */
export function collectSteps(table: Table, keep: ReadonlySet<string> = new Set()): Step[] {
  const at = table.layout();
  const hands = table.croupierSeat();
  const steps: Step[] = [];
  // КУДА ЛОЖИТСЯ ОХАПКА: в руку крупье, следом за тем, что там уже есть. Номер места растёт на
  // размер охапки — следующая ляжет за ней, а не поверх.
  let n = hands ? (at.chairs.find((c) => c.id === hands)?.hand.length ?? 0) : 0;
  const to = (take: number): Where => {
    const where: Where = hands ? { in: "hand", chair: hands, i: n } : DECK;
    n += take;
    return where;
  };
  /** Охапка, если в ней есть что нести. Пустых шагов в сценарии быть не должно. */
  const sweep = (ids: string[]): void => {
    if (ids.length > 0) steps.push({ t: "sweep", ids, to: to(ids.length), ms: PACE.sweep });
  };

  /** Стопка целиком — своим движением: по карте её черпать нельзя. */
  const sweepPile = (pile: string, count: number): void => {
    if (count > 0) steps.push({ t: "sweepPile", pile, to: to(count) as { in: "deck"; pile: string } | { in: "hand"; chair: string; i: number }, ms: PACE.sweep });
  };

  // ПО ОЧЕРЕДИ, НО ЦЕЛИКОМ. Сначала сукно, потом колода, потом руки — каждая своим движением, — и
  // напоследок стопки. Видно, откуда что пришло, а ждать полсотни отдельных перелётов не приходится.
  sweep([...at.felt].reverse().filter((one) => !keep.has(one.id)).map((one) => one.id));
  if (hands) sweepPile(MAIN_PILE, at.deck.length);
  for (const chair of at.chairs) {
    if (chair.id === hands) continue;
    sweep([...chair.hand].reverse());
  }
  for (const pile of [...at.piles].reverse()) sweepPile(pile.id, pile.cards.length);
  return steps;
}

/**
 * СКОЛЬКО КАРТ ПРИНЕСЁТ СБОР. Считается по картам, а не по шагам: шаг — это охапка, и в ней бывает
 * и одна карта, и вся колода. Счёт по шагам однажды уже решил, что собранной колоды не хватает на
 * раздачу, — и раздача не пошла.
 */
function cardsIn(steps: readonly Step[], table: Table): number {
  const at = table.layout();
  let n = 0;
  for (const step of steps) {
    if (step.t === "sweep") n += step.ids.length;
    else if (step.t === "sweepPile") n += step.pile === MAIN_PILE ? at.deck.length : (at.piles.find((p) => p.id === step.pile)?.cards.length ?? 0);
    else if (step.t === "move") n += 1;
  }
  return n;
}

/** Карты, которые СЧИТАЮТСЯ СОБРАННЫМИ: колода и рука крупье — он держит её вместо стола. */
function packOf(table: Table): { deck: number; hand: string | null } {
  const seat = table.croupierSeat();
  const at = table.layout();
  return { deck: at.deck.length + (seat ? (at.chairs.find((c) => c.id === seat)?.hand.length ?? 0) : 0), hand: seat };
}

/** Стулья по часовой, начиная с `from` (включительно). */
/**
 * ПО КРУГУ ОТ СТУЛА. Угол стула растёт от шести часов к трём — на экране это против часовой, поэтому
 * «по часовой» (как за настоящим столом, и так по умолчанию) — это УБЫВАНИЕ угла.
 */
export function clockwise<T extends { id: string; angle: number }>(chairs: T[], from: string, dir: DealDir = "cw"): T[] {
  const sorted = [...chairs].sort((a, b) => (dir === "cw" ? b.angle - a.angle : a.angle - b.angle));
  const i = Math.max(0, sorted.findIndex((c) => c.id === from));
  return [...sorted.slice(i), ...sorted.slice(0, i)];
}

/** Шестёрки, лежащие по краю: их не собирает ни сборка, ни раздача (`DealPreset.sixesOut`). */
function sixesAside(table: Table): Set<string> {
  return new Set(table.layout().felt.filter((f) => table.faceOf(f.id)?.rank === "6" && !f.under).map((f) => f.id));
}

export interface Who {
  key: string;
  name: string;
  username?: string;
  seat?: string;
}

/** Раздающий по слову команды: ключ, `@username` или имя. */
export function findDealer(people: Who[], word: string | undefined, admin: string | null): Who | undefined {
  if (!word) return people.find((p) => p.key === admin);
  const w = word.replace(/^@/, "").toLowerCase();
  return people.find((p) => p.key === word || p.username?.toLowerCase() === w || p.name.toLowerCase() === w);
}

/**
 * ПЛАН КОМАНДЫ. `admin` — кто командует (он и есть админ, это проверила комната). `bot` — ключ бота:
 * ходы идут от него, если раздача не «от лица раздающего».
 */
export function plan(table: Table, command: TableCommand, people: Who[], admin: string): Plan {
  const at = table.layout();
  switch (command.t) {
    case "collect":
      return { steps: collectSteps(table), actor: "bot" };
    // Крупье и игроков без человека исполняет комната сама: это состав стола, а не ход.
    case "croupier":
    case "bots":
      return { error: "bad" };
    // Перераздачу и рассадку комната делает сама: одной нужна память о прошлой раздаче, другой — люди
    // в комнате, а не карты на столе.
    case "redeal":
    case "seat":
      return { error: "bad" };
    case "shuffle": {
      const pack = packOf(table);
      if (at.felt.length > 0 || at.chairs.some((c) => c.id !== pack.hand && c.hand.length > 0) || at.piles.some((p) => p.cards.length > 0)) return { error: "needs-collect" };
      return { steps: [{ t: "shuffle", ms: PACE.shuffle }], actor: "bot" };
    }
    case "look":
      return { steps: [{ t: "rules", rules: { ...(command.faces ? { faces: command.faces } : {}), ...(command.back ? { back: command.back } : {}) } }], actor: "bot" };
    case "preset":
      return presetPlan(table, command.game, command.size ?? 36, command.jokers === true, people, admin);
    case "deal":
      return dealPlan(table, command, people, admin);
  }
}

function presetPlan(table: Table, game: Game, size: DeckSize, jokers: boolean, people: Who[], admin: string): Plan {
  const steps: Step[] = [{ t: "rules", rules: { faces: PRESET_FACES[game] } }];
  // ЧТО ПРЕСЕТ ДЕЛАЕТ СО СТОЛОМ — из `GAME_PRESETS`; названий игр ниже нет.
  const preset = GAME_PRESETS[game];
  const faces = preset.deck ? deckOf(preset.deck.size, preset.deck.jokers) : deckOf(size, jokers);
  // СМЕНА КОЛОДЫ — РАЗНИЦА, А НЕ ПЕРЕСБОРКА. Карты, которые есть и в новой колоде, остаются лежать
  // там, где лежат: в руках, в круге, на сукне. Уходят только лишние, приходят только недостающие —
  // и приходят в руку крупье, потому что класть их больше некуда.
  steps.push(...tuneSteps(table, faces));
  if (!preset.cross) return { steps, actor: "bot" };

  // ЧЕТВЕРО КРЕСТОМ: первые четыре игрока по часовой от админа — 1 напротив 3, 2 напротив 4;
  // остальные стулья — между ними.
  const at = table.layout();
  // Стул крупье — не игровой: он не садится в круг и карт себе не получает.
  const seated = at.chairs.filter((c) => !c.croupier && c.owner !== null && people.some((p) => p.key === c.owner));
  const home = seated.find((c) => c.owner === admin) ?? seated[0];
  if (!home || seated.length < 4) return { error: "not-enough-players" };
  const four = clockwise(seated, home.id).slice(0, 4);
  const base = home.angle;
  const taken: number[] = [0, 90, 180, 270];
  four.forEach((c, i) => steps.push({ t: "chair", id: c.id, angle: base + 90 * i, ms: PACE.chair }));
  for (const c of clockwise(at.chairs.filter((c) => !c.croupier), home.id).filter((c) => !four.includes(c))) {
    const rel = freeAngle(taken);
    taken.push(rel);
    steps.push({ t: "chair", id: c.id, angle: base + rel, ms: PACE.chair });
  }
  // Шестёрки — после перемешивания, по их лицам в новой колоде: план досчитает их, когда колода будет набрана.
  if (preset.sixesRow) steps.push(...sixesSteps(base));
  return { steps, actor: "bot" };
}

/** Все карты стола, где бы они ни лежали, — по ним и считается разница с новой колодой. */
function everyCard(table: Table): string[] {
  const at = table.layout();
  return [...at.deck, ...at.felt.map((f) => f.id), ...at.piles.flatMap((p) => p.cards), ...at.chairs.flatMap((c) => c.hand)];
}

const faceKey = (face: Face): string => `${face.rank}${face.suit}`;

/**
 * ПОДОГНАТЬ СТОЛ ПОД НОВУЮ КОЛОДУ — разницей.
 *
 * Лишние карты (52 → 36) исчезают оттуда, где лежат; недостающие (36 → 52, джокеры) появляются в
 * руке крупье. Одинаковых карт в колоде не бывает, поэтому сравнение идёт по лицу, а не по счёту.
 */
export function tuneSteps(table: Table, want: readonly Face[]): Step[] {
  const need = new Set(want.map(faceKey));
  const has = new Map<string, string>();
  const extra: string[] = [];
  for (const id of everyCard(table)) {
    const face = table.faceOf(id);
    const key = face && faceKey(face);
    // Карта без лица или уже вторая такая же — лишняя: колода не должна расходиться сама с собой.
    if (!key || !need.has(key) || has.has(key)) extra.push(id);
    else has.set(key, id);
  }
  const missing = want.filter((face) => !has.has(faceKey(face)));
  return [...(extra.length ? [{ t: "unmake" as const, ids: extra }] : []), ...(missing.length ? [{ t: "make" as const, faces: missing }] : [])];
}

/** Метка шага «вынести шестёрки»: какие это карты, комната узнаёт уже по набранной колоде. */
export const SIXES = "six";
function sixesSteps(anchor: number): Step[] {
  return sixesRow(anchor).map((to, i) => ({ t: "move", id: `${SIXES}:${i}`, to, ms: PACE.lay }));
}

/** Порядок «со следующего после раздающего, ему — последним». Раздающий без стула в круге — просто с его места по часовой. */
function afterDealer<T extends { id: string; angle: number }>(chairs: T[], playable: T[], anchor: string, dir: DealDir): T[] {
  const ring = clockwise([...chairs, ...playable.filter((c) => c.id === anchor && !chairs.includes(c))], anchor, dir);
  return (ring[0]?.id === anchor ? [...ring.slice(1), ring[0]!] : ring).filter((c) => chairs.includes(c));
}

function dealPlan(table: Table, command: Extract<TableCommand, { t: "deal" }>, people: Who[], admin: string): Plan {
  const at = table.layout();
  const dealer = findDealer(people, command.dealer, admin);
  if (!dealer) return { error: "no-dealer" };
  const rule: DealRule = command.rule;
  // ВСЯ РАЗНИЦА МЕЖДУ ИГРАМИ — В ЭТИХ ПЯТИ ЧИСЛАХ (`DEAL_PRESETS`). Ниже названий игр уже нет.
  const preset = DEAL_PRESETS[rule];
  const sixes = preset.sixesOut ? sixesAside(table) : new Set<string>();

  // РУКА КРУПЬЕ — ЭТО СОБРАННАЯ КОЛОДА, а не разброс: он её держит, как держал бы сдающий.
  const pack = packOf(table);
  const loose = at.felt.some((f) => !sixes.has(f.id)) || at.chairs.some((c) => c.id !== pack.hand && c.hand.length > 0) || at.piles.some((p) => p.cards.length > 0);

  const steps: Step[] = [];
  let deck = pack.deck;
  if (loose) {
    if (!command.force) return { error: "needs-collect" };
    const back = collectSteps(table, sixes);
    steps.push(...back, { t: "shuffle", ms: PACE.shuffle });
    deck += cardsIn(back, table);
  }


  // РАЗДАЮТ ТОЛЬКО ИГРОВЫМ СТУЛЬЯМ. Стул крупье в круг не входит: он раздаёт, а не играет.
  const playable = at.chairs.filter((c) => !c.croupier);
  // ОТКУДА ИДЁТ РАЗДАЧА. Крупье за столом — с первого стула по часовой от него: рассадка вокруг крупье
  // и есть порядок раздачи. Крупье нет — по-старому, от раздающего.
  const hands = at.chairs.find((c) => c.croupier)?.id ?? null;
  const anchor = hands ?? dealer.seat ?? playable.find((c) => c.owner === admin)?.id ?? playable[0]?.id;
  if (!anchor) return { error: "not-enough-players" };
  // КОМУ РАЗДАЁМ. Сказали списком — ровно им (исчезнувшие стулья просто выпадают); не сказали —
  // всем игровым, как раньше.
  const named = command.seats ? new Set(command.seats) : null;
  let chairs = playable.filter((c) => (named ? named.has(c.id) : !(command.skipEmpty || preset.skipEmpty) || (c.owner !== null && people.some((p) => p.key === c.owner))));
  // РАЗДАЧА НА СТРОГОЕ ЧИСЛО МЕСТ: назвали стулья — их должно быть ровно столько, ни больше, ни меньше.
  if (preset.seats > 0 && named && chairs.length !== preset.seats) return { error: "wrong-players" };
  if (preset.seats > 0) {
    const around = clockwise(chairs, chairs.some((c) => c.id === anchor) ? anchor : (chairs[0]?.id ?? anchor));
    chairs = around.slice(0, preset.seats);
    if (chairs.length < preset.seats) return { error: "not-enough-players" };
  }
  if (chairs.length === 0) return { error: "not-enough-players" };
  // С КОГО ПОШЛА РАЗДАЧА. Назвали стул — первая карта ему самому и дальше по часовой. Не назвали —
  // по старому: со следующего после раздающего, а раздающему последним.
  const first = command.from !== undefined && chairs.some((c) => c.id === command.from) ? command.from : null;
  const dir: DealDir = command.dir ?? "cw";
  const order = first !== null ? clockwise(chairs, first, dir) : afterDealer(chairs, at.chairs, anchor, dir);

  // «Всю колоду» раздают по кругу, пока карты не кончатся; иначе — по стольку каждому, и число
  // можно спросить у человека ровно там, где пресет это позволяет.
  const n = preset.each === "all" ? 0 : Math.max(1, Math.floor((preset.askable ? command.n : undefined) ?? preset.each));
  const dealt = preset.each === "all" ? deck : n * order.length;
  const total = dealt + (preset.trump ? 1 : 0);
  if (total === 0 || total > deck) return { error: "not-enough-cards" };

  for (let k = 0; k < dealt; k += 1) steps.push({ t: "move", id: "top", to: toHand(order[k % order.length]!.id), ms: PACE.deal });
  if (preset.trump) steps.push({ t: "move", id: "top", to: TRUMP, ms: PACE.lay });
  const memo: DealMemo = { rule, ...(preset.each === "all" ? {} : { n }), seats: order.map((c) => c.id), from: order[0]!.id, dir };
  return { steps, actor: command.asDealer ? dealer.key : "bot", deal: memo };
}

export interface Io {
  spread(ops: import("./contract.js").Op[]): void;
  /** Палец команды над местом — всем, и самому раздающему. */
  carry(id: string, by: string): void;
  sleep(ms: number): Promise<void>;
  now(): number;
  /**
   * ШАГ КОМАНДЫ НЕ ВЫШЕЛ. Сценарий идёт дальше — одна несложившаяся карта не повод бросать раздачу,
   * — но молчать об этом нельзя: однажды раздача дошла до одного игрока из трёх, и понять это по
   * записи было нечем. Необязательно: старым вызовам знать о журнале незачем.
   */
  failed?(step: string, why: string, what?: unknown): void;
}

/**
 * ПРОИГРАТЬ ПЛАН. Каждая карта — как рукой: взять (лок виден всем), показать над колодой, через треть шага
 * — над местом, куда ляжет, в конце шага — положить. Стол на всё время — `busy` для людей.
 * Шаг, который уже не выполнить (карту кто-то успел унести), пропускается, а не рушит команду.
 */
export async function execute(table: Table, steps: Step[], actor: string, io: Io, kind: string | boolean = true): Promise<void> {
  table.script(kind);
  try {
    for (const step of steps) {
      if (step.t === "shuffle") {
        // Колода у крупье в руках — мешается она же, только в руке.
        const held = table.croupierSeat();
        const inHand = held ? (table.layout().chairs.find((c) => c.id === held)?.hand.length ?? 0) : 0;
        io.spread(table.layout().deck.length === 0 && inHand > 1 ? table.shuffleHand(held!) : table.shuffleDeck());
        await io.sleep(step.ms);
        continue;
      }
      if (step.t === "rules") {
        io.spread(table.setRules(step.rules));
        continue;
      }
      if (step.t === "sweepPile") {
        const done = table.act(actor, { t: "pileDrop", pile: step.pile, to: step.to }, io.now(), true);
        if ("refused" in done) io.failed?.("sweepPile", done.refused, { стопка: step.pile, куда: step.to });
        else io.spread(done.ops);
        await io.sleep(step.ms);
        continue;
      }
      if (step.t === "sweep") {
        // ОДНИМ ПАТЧЕМ И ОДНИМ ОТКАЗОМ: карты, которые место не примет, просто останутся лежать —
        // сбор не должен вставать из-за одной чужой карты под замком.
        const done = table.act(actor, { t: "moveMany", moves: step.ids.map((id) => ({ id, to: step.to })) }, io.now(), true);
        if ("refused" in done) io.failed?.("sweep", done.refused, { карт: step.ids.length, куда: step.to });
        else io.spread(done.ops);
        await io.sleep(step.ms);
        continue;
      }
      if (step.t === "unmake") {
        io.spread(table.unmake(step.ids));
        continue;
      }
      if (step.t === "make") {
        io.spread(table.make(step.faces));
        continue;
      }
      if (step.t === "restock") {
        const ops = table.restock(step.faces);
        if (ops) io.spread(ops);
        continue;
      }
      if (step.t === "chair") {
        io.spread(table.turnChair(step.id, step.angle));
        await io.sleep(step.ms);
        continue;
      }
      const at = table.layout();
      // «ВЕРХНЯЯ» — из колоды, а если колода в руках крупье, то из его руки: это одна и та же колода.
      const held = table.croupierSeat();
      const inHand = held ? (at.chairs.find((c) => c.id === held)?.hand ?? []) : [];
      const stock = at.deck.length > 0 ? at.deck : inHand;
      const id = step.id === "top" ? stock.at(-1) : step.id.startsWith(`${SIXES}:`) ? sixInDeck(table, stock) : step.id;
      if (!id) continue;
      const grab = table.act(actor, { t: "grab", id }, io.now(), true);
      if ("refused" in grab) {
        // С колоды берётся только верхняя — шестёрку из середины команда вынимает, как фокусник: снизу.
        if (grab.refused !== "not-top" || !(await lift(table, id, actor, io))) continue;
      } else io.spread(grab.ops);
      table.carry(actor, { id, over: step.to }, io.now(), true);
      io.carry(id, actor);
      await io.sleep(Math.round(step.ms * 0.66));
      const drop = table.act(actor, { t: "drop", id, to: step.to }, io.now(), true);
      if ("refused" in drop) {
        io.failed?.("move", drop.refused, { карта: id, куда: step.to });
        const back = table.act(actor, { t: "release", id }, io.now(), true);
        if (!("refused" in back)) io.spread(back.ops);
      } else io.spread(drop.ops);
      await io.sleep(Math.round(step.ms * 0.34));
    }
  } finally {
    table.script(false);
  }
}

function sixInDeck(table: Table, deck: string[]): string | undefined {
  return [...deck].reverse().find((id) => table.faceOf(id)?.rank === "6");
}

/** Взять карту из середины колоды: команде можно (белка вынимает шестёрки), руке — нет. */
async function lift(table: Table, id: string, actor: string, io: Io): Promise<boolean> {
  const r = table.grabAny(actor, id, io.now());
  if (!r) return false;
  io.spread(r);
  return true;
}
