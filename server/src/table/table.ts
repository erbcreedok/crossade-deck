// СТОЛ НА СЕРВЕРЕ — единственная правда о том, где лежит каждая карта, кто где сидит и кто что держит.
//
// Здесь нет ни Colyseus, ни сети, ни часов: намерение входит, выходят дифы (`Op[]`) в полном виде, а
// под каждого зрителя их режет `seenOp`. Так одно и то же проверяется тестом без сокета и ставится в
// любую комнату.
//
// РУКА ПРИНАДЛЕЖИТ СТУЛУ. Человек садится на стул и уходит с него; карты остаются лежать там, где их
// оставили, и тот, кто сядет следом, получает их вместе со стулом.
//
// КТО ЧТО ВИДИТ — одно правило (`visibleTo`): карту в руке — хозяин стула всегда, остальные — только если
// у стула снят «скрыть»; карту на сукне — если лежит лицом вверх; колоду — никто. Лицо чужой карты не
// уходит в сеть вовсе: спрятанное в клиенте — не спрятано.
//
// КТО ЧТО МОЖЕТ СО СТУЛОМ (`mayFlag`): флаги своего стула — хозяин; покинутого — любой; любого — админ.
// Флаг, пока стоит, действует на всех, кроме хозяина, — и на админа тоже: снять может, обойти — нет.

import {
  DEFAULT_RULES,
  DEFAULT_SPOT,
  DECK_DOS,
  GATHER_SIDES,
  LOCK_TTL_MS,
  MAIN_PILE,
  PILE_GUARDS,
  type GatherSide,
  type Pile,
  type DeckDo,
  type DeckSpot,
  type Carry,
  type CarryOut,
  DEFAULT_POSE,
  HAND_POSE_KEYS,
  type Arrange,
  type Chair,
  type ChairFlag,
  type HandPose,
  type Face,
  type FeltCard,
  type Intent,
  type Op,
  type Person,
  type Refusal,
  type SeenCard,
  type Snapshot,
  type TableRules,
  type Trail,
  type Where,
  CARD_BACKS,
  CARD_FACES,
} from "./contract.js";
import { arranged, samePack, shuffled } from "./arrange.js";
import { SANDBOX, type DeskAsk, type DeskRules } from "./rules.js";
import { croupierAngle, freeAngle, seatPoint } from "./ring.js";

/** Докуда на сукне может лежать середина карты: радиус стола минус полкарты по диагонали. */
export const FELT_REACH = 8 - 0.86;

/** Насколько близко середины двух карт, чтобы верхняя считалась ЛЕЖАЩЕЙ НА нижней (`FELT_OVERLAP` клиента). */
const FELT_OVERLAP = 1.2;

interface Lock {
  by: string;
  until: number;
}

/** Стул на сервере: рука — id карт, лица не здесь (`faces`). */
interface ChairRow {
  id: string;
  angle: number;
  owner: string | null;
  /** Кто сидел последним — вернувшийся садится обратно. */
  last: string | null;
  lock: boolean;
  hide: boolean;
  forever: boolean;
  croupier?: true;
  pose: HandPose;
  hand: string[];
}

type Result = { ops: Op[] } | { refused: Refusal };

/** Стопка на сервере: место и флаги, карты снизу вверх. */
interface PileRow {
  spot: DeckSpot;
  cards: string[];
  shuffles: number;
}

export class Table {
  private v = 0;
  private seq = 0;
  private faces = new Map<string, Face>();
  /** Стопки в порядке «кто сверху». Колода (`MAIN_PILE`) стоит с начала. */
  private piles = new Map<string, PileRow>([[MAIN_PILE, { spot: { ...DEFAULT_SPOT, below: [] }, cards: [], shuffles: 0 }]]);
  private pileSeq = 0;
  private felt: { id: string; x: number; y: number; up: boolean; angle: number; under?: boolean }[] = [];
  /** Идёт команда бота: руки людей до конца неё стол не трогают (`busy`). */
  private scripted = false;
  private chairs = new Map<string, ChairRow>();
  private people = new Map<string, Person>();
  private locks = new Map<string, Lock>();
  /** Выделение лассо: id карты → кто выделил (`Snapshot.picks`). */
  private picks = new Map<string, string>();
  /** Последнее «над чем карта», пока её держат. Живёт не дольше блокировки (`carriesSeenBy`). */
  private carries = new Map<string, { by: string; over: Where; auto?: true; with?: string[] }>();
  private rules: TableRules = { ...DEFAULT_RULES };
  private trails = new Map<string, Trail>();
  /** Перевёрнутые карты в колоде и в руках. У карты на сукне сторона лежит в ней самой (`felt[].up`). */
  private turned = new Set<string>();
  /** Имена всех, кто когда-либо садился: след подписывает и ушедшего. */
  private names = new Map<string, string>();

  /**
   * ЧЕМ СТОЛ СПРАШИВАЕТ У ПРАВИЛ — узкое окно: правила читают стол и не правят его (`rules.ts`).
   * Собирается один раз и живёт со столом: у каждого вопроса одно и то же окно.
   */
  private readonly ask: DeskAsk = {
    face: (id) => this.faces.get(id),
    pile: (id) => this.piles.get(id)?.cards ?? [],
    hand: (chair) => this.chairs.get(chair)?.hand ?? [],
    admin: (key) => key === this.admin,
  };

  /**
   * `creator` — ключ создателя комнаты: он админ, пока сидит за столом.
   * `rules` — РОД СТОЛА. По умолчанию песочница: стол, где разрешено всё.
   */
  constructor(
    cards: { id: string; face: Face }[],
    private creator: string | null = null,
    private desk: DeskRules = SANDBOX,
  ) {
    for (const card of cards) {
      this.faces.set(card.id, card.face);
      this.main!.cards.push(card.id);
    }
    // ЗОНЫ РОДА СТОЛА — из конфига, а не из кода. Чтобы на сукне появилось новое место, дописывают
    // строку в `DeskRules.zones`; здесь ничего не меняется (`rules.law.test.ts` это стережёт).
    for (const zone of this.desk.zones) {
      this.piles.set(zone.id, {
        spot: {
          ...DEFAULT_SPOT,
          below: [],
          x: zone.x,
          y: zone.y,
          pose: zone.pose,
          angle: zone.angle ?? 0,
          forever: zone.forever ?? true,
          lock: zone.lock ?? false,
          shut: zone.shut ?? false,
          seal: zone.seal ?? false,
          pin: zone.pin ?? false,
        },
        cards: [],
        shuffles: 0,
      });
    }
  }

  get version(): number {
    return this.v;
  }

  get here(): Person[] {
    return [...this.people.values()];
  }

  /** Колода стола; `undefined` — её сейчас нет. */
  private get main(): PileRow | undefined {
    return this.piles.get(MAIN_PILE);
  }

  /**
   * ХОЗЯИН НАШЁЛСЯ. Комнату, открытую входом, админа лишает не решение, а порядок событий: сервер
   * перезапустился, и человек вошёл раньше, чем бот успел назвать себя. Тогда бот приходит следом и
   * забирает свою комнату обратно — но только пустую, у которой хозяина ещё нет.
   */
  claim(by: string): Op[] {
    if (this.creator !== null || !by) return [];
    this.creator = by;
    return this.commit([{ t: "admin", key: this.admin }]);
  }

  private get admin(): string | null {
    return this.creator !== null && this.people.has(this.creator) ? this.creator : null;
  }

  // ── ЛЮДИ ───────────────────────────────────────────────────────────────────────────────────

  /** Сесть за стол: на свой прежний стул, если он ещё стоит и свободен, иначе — на новый. */
  join(person: Person): Op[] {
    const ops: Op[] = [];
    const wasAdmin = this.admin;
    const chair =
      [...this.chairs.values()].find((c) => c.owner === person.key) ??
      [...this.chairs.values()].find((c) => c.owner === null && c.last === person.key) ??
      this.newChair();
    chair.owner = person.key;
    chair.last = person.key;
    const seated = { ...person, seat: chair.id };
    this.people.set(person.key, seated);
    this.names.set(person.key, person.name);
    ops.push({ t: "join", person: seated }, { t: "chair", chair: this.chairOut(chair) });
    if (this.admin !== wasAdmin) ops.push({ t: "admin", key: this.admin });
    return this.commit(ops);
  }

  /**
   * КРУПЬЕ САДИТСЯ. Он один на комнату: это бот стола, но со своим местом вне кольца и своей рукой.
   * Рука открыта, без замка и принимает карты — пока админ не решит иначе.
   */
  seatCroupier(person: Person): Op[] {
    const had = this.croupierChair();
    if (had) return [];
    this.seq += 1;
    const chair: ChairRow = {
      id: `c${this.seq}`,
      // На десяти часах от админа; админа за столом нет — от своей стороны.
      angle: croupierAngle(this.admin ? this.seatOf(this.admin)?.angle : undefined),
      owner: person.key,
      last: person.key,
      lock: false,
      hide: false,
      forever: true,
      croupier: true,
      pose: { ...DEFAULT_POSE },
      hand: [],
    };
    this.chairs.set(chair.id, chair);
    const seated = { ...person, bot: true as const, seat: chair.id };
    this.people.set(person.key, seated);
    this.names.set(person.key, person.name);
    return this.commit([{ t: "join", person: seated }, { t: "chair", chair: this.chairOut(chair) }]);
  }

  /** Крупье уходит: его карты падают на стол новой закрытой стопкой, как у любого убранного стула. */
  removeCroupier(): Op[] {
    const chair = this.croupierChair();
    if (!chair) return [];
    const who = chair.owner;
    const ops = this.removeChair(chair);
    if (who !== null) {
      this.people.delete(who);
      ops.push({ t: "leave", key: who });
    }
    return this.commit(ops);
  }

  /** Стул крупье, если он в комнате. */
  croupierChair(): ChairRow | undefined {
    return [...this.chairs.values()].find((c) => c.croupier);
  }

  /** Есть ли крупье за столом. */
  get hasCroupier(): boolean {
    return this.croupierChair() !== undefined;
  }

  /** Бот стола садится за стол без стула: он только ходит по командам. */
  joinBot(person: Person): Op[] {
    if (this.people.has(person.key)) return [];
    const bot = { ...person, bot: true as const };
    delete (bot as Person).seat;
    this.people.set(person.key, bot);
    this.names.set(person.key, person.name);
    return this.commit([{ t: "join", person: bot }]);
  }

  /** Уйти. Всё, что держал, отпускается; стул остаётся покинутым — или уходит по правилу стола. */
  leave(key: string): Op[] {
    const person = this.people.get(key);
    if (!person) return [];
    const wasAdmin = this.admin;
    this.people.delete(key);
    const ops: Op[] = [];
    for (const [id, lock] of this.locks) {
      if (lock.by !== key) continue;
      this.locks.delete(id);
      ops.push({ t: "unlock", id });
    }
    ops.push(...this.dropPicks([...this.picks].filter(([, who]) => who === key).map(([id]) => id)));
    ops.push({ t: "leave", key });
    const chair = person.seat ? this.chairs.get(person.seat) : undefined;
    if (chair) ops.push(...this.vacate(chair, "left"));
    if (this.admin !== wasAdmin) ops.push({ t: "admin", key: this.admin });
    return this.commit(ops);
  }

  // ── НАМЕРЕНИЯ ──────────────────────────────────────────────────────────────────────────────

  /**
   * `auto` — ход команды бота. Пока команда идёт (`script(true)`), всё, что меняет стол, у людей
   * отказывается `busy`: раздача не должна делиться с чужой рукой, которая тянет ту же колоду.
   */
  act(by: string, intent: Intent, now: number, auto = false): Result {
    if (this.scripted && !auto && intent.t !== "sync" && intent.t !== "hold" && intent.t !== "release") return { refused: "busy" };
    switch (intent.t) {
      case "grab":
        return this.grab(by, intent.id, now, auto);
      case "hold": {
        const lock = this.locks.get(intent.id);
        if (!lock || lock.by !== by) return { refused: "not-held" };
        lock.until = now + LOCK_TTL_MS;
        return { ops: [] };
      }
      case "release": {
        const lock = this.locks.get(intent.id);
        if (!lock || lock.by !== by) return { refused: "not-held" };
        this.locks.delete(intent.id);
        return { ops: this.commit([{ t: "unlock", id: intent.id }]) };
      }
      case "drop":
        return this.drop(by, intent.id, intent.to, now, auto);
      case "turn":
        return this.turn(by, intent.id, now);
      case "flip": {
        const chair = this.seatOf(by);
        if (!chair) return { refused: "bad" };
        chair.hand.reverse();
        return { ops: this.commit([{ t: "order", chair: chair.id, ids: [...chair.hand] }]) };
      }
      case "arrange":
        return this.arrange(by, intent.how, intent.ids);
      case "pose":
        return this.pose(by, intent.chair, intent.pose);
      case "stand": {
        const person = this.people.get(by);
        const chair = this.seatOf(by);
        if (!person || !chair) return { refused: "bad" };
        const { seat: _seat, ...standing } = person;
        this.people.set(by, standing);
        return { ops: this.commit([{ t: "join", person: standing }, ...this.vacate(chair, "left")]) };
      }
      case "sit":
        return this.sit(by, intent.chair);
      case "flag":
        return this.flag(by, intent.chair, intent.flag, intent.on);
      case "deckMove":
        return this.deckMove(intent.pile, intent.x, intent.y, intent.angle);
      case "deckDo":
        return this.deckDo(by, intent.pile, intent.how);
      case "deckForever": {
        const pile = this.piles.get(intent.pile);
        if (!pile) return { refused: "gone" };
        if (typeof intent.on !== "boolean") return { refused: "bad" };
        pile.spot.forever = intent.on;
        return { ops: this.commit([this.spotOp(intent.pile), ...this.sweepPile(intent.pile)]) };
      }
      case "deckPin": {
        const pile = this.piles.get(intent.pile);
        if (!pile) return { refused: "gone" };
        if (typeof intent.on !== "boolean") return { refused: "bad" };
        if (!intent.on && by !== this.admin) return { refused: "not-yours" };
        pile.spot.pin = intent.on;
        return { ops: this.commit([this.spotOp(intent.pile)]) };
      }
      case "deckGuard": {
        const pile = this.piles.get(intent.pile);
        if (!pile) return { refused: "gone" };
        if (by !== this.admin) return { refused: "not-yours" };
        if (typeof intent.on !== "boolean" || !(PILE_GUARDS as readonly unknown[]).includes(intent.guard)) return { refused: "bad" };
        pile.spot[intent.guard] = intent.on;
        return { ops: this.commit([this.spotOp(intent.pile)]) };
      }
      case "gather":
        return this.gather(by, intent.ids, intent.side, intent.to, now);
      case "pick":
        return this.pick(by, intent.ids, intent.on);
      case "moveMany":
        return this.moveMany(by, intent.moves, now);
      case "pileDrop":
        return this.pileDrop(by, intent.pile, intent.to, now);
      case "turnMany":
        return this.turnMany(by, intent.ids, now);
      case "unpick": {
        const ops = this.dropPicks([...this.picks].filter(([, who]) => who === by).map(([id]) => id));
        return { ops: ops.length ? this.commit(ops) : [] };
      }
      case "rules": {
        if (by !== this.admin) return { refused: "not-yours" };
        return { ops: this.setRules(intent.rules) };
      }
      case "sync":
        return { ops: [] };
    }
  }

  /** Блокировки, которые никто не продлил. Комната спрашивает это по таймеру. */
  sweep(now: number): Op[] {
    const ops: Op[] = [];
    for (const [id, lock] of this.locks) {
      if (lock.until > now) continue;
      this.locks.delete(id);
      ops.push({ t: "unlock", id });
    }
    return ops.length ? this.commit(ops) : [];
  }

  /**
   * ПАЛЕЦ В ВОЗДУХЕ СООБЩИЛ, НАД ЧЕМ ОН. Только держащий; место чистится тем же `clean`, что и дроп, —
   * иначе чужая рука, которой нет, пришла бы остальным. Версия не растёт. Блокировку продлевает.
   */
  carry(by: string, out: CarryOut, now: number, auto = false): { refused: Refusal } | { ok: true } {
    const lock = this.locks.get(out?.id);
    if (!lock || lock.by !== by) return { refused: "not-held" };
    const over = this.clean(out.over);
    if (!over) return { refused: "bad" };
    lock.until = now + LOCK_TTL_MS;
    // С пальцем — только своё выделение, которое никто другой не держит.
    const flock = Array.isArray(out.with)
      ? [...new Set(out.with)].filter((id) => typeof id === "string" && id !== out.id && this.picks.get(id) === by && this.whereIs(id) && (!this.locks.get(id) || this.locks.get(id)!.by === by))
      : [];
    this.carries.set(out.id, { by, over, ...(auto ? { auto: true as const } : {}), ...(flock.length ? { with: flock } : {}) });
    return { ok: true };
  }

  /** Что в воздухе у других, глазами зрителя. Своё не отдаётся: свой палец у зрителя и так под рукой. */
  carriesSeenBy(viewer: string, only?: string): Carry[] {
    const out: Carry[] = [];
    for (const [id, c] of this.carries) {
      const lock = this.locks.get(id);
      const from = this.whereIs(id);
      if (!lock || lock.by !== c.by || !from) {
        this.carries.delete(id);
        continue;
      }
      if ((c.by === viewer && !c.auto) || (only !== undefined && only !== id)) continue;
      const flock = (c.with ?? []).flatMap((one) => {
        const at = this.picks.get(one) === c.by ? this.whereIs(one) : null;
        return at ? [{ card: this.seen(one, viewer, at), from: at }] : [];
      });
      out.push({ id, by: c.by, over: c.over, from, card: this.seen(id, viewer, from), ...(c.auto ? { auto: true as const } : {}), ...(flock.length ? { with: flock } : {}) });
    }
    return out;
  }

  /** Можно ли тронуть карту — взять или перевернуть. Одно правило на оба жеста. */
  private touchable(by: string, id: string): { at: Where } | { refused: Refusal } {
    const at = this.whereIs(id);
    if (!at) return { refused: "gone" };
    const lock = this.locks.get(id);
    if (lock && lock.by !== by) return { refused: "locked" };
    const picked = this.picks.get(id);
    if (picked !== undefined && picked !== by) return { refused: "locked" };
    // ИЗ СЕРЕДИНЫ СТОПКИ — только пока на ней нет лока: под локом доступна одна верхняя.
    if (at.in === "deck") {
      const pile = this.piles.get(at.pile)!;
      if (pile.spot.lock && pile.cards[pile.cards.length - 1] !== id) return { refused: "not-top" };
    }
    if (at.in === "hand" && this.closedTo(by, at.chair)) return { refused: "chair-locked" };
    // ПРАВИЛА РОДА СТОЛА — последними: зона уже сказала своё, теперь слово игре (`rules.ts`).
    if (!this.desk.mayTake(this.ask, id, at, by)) return { refused: "locked" };
    return { at };
  }

  private grab(by: string, id: string, now: number, auto = false): Result {
    const may = this.touchable(by, id);
    if ("refused" in may) return may;
    if (may.at.in === "deck" && this.piles.get(may.at.pile)!.spot.shut && !auto) return { refused: "locked" };
    const lock = this.locks.get(id);
    this.locks.set(id, { by, until: now + LOCK_TTL_MS });
    return { ops: lock ? [] : this.commit([{ t: "lock", id, by }]) };
  }

  /**
   * ПЕРЕВЕРНУТЬ НА МЕСТЕ. Место, угол и порядок не меняются; след — «трогал я», а «откуда» остаётся от
   * последнего переноса: карта Джемаля из его руки, перевёрнутая мной, — всё ещё «из руки Джемаля».
   */
  private turn(by: string, id: string, now: number): Result {
    const done = this.turnOps(by, id, now);
    return "refused" in done ? done : { ops: this.commit(done.ops) };
  }

  /** ПЕРЕЛОЖИТЬ СТОПКУ ЦЕЛИКОМ (`Intent.pileDrop`). Одним патчем; опустевшая невечная стопка уходит со стола. */
  private pileDrop(by: string, id: string, to: unknown, now: number): Result {
    const source = this.piles.get(id);
    if (!source) return { refused: "gone" };
    const target = this.clean(to as Where);
    if (!target || target.in === "felt" || (target.in === "deck" && target.pile === id)) return { refused: "bad" };
    if (source.spot.pin || source.spot.shut || source.spot.seal) return { refused: "locked" };
    if (!this.desk.mayGrip(this.ask, id, by)) return { refused: "locked" };
    if (source.cards.some((one) => (this.locks.has(one) && this.locks.get(one)!.by !== by) || (this.picks.has(one) && this.picks.get(one) !== by))) return { refused: "locked" };
    if (source.cards.length === 0) return { refused: "bad" };
    if (target.in === "hand" && this.closedTo(by, target.chair)) return { refused: "chair-locked" };
    const into = target.in === "deck" ? this.piles.get(target.pile) : undefined;
    if (target.in === "deck" && !into) return { refused: "gone" };
    if (into?.spot.shut || into?.spot.seal) return { refused: "locked" };
    // ВЕЧНАЯ, ПЕРЕЛОЖЕННАЯ ЦЕЛИКОМ, — больше не стопка: вечность снята, опустевшая уйдёт.
    source.spot.forever = false;
    // СТОРОНА: цель вся одной стороной — ею; вперемешку или пустая — как лежали.
    const pack = into ? into.cards.map((one) => this.turned.has(one)) : [];
    const side = pack.length > 0 && pack.every((up) => up === pack[0]) ? pack[0] : undefined;
    const ops: Op[] = [];
    const cards = [...source.cards];
    let i = target.in === "hand" ? target.i : into!.spot.lock ? undefined : target.i;
    for (const one of cards) {
      const from = this.whereIs(one)!;
      const trail = this.trailOf(one, by, from, target.in, now);
      this.take(one, from);
      if (target.in === "hand") this.turned.delete(one);
      else if (side !== undefined) {
        this.turned.delete(one);
        if (side) this.turned.add(one);
      }
      const landed = this.put(one, target.in === "hand" ? { in: "hand", chair: target.chair, i: i! } : { in: "deck", pile: target.pile, ...(i !== undefined ? { i } : {}) });
      if (i !== undefined) i = (landed as { i: number }).i + 1;
      this.trails.set(one, trail);
      if (this.locks.delete(one)) ops.push({ t: "unlock", id: one });
      ops.push({ t: "move", card: { id: one }, from, to: landed, trail });
    }
    ops.push(...this.sweepPile(id));
    return { ops: this.commit(ops) };
  }

  /** ПЕРЕВЕРНУТЬ ВЫДЕЛЕННОЕ — каждую карту на месте, одним патчем; чего тронуть нельзя — пропускается. */
  private turnMany(by: string, ids: unknown, now: number): Result {
    if (!Array.isArray(ids) || !ids.every((one) => typeof one === "string")) return { refused: "bad" };
    const ops = [...new Set(ids as string[])].flatMap((id) => {
      const done = this.turnOps(by, id, now);
      return "refused" in done ? [] : done.ops;
    });
    return ops.length ? { ops: this.commit(ops) } : { refused: "bad" };
  }

  private turnOps(by: string, id: string, now: number): { ops: Op[] } | { refused: Refusal } {
    const may = this.touchable(by, id);
    if ("refused" in may) return may;
    const at = may.at;
    let up: boolean;
    if (at.in === "felt") {
      const one = this.felt.find((f) => f.id === id)!;
      up = one.up = !one.up;
    } else {
      up = !this.turned.has(id);
      if (up) this.turned.add(id);
      else this.turned.delete(id);
    }
    const was = this.trails.get(id);
    const trail: Trail = was ? { ...was, by, byName: this.names.get(by) ?? by, at: now } : this.trailOf(id, by, at, at.in, now);
    this.trails.set(id, trail);
    return { ops: [{ t: "turn", card: { id }, up, trail }] };
  }

  private drop(by: string, id: string, to: Where, now: number, auto = false): Result {
    const done = this.dropOps(by, id, to, now, auto);
    return "refused" in done ? done : { ops: this.commit(done.ops) };
  }

  /**
   * ПЕРЕНЕСТИ ВЫДЕЛЕННОЕ РАЗОМ — по одному переносу на карту, каждый по правилам дропа, одним патчем. Карта, которую
   * взять нельзя (чужая в пальце или выделена другим, под замком, из-под лока) или которую место не примет, остаётся.
   */
  private moveMany(by: string, moves: unknown, now: number): Result {
    if (!Array.isArray(moves) || moves.length === 0) return { refused: "bad" };
    const ops: Op[] = [];
    const seen = new Set<string>();
    for (const move of moves as { id?: unknown; to?: unknown }[]) {
      if (typeof move?.id !== "string" || typeof move.to !== "object" || move.to === null || seen.has(move.id)) continue;
      seen.add(move.id);
      const id = move.id;
      const may = this.touchable(by, id);
      if ("refused" in may) continue;
      if (may.at.in === "deck" && this.piles.get(may.at.pile)!.spot.shut) continue;
      const had = this.locks.get(id);
      if (!had) this.locks.set(id, { by, until: now + LOCK_TTL_MS });
      const done = this.dropOps(by, id, move.to as Where, now);
      if ("refused" in done) {
        if (!had) this.locks.delete(id);
        continue;
      }
      ops.push(...(had ? done.ops : done.ops.filter((op) => !(op.t === "unlock" && op.id === id))));
    }
    return ops.length ? { ops: this.commit(ops) } : { refused: "bad" };
  }

  private dropOps(by: string, id: string, to: Where, now: number, auto = false): { ops: Op[] } | { refused: Refusal } {
    const lock = this.locks.get(id);
    if (!lock || lock.by !== by) return { refused: "not-held" };
    const target = this.clean(to, auto);
    if (!target) return { refused: "bad" };
    if (target.in === "hand" && this.closedTo(by, target.chair)) return { refused: "chair-locked" };
    const from = this.whereIs(id)!;
    const refusal = this.ruleRefusal(by, id, target);
    if (refusal) return { refused: refusal };
    const trail = this.trailOf(id, by, from, target.in, now);
    // СТОРОНА КАРТЫ. В руку — всегда лицом к хозяину. Команда кладёт, как сказано. Рука кладёт, как несла:
    // из руки — лицом, если его было видно в худе; с сукна и колоды — как лежала.
    // В СТОПКУ, КОТОРОЙ НЕТ, кладёт только команда бота, и только в колоду — ставит новую посередине.
    const into = target.in === "deck" ? this.piles.get(target.pile) : undefined;
    if (target.in === "deck" && !into && !(auto && target.pile === MAIN_PILE)) return { refused: "gone" };
    // ПРИЁМКА ЗАКРЫТА — не положить; вернуть взятую из самой стопки на её место тоже нельзя, это перестановка.
    if (target.in === "deck" && !auto && into && (into.spot.shut || (into.spot.lock && from.in === "deck" && from.pile === target.pile))) return { refused: "locked" };
    const born = target.in === "deck" && !into ? this.ensureDeck() : [];
    // В СТОПКУ — стороной стопки, если все её карты лежат одинаково; вперемешку или пустая — как нёс.
    const pack = into && !auto ? into.cards.filter((one) => one !== id).map((one) => this.turned.has(one)) : [];
    const packSide = pack.length > 0 && pack.every((up) => up === pack[0]) ? pack[0] : undefined;
    const faceUp = auto && target.in === "felt" ? target.up : (packSide ?? this.sideOf(by, id, from));
    if (target.in === "felt") target.up = faceUp;
    this.turned.delete(id);
    if (target.in === "deck" && faceUp && !auto) this.turned.add(id);
    this.take(id, from);
    const landed = this.put(id, target);
    this.locks.delete(id);
    this.trails.set(id, trail);
    const ops: Op[] = [...born, { t: "move", card: { id }, from, to: landed, trail }, { t: "unlock", id }];
    if (from.in === "deck") ops.push(...this.sweepPile(from.pile));
    // РУКА ПОКИНУТОГО СТУЛА ОПУСТЕЛА — правило стола решает, стоять ли ему дальше.
    if (from.in === "hand") ops.push(...this.sweepChair(this.chairs.get(from.chair)!));
    return { ops };
  }

  /**
   * ЧТО СКАЖУТ ПРАВИЛА РОДА СТОЛА ПРО ЭТОТ БРОСОК — один разбор на все пути, которыми карта ложится.
   *
   * Три вопроса подряд: пускает ли зона (`mayDrop`), бьёт ли карта ту, что уже лежит (`mayCover`),
   * и влезет ли она в руку (`handMax`). «Накрыть» спрашивается только там, где карта ДЕЙСТВИТЕЛЬНО
   * ложится на другую: верхняя карта стопки и карта сукна под точкой броска.
   */
  private ruleRefusal(by: string, id: string, to: Where): Refusal | null {
    if (!this.desk.mayDrop(this.ask, id, to, by)) return "locked";
    const over = this.coveredBy(to);
    if (over !== null && !this.desk.mayCover(this.ask, id, over, by)) return "locked";
    if (to.in === "hand") {
      const hand = this.chairs.get(to.chair)?.hand ?? [];
      if (hand.length >= this.desk.handMax(this.ask, to.chair)) return "locked";
    }
    return null;
  }

  /** Какую карту накроет бросок сюда: верхнюю в стопке, ближайшую на сукне; в руку — никакую. */
  private coveredBy(to: Where): string | null {
    if (to.in === "deck") {
      const pile = this.piles.get(to.pile);
      return pile && pile.cards.length > 0 ? pile.cards[pile.cards.length - 1]! : null;
    }
    if (to.in !== "felt") return null;
    let best: { id: string; d: number } | null = null;
    for (const one of this.felt) {
      const d = Math.hypot(one.x - to.x, one.y - to.y);
      if (d <= FELT_OVERLAP && (!best || d < best.d)) best = { id: one.id, d };
    }
    return best ? best.id : null;
  }

  /**
   * «ОТКУДА» — последняя стопка или рука, из которой карта пришла. Сдвиг по сукну его не перетирает: карта,
   * брошенная Джемалем из руки и передвинутая мной, всё ещё «из руки Джемаля», а «двигал» — уже я.
   */
  private trailOf(id: string, by: string, from: Where, to: Where["in"], at: number): Trail {
    const byName = this.names.get(by) ?? by;
    const was = this.trails.get(id);
    if (from.in === "felt" && to === "felt" && was) return { ...was, by, byName, at };
    const trail: Trail = { by, byName, from: from.in, at };
    if (from.in === "hand") {
      const chair = this.chairs.get(from.chair);
      const whose = chair?.owner ?? chair?.last;
      if (whose) trail.hand = this.names.get(whose) ?? whose;
    }
    return trail;
  }

  /** Пересесть. Старый стул: с картами — остаётся и становится вечным; без карт — исчезает сразу. */
  private sit(by: string, id: string): Result {
    const chair = this.chairs.get(id);
    const person = this.people.get(by);
    if (!chair || !person) return { refused: "gone" };
    if (chair.owner !== null) return { refused: chair.owner === by ? "bad" : "taken" };
    const ops: Op[] = [];
    const old = person.seat ? this.chairs.get(person.seat) : undefined;
    if (old) ops.push(...this.vacate(old, "moved"));
    chair.owner = by;
    chair.last = by;
    const seated = { ...person, seat: chair.id };
    this.people.set(by, seated);
    ops.push({ t: "join", person: seated }, { t: "chair", chair: this.chairOut(chair) });
    return { ops: this.commit(ops) };
  }

  /** Переставить руку своего стула (`arrange.ts`). Шафл без присланного порядка мешает сам. */
  private arrange(by: string, how: Arrange, ids?: string[]): Result {
    const chair = this.seatOf(by);
    if (!chair || !["suit", "rank", "reverse", "shuffle"].includes(how)) return { refused: "bad" };
    let next: string[] | null;
    if (how !== "shuffle") next = arranged(chair.hand, how, (id) => this.faces.get(id));
    else if (ids === undefined) next = shuffled(chair.hand);
    else next = Array.isArray(ids) && ids.every((id) => typeof id === "string") && samePack(ids, chair.hand) ? [...ids] : null;
    if (!next) return { refused: "bad" };
    chair.hand = next;
    return { ops: this.commit([{ t: "order", chair: chair.id, ids: [...next] }]) };
  }

  private pose(by: string, id: string, pose: Partial<HandPose>): Result {
    const chair = this.chairs.get(id);
    if (!chair) return { refused: "gone" };
    if (chair.owner !== by && by !== this.admin) return { refused: "not-yours" };
    const next = { ...chair.pose };
    for (const k of HAND_POSE_KEYS) {
      const v = pose?.[k];
      if (v === undefined) continue;
      if (typeof v !== "boolean") return { refused: "bad" };
      next[k] = v;
    }
    chair.pose = next;
    return { ops: this.commit([{ t: "chair", chair: this.chairOut(chair) }]) };
  }

  private flag(by: string, id: string, flag: ChairFlag, on: boolean): Result {
    const chair = this.chairs.get(id);
    if (!chair) return { refused: "gone" };
    if (!this.mayFlag(by, chair)) return { refused: "not-yours" };
    if (typeof on !== "boolean" || !["lock", "hide", "forever"].includes(flag)) return { refused: "bad" };
    chair[flag] = on;
    const ops: Op[] = [{ t: "chair", chair: this.chairOut(chair) }];
    if (flag === "forever" && !on) ops.push(...this.sweepChair(chair));
    return { ops: this.commit(ops) };
  }

  // ── КОЛОДА ─────────────────────────────────────────────────────────────────────────────────

  /** Переставить стопку по сукну. Мимо стола не поставить — встанет на кромку, как карта. */
  private deckMove(id: string, x: number, y: number, angle = 0): Result {
    const pile = this.piles.get(id);
    if (!pile) return { refused: "gone" };
    if (pile.spot.pin) return { refused: "locked" };
    if (![x, y, angle].every(Number.isFinite)) return { refused: "bad" };
    const far = Math.hypot(x, y);
    const k = far > FELT_REACH ? FELT_REACH / far : 1;
    // ПОСТАВЛЕННАЯ СТОПКА ЛЕЖИТ ПОВЕРХ всего, что уже было на сукне, — и поверх других стопок.
    pile.spot = { ...pile.spot, x: x * k, y: y * k, angle: turnOf(angle), below: this.felt.map((one) => one.id) };
    this.piles.delete(id);
    this.piles.set(id, pile);
    return { ops: this.commit([{ ...this.spotOp(id), top: true }]) };
  }

  /**
   * ИЗ ТУЛТИПА СТОПКИ. Пока карту стопки кто-то держит — отказ: перемешивание выписывает новые id, и
   * держащий остался бы с картой, которой нет.
   */
  private deckDo(by: string, id: string, how: DeckDo): Result {
    if (!(DECK_DOS as readonly unknown[]).includes(how)) return { refused: "bad" };
    const pile = this.piles.get(id);
    if (!pile) return { refused: "gone" };
    if (pile.spot.lock || pile.cards.some((one) => this.locks.has(one) || (this.picks.has(one) && this.picks.get(one) !== by))) return { refused: "locked" };
    if (how === "shuffle") return { ops: this.shuffleDeck(Math.random, id) };
    if (how === "sort") pile.cards = arranged(pile.cards, "suit", (one) => this.faces.get(one))!;
    else {
      // ПЕРЕВЕРНУТЬ СТОПКУ: нижняя стала верхней, и каждая карта легла другой стороной.
      pile.cards.reverse();
      for (const one of pile.cards) if (!this.turned.delete(one)) this.turned.add(one);
    }
    return { ops: this.commit([{ t: "deck", pile: id, cards: pile.cards.map((one) => ({ id: one })), shuffled: false }]) };
  }

  /**
   * СОБРАТЬ В СТОПКУ. Карты идут по порядку снизу вверх; каждая — по тем же правилам, что рука: чужую в пальце,
   * из-под замка стула, из середины залоченной стопки и из стопки с закрытой приёмкой не взять. В стоящую стопку —
   * только если она принимает; в новую — стопка встаёт, где сказано, не вечной, поверх всего.
   */
  private gather(by: string, ids: unknown, side: GatherSide, to: unknown, now: number): Result {
    if (!Array.isArray(ids) || !ids.every((one) => typeof one === "string") || !(GATHER_SIDES as readonly unknown[]).includes(side)) return { refused: "bad" };
    const dest = to as { pile?: unknown; x?: unknown; y?: unknown; angle?: unknown } | null;
    if (!dest) return { refused: "bad" };
    const ops: Op[] = [];
    let pileId: string;
    if (typeof dest.pile === "string") {
      const pile = this.piles.get(dest.pile);
      if (!pile) return { refused: "gone" };
      if (pile.spot.shut) return { refused: "locked" };
      pileId = dest.pile;
    } else {
      if (![dest.x, dest.y, dest.angle].every((n) => typeof n === "number" && Number.isFinite(n))) return { refused: "bad" };
      pileId = "";
    }
    // Из залоченной стопки берётся только верхняя (`touchable`), из стопки с закрытой приёмкой — ничего.
    const taken = [...new Set(ids as string[])].filter((id) => {
      const may = this.touchable(by, id);
      if ("refused" in may) return false;
      return may.at.in !== "deck" || (!this.piles.get(may.at.pile)!.spot.shut && may.at.pile !== pileId);
    });
    if (taken.length === 0) return { refused: "bad" };
    if (!pileId) {
      this.pileSeq += 1;
      pileId = `p${this.pileSeq}`;
      const far = Math.hypot(dest.x as number, dest.y as number);
      const k = far > FELT_REACH ? FELT_REACH / far : 1;
      const felt = new Set(taken);
      this.piles.set(pileId, {
        spot: { ...DEFAULT_SPOT, forever: false, x: (dest.x as number) * k, y: (dest.y as number) * k, angle: turnOf(dest.angle as number), below: this.felt.map((one) => one.id).filter((one) => !felt.has(one)) },
        cards: [],
        shuffles: 0,
      });
      ops.push({ ...this.spotOp(pileId), top: true });
    }
    const sweep = new Set<string>();
    const chairs = new Set<string>();
    for (const id of taken) {
      const from = this.whereIs(id)!;
      const up = side === "up" ? true : side === "down" ? false : this.sideOf(by, id, from);
      const trail = this.trailOf(id, by, from, "deck", now);
      this.take(id, from);
      this.turned.delete(id);
      if (up) this.turned.add(id);
      const landed = this.put(id, { in: "deck", pile: pileId });
      this.trails.set(id, trail);
      if (this.locks.delete(id)) ops.push({ t: "unlock", id });
      ops.push({ t: "move", card: { id }, from, to: landed, trail });
      if (from.in === "deck") sweep.add(from.pile);
      if (from.in === "hand") chairs.add(from.chair);
    }
    for (const pile of sweep) ops.push(...this.sweepPile(pile));
    for (const chair of chairs) ops.push(...this.sweepChair(this.chairs.get(chair)!));
    // Собрали одну карту в новую стопку — это не стопка: карта ложится на сукно.
    ops.push(...this.sweepPile(pileId));
    return { ops: this.commit(ops) };
  }

  /** Выделить или снять своё выделение. Карты, которых нет, чужие выделенные и чужие в пальце — мимо. */
  private pick(by: string, ids: unknown, on: unknown): Result {
    if (!Array.isArray(ids) || !ids.every((one) => typeof one === "string") || typeof on !== "boolean") return { refused: "bad" };
    const fresh = [...new Set(ids as string[])].filter((id) => {
      if (on) {
        const lock = this.locks.get(id);
        return this.whereIs(id) !== null && !this.picks.has(id) && (!lock || lock.by === by);
      }
      return this.picks.get(id) === by;
    });
    // Выделять было нечего — отказ: экран снимет свою догадку сразу, а не по сроку.
    if (fresh.length === 0) return on ? { refused: "locked" } : { ops: [] };
    if (!on) return { ops: this.commit(this.dropPicks(fresh)) };
    for (const id of fresh) this.picks.set(id, by);
    return { ops: this.commit([{ t: "pick", ids: fresh, by }]) };
  }

  /** Снять выделение с карт — без коммита. */
  private dropPicks(ids: string[]): Op[] {
    const gone = ids.filter((id) => this.picks.delete(id));
    return gone.length ? [{ t: "pick", ids: gone, by: null }] : [];
  }

  private spotOut(id: string): DeckSpot | null {
    const pile = this.piles.get(id);
    return pile ? { ...pile.spot, below: [...pile.spot.below] } : null;
  }

  private spotOp(id: string): Extract<Op, { t: "spot" }> {
    return { t: "spot", pile: id, spot: this.spotOut(id) };
  }

  /** Невечная стопка без карт уходит со стола. */
  /**
   * НЕВЕЧНАЯ СТОПКА ИЗ ОДНОЙ КАРТЫ — НЕ СТОПКА: рушится, и карта ложится на сукно на её место, её углом и той
   * стороной, какой лежала. Пустая — просто уходит. Вечная стоит всегда.
   */
  private sweepPile(id: string): Op[] {
    const pile = this.piles.get(id);
    if (!pile || pile.spot.forever || pile.cards.length > 1) return [];
    const ops: Op[] = [];
    const last = pile.cards[0];
    if (last !== undefined) {
      const up = this.turned.has(last);
      const from: Where = { in: "deck", pile: id };
      this.take(last, from);
      this.turned.delete(last);
      const to = this.put(last, { in: "felt", x: pile.spot.x, y: pile.spot.y, up, angle: pile.spot.angle });
      ops.push({ t: "move", card: { id: last }, from, to });
    }
    this.piles.delete(id);
    ops.push({ t: "spot", pile: id, spot: null });
    return ops;
  }

  /** Колоды нет — поставить новую посередине (для команды бота). */
  private ensureDeck(): Op[] {
    if (this.main) return [];
    this.piles.set(MAIN_PILE, { spot: { ...DEFAULT_SPOT, below: [] }, cards: [], shuffles: 0 });
    return [{ ...this.spotOp(MAIN_PILE), top: true }];
  }

  /** Флаги стула меняет его хозяин, любой — у покинутого, админ — у любого. */
  mayFlag(by: string, chair: { owner: string | null }): boolean {
    return chair.owner === null || chair.owner === by || by === this.admin;
  }

  /** Замок стула закрыт для всех, кроме того, кто на нём сидит. */
  private closedTo(by: string, chairId: string): boolean {
    const chair = this.chairs.get(chairId);
    return chair !== undefined && chair.lock && chair.owner !== by;
  }

  // ── ДЛЯ КОМАНД БОТА ─────────────────────────────────────────────────────────────────────────

  /** Взять любую карту колоды, не только верхнюю, — только для команды бота. */
  grabAny(by: string, id: string, now: number): Op[] | null {
    if (!this.main?.cards.includes(id) || this.locks.has(id)) return null;
    this.locks.set(id, { by, until: now + LOCK_TTL_MS });
    return this.commit([{ t: "lock", id, by }]);
  }

  /** Команда началась или кончилась. */
  script(on: boolean): void {
    this.scripted = on;
  }

  get busy(): boolean {
    return this.scripted;
  }

  faceOf(id: string): Face | undefined {
    return this.faces.get(id);
  }

  /** Где что лежит — без лиц, для плана команды. */
  layout(): { deck: string[]; piles: { id: string; cards: string[] }[]; felt: { id: string; x: number; y: number; under?: boolean }[]; chairs: { id: string; angle: number; owner: string | null; hand: string[]; croupier?: true }[] } {
    return {
      deck: [...(this.main?.cards ?? [])],
      piles: [...this.piles].filter(([id]) => id !== MAIN_PILE).map(([id, pile]) => ({ id, cards: [...pile.cards] })),
      felt: this.felt.map(({ id, x, y, under }) => ({ id, x, y, ...(under ? { under } : {}) })),
      chairs: [...this.chairs.values()].map((c) => ({ id: c.id, angle: c.angle, owner: c.owner, hand: [...c.hand], ...(c.croupier ? { croupier: true as const } : {}) })),
    };
  }

  /**
   * ПЕРЕМЕШАТЬ. Id всех карт колоды выписываются заново: иначе карта, которую кто-то видел лицом до сборки,
   * отслеживалась бы по id сквозь любое перемешивание.
   */
  shuffleDeck(random: () => number = Math.random, pileId: string = MAIN_PILE): Op[] {
    const pile = this.piles.get(pileId);
    if (!pile) return [];
    const cards = pile.cards.map((id) => this.faces.get(id)!);
    const unpicked = this.dropPicks(pile.cards);
    for (const id of pile.cards) {
      this.turned.delete(id);
      this.faces.delete(id);
      this.trails.delete(id);
    }
    for (let i = cards.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [cards[i], cards[j]] = [cards[j]!, cards[i]!];
    }
    pile.cards = cards.map((face) => {
      const id = freshId();
      this.faces.set(id, face);
      return id;
    });
    pile.shuffles += 1;
    return this.commit([...unpicked, { t: "deck", pile: pileId, cards: pile.cards.map((id) => ({ id })), shuffled: true }]);
  }

  /** Поменять правила стола — от админа или команды. Неизвестное и кривое молча отбрасывается. */
  setRules(raw: Partial<TableRules>): Op[] {
    this.rules = { ...this.rules, ...pickRules(raw) };
    const ops: Op[] = [{ t: "rules", rules: { ...this.rules } }];
    for (const chair of [...this.chairs.values()]) ops.push(...this.sweepChair(chair));
    return this.commit(ops);
  }

  /** НАБРАТЬ КОЛОДУ ЗАНОВО — только когда всё уже собрано в колоду: чужие карты на столе так не пропадут. */
  restock(cards: Face[]): Op[] | null {
    if (this.felt.length > 0 || [...this.chairs.values()].some((c) => c.hand.length > 0) || [...this.piles].some(([id, pile]) => id !== MAIN_PILE && pile.cards.length > 0) || this.locks.size > 0) return null;
    const born = this.ensureDeck();
    const main = this.main!;
    born.push(...this.dropPicks(main.cards));
    for (const id of main.cards) {
      this.turned.delete(id);
      this.faces.delete(id);
      this.trails.delete(id);
    }
    main.cards = cards.map((face) => {
      const id = freshId();
      this.faces.set(id, face);
      return id;
    });
    return this.commit([...born, { t: "deck", pile: MAIN_PILE, cards: main.cards.map((id) => ({ id })), shuffled: false }]);
  }

  /** Переставить стул на другой угол. */
  turnChair(id: string, angle: number): Op[] {
    const chair = this.chairs.get(id);
    if (!chair) return [];
    chair.angle = ((angle % 360) + 360) % 360;
    return this.commit([{ t: "chair", chair: this.chairOut(chair) }]);
  }

  // ── СТУЛЬЯ ─────────────────────────────────────────────────────────────────────────────────

  private newChair(): ChairRow {
    this.seq += 1;
    const chair: ChairRow = {
      id: `c${this.seq}`,
      angle: freeAngle([...this.chairs.values()].map((c) => c.angle)),
      owner: null,
      last: null,
      lock: false,
      hide: true,
      forever: false,
      pose: { ...DEFAULT_POSE },
      hand: [],
    };
    this.chairs.set(chair.id, chair);
    return chair;
  }

  private seatOf(key: string): ChairRow | undefined {
    const seat = this.people.get(key)?.seat;
    return seat ? this.chairs.get(seat) : undefined;
  }

  /**
   * СТУЛ ПОКИНУТ. Замок и булавка спадают — их ставил тот, кто сидел, и охранять больше некого;
   * «скрыть» остаётся: карты, что лежали рубашкой к соседям, не раскрываются от того, что хозяин встал.
   *
   * Ушёл (`left`) — дальше решает правило стола. Пересел (`moved`) — стул с картами становится вечным,
   * чтобы оставленное не пропало, а без карт исчезает сразу, какое бы правило ни стояло.
   */
  private vacate(chair: ChairRow, how: "left" | "moved"): Op[] {
    chair.owner = null;
    chair.lock = false;
    if (how === "moved") {
      if (chair.hand.length > 0) chair.forever = true;
      else if (!chair.forever) return this.removeChair(chair);
      return [{ t: "chair", chair: this.chairOut(chair) }];
    }
    return [{ t: "chair", chair: this.chairOut(chair) }, ...this.sweepChair(chair)];
  }

  /** Правило стола на одном стуле: покинутый, пустой и не вечный — уходит. */
  private sweepChair(chair: ChairRow): Op[] {
    if (!this.chairs.has(chair.id)) return [];
    if (chair.owner !== null || chair.forever || !this.rules.dropEmptyChairs || chair.hand.length > 0) return [];
    return this.removeChair(chair);
  }

  /**
   * УБРАТЬ СТУЛ. Правила не убирают стул с картами, но если это всё же случится, карты не пропадают:
   * ложатся закрытой стопкой туда, где стоял стул.
   */
  private removeChair(chair: ChairRow): Op[] {
    this.chairs.delete(chair.id);
    const at = seatPoint(chair.angle);
    const felt: FeltCard[] = chair.hand.map((id, i) => {
      this.turned.delete(id);
      const card = { id, x: at.x + i * 0.03, y: at.y - i * 0.03, up: false, angle: 0 };
      this.felt.push(card);
      return card;
    });
    chair.hand = [];
    return [{ t: "unchair", id: chair.id, felt }];
  }

  // ── КАРТЫ ──────────────────────────────────────────────────────────────────────────────────

  /** Куда класть можно: только в руку стоящего стула и только в пределах сукна. */
  private clean(to: Where, auto = false): Where | null {
    if (to.in === "deck") {
      if (typeof to.pile !== "string") return null;
      return Number.isInteger(to.i) && !this.piles.get(to.pile)?.spot.lock ? { in: "deck", pile: to.pile, i: to.i } : { in: "deck", pile: to.pile };
    }
    if (to.in === "hand") {
      if (!this.chairs.has(to.chair) || !Number.isInteger(to.i)) return null;
      return { in: "hand", chair: to.chair, i: to.i };
    }
    if (![to.x, to.y].every(Number.isFinite)) return null;
    // МИМО СТОЛА НЕ ПОЛОЖИТЬ: карта, брошенная за кромку, ложится на её край, а не пропадает в темноте.
    const far = Math.hypot(to.x, to.y);
    const k = far > FELT_REACH ? FELT_REACH / far : 1;
    const angle = turnOf(Number.isFinite(to.angle) ? to.angle : 0);
    return { in: "felt", x: to.x * k, y: to.y * k, up: to.up === true, angle, ...(auto && to.under === true ? { under: true } : {}) };
  }

  /** Какой стороной вверх карта ляжет из `from`, если её несёт `by`. */
  private sideOf(by: string, id: string, from: Where): boolean {
    if (from.in === "felt") return from.up;
    if (from.in === "deck") return this.turned.has(id);
    const chair = this.chairs.get(from.chair);
    return !this.turned.has(id) && chair !== undefined && (chair.owner === by || !chair.hide);
  }

  private whereIs(id: string): Where | null {
    for (const [pile, row] of this.piles) if (row.cards.includes(id)) return { in: "deck", pile };
    const onFelt = this.felt.find((one) => one.id === id);
    if (onFelt) return { in: "felt", x: onFelt.x, y: onFelt.y, up: onFelt.up, angle: onFelt.angle, ...(onFelt.under ? { under: true } : {}) };
    for (const chair of this.chairs.values()) {
      const i = chair.hand.indexOf(id);
      if (i >= 0) return { in: "hand", chair: chair.id, i };
    }
    return null;
  }

  private take(id: string, from: Where): void {
    if (from.in === "deck") {
      const cards = this.piles.get(from.pile)!.cards;
      cards.splice(cards.indexOf(id), 1);
    } else if (from.in === "felt") {
      for (const pile of this.piles.values()) if (pile.spot.below.includes(id)) pile.spot.below = pile.spot.below.filter((one) => one !== id);
      this.felt.splice(this.felt.findIndex((one) => one.id === id), 1);
    }
    else this.chairs.get(from.chair)!.hand.splice(from.i, 1);
  }

  /** Положить и вернуть, куда легло НА САМОМ ДЕЛЕ: индекс руки прижимается к её длине. */
  private put(id: string, to: Where): Where {
    if (to.in === "deck") {
      const cards = this.piles.get(to.pile)!.cards;
      if (to.i === undefined) {
        cards.push(id);
        return { in: "deck", pile: to.pile };
      }
      const i = Math.max(0, Math.min(cards.length, to.i));
      cards.splice(i, 0, id);
      return { in: "deck", pile: to.pile, i };
    }
    if (to.in === "felt") {
      this.felt.push({ id, x: to.x, y: to.y, up: to.up, angle: to.angle, ...(to.under ? { under: true } : {}) });
      return to;
    }
    const hand = this.chairs.get(to.chair)!.hand;
    const i = Math.max(0, Math.min(hand.length, to.i));
    hand.splice(i, 0, id);
    return { in: "hand", chair: to.chair, i };
  }

  private commit(ops: Op[]): Op[] {
    this.v += 1;
    return ops;
  }

  // ── ЗРИТЕЛЬ ────────────────────────────────────────────────────────────────────────────────

  /**
   * ВИДНО ЛИ ЛИЦО. В руке: хозяину — пока карта не перевёрнута (худ); остальным — если стул не скрыт (в худе
   * неперевёрнутые, на стуле перевёрнутые). В колоде — если перевёрнута. На сукне — если лицом вверх.
   */
  private visibleTo(viewer: string, where: Where, id: string): boolean {
    if (where.in === "hand") {
      const chair = this.chairs.get(where.chair);
      return chair !== undefined && ((chair.owner === viewer && !this.turned.has(id)) || !chair.hide);
    }
    if (where.in === "felt") return where.up;
    return this.turned.has(id);
  }

  private seen(id: string, viewer: string, where: Where): SeenCard {
    const card: SeenCard = this.visibleTo(viewer, where, id) ? { id, face: this.faces.get(id)! } : { id };
    if (where.in !== "felt" && this.turned.has(id)) card.up = true;
    return card;
  }

  /** Стул в полном виде — лица в руке режет `seenOp`. */
  private chairOut(chair: ChairRow): Chair {
    const { last: _last, hand, pose, ...rest } = chair;
    return { ...rest, pose: { ...pose }, hand: hand.map((id) => ({ id })) };
  }

  /**
   * Стул глазами зрителя. Спрашивает ТЕКУЩИЙ стул, а не тот, что лежит в дифе: диф рассылается после
   * того, как намерение целиком применено, и в нём должен ехать итог — иначе в одном патче стул,
   * отданный пересевшему, уехал бы к соседям с лицами, открытыми старым хозяином.
   */
  private chairSeen(chair: Chair, viewer: string): Chair {
    return { ...chair, hand: chair.hand.map((c, i) => this.seen(c.id, viewer, { in: "hand", chair: chair.id, i })) };
  }

  seenOp(op: Op, viewer: string): Op {
    if (op.t === "move") return { ...op, card: this.seen(op.card.id, viewer, op.to) };
    if (op.t === "turn") {
      const at = this.whereIs(op.card.id);
      return at ? { ...op, card: this.seen(op.card.id, viewer, at) } : op;
    }
    if (op.t === "chair") return { ...op, chair: this.chairSeen(op.chair, viewer) };
    // Стопка заменена целиком: у перевёрнутых карт лица приходят всем.
    if (op.t === "deck") return { ...op, cards: op.cards.map((c) => this.seen(c.id, viewer, { in: "deck", pile: op.pile })) };
    return op;
  }

  seenBy(viewer: string): Snapshot {
    const chairs = [...this.chairs.values()].map((c) => this.chairSeen(this.chairOut(c), viewer));
    const felt: FeltCard[] = this.felt.map((one) => ({
      ...this.seen(one.id, viewer, { in: "felt", ...one }),
      x: one.x,
      y: one.y,
      up: one.up,
      angle: one.angle,
      ...(one.under ? { under: true } : {}),
    }));
    return {
      v: this.v,
      people: this.here,
      chairs,
      piles: [...this.piles].map(([id, pile]): Pile => ({ ...this.spotOut(id)!, id, cards: pile.cards.map((one) => this.seen(one, viewer, { in: "deck", pile: id })), shuffles: pile.shuffles })),
      felt,
      trails: Object.fromEntries(this.trails),
      locks: Object.fromEntries([...this.locks].map(([id, lock]) => [id, lock.by])),
      picks: Object.fromEntries(this.picks),
      rules: { ...this.rules },
      admin: this.admin,
    };
  }
}

/** Id карты — случайный: по нему нельзя узнать ни карту, ни её прежний id. */
function freshId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

/** Угол в (-180, 180] — один и тот же поворот не должен приходить двумя разными числами. */
function turnOf(deg: number): number {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  return d === -180 ? 180 : d;
}

function pickRules(raw: Partial<TableRules>): Partial<TableRules> {
  const out: Partial<TableRules> = {};
  if (typeof raw?.dropEmptyChairs === "boolean") out.dropEmptyChairs = raw.dropEmptyChairs;
  if ((CARD_FACES as readonly unknown[]).includes(raw?.faces)) out.faces = raw.faces;
  if ((CARD_BACKS as readonly unknown[]).includes(raw?.back)) out.back = raw.back;
  return out;
}
