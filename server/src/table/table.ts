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
  LOCK_TTL_MS,
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
import { freeAngle, seatPoint } from "./ring.js";

/** Докуда на сукне может лежать середина карты: радиус стола минус полкарты по диагонали. */
export const FELT_REACH = 8 - 0.86;

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
  pose: HandPose;
  hand: string[];
}

type Result = { ops: Op[] } | { refused: Refusal };

export class Table {
  private v = 0;
  private seq = 0;
  private faces = new Map<string, Face>();
  private deck: string[] = [];
  /** Где стоит колода; `null` — её нет на столе. */
  private spot: DeckSpot | null = { ...DEFAULT_SPOT };
  private felt: { id: string; x: number; y: number; up: boolean; angle: number; under?: boolean }[] = [];
  /** Сколько раз перемешали колоду (`Snapshot.shuffles`). */
  private shuffles = 0;
  /** Идёт команда бота: руки людей до конца неё стол не трогают (`busy`). */
  private scripted = false;
  private chairs = new Map<string, ChairRow>();
  private people = new Map<string, Person>();
  private locks = new Map<string, Lock>();
  /** Последнее «над чем карта», пока её держат. Живёт не дольше блокировки (`carriesSeenBy`). */
  private carries = new Map<string, { by: string; over: Where; auto?: true }>();
  private rules: TableRules = { ...DEFAULT_RULES };
  private trails = new Map<string, Trail>();
  /** Перевёрнутые карты в колоде и в руках. У карты на сукне сторона лежит в ней самой (`felt[].up`). */
  private turned = new Set<string>();
  /** Имена всех, кто когда-либо садился: след подписывает и ушедшего. */
  private names = new Map<string, string>();

  /** `creator` — ключ создателя комнаты: он админ, пока сидит за столом. */
  constructor(
    cards: { id: string; face: Face }[],
    private readonly creator: string | null = null,
  ) {
    for (const card of cards) {
      this.faces.set(card.id, card.face);
      this.deck.push(card.id);
    }
  }

  get version(): number {
    return this.v;
  }

  get here(): Person[] {
    return [...this.people.values()];
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
        return this.grab(by, intent.id, now);
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
        return this.deckMove(intent.x, intent.y);
      case "deckDo":
        return this.deckDo(intent.how);
      case "deckForever": {
        if (!this.spot) return { refused: "gone" };
        if (typeof intent.on !== "boolean") return { refused: "bad" };
        this.spot.forever = intent.on;
        return { ops: this.commit([{ t: "spot", spot: { ...this.spot } }, ...this.sweepDeck()]) };
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
    this.carries.set(out.id, { by, over, ...(auto ? { auto: true as const } : {}) });
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
      out.push({ id, by: c.by, over: c.over, from, card: this.seen(id, viewer, from), ...(c.auto ? { auto: true as const } : {}) });
    }
    return out;
  }

  /** Можно ли тронуть карту — взять или перевернуть. Одно правило на оба жеста. */
  private touchable(by: string, id: string): { at: Where } | { refused: Refusal } {
    const at = this.whereIs(id);
    if (!at) return { refused: "gone" };
    const lock = this.locks.get(id);
    if (lock && lock.by !== by) return { refused: "locked" };
    // С КОЛОДЫ — ТОЛЬКО ВЕРХНЯЯ. Стопку целиком не поднимают, и карту из середины не выдёргивают.
    if (at.in === "deck" && this.deck[this.deck.length - 1] !== id) return { refused: "not-top" };
    if (at.in === "hand" && this.closedTo(by, at.chair)) return { refused: "chair-locked" };
    return { at };
  }

  private grab(by: string, id: string, now: number): Result {
    const may = this.touchable(by, id);
    if ("refused" in may) return may;
    const lock = this.locks.get(id);
    this.locks.set(id, { by, until: now + LOCK_TTL_MS });
    return { ops: lock ? [] : this.commit([{ t: "lock", id, by }]) };
  }

  /**
   * ПЕРЕВЕРНУТЬ НА МЕСТЕ. Место, угол и порядок не меняются; след — «трогал я», а «откуда» остаётся от
   * последнего переноса: карта Джемаля из его руки, перевёрнутая мной, — всё ещё «из руки Джемаля».
   */
  private turn(by: string, id: string, now: number): Result {
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
    return { ops: this.commit([{ t: "turn", card: { id }, up, trail }]) };
  }

  private drop(by: string, id: string, to: Where, now: number, auto = false): Result {
    const lock = this.locks.get(id);
    if (!lock || lock.by !== by) return { refused: "not-held" };
    const target = this.clean(to, auto);
    if (!target) return { refused: "bad" };
    if (target.in === "hand" && this.closedTo(by, target.chair)) return { refused: "chair-locked" };
    const from = this.whereIs(id)!;
    const trail = this.trailOf(id, by, from, target.in, now);
    // СТОРОНА КАРТЫ. В руку — всегда лицом к хозяину. Команда кладёт, как сказано. Рука кладёт, как несла:
    // из руки — лицом, если его было видно в худе; с сукна и колоды — как лежала.
    // В КОЛОДУ, КОТОРОЙ НЕТ, кладёт только команда бота — и ставит новую посередине.
    if (target.in === "deck" && !this.spot && !auto) return { refused: "gone" };
    const born = target.in === "deck" ? this.ensureDeck() : [];
    // В СТОПКУ — стороной стопки, если все её карты лежат одинаково; вперемешку или пустая — как нёс.
    const pack = target.in === "deck" && !auto ? this.deck.filter((one) => one !== id).map((one) => this.turned.has(one)) : [];
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
    if (from.in === "deck") ops.push(...this.sweepDeck());
    // РУКА ПОКИНУТОГО СТУЛА ОПУСТЕЛА — правило стола решает, стоять ли ему дальше.
    if (from.in === "hand") ops.push(...this.sweepChair(this.chairs.get(from.chair)!));
    return { ops: this.commit(ops) };
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

  /** Переставить колоду по сукну. Мимо стола не поставить — встанет на кромку, как карта. */
  private deckMove(x: number, y: number): Result {
    if (!this.spot) return { refused: "gone" };
    if (![x, y].every(Number.isFinite)) return { refused: "bad" };
    const far = Math.hypot(x, y);
    const k = far > FELT_REACH ? FELT_REACH / far : 1;
    this.spot = { ...this.spot, x: x * k, y: y * k };
    return { ops: this.commit([{ t: "spot", spot: { ...this.spot } }]) };
  }

  /**
   * ИЗ ТУЛТИПА КОЛОДЫ. Пока карту колоды кто-то держит — отказ: перемешивание выписывает новые id, и
   * держащий остался бы с картой, которой нет.
   */
  private deckDo(how: DeckDo): Result {
    if (!(DECK_DOS as readonly unknown[]).includes(how)) return { refused: "bad" };
    if (!this.spot) return { refused: "gone" };
    if (this.deck.some((id) => this.locks.has(id))) return { refused: "locked" };
    if (how === "shuffle") return { ops: this.shuffleDeck() };
    if (how === "sort") this.deck = arranged(this.deck, "suit", (id) => this.faces.get(id))!;
    else {
      // ПЕРЕВЕРНУТЬ СТОПКУ: нижняя стала верхней, и каждая карта легла другой стороной.
      this.deck.reverse();
      for (const id of this.deck) if (!this.turned.delete(id)) this.turned.add(id);
    }
    return { ops: this.commit([{ t: "deck", deck: this.deck.map((id) => ({ id })), shuffled: false }]) };
  }

  /** Невечная колода без карт уходит со стола. */
  private sweepDeck(): Op[] {
    if (!this.spot || this.spot.forever || this.deck.length > 0) return [];
    this.spot = null;
    return [{ t: "spot", spot: null }];
  }

  /** Колоды нет — поставить новую посередине (для команды бота). */
  private ensureDeck(): Op[] {
    if (this.spot) return [];
    this.spot = { ...DEFAULT_SPOT };
    return [{ t: "spot", spot: { ...this.spot } }];
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
    if (!this.deck.includes(id) || this.locks.has(id)) return null;
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
  layout(): { deck: string[]; felt: { id: string; x: number; y: number; under?: boolean }[]; chairs: { id: string; angle: number; owner: string | null; hand: string[] }[] } {
    return {
      deck: [...this.deck],
      felt: this.felt.map(({ id, x, y, under }) => ({ id, x, y, ...(under ? { under } : {}) })),
      chairs: [...this.chairs.values()].map((c) => ({ id: c.id, angle: c.angle, owner: c.owner, hand: [...c.hand] })),
    };
  }

  /**
   * ПЕРЕМЕШАТЬ. Id всех карт колоды выписываются заново: иначе карта, которую кто-то видел лицом до сборки,
   * отслеживалась бы по id сквозь любое перемешивание.
   */
  shuffleDeck(random: () => number = Math.random): Op[] {
    const cards = this.deck.map((id) => this.faces.get(id)!);
    for (const id of this.deck) {
      this.turned.delete(id);
      this.faces.delete(id);
      this.trails.delete(id);
    }
    for (let i = cards.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [cards[i], cards[j]] = [cards[j]!, cards[i]!];
    }
    this.deck = cards.map((face) => {
      const id = freshId();
      this.faces.set(id, face);
      return id;
    });
    this.shuffles += 1;
    return this.commit([...(this.deck.length ? this.ensureDeck() : []), { t: "deck", deck: this.deck.map((id) => ({ id })), shuffled: true }]);
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
    if (this.felt.length > 0 || [...this.chairs.values()].some((c) => c.hand.length > 0) || this.locks.size > 0) return null;
    for (const id of this.deck) {
      this.turned.delete(id);
      this.faces.delete(id);
      this.trails.delete(id);
    }
    this.deck = cards.map((face) => {
      const id = freshId();
      this.faces.set(id, face);
      return id;
    });
    return this.commit([...this.ensureDeck(), { t: "deck", deck: this.deck.map((id) => ({ id })), shuffled: false }]);
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
    if (to.in === "deck") return { in: "deck" };
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
    if (this.deck.includes(id)) return { in: "deck" };
    const onFelt = this.felt.find((one) => one.id === id);
    if (onFelt) return { in: "felt", x: onFelt.x, y: onFelt.y, up: onFelt.up, angle: onFelt.angle, ...(onFelt.under ? { under: true } : {}) };
    for (const chair of this.chairs.values()) {
      const i = chair.hand.indexOf(id);
      if (i >= 0) return { in: "hand", chair: chair.id, i };
    }
    return null;
  }

  private take(id: string, from: Where): void {
    if (from.in === "deck") this.deck.splice(this.deck.indexOf(id), 1);
    else if (from.in === "felt") this.felt.splice(this.felt.findIndex((one) => one.id === id), 1);
    else this.chairs.get(from.chair)!.hand.splice(from.i, 1);
  }

  /** Положить и вернуть, куда легло НА САМОМ ДЕЛЕ: индекс руки прижимается к её длине. */
  private put(id: string, to: Where): Where {
    if (to.in === "deck") {
      this.deck.push(id);
      return to;
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
    // Колода заменена целиком: у перевёрнутых карт лица приходят всем.
    if (op.t === "deck") return { ...op, deck: op.deck.map((c) => this.seen(c.id, viewer, { in: "deck" })) };
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
      deck: this.deck.map((id) => this.seen(id, viewer, { in: "deck" })),
      spot: this.spot && { ...this.spot },
      felt,
      trails: Object.fromEntries(this.trails),
      shuffles: this.shuffles,
      locks: Object.fromEntries([...this.locks].map(([id, lock]) => [id, lock.by])),
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
