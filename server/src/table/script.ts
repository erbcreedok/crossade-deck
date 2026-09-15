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

import { PRESET_FACES, type DealRule, type DeckSize, type Face, type Game, type RunError, type Suit, type TableCommand, type TableRules, type Where } from "./contract.js";
import type { Table } from "./table.js";
import { freeAngle, seatPoint } from "./ring.js";

/** Сколько длится шаг — у сидящих за столом должно успевать читаться. */
export const PACE = {
  /** Карта с колоды в руку. */
  deal: 150,
  /** Карта в колоду при сборке. */
  collect: 80,
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
  | { t: "chair"; id: string; angle: number; ms: number }
  | { t: "rules"; rules: Partial<TableRules> };

export type Plan = { steps: Step[]; actor: "bot" | string } | { error: RunError };

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
const DECK: Where = { in: "deck" };

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
function collectSteps(table: Table, keep: ReadonlySet<string> = new Set()): Step[] {
  const at = table.layout();
  const steps: Step[] = [];
  for (const one of [...at.felt].reverse()) if (!keep.has(one.id)) steps.push({ t: "move", id: one.id, to: DECK, ms: PACE.collect });
  for (const chair of at.chairs) for (const id of [...chair.hand].reverse()) steps.push({ t: "move", id, to: DECK, ms: PACE.collect });
  return steps;
}

/** Стулья по часовой, начиная с `from` (включительно). */
function clockwise<T extends { id: string; angle: number }>(chairs: T[], from: string): T[] {
  const sorted = [...chairs].sort((a, b) => a.angle - b.angle);
  const i = Math.max(0, sorted.findIndex((c) => c.id === from));
  return [...sorted.slice(i), ...sorted.slice(0, i)];
}

/** Шестёрки на краю белки — их не собирает ни сборка, ни раздача. */
function belkaSixes(table: Table): Set<string> {
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
    case "shuffle":
      if (at.felt.length > 0 || at.chairs.some((c) => c.hand.length > 0)) return { error: "needs-collect" };
      return { steps: [{ t: "shuffle", ms: PACE.shuffle }], actor: "bot" };
    case "look":
      return { steps: [{ t: "rules", rules: { ...(command.faces ? { faces: command.faces } : {}), ...(command.back ? { back: command.back } : {}) } }], actor: "bot" };
    case "preset":
      return presetPlan(table, command.game, command.size ?? 36, command.jokers === true, people, admin);
    case "deal":
      return dealPlan(table, command, people, admin);
  }
}

function presetPlan(table: Table, game: Game, size: DeckSize, jokers: boolean, people: Who[], admin: string): Plan {
  const steps: Step[] = [{ t: "rules", rules: { faces: PRESET_FACES[game] } }, ...collectSteps(table)];
  const faces = game === "belka" ? deckOf(36, false) : deckOf(size, jokers);
  steps.push({ t: "restock", faces }, { t: "shuffle", ms: PACE.shuffle });
  if (game !== "belka") return { steps, actor: "bot" };

  // БЕЛКА: четыре первых игрока по часовой от админа — крестом, 1 напротив 3, 2 напротив 4; остальные
  // стулья — между ними. Шестёрки — на край.
  const at = table.layout();
  const seated = at.chairs.filter((c) => c.owner !== null && people.some((p) => p.key === c.owner));
  const home = seated.find((c) => c.owner === admin) ?? seated[0];
  if (!home || seated.length < 4) return { error: "not-enough-players" };
  const four = clockwise(seated, home.id).slice(0, 4);
  const base = home.angle;
  const taken: number[] = [0, 90, 180, 270];
  four.forEach((c, i) => steps.push({ t: "chair", id: c.id, angle: base + 90 * i, ms: PACE.chair }));
  for (const c of clockwise(at.chairs, home.id).filter((c) => !four.includes(c))) {
    const rel = freeAngle(taken);
    taken.push(rel);
    steps.push({ t: "chair", id: c.id, angle: base + rel, ms: PACE.chair });
  }
  // Шестёрки — после перемешивания, по их лицам в новой колоде: план досчитает их, когда колода будет набрана.
  steps.push(...sixesSteps(base));
  return { steps, actor: "bot" };
}

/** Метка шага «вынести шестёрки»: какие это карты, комната узнаёт уже по набранной колоде. */
export const SIXES = "six";
function sixesSteps(anchor: number): Step[] {
  return sixesRow(anchor).map((to, i) => ({ t: "move", id: `${SIXES}:${i}`, to, ms: PACE.lay }));
}

function dealPlan(table: Table, command: Extract<TableCommand, { t: "deal" }>, people: Who[], admin: string): Plan {
  const at = table.layout();
  const dealer = findDealer(people, command.dealer, admin);
  if (!dealer) return { error: "no-dealer" };
  const rule: DealRule = command.rule;
  const sixes = rule === "belka" ? belkaSixes(table) : new Set<string>();

  const loose = at.felt.some((f) => !sixes.has(f.id)) || at.chairs.some((c) => c.hand.length > 0);

  const steps: Step[] = [];
  let deck = at.deck.length;
  if (loose) {
    if (!command.force) return { error: "needs-collect" };
    const back = collectSteps(table, sixes);
    steps.push(...back, { t: "shuffle", ms: PACE.shuffle });
    deck += back.length;
  }


  const anchor = dealer.seat ?? at.chairs.find((c) => c.owner === admin)?.id ?? at.chairs[0]?.id;
  if (!anchor) return { error: "not-enough-players" };
  let chairs = at.chairs.filter((c) => !(command.skipEmpty || rule === "belka") || (c.owner !== null && people.some((p) => p.key === c.owner)));
  if (rule === "belka") {
    const around = clockwise(chairs, chairs.some((c) => c.id === anchor) ? anchor : (chairs[0]?.id ?? anchor));
    chairs = around.slice(0, 4);
    if (chairs.length < 4) return { error: "not-enough-players" };
  }
  if (chairs.length === 0) return { error: "not-enough-players" };
  // Со следующего после раздающего; раздающему — последним. Раздающий без стула в круге — просто с его места по часовой.
  const ring = clockwise([...chairs, ...at.chairs.filter((c) => c.id === anchor && !chairs.includes(c))], anchor);
  const order = (ring[0]?.id === anchor ? [...ring.slice(1), ring[0]!] : ring).filter((c) => chairs.includes(c));

  const n = rule === "each" ? Math.max(1, Math.floor(command.n ?? 1)) : rule === "durak" ? Math.max(1, Math.floor(command.n ?? 6)) : rule === "belka" ? 8 : 0;
  const total = rule === "krest" ? deck : n * order.length + (rule === "durak" ? 1 : 0);
  if (total === 0 || total > deck) return { error: "not-enough-cards" };

  const dealt = rule === "krest" ? deck : n * order.length;
  for (let k = 0; k < dealt; k += 1) steps.push({ t: "move", id: "top", to: toHand(order[k % order.length]!.id), ms: PACE.deal });
  if (rule === "durak") steps.push({ t: "move", id: "top", to: TRUMP, ms: PACE.lay });
  return { steps, actor: command.asDealer ? dealer.key : "bot" };
}

export interface Io {
  spread(ops: import("./contract.js").Op[]): void;
  /** Палец команды над местом — всем, и самому раздающему. */
  carry(id: string, by: string): void;
  sleep(ms: number): Promise<void>;
  now(): number;
}

/**
 * ПРОИГРАТЬ ПЛАН. Каждая карта — как рукой: взять (лок виден всем), показать над колодой, через треть шага
 * — над местом, куда ляжет, в конце шага — положить. Стол на всё время — `busy` для людей.
 * Шаг, который уже не выполнить (карту кто-то успел унести), пропускается, а не рушит команду.
 */
export async function execute(table: Table, steps: Step[], actor: string, io: Io): Promise<void> {
  table.script(true);
  try {
    for (const step of steps) {
      if (step.t === "shuffle") {
        io.spread(table.shuffleDeck());
        await io.sleep(step.ms);
        continue;
      }
      if (step.t === "rules") {
        io.spread(table.setRules(step.rules));
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
      const id = step.id === "top" ? at.deck.at(-1) : step.id.startsWith(`${SIXES}:`) ? sixInDeck(table, at.deck) : step.id;
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
        const back = table.act(actor, { t: "release", id }, io.now(), true);
        if ("ops" in back) io.spread(back.ops);
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
